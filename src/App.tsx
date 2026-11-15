import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  BarChart2,
  Bell,
  CandlestickChart,
  ChevronDown,
  CircleDollarSign,
  HelpCircle,
  Maximize2,
  Menu,
  MessageSquareText,
  Minimize2,
  MoreHorizontal,
  Plus,
  Send,
  Settings,
  Trophy,
  User,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { ASSETS, ASSET_MAP, TIMEFRAME_SECONDS } from './constants/assets.ts';
import type {
  AccountMode,
  AssetDefinition,
  Candle,
  ChartDrawing,
  ChartType,
  CryptoPaymentMethodConfig,
  IndicatorConfig,
  IndicatorId,
  MarketQuote,
  NavSection,
  TerminalSettings,
  Timeframe,
  Trade,
  TradeDirection,
  TraderAccountState,
  UserProfile,
} from './types/trading.ts';
import { soundEngine } from './utils/sound.ts';
import { brokerFetch, isStandaloneMode } from './utils/brokerApi.ts';
import { standaloneBroker } from './utils/standaloneBroker.ts';
import { AssetIcon } from './components/AssetIcon.tsx';
import { TradingChart } from './components/TradingChart.tsx';
import { AssetSelectorModal } from './components/AssetSelectorModal.tsx';
import { TradeSidebar } from './components/TradeSidebar.tsx';
import { WalletModal } from './components/WalletModal.tsx';
import { AccountAndAdminView } from './components/AccountAndAdminView.tsx';
import {
  AnalyticsView,
  LeaderboardView,
  SettingsView,
  SignalsView,
  SupportView,
} from './components/SecondaryViews.tsx';

