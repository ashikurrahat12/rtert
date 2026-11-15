import { standaloneBroker } from './standaloneBroker.ts';

let forceStandalone = false;

export function isStandaloneMode(): boolean {
  return forceStandalone;
}

export interface ApiResponse<T = unknown> {
  ok: boolean;
  status: number;
  data: T;
}

/**
 * Calls the Express `/api/*` backend when running on Node/AI Studio/Render/Railway,
 * and seamlessly falls back to the browser-side real-time standalone engine
 * when hosted statically (e.g. GitHub Pages, Vercel/Netlify static, vite preview).
 */
export async function brokerFetch<T = Record<string, unknown>>(
  path: string,
  init?: RequestInit
): Promise<ApiResponse<T>> {
  if (!forceStandalone) {
    try {
      const res = await fetch(path, init);
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = (await res.json()) as T;
        return { ok: res.ok, status: res.status, data };
      }
      // Static hosts (e.g. GitHub Pages / SPA fallback) return text/html 404/200 for /api/*
      forceStandalone = true;
    } catch {
      forceStandalone = true;
    }
  }

  const fallback = await standaloneBroker.handleRequest(path, init);
  return fallback as ApiResponse<T>;
}
