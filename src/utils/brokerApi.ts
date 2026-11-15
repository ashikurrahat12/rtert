import { standaloneBroker } from './standaloneBroker.ts';

export type BackendMode = 'probing' | 'remote' | 'standalone';

const SERVER_URL_STORAGE_KEY = 'binarx_server_url';

function normalizeBaseUrl(raw?: string | null): string {
  if (!raw) return '';
  const trimmed = raw.trim().replace(/\/+$/, '');
  if (!trimmed) return '';
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  return `https://${trimmed}`;
}

function getConfiguredServerUrl(): string {
  if (typeof window !== 'undefined') {
    try {
      const params = new URLSearchParams(window.location.search);
      const fromQuery = params.get('server');
      if (fromQuery !== null) {
        if (fromQuery === '' || fromQuery === 'local' || fromQuery === 'auto') {
          localStorage.removeItem(SERVER_URL_STORAGE_KEY);
        } else {
          const normalized = normalizeBaseUrl(fromQuery);
          localStorage.setItem(SERVER_URL_STORAGE_KEY, normalized);
          return normalized;
        }
      }
      const saved = localStorage.getItem(SERVER_URL_STORAGE_KEY);
      if (saved) return normalizeBaseUrl(saved);
    } catch {
      // Ignore storage/URL errors
    }
  }
  const envUrl = import.meta.env.VITE_API_URL as string | undefined;
  return normalizeBaseUrl(envUrl);
}

let cachedServerBaseUrl: string | null = null;

export function getServerBaseUrl(): string {
  if (cachedServerBaseUrl === null) {
    cachedServerBaseUrl = getConfiguredServerUrl();
  }
  return cachedServerBaseUrl;
}

export function resolveApiUrl(path: string): string {
  const base = getServerBaseUrl();
  if (!base) return path;
  return path.startsWith('/') ? `${base}${path}` : `${base}/${path}`;
}

export function resolveWsUrl(clientId: string): string {
  const base = getServerBaseUrl();
  const query = `?clientId=${encodeURIComponent(clientId)}`;
  if (base) {
    const wsBase = base.replace(/^https:/i, 'wss:').replace(/^http:/i, 'ws:');
    return `${wsBase}/ws${query}`;
  }
  const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${window.location.host}/ws${query}`;
}

let backendMode: BackendMode = 'probing';
let probePromise: Promise<'remote' | 'standalone'> | null = null;

export function isStandaloneMode(): boolean {
  return backendMode === 'standalone';
}

export function getBackendMode(): BackendMode {
  return backendMode;
}

/**
 * Probes whether an Express + WebSocket backend is available (same-origin Node server
 * or external URL configured via VITE_API_URL / ?server=...). If hosted statically on
 * Vercel, GitHub Pages, or Netlify without a remote server URL, switches immediately to
 * the built-in browser engine without hanging on failed WebSocket retries.
 */
export async function probeBackendServer(): Promise<'remote' | 'standalone'> {
  if (backendMode === 'remote' || backendMode === 'standalone') {
    return backendMode;
  }
  if (probePromise) return probePromise;

  probePromise = (async () => {
    const base = getServerBaseUrl();
    if (!base && typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')) {
      backendMode = 'standalone';
      return 'standalone';
    }

    const controller = new AbortController();
    const timeoutMs = base ? 4500 : 1800;
    const timer = window.setTimeout(() => controller.abort(), timeoutMs);

    try {
      const res = await fetch(resolveApiUrl('/api/health'), {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      const contentType = res.headers.get('content-type') || '';
      if (res.ok && contentType.includes('application/json')) {
        const payload = (await res.json()) as { ok?: boolean; service?: string };
        if (payload?.ok && payload?.service === 'binarx-trade') {
          backendMode = 'remote';
          return 'remote';
        }
      }
    } catch {
      // Static host or unreachable remote server -> standalone engine
    } finally {
      window.clearTimeout(timer);
    }

    backendMode = 'standalone';
    return 'standalone';
  })();

  return probePromise;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Calls the Express `/api/*` backend (same-origin or VITE_API_URL) when live,
 * and seamlessly falls back to the browser-side real-time standalone engine
 * when hosted statically on Vercel, GitHub Pages, or Netlify.
 */
export async function brokerFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  const mode = await probeBackendServer();
  if (mode === 'remote') {
    try {
      const res = await fetch(resolveApiUrl(path), init);
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as T;
        return { ok: res.ok, status: res.status, data };
      }
      backendMode = 'standalone';
    } catch {
      backendMode = 'standalone';
    }
  }

  const fallback = await standaloneBroker.handleRequest(path, init);
  return fallback as ApiResponse<T>;
}