function getClientId(): string {
  const key = 'quantax_client_id';
  let id = localStorage.getItem(key);
  if (!id) {
    id = `trader_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(key, id);
  }
  return id;
}

const DEFAULT_SETTINGS: TerminalSettings = {
  templateMode: 'full_light',
  soundEnabled: true,
  oneClickTrade: true,
  showGrid: true,
  showSentiment: true,
  showOpenTradesOnChart: true,
  timezoneOffsetMinutes: -new Date().getTimezoneOffset(),
};

interface ToastAlert {
  id: string;
  title: string;
  detail: string;
  variant: 'win' | 'loss' | 'info';
}

export default function App() {
  const [clientId, setClientId] = useState<string>(() => getClientId());
  const [authToken, setAuthToken] = useState<string | null>(() => localStorage.getItem('binarx_auth_token'));
  const [standaloneActive, setStandaloneActive] = useState<boolean>(() =>
    typeof window !== 'undefined' && window.location.hostname.endsWith('github.io')
  );
  const [assets, setAssets] = useState<AssetDefinition[]>(ASSETS);
  const [quotes, setQuotes] = useState<Record<string, MarketQuote>>({});
  const [paymentConfig, setPaymentConfig] = useState<CryptoPaymentMethodConfig[]>([]);
  const [adminRefreshKey, setAdminRefreshKey] = useState(0);
  const [account, setAccount] = useState<TraderAccountState>({
    clientId,
    isAuthenticated: false,
    role: 'user',
    name: 'Guest Trader',
    email: 'guest@binarxtrade.com',
    currency: 'USD',
    accountMode: 'demo',
    demoBalance: 10000,
    liveBalance: 0,
    profile: {
      userId: '79000000',
      nickname: '#79000000',
      firstName: '',
      lastName: '',
      dob: '',
      email: 'guest@binarxtrade.com',
      country: 'Bangladesh',
      address: '',
      language: 'English',
      timezone: '(UTC+06:00)',
      twoFactorLogin: false,
      twoFactorWithdraw: false,
      verified: false,
      role: 'user',
      createdAt: Date.now(),
      lastLoginAt: Date.now(),
    },
    trades: [],
    pendingOrders: [],
    transactions: [],
    depositRequests: [],
    withdrawalRequests: [],
  });

  const [navSection, setNavSection] = useState<NavSection>('trade');
  const [openTabs, setOpenTabs] = useState<string[]>([
    'NZD/JPY (OTC)',
    'AUD/JPY (OTC)',
    'AUD/USD (OTC)',
    'USD/JPY (OTC)',
    'NZD/USD (OTC)',
    'EUR/NZD (OTC)',
    'USD/PKR (OTC)',
    'USD/NGN (OTC)',
    'USD/BDT (OTC)',
    'EUR/USD (OTC)',
    'GBP/USD (OTC)',
  ]);
  const [selectedSymbol, setSelectedSymbol] = useState<string>('GBP/USD (OTC)');
  const [favorites, setFavorites] = useState<string[]>([
    'GBP/USD (OTC)',
    'EUR/USD (OTC)',
    'USD/BDT (OTC)',
    'USD/JPY (OTC)',
    'EUR/NZD (OTC)',
    'BTC/USD',
    'XAU/USD',
  ]);

  const [timeframe, setTimeframe] = useState<Timeframe>('1m');
  const [chartType, setChartType] = useState<ChartType>('candles');
  const [candles, setCandles] = useState<Candle[]>([]);
  const [candlesLoading, setCandlesLoading] = useState<boolean>(true);

  const [indicators, setIndicators] = useState<IndicatorConfig[]>([]);
  const [drawings, setDrawings] = useState<ChartDrawing[]>([]);

  const [durationSeconds, setDurationSeconds] = useState<number>(60);
  const [amount, setAmount] = useState<number>(1);
  const [hoverDirection, setHoverDirection] = useState<TradeDirection | null>(null);

  const [showAssetModal, setShowAssetModal] = useState(false);
  const [showWalletModal, setShowWalletModal] = useState(false);
  const [walletInitialTab, setWalletInitialTab] = useState<'deposit' | 'withdraw' | 'demo'>('deposit');
  const [showAccountDropdown, setShowAccountDropdown] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const [railExpanded, setRailExpanded] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [toasts, setToasts] = useState<ToastAlert[]>([]);

  const [settings, setSettings] = useState<TerminalSettings>(() => {
    try {
      const saved = localStorage.getItem('binarx_settings');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          ...DEFAULT_SETTINGS,
          ...parsed,
          templateMode: parsed.templateMode === 'light_mode' ? 'light_mode' : 'full_light',
        };
      }
      return DEFAULT_SETTINGS;
    } catch {
      return DEFAULT_SETTINGS;
    }
  });

  // Sync 2-option template mode (Light Mode vs Full Light) & sound
  useEffect(() => {
    const root = document.documentElement;
    if (settings.templateMode === 'light_mode') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
    soundEngine.setEnabled(settings.soundEnabled);
    localStorage.setItem('binarx_settings', JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    const onFsChange = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const openWallet = useCallback((tab: 'deposit' | 'withdraw' | 'demo') => {
    setWalletInitialTab(tab);
    setShowWalletModal(true);
    setShowAccountDropdown(false);
  }, []);

  const pushToast = useCallback((title: string, detail: string, variant: ToastAlert['variant']) => {
    const id = `toast_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`;
    setToasts((prev) => [{ id, title, detail, variant }, ...prev].slice(0, 4));
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 4500);
  }, []);

  // Refs for WebSocket live tick merging without stale closures
  const selectedSymbolRef = useRef(selectedSymbol);
  const timeframeRef = useRef(timeframe);
  selectedSymbolRef.current = selectedSymbol;
  timeframeRef.current = timeframe;

  // 1. Initial bootstrap (restores logged-in session if authToken exists)
  useEffect(() => {
    const tokenQuery = authToken ? `&token=${encodeURIComponent(authToken)}` : '';
    brokerFetch<{
      assets: AssetDefinition[];
      quotes: MarketQuote[];
      account: TraderAccountState;
      paymentConfig?: CryptoPaymentMethodConfig[];
    }>(`/api/bootstrap?clientId=${encodeURIComponent(clientId)}${tokenQuery}`, {
      headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
    })
      .then(({ ok, data }) => {
        if (isStandaloneMode()) setStandaloneActive(true);
        if (!ok || !data) return;
        if (data.assets?.length) setAssets(data.assets);
        if (data.quotes?.length) {
          const map: Record<string, MarketQuote> = {};
          for (const q of data.quotes) map[q.symbol] = q;
          setQuotes(map);
        }
        if (data.paymentConfig?.length) setPaymentConfig(data.paymentConfig);
        if (data.account) {
          setAccount(data.account);
          if (data.account.clientId !== clientId) {
            setClientId(data.account.clientId);
            localStorage.setItem('quantax_client_id', data.account.clientId);
          }
        }
      })
      .catch(() => {});
  }, [clientId, authToken]);

  const handleBrokerMessage = useCallback(
    (msg: Record<string, unknown>) => {
      if (msg.type === 'init') {
        if (Array.isArray(msg.quotes)) {
          const map: Record<string, MarketQuote> = {};
          for (const q of msg.quotes as MarketQuote[]) map[q.symbol] = q;
          setQuotes((prev) => ({ ...prev, ...map }));
        }
        if (msg.account) setAccount(msg.account as TraderAccountState);
      } else if (msg.type === 'ticks' && Array.isArray(msg.quotes)) {
        const incoming = msg.quotes as MarketQuote[];
        setQuotes((prev) => {
          const next = { ...prev };
          for (const q of incoming) next[q.symbol] = q;
          return next;
        });
        const activeTick = incoming.find((q) => q.symbol === selectedSymbolRef.current);
        if (activeTick) {
          const tfSec = TIMEFRAME_SECONDS[timeframeRef.current] || 60;
          const bucket = Math.floor(activeTick.timestamp / 1000 / tfSec) * tfSec;
          setCandles((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.time === bucket) {
              const updated: Candle = {
                ...last,
                high: Math.max(last.high, activeTick.price),
                low: Math.min(last.low, activeTick.price),
                close: activeTick.price,
              };
              return [...prev.slice(0, -1), updated];
            } else if (bucket > last.time) {
              const newCandle: Candle = {
                time: bucket,
                open: last.close,
                high: Math.max(last.close, activeTick.price),
                low: Math.min(last.close, activeTick.price),
                close: activeTick.price,
                volume: 0,
              };
              return [...prev.slice(-259), newCandle];
            }
            return prev;
          });
        }
      } else if (msg.type === 'tick' && msg.quote) {
        const q = msg.quote as MarketQuote;
        setQuotes((prev) => ({ ...prev, [q.symbol]: q }));

        if (q.symbol === selectedSymbolRef.current) {
          const tfSec = TIMEFRAME_SECONDS[timeframeRef.current] || 60;
          const bucket = Math.floor(q.timestamp / 1000 / tfSec) * tfSec;
          setCandles((prev) => {
            if (prev.length === 0) return prev;
            const last = prev[prev.length - 1];
            if (last.time === bucket) {
              const updated: Candle = {
                ...last,
                high: Math.max(last.high, q.price),
                low: Math.min(last.low, q.price),
                close: q.price,
              };
              return [...prev.slice(0, -1), updated];
            } else if (bucket > last.time) {
              const newCandle: Candle = {
                time: bucket,
                open: last.close,
                high: Math.max(last.close, q.price),
                low: Math.min(last.close, q.price),
                close: q.price,
                volume: 0,
              };
              return [...prev.slice(-259), newCandle];
            }
            return prev;
          });
        }
      } else if (msg.type === 'account:update' && msg.account) {
        setAccount(msg.account as TraderAccountState);
      } else if (msg.type === 'config:update' && Array.isArray(msg.paymentConfig)) {
        setPaymentConfig(msg.paymentConfig as CryptoPaymentMethodConfig[]);
      } else if (msg.type === 'admin:update') {
        setAdminRefreshKey((k) => k + 1);
      } else if (msg.type === 'deposit:approved') {
        soundEngine.playWin();
        pushToast(
          'Deposit Approved',
          `+$${Number(msg.amount || 0).toFixed(2)} credited to Live Account (${String(msg.method || 'Deposit')})`,
          'win'
        );
      } else if (msg.type === 'trade:settled' && msg.trade) {
        const tr = msg.trade as Trade;
        setUnreadNotifications((n) => n + 1);
        if (tr.status === 'won') {
          soundEngine.playWin();
          pushToast(
            `${tr.symbol} Trade Won`,
            `Payout +$${tr.payoutAmount.toFixed(2)} (+$${tr.profit.toFixed(2)} profit)`,
            'win'
          );
        } else if (tr.status === 'tie') {
          pushToast(`${tr.symbol} Trade Tie`, `Stake $${tr.amount.toFixed(2)} refunded`, 'info');
        } else {
          soundEngine.playLoss();
          pushToast(`${tr.symbol} Trade Closed`, `Expired out of money (-$${tr.amount.toFixed(2)})`, 'loss');
        }
      }
    },
    [pushToast]
  );

  // 2. Real-time WebSocket stream (auto-switches to standalone engine on static GitHub Pages)
  useEffect(() => {
    if (standaloneActive || isStandaloneMode()) {
      return standaloneBroker.subscribe(handleBrokerMessage);
    }

    let ws: WebSocket | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    let unmounted = false;
    let failedAttempts = 0;

    const connect = () => {
      if (unmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      ws = new WebSocket(`${proto}//${window.location.host}/ws?clientId=${encodeURIComponent(clientId)}`);

      ws.onopen = () => {
        failedAttempts = 0;
      };

      ws.onmessage = (evt) => {
        try {
          handleBrokerMessage(JSON.parse(evt.data));
        } catch {
          // Ignore invalid JSON
        }
      };

      ws.onclose = () => {
        if (unmounted) return;
        failedAttempts += 1;
        if (isStandaloneMode() || failedAttempts >= 2) {
          setStandaloneActive(true);
          return;
        }
        reconnectTimer = setTimeout(connect, 2000);
      };
    };

    connect();
    return () => {
      unmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      ws?.close();
    };
  }, [clientId, standaloneActive, handleBrokerMessage]);

  // 3. Fetch real historical candles on symbol / timeframe change
  useEffect(() => {
    let cancelled = false;
    setCandlesLoading(true);
    brokerFetch<{ candles: Candle[] }>(
      `/api/candles?symbol=${encodeURIComponent(selectedSymbol)}&tf=${encodeURIComponent(timeframe)}`
    )
      .then(({ data }) => {
        if (!cancelled) {
          setCandles(data?.candles || []);
          setCandlesLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setCandlesLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedSymbol, timeframe, standaloneActive]);

  const currentAsset = useMemo(
    () => ASSET_MAP.get(selectedSymbol) || assets[0],
    [selectedSymbol, assets]
  );

  const activeBalance = account.accountMode === 'demo' ? account.demoBalance : account.liveBalance;

  // Trade actions
  const handlePlaceTrade = useCallback(
    async (direction: TradeDirection, overrideAmount?: number, overrideDuration?: number) => {
      const useAmt = overrideAmount ?? amount;
      const useDur = overrideDuration ?? durationSeconds;
      const { ok, data } = await brokerFetch<{ trade: Trade; account: TraderAccountState; error?: string }>(
        '/api/trade',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            clientId,
            symbol: selectedSymbol,
            direction,
            amount: useAmt,
            durationSeconds: useDur,
            accountMode: account.accountMode,
          }),
        }
      );
      if (!ok) {
        pushToast('Order Rejected', data.error || 'Unable to place trade', 'loss');
        return;
      }
      soundEngine.playOrderPlaced();
      if (data.account) setAccount(data.account);
      pushToast(
        `${direction === 'UP' ? 'Buy' : 'Sell'} Order Opened`,
        `${selectedSymbol} · $${useAmt} · ${useDur}s @ ${data.trade.entryPrice}`,
        'info'
      );
    },
    [account.accountMode, amount, clientId, durationSeconds, pushToast, selectedSymbol]
  );

  const handlePlacePendingOrder = useCallback(
    async (params: {
      direction: TradeDirection;
      triggerType: 'price' | 'time';
      targetPrice?: number;
      targetTime?: number;
    }) => {
      const { ok, data } = await brokerFetch<{ account?: TraderAccountState; error?: string }>('/api/pending-order', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clientId,
          symbol: selectedSymbol,
          direction: params.direction,
          amount,
          durationSeconds,
          triggerType: params.triggerType,
          targetPrice: params.targetPrice,
          targetTime: params.targetTime,
        }),
      });
      if (!ok) {
        pushToast('Pending Order Failed', data.error || 'Could not schedule order', 'loss');
        return;
      }
      soundEngine.playOrderPlaced();
      if (data.account) setAccount(data.account);
      pushToast('Pending Order Active', `${selectedSymbol} ${params.direction} $${amount}`, 'info');
    },
    [amount, clientId, durationSeconds, pushToast, selectedSymbol]
  );

  const handleCancelPendingOrder = useCallback(
    async (id: string) => {
      const { data } = await brokerFetch<{ account?: TraderAccountState }>(
        `/api/pending-order/${id}?clientId=${encodeURIComponent(clientId)}`,
        { method: 'DELETE' }
      );
      if (data?.account) setAccount(data.account);
    },
    [clientId]
  );

  // Keyboard shortcuts (W = UP, S = DOWN)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (navSection !== 'trade' || showAssetModal || showWalletModal) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key.toLowerCase() === 'w') {
        e.preventDefault();
        handlePlaceTrade('UP');
      } else if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        handlePlaceTrade('DOWN');
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlaceTrade, navSection, showAssetModal, showWalletModal]);

  const handleSwitchMode = async (mode: AccountMode) => {
    setShowAccountDropdown(false);
    const { data } = await brokerFetch<{ account?: TraderAccountState }>('/api/account/mode', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ clientId, accountMode: mode }),
    });
    if (data?.account) setAccount(data.account);
  };

  const handleSelectAsset = (symbol: string) => {
    setSelectedSymbol(symbol);
    setOpenTabs((prev) => (prev.includes(symbol) ? prev : [...prev.slice(-11), symbol]));
    setNavSection('trade');
  };

  const handleCloseTab = (symbol: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (openTabs.length <= 1) return;
    const next = openTabs.filter((s) => s !== symbol);
    setOpenTabs(next);
    if (selectedSymbol === symbol) {
      setSelectedSymbol(next[next.length - 1]);
    }
  };

  const handleAddIndicator = (id: IndicatorId) => {
    const presets: Record<IndicatorId, { name: string; period: number; color: string }> = {
      sma: { name: 'SMA (20)', period: 20, color: '#F59E0B' },
      ema: { name: 'EMA (9)', period: 9, color: '#38BDF8' },
      bollinger: { name: 'Bollinger (20,2)', period: 20, color: '#A78BFA' },
      rsi: { name: 'RSI (14)', period: 14, color: '#F472B6' },
      macd: { name: 'MACD (12,26,9)', period: 12, color: '#2962FF' },
      stochastic: { name: 'Stochastic (14,3)', period: 14, color: '#10B981' },
    };
    const p = presets[id];
    setIndicators((prev) => [
      ...prev,
      {
        uid: `${id}_${Date.now()}`,
        id,
        name: p.name,
        period: p.period,
        color: p.color,
        enabled: true,
      },
    ]);
  };

  const activeTradesForChart = useMemo(
    () => account.trades.filter((t) => t.status === 'active' && t.accountMode === account.accountMode),
    [account.trades, account.accountMode]
  );

  const recentNotifications = useMemo(() => account.trades.slice(0, 6), [account.trades]);

  const railNavItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number;
  }> = [
    { id: 'trade', label: 'TRADE', icon: CandlestickChart },
    { id: 'support', label: 'SUPPORT', icon: HelpCircle },
    { id: 'account', label: 'ACCOUNT', icon: User },
    { id: 'tournaments', label: 'TOURNAMENTS', icon: Trophy, badge: 4 },
    { id: 'market', label: 'MARKET', icon: CircleDollarSign, badge: 3 },
  ];

  return (
    <div className="h-[100dvh] w-screen flex flex-col overflow-hidden bg-[#F8FAFC] dark:bg-[#131722] text-slate-900 dark:text-slate-100">
      {/* TOP HEADER BAR */}
      <header className="h-12 sm:h-14 shrink-0 bg-white dark:bg-[#171B26] border-b border-slate-200 dark:border-[#262D3F] px-2 sm:px-3 flex items-center justify-between gap-1.5 sm:gap-3 z-30">
        {/* Left: Menu Button + Binarx Trade Brand + Platform Subtitle */}
        <div className="flex items-center gap-2 sm:gap-3 min-w-0">
          <button
            onClick={() => setRailExpanded((v) => !v)}
            className="hidden md:inline-flex p-2 rounded-md text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-[#252B3B] transition-colors"
            title="Toggle navigation labels"
          >
            <Menu className="w-5 h-5" />
          </button>

          <button
            onClick={() => setNavSection('trade')}
            className="flex items-center gap-1.5 sm:gap-2.5 shrink-0 whitespace-nowrap focus:outline-none"
          >
            <svg viewBox="0 0 32 32" className="w-6 h-6 sm:w-7 sm:h-7" fill="none">
              <rect width="32" height="32" rx="7" fill="#1E2433" />
              <rect x="0.75" y="0.75" width="30.5" height="30.5" rx="6.25" stroke="#2F3952" strokeWidth="1.5" />
              <rect x="7" y="15" width="3.5" height="9" rx="1" fill="#0FAF59" />
              <path d="M8.75 11V26" stroke="#0FAF59" strokeWidth="1.5" strokeLinecap="round" />
              <rect x="14.25" y="10" width="3.5" height="10" rx="1" fill="#1D74F5" />
              <path d="M16 6.5V23" stroke="#1D74F5" strokeWidth="1.5" strokeLinecap="round" />
              <path
                d="M21 15L25 9M25 9H21.5M25 9V12.5"
                stroke="#0FAF59"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
            <span className="font-display font-extrabold text-[14px] xs:text-[15px] sm:text-[17px] tracking-tight text-slate-900 dark:text-white">
              Binarx <span className="text-[#0FAF59]">Trade</span>
            </span>
          </button>

          <span className="hidden md:inline-flex items-center gap-2 text-[11px] font-semibold tracking-wider text-slate-400 uppercase pl-1">
            <span className="w-1 h-1 rounded-full bg-slate-300 dark:bg-slate-600" />
            WEB TRADING PLATFORM
          </span>
        </div>

        {/* Right: 2-Option Template Switcher + Notifications + Account Switcher + Deposit + Withdrawal */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
          {/* 2-Option Template Switcher: Light Mode | Full Light */}
          <div
            className="hidden sm:flex items-center bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#262D3F] rounded-md p-0.5"
            title="Template Mode"
          >
            <button
              onClick={() => setSettings((s) => ({ ...s, templateMode: 'light_mode' }))}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                settings.templateMode === 'light_mode'
                  ? 'bg-[#1D74F5] text-white shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Light Mode
            </button>
            <button
              onClick={() => setSettings((s) => ({ ...s, templateMode: 'full_light' }))}
              className={`px-2.5 py-1 text-[11px] font-semibold rounded transition-colors ${
                settings.templateMode === 'full_light'
                  ? 'bg-white text-slate-900 shadow-sm'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
              }`}
            >
              Full Light
            </button>
          </div>

          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => {
                setShowNotifications((v) => !v);
                setUnreadNotifications(0);
              }}
              className="relative flex items-center justify-center w-8 h-8 sm:w-9 sm:h-9 rounded-md bg-slate-100 dark:bg-[#252B3B] hover:bg-slate-200 dark:hover:bg-[#2F374C] text-slate-700 dark:text-slate-200 transition-colors"
              title="Trade Notifications"
            >
              <Bell className="w-4 h-4" />
              {(unreadNotifications > 0 || recentNotifications.length > 0) && (
                <span className="absolute -top-1 -right-1 min-w-[16px] h-[16px] sm:min-w-[18px] sm:h-[18px] px-1 rounded-full bg-[#F05044] text-white font-mono-tabular text-[9px] sm:text-[10px] font-bold flex items-center justify-center">
                  {unreadNotifications > 0 ? unreadNotifications : recentNotifications.length}
                </span>
              )}
            </button>

            {showNotifications && (
              <div className="fixed sm:absolute right-2 sm:right-0 top-14 sm:top-auto sm:mt-2 w-[calc(100vw-16px)] max-w-[300px] sm:w-72 bg-white dark:bg-[#1C2030] border border-slate-200 dark:border-[#2A3142] rounded-lg shadow-2xl p-3 z-50">
                <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-100 dark:border-[#262D3F]">
                  <span className="text-xs font-bold text-slate-900 dark:text-white">Trade Activity</span>
                  <button
                    onClick={() => setShowNotifications(false)}
                    className="text-slate-400 hover:text-slate-700 dark:hover:text-white"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                {recentNotifications.length === 0 ? (
                  <p className="text-xs text-slate-400 py-4 text-center">No recent executions yet.</p>
                ) : (
                  <div className="space-y-2 max-h-60 overflow-y-auto">
                    {recentNotifications.map((tr) => (
                      <div
                        key={tr.id}
                        className="flex items-center justify-between text-xs py-1.5 border-b border-slate-100 dark:border-[#262D3F] last:border-0"
                      >
                        <div>
                          <div className="font-semibold text-slate-900 dark:text-white">
                            {tr.symbol} · {tr.direction === 'UP' ? 'Buy' : 'Sell'}
                          </div>
                          <div className="text-[11px] text-slate-400 font-mono-tabular">
                            ${tr.amount.toFixed(2)} @ {tr.entryPrice}
                          </div>
                        </div>
                        <span
                          className={`font-mono-tabular font-bold ${
                            tr.status === 'won'
                              ? 'text-[#0FAF59]'
                              : tr.status === 'lost'
                                ? 'text-[#F05044]'
                                : 'text-amber-500'
                          }`}
                        >
                          {tr.status === 'won'
                            ? `+$${tr.payoutAmount.toFixed(2)}`
                            : tr.status === 'active'
                              ? 'LIVE'
                              : '$0.00'}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Account Mode Switcher Pill */}
          <div className="relative">
            <button
              onClick={() => setShowAccountDropdown((v) => !v)}
              className="flex items-center gap-1.5 sm:gap-2.5 px-2 sm:px-3 py-1 sm:py-1.5 rounded-md bg-slate-100 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] hover:border-[#1D74F5] transition-colors"
            >
              <Send
                className={`w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0 ${
                  account.accountMode === 'demo' ? 'text-amber-500' : 'text-[#0FAF59]'
                }`}
              />
              <div className="text-left leading-tight">
                <div
                  className={`text-[8px] sm:text-[9px] font-bold uppercase tracking-wider ${
                    account.accountMode === 'demo' ? 'text-amber-500' : 'text-[#0FAF59]'
                  }`}
                >
                  <span className="sm:hidden">{account.accountMode === 'demo' ? 'DEMO' : 'LIVE'}</span>
                  <span className="hidden sm:inline">{account.accountMode === 'demo' ? 'DEMO ACCOUNT' : 'LIVE ACCOUNT'}</span>
                </div>
                <div className="font-mono-tabular font-bold text-[11px] sm:text-sm text-slate-900 dark:text-white">
                  ${activeBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </div>
              </div>
              <ChevronDown className="w-3 h-3 sm:w-3.5 sm:h-3.5 text-slate-400" />
            </button>

            {showAccountDropdown && (
              <div className="absolute right-0 mt-1.5 w-64 bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg shadow-2xl p-2 z-50 space-y-1">
                <button
                  onClick={() => handleSwitchMode('demo')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-colors ${
                    account.accountMode === 'demo'
                      ? 'bg-[#1D74F5]/10 border border-[#1D74F5]'
                      : 'hover:bg-slate-100 dark:hover:bg-[#252B3B]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-amber-500">Demo Account</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Practice with live prices</div>
                  </div>
                  <div className="font-mono-tabular font-bold text-sm text-slate-900 dark:text-white">
                    ${account.demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </button>

                <button
                  onClick={() => handleSwitchMode('live')}
                  className={`w-full flex items-center justify-between px-3 py-2.5 rounded-md text-left transition-colors ${
                    account.accountMode === 'live'
                      ? 'bg-[#0FAF59]/10 border border-[#0FAF59]'
                      : 'hover:bg-slate-100 dark:hover:bg-[#252B3B]'
                  }`}
                >
                  <div>
                    <div className="text-xs font-bold text-[#0FAF59]">Live Account</div>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400">Real wallet trading</div>
                  </div>
                  <div className="font-mono-tabular font-bold text-sm text-slate-900 dark:text-white">
                    ${account.liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2 })}
                  </div>
                </button>

                <div className="pt-1 border-t border-slate-200 dark:border-[#2A3142]">
                  <button
                    onClick={() => openWallet('demo')}
                    className="w-full py-1.5 text-xs font-semibold text-[#1D74F5] hover:underline"
                  >
                    Refill Demo Balance / Cashier
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* + Deposit CTA */}
          <button
            onClick={() => openWallet('deposit')}
            className="flex items-center gap-1 px-2.5 sm:px-3.5 py-1.5 sm:py-2 rounded-md bg-[#0FAF59] hover:bg-[#12c464] text-white font-display font-bold text-[11px] sm:text-xs transition-colors whitespace-nowrap shrink-0 shadow-xs"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Deposit</span>
          </button>

          {/* Withdrawal CTA */}
          <button
            onClick={() => openWallet('withdraw')}
            className="hidden sm:flex items-center px-3.5 py-2 rounded-md bg-[#364152] hover:bg-[#28313F] text-white font-display font-bold text-xs transition-colors whitespace-nowrap shrink-0"
          >
            Withdrawal
          </button>
        </div>
      </header>

      {/* MAIN WORKSPACE BODY */}
      <div className="flex-1 flex flex-col md:flex-row min-h-0 overflow-hidden">
        {/* LEFT VERTICAL NAVIGATION RAIL */}
        <aside
          className={`order-last md:order-first shrink-0 bg-white dark:bg-[#171B26] border-t md:border-t-0 md:border-r border-slate-200 dark:border-[#262D3F] flex md:flex-col items-center justify-between py-1 md:py-2.5 z-20 transition-all ${
            railExpanded ? 'md:w-[148px]' : 'md:w-[72px]'
          }`}
        >
          {/* Main Nav Links */}
          <nav className="flex md:flex-col items-center gap-0.5 sm:gap-1.5 w-full px-1 sm:px-1.5 justify-between md:justify-start">
            {railNavItems.map((item) => {
              const Icon = item.icon;
              const active = navSection === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => {
                    setNavSection(item.id);
                    setShowMoreMenu(false);
                  }}
                  className={`relative flex ${
                    railExpanded ? 'md:flex-row md:justify-start md:px-3 md:gap-2.5' : 'flex-col justify-center'
                  } items-center flex-1 md:flex-none h-11 md:w-full md:h-12 rounded-lg transition-colors min-w-0 ${
                    active
                      ? 'bg-[#1D74F5] text-white shadow-sm'
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#23293A]'
                  }`}
                >
                  <Icon className="w-4 h-4 md:w-[18px] md:h-[18px] shrink-0" />
                  <span
                    className={`font-bold tracking-tight leading-none truncate max-w-full px-0.5 ${
                      railExpanded ? 'text-[10px]' : 'text-[8px] sm:text-[8.5px] mt-1'
                    }`}
                  >
                    {item.id === 'tournaments' ? (
                      <>
                        <span className="sm:hidden">RANK</span>
                        <span className="hidden sm:inline">{item.label}</span>
                      </>
                    ) : (
                      item.label
                    )}
                  </span>
                  {item.badge && (
                    <span className="hidden md:flex absolute top-1 right-1.5 min-w-[15px] h-[15px] px-1 rounded-full bg-slate-800 dark:bg-[#2F374C] text-white font-mono-tabular text-[9px] font-bold items-center justify-center">
                      {item.badge}
                    </span>
                  )}
                </button>
              );
            })}

            {/* MORE button + Popover */}
            <div className="relative flex-1 md:flex-none md:w-full">
              <button
                onClick={() => setShowMoreMenu((v) => !v)}
                className={`flex ${
                  railExpanded ? 'md:flex-row md:justify-start md:px-3 md:gap-2.5' : 'flex-col justify-center'
                } items-center w-full h-11 md:h-12 rounded-lg transition-colors ${
                  navSection === 'analytics' || navSection === 'settings' || showMoreMenu
                    ? 'bg-slate-100 dark:bg-[#23293A] text-[#1D74F5]'
                    : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#23293A]'
                }`}
              >
                <MoreHorizontal className="w-4 h-4 md:w-[18px] md:h-[18px] shrink-0" />
                <span
                  className={`font-bold tracking-tight leading-none ${
                    railExpanded ? 'text-[10px]' : 'text-[8px] sm:text-[8.5px] mt-1'
                  }`}
                >
                  MORE
                </span>
              </button>

              {showMoreMenu && (
                <div className="absolute right-0 bottom-full mb-2 md:left-full md:right-auto md:top-0 md:bottom-auto md:mb-0 md:ml-2 w-52 bg-white dark:bg-[#1C2030] border border-slate-200 dark:border-[#2A3142] rounded-lg shadow-xl p-1.5 z-50 space-y-0.5">
                  <button
                    onClick={() => {
                      setNavSection('analytics');
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252B3B]"
                  >
                    <BarChart2 className="w-3.5 h-3.5 text-[#1D74F5]" />
                    Analytics
                  </button>
                  <button
                    onClick={() => {
                      setNavSection('settings');
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252B3B]"
                  >
                    <Settings className="w-3.5 h-3.5 text-[#1D74F5]" />
                    Template & Settings
                  </button>
                  <button
                    onClick={() => {
                      setNavSection('market');
                      setShowMoreMenu(false);
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2 rounded text-xs font-semibold text-slate-700 dark:text-slate-200 hover:bg-slate-100 dark:hover:bg-[#252B3B]"
                  >
                    <CircleDollarSign className="w-3.5 h-3.5 text-[#0FAF59]" />
                    Market Signals
                  </button>
                  <div className="sm:hidden pt-1.5 mt-1 border-t border-slate-200 dark:border-[#2A3142] flex gap-1 px-1 pb-1">
                    <button
                      onClick={() => setSettings((s) => ({ ...s, templateMode: 'light_mode' }))}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded ${
                        settings.templateMode === 'light_mode'
                          ? 'bg-[#1D74F5] text-white'
                          : 'bg-slate-100 dark:bg-[#131722] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Light Mode
                    </button>
                    <button
                      onClick={() => setSettings((s) => ({ ...s, templateMode: 'full_light' }))}
                      className={`flex-1 py-1.5 text-[11px] font-bold rounded ${
                        settings.templateMode === 'full_light'
                          ? 'bg-[#0FAF59] text-white'
                          : 'bg-slate-100 dark:bg-[#131722] text-slate-600 dark:text-slate-300'
                      }`}
                    >
                      Full Light
                    </button>
                  </div>
                </div>
              )}
            </div>
          </nav>

          {/* Bottom 2x2 Utility Icons + JOIN US Card (desktop) */}
          <div className="hidden md:flex flex-col items-center gap-2.5 w-full px-2">
            <div className="grid grid-cols-2 gap-1.5 w-full">
              <button
                onClick={toggleFullscreen}
                className="flex items-center justify-center h-7 rounded bg-slate-100 dark:bg-[#23293A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                title="Toggle Fullscreen"
              >
                {isFullscreen ? <Minimize2 className="w-3.5 h-3.5" /> : <Maximize2 className="w-3.5 h-3.5" />}
              </button>
              <button
                onClick={() => setNavSection('analytics')}
                className={`flex items-center justify-center h-7 rounded transition-colors ${
                  navSection === 'analytics'
                    ? 'bg-[#1D74F5] text-white'
                    : 'bg-slate-100 dark:bg-[#23293A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Performance Analytics"
              >
                <BarChart2 className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setNavSection('settings')}
                className={`flex items-center justify-center h-7 rounded transition-colors ${
                  navSection === 'settings'
                    ? 'bg-[#1D74F5] text-white'
                    : 'bg-slate-100 dark:bg-[#23293A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
                title="Template & Terminal Settings"
              >
                <Settings className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => setSettings((s) => ({ ...s, soundEnabled: !s.soundEnabled }))}
                className="flex items-center justify-center h-7 rounded bg-slate-100 dark:bg-[#23293A] text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white transition-colors"
                title={settings.soundEnabled ? 'Mute Sound' : 'Enable Sound'}
              >
                {settings.soundEnabled ? <Volume2 className="w-3.5 h-3.5" /> : <VolumeX className="w-3.5 h-3.5" />}
              </button>
            </div>

            <button
              onClick={() => setNavSection('support')}
              className="w-full py-2 rounded-lg bg-[#EBF3FF] dark:bg-[#1E2A42] hover:bg-[#DDEAFF] dark:hover:bg-[#243452] text-[#1D74F5] flex flex-col items-center justify-center gap-0.5 transition-colors"
              title="Trading Manual & Community"
            >
              <MessageSquareText className="w-4 h-4" />
              <span className="text-[8px] font-bold tracking-wide">JOIN US</span>
            </button>
          </div>
        </aside>

        {/* CENTER WORKSPACE */}
        {navSection === 'trade' ? (
          <div className="flex-1 flex flex-col lg:flex-row min-w-0 min-h-0 overflow-hidden">
            {/* Left/Center Column: Top-of-Chart Asset Tabs Strip + Chart Canvas */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 overflow-hidden">
              {/* Asset Tabs Strip directly above chart */}
              <div className="shrink-0 bg-[#F8FAFC] dark:bg-[#131722] border-b border-slate-200 dark:border-[#262D3F] px-2 sm:px-2.5 pt-2.5 pb-1.5 sm:py-2 flex items-center gap-1.5 overflow-x-auto no-scrollbar">
                <button
                  onClick={() => setShowAssetModal(true)}
                  className="w-9 h-9 sm:w-10 sm:h-10 rounded-md bg-[#1D74F5] hover:bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs transition-colors"
                  title="Add Asset Pair"
                >
                  <Plus className="w-4 h-4 sm:w-5 sm:h-5" />
                </button>

                {openTabs.map((sym) => {
                  const def = ASSET_MAP.get(sym);
                  const isSelected = sym === selectedSymbol;
                  return (
                    <div
                      key={sym}
                      onClick={() => setSelectedSymbol(sym)}
                      className={`group relative flex items-center gap-1.5 sm:gap-2 px-2 sm:px-2.5 py-1 sm:py-1.5 h-9 sm:h-10 rounded-md border cursor-pointer transition-colors shrink-0 min-w-[104px] sm:min-w-[116px] ${
                        isSelected
                          ? 'bg-[#2B3345] border-[#2B3345] text-white shadow-sm'
                          : 'bg-white dark:bg-[#1C212D] border-slate-200 dark:border-[#262D3F] hover:border-slate-300 dark:hover:border-[#39435C] text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {def && (
                        <AssetIcon
                          base={def.baseCurrency}
                          quote={def.quoteCurrency}
                          category={def.category}
                          size="sm"
                        />
                      )}
                      <div className="leading-tight min-w-0 pr-1">
                        <div className="font-display font-bold text-[10px] sm:text-[11px] whitespace-nowrap truncate">{sym}</div>
                        <div
                          className={`font-mono-tabular text-[10px] sm:text-[11px] font-bold ${
                            isSelected ? 'text-amber-400' : 'text-amber-500'
                          }`}
                        >
                          {def?.payout ?? 85}%
                        </div>
                      </div>

                      {openTabs.length > 1 && (
                        <button
                          onClick={(e) => handleCloseTab(sym, e)}
                          className={`absolute -top-1.5 -right-1.5 w-4 h-4 rounded-full flex items-center justify-center transition-opacity ${
                            isSelected
                              ? 'bg-[#465169] hover:bg-rose-500 text-white opacity-100'
                              : 'bg-slate-200 dark:bg-[#2F374C] text-slate-600 dark:text-slate-300 hover:bg-rose-500 hover:text-white opacity-0 group-hover:opacity-100'
                          }`}
                          title="Close tab"
                        >
                          <X className="w-2.5 h-2.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              {/* Live Chart Viewport */}
              <main className="flex-1 min-w-0 min-h-[240px] sm:min-h-[340px] relative">
                <TradingChart
                  asset={currentAsset}
                  quote={quotes[currentAsset.symbol]}
                  candles={candles}
                  loading={candlesLoading}
                  timeframe={timeframe}
                  onTimeframeChange={setTimeframe}
                  chartType={chartType}
                  onChartTypeChange={setChartType}
                  indicators={indicators}
                  onAddIndicator={handleAddIndicator}
                  onRemoveIndicator={(uid) => setIndicators((p) => p.filter((i) => i.uid !== uid))}
                  onToggleIndicator={(uid) =>
                    setIndicators((p) => p.map((i) => (i.uid === uid ? { ...i, enabled: !i.enabled } : i)))
                  }
                  activeTrades={activeTradesForChart}
                  pendingOrders={account.pendingOrders.filter((o) => o.accountMode === account.accountMode)}
                  hoverDirection={hoverDirection}
                  selectedDurationSec={durationSeconds}
                  settings={settings}
                  drawings={drawings}
                  onAddDrawing={(d) => setDrawings((p) => [...p, d])}
                  onUndoDrawing={() =>
                    setDrawings((p) => {
                      const idx = [...p].reverse().findIndex((d) => d.symbol === currentAsset.symbol);
                      if (idx === -1) return p;
                      const realIdx = p.length - 1 - idx;
                      return [...p.slice(0, realIdx), ...p.slice(realIdx + 1)];
                    })
                  }
                  onClearDrawings={() => setDrawings((p) => p.filter((d) => d.symbol !== currentAsset.symbol))}
                />
              </main>
            </div>

            {/* Right Execution Panel */}
            <TradeSidebar
              asset={currentAsset}
              quote={quotes[currentAsset.symbol]}
              accountMode={account.accountMode}
              balance={activeBalance}
              durationSeconds={durationSeconds}
              onDurationChange={setDurationSeconds}
              amount={amount}
              onAmountChange={setAmount}
              onHoverDirection={setHoverDirection}
              onPlaceTrade={handlePlaceTrade}
              onPlacePendingOrder={handlePlacePendingOrder}
              onCancelPendingOrder={handleCancelPendingOrder}
              trades={account.trades}
              pendingOrders={account.pendingOrders}
              oneClickTrade={settings.oneClickTrade}
              onOpenWallet={() => openWallet('deposit')}
            />
          </div>
        ) : navSection === 'market' ? (
          <SignalsView assets={assets} quotes={quotes} onSelectAssetAndTrade={handleSelectAsset} />
        ) : navSection === 'analytics' ? (
          <AnalyticsView account={account} onGoTrade={() => setNavSection('trade')} />
        ) : navSection === 'tournaments' ? (
          <LeaderboardView clientId={clientId} />
        ) : navSection === 'account' ? (
          <AccountAndAdminView
            account={account}
            authToken={authToken}
            paymentConfig={paymentConfig}
            assets={assets}
            adminRefreshKey={adminRefreshKey}
            onNavigate={setNavSection}
            onOpenWallet={openWallet}
            onLogin={async (email, password) => {
              const { ok, data } = await brokerFetch<{
                token: string;
                account: TraderAccountState;
                paymentConfig?: CryptoPaymentMethodConfig[];
                error?: string;
              }>('/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password }),
              });
              if (!ok) throw new Error(data.error || 'Sign in failed.');
              localStorage.setItem('binarx_auth_token', data.token);
              localStorage.setItem('quantax_client_id', data.account.clientId);
              setAuthToken(data.token);
              setClientId(data.account.clientId);
              setAccount(data.account);
              if (data.paymentConfig) setPaymentConfig(data.paymentConfig);
              pushToast(
                data.account.role === 'admin' ? 'Admin Signed In' : 'Signed In',
                `Welcome back, ${data.account.email}`,
                'win'
              );
            }}
            onRegister={async ({ email, password, firstName, lastName, country }) => {
              const { ok, data } = await brokerFetch<{
                token: string;
                account: TraderAccountState;
                paymentConfig?: CryptoPaymentMethodConfig[];
                error?: string;
              }>('/api/auth/register', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email, password, firstName, lastName, country }),
              });
              if (!ok) throw new Error(data.error || 'Registration failed.');
              localStorage.setItem('binarx_auth_token', data.token);
              localStorage.setItem('quantax_client_id', data.account.clientId);
              setAuthToken(data.token);
              setClientId(data.account.clientId);
              setAccount(data.account);
              if (data.paymentConfig) setPaymentConfig(data.paymentConfig);
              pushToast('Account Created', `Saved permanently for ${data.account.email}`, 'win');
            }}
            onLogout={async () => {
              if (authToken) {
                await brokerFetch('/api/auth/logout', {
                  method: 'POST',
                  headers: { Authorization: `Bearer ${authToken}`, 'Content-Type': 'application/json' },
                  body: JSON.stringify({ token: authToken }),
                }).catch(() => {});
              }
              const guestId = `trader_${Math.random().toString(36).slice(2, 10)}`;
              localStorage.removeItem('binarx_auth_token');
              localStorage.setItem('quantax_client_id', guestId);
              setAuthToken(null);
              setClientId(guestId);
              pushToast('Signed Out', 'Switched back to guest demo session.', 'info');
            }}
            onSaveProfile={async (patch: Partial<UserProfile> & { currency?: string }) => {
              const { data } = await brokerFetch<{ account?: TraderAccountState }>('/api/account/profile', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({ clientId, ...patch }),
              });
              if (data?.account) setAccount(data.account);
            }}
            onChangePassword={async (currentPassword, newPassword) => {
              const { ok, data } = await brokerFetch<{ error?: string }>('/api/account/password', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
                },
                body: JSON.stringify({ currentPassword, newPassword }),
              });
              if (!ok) throw new Error(data.error || 'Failed to update password.');
            }}
            onDeleteAccount={async () => {
              const { ok, data } = await brokerFetch<{ error?: string }>('/api/account', {
                method: 'DELETE',
                headers: authToken ? { Authorization: `Bearer ${authToken}` } : {},
              });
              if (!ok) throw new Error(data.error || 'Unable to delete account.');
              const guestId = `trader_${Math.random().toString(36).slice(2, 10)}`;
              localStorage.removeItem('binarx_auth_token');
              localStorage.setItem('quantax_client_id', guestId);
              setAuthToken(null);
              setClientId(guestId);
              pushToast('Account Deleted', 'Your account has been removed.', 'info');
            }}
            onPaymentConfigUpdated={(methods) => setPaymentConfig(methods)}
          />
        ) : navSection === 'support' ? (
          <SupportView onGoTrade={() => setNavSection('trade')} />
        ) : (
          <SettingsView
            settings={settings}
            onUpdate={(patch) => setSettings((prev) => ({ ...prev, ...patch }))}
          />
        )}
      </div>

      {/* MODALS */}
      <AssetSelectorModal
        isOpen={showAssetModal}
        onClose={() => setShowAssetModal(false)}
        assets={assets}
        quotes={quotes}
        selectedSymbol={selectedSymbol}
        favorites={favorites}
        onToggleFavorite={(sym) =>
          setFavorites((prev) => (prev.includes(sym) ? prev.filter((s) => s !== sym) : [...prev, sym]))
        }
        onSelectAsset={handleSelectAsset}
      />

      <WalletModal
        isOpen={showWalletModal}
        initialTab={walletInitialTab}
        onClose={() => setShowWalletModal(false)}
        account={account}
        paymentConfig={paymentConfig}
        onDeposit={async (amt, method, promoCode, txHash) => {
          const { ok, data } = await brokerFetch<{ account?: TraderAccountState; error?: string }>(
            '/api/wallet/deposit',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId, amount: amt, method, promoCode, txHash }),
            }
          );
          if (!ok) throw new Error(data.error || 'Deposit failed');
          if (data.account) setAccount(data.account);
        }}
        onWithdraw={async (amt, method, destination) => {
          const { ok, data } = await brokerFetch<{ account?: TraderAccountState; error?: string }>(
            '/api/wallet/withdraw',
            {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ clientId, amount: amt, method, destination }),
            }
          );
          if (!ok) throw new Error(data.error || 'Withdrawal failed');
          if (data.account) setAccount(data.account);
        }}
        onRefillDemo={async () => {
          const { data } = await brokerFetch<{ account?: TraderAccountState }>('/api/wallet/refill-demo', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ clientId }),
          });
          if (data?.account) setAccount(data.account);
        }}
      />

      {/* TOAST NOTIFICATIONS */}
      <div className="fixed top-14 right-3 left-3 sm:top-auto sm:bottom-4 sm:left-24 sm:right-auto z-50 space-y-2 pointer-events-none flex flex-col items-end sm:items-start">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`px-3.5 py-2.5 rounded-md shadow-xl border text-xs pointer-events-auto max-w-xs ${
              t.variant === 'win'
                ? 'bg-[#0FAF59] border-emerald-400 text-white'
                : t.variant === 'loss'
                  ? 'bg-[#1C212D] border-[#F05044] text-white'
                  : 'bg-[#1C212D] border-[#1D74F5] text-white'
            }`}
          >
            <div className="font-display font-bold">{t.title}</div>
            <div className="font-mono-tabular text-[11px] opacity-90 mt-0.5">{t.detail}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
