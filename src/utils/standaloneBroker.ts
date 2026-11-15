import { ASSETS, ASSET_MAP, TIMEFRAME_SECONDS } from '../constants/assets.ts';
import type {
  AccountMode,
  AdminUserSummary,
  Candle,
  CryptoPaymentMethodConfig,
  DepositRequest,
  LeaderboardEntry,
  MarketQuote,
  PendingOrder,
  Timeframe,
  Trade,
  TradeDirection,
  TraderAccountState,
  UserProfile,
  WithdrawalRequest,
} from '../types/trading.ts';

const DB_STORAGE_KEY = 'binarx_standalone_db_v1';
const ADMIN_SEED_EMAILS = ['rakishasan19@gmail.com', 'ashikurrahat021@gmail.com'];
const ADMIN_SEED_PASS = 'asdfg@#$%';

const DEFAULT_PAYMENT_CONFIG: CryptoPaymentMethodConfig[] = [
  {
    id: 'usdt_trc20',
    label: 'USDT (TRC-20)',
    network: 'TRON (TRC20)',
    address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
    note: 'Send exact USDT TRC-20 amount and submit your TxID below for fast approval.',
    enabled: true,
  },
  {
    id: 'usdt_erc20',
    label: 'USDT (ERC-20)',
    network: 'Ethereum (ERC20)',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    note: 'ERC-20 USDT transfers require network confirmation before admin approval.',
    enabled: true,
  },
  {
    id: 'btc',
    label: 'Bitcoin (BTC)',
    network: 'Bitcoin Mainnet',
    address: 'bc1qxy2kgdygjrsqtzq2n0yrf2493p83kkfjhx0wlh',
    note: 'Send BTC to this address and paste your transaction hash.',
    enabled: true,
  },
  {
    id: 'eth',
    label: 'Ethereum (ETH)',
    network: 'Ethereum Mainnet',
    address: '0x71C7656EC7ab88b098defB751B7401B5f6d8976F',
    note: 'Send ETH via mainnet and submit your reference hash.',
    enabled: true,
  },
  {
    id: 'binance_pay',
    label: 'Binance Pay',
    network: 'Binance Pay ID',
    address: '849201485',
    note: 'Transfer via Binance Pay ID and enter your Order ID.',
    enabled: true,
  },
  {
    id: 'card',
    label: 'Visa / Mastercard',
    network: 'Card / Bank Transfer',
    address: 'BINARX-INSTANT-GATEWAY',
    note: 'Submit card / gateway deposit request for instant admin verification.',
    enabled: true,
  },
];

const OTC_FALLBACK_SPOTS: Record<string, number> = {
  'EUR/NZD (OTC)': 1.8142,
  'USD/BRL (OTC)': 5.742,
  'CAD/CHF (OTC)': 0.6318,
  'NZD/CAD (OTC)': 0.8245,
  'USD/MXN (OTC)': 20.145,
  'USD/NGN (OTC)': 1645.5,
  'EUR/CHF (OTC)': 0.9384,
  'USD/BDT (OTC)': 119.52,
  'USD/IDR (OTC)': 15840.0,
  'USD/ARS (OTC)': 998.4,
  'AUD/CHF (OTC)': 0.5742,
  'GBP/JPY (OTC)': 196.42,
  'NZD/CHF (OTC)': 0.5204,
  'USD/JPY (OTC)': 154.28,
  'GBP/AUD (OTC)': 1.9465,
  'USD/DZD (OTC)': 133.6,
  'USD/PKR (OTC)': 277.85,
  'USD/ZAR (OTC)': 18.08,
  'AUD/JPY (OTC)': 100.46,
  'EUR/GBP (OTC)': 0.8342,
  'EUR/JPY (OTC)': 163.12,
  'USD/COP (OTC)': 4395.0,
  'EUR/USD (OTC)': 1.0574,
  'USD/EGP (OTC)': 49.32,
  'AUD/CAD (OTC)': 0.9082,
  'AUD/USD (OTC)': 0.6512,
  'CHF/JPY (OTC)': 173.84,
  'EUR/AUD (OTC)': 1.6238,
  'EUR/CAD (OTC)': 1.4748,
  'GBP/CAD (OTC)': 1.7684,
  'USD/CAD (OTC)': 1.3948,
  'USD/CHF (OTC)': 0.8874,
  'USD/PHP (OTC)': 58.65,
  'NZD/JPY (OTC)': 90.82,
  'GBP/NZD (OTC)': 2.1542,
  'NZD/USD (OTC)': 0.5887,
  'CAD/JPY (OTC)': 110.62,
  'GBP/USD (OTC)': 1.2678,
  'AUD/NZD (OTC)': 1.1062,
  'GBP/CHF (OTC)': 1.125,
};

const MARKET_FALLBACK_SPOTS: Record<string, number> = {
  'BTC/USD': 91250,
  'ETH/USD': 3140,
  'SOL/USD': 218.4,
  'BNB/USD': 628.5,
  'XRP/USD': 0.945,
  'ADA/USD': 0.724,
  'DOGE/USD': 0.368,
  'AVAX/USD': 35.4,
  'XAU/USD': 2612.4,
  'XAG/USD': 30.85,
  'WTI/USD': 68.42,
  'EUR/USD': 1.0574,
  'GBP/USD': 1.2678,
  'USD/JPY': 154.28,
  'AUD/USD': 0.6512,
  'USD/CAD': 1.3948,
  'AAPL': 227.5,
  'TSLA': 328.4,
  'NVDA': 144.2,
  'MSFT': 419.6,
};

interface StoredUser {
  email: string;
  password: string;
  clientId: string;
}

interface StandaloneDb {
  users: StoredUser[];
  accounts: Record<string, TraderAccountState>;
  sessions: Record<string, string>;
  depositRequests: DepositRequest[];
  withdrawalRequests: WithdrawalRequest[];
  paymentConfig: CryptoPaymentMethodConfig[];
  otcCounterFlowEnabled: boolean;
}

type EventListener = (msg: Record<string, unknown>) => void;

function makeDefaultProfile(opts: {
  email?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  role?: 'user' | 'admin';
  verified?: boolean;
}): UserProfile {
  const numericId = String(79000000 + Math.floor(Math.random() * 999999));
  const now = Date.now();
  return {
    userId: numericId,
    nickname: `#${numericId}`,
    firstName: opts.firstName || '',
    lastName: opts.lastName || '',
    dob: '',
    email: opts.email || 'guest@binarxtrade.com',
    country: opts.country || 'Bangladesh',
    address: '',
    language: 'English',
    timezone: '(UTC+06:00)',
    twoFactorLogin: false,
    twoFactorWithdraw: false,
    verified: opts.verified ?? false,
    role: opts.role ?? 'user',
    createdAt: now,
    lastLoginAt: now,
  };
}

class StandaloneBrokerEngine {
  private started = false;
  private quotes = new Map<string, MarketQuote>();
  private live1sCandles = new Map<string, Candle[]>();
  private recentTickDirs = new Map<string, number[]>();
  private listeners = new Set<EventListener>();
  private db: StandaloneDb;

  constructor() {
    this.db = this.loadDb();
    this.ensureSeedAdmins();
  }

  private loadDb(): StandaloneDb {
    try {
      const raw = localStorage.getItem(DB_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Partial<StandaloneDb>;
        return {
          users: Array.isArray(parsed.users) ? parsed.users : [],
          accounts: parsed.accounts || {},
          sessions: parsed.sessions || {},
          depositRequests: Array.isArray(parsed.depositRequests) ? parsed.depositRequests : [],
          withdrawalRequests: Array.isArray(parsed.withdrawalRequests) ? parsed.withdrawalRequests : [],
          paymentConfig:
            Array.isArray(parsed.paymentConfig) && parsed.paymentConfig.length > 0
              ? parsed.paymentConfig
              : [...DEFAULT_PAYMENT_CONFIG],
          otcCounterFlowEnabled:
            typeof parsed.otcCounterFlowEnabled === 'boolean' ? parsed.otcCounterFlowEnabled : true,
        };
      }
    } catch {
      // Ignore corrupt storage
    }
    return {
      users: [],
      accounts: {},
      sessions: {},
      depositRequests: [],
      withdrawalRequests: [],
      paymentConfig: [...DEFAULT_PAYMENT_CONFIG],
      otcCounterFlowEnabled: true,
    };
  }

  private saveDb() {
    try {
      localStorage.setItem(DB_STORAGE_KEY, JSON.stringify(this.db));
    } catch {
      // Ignore quota errors
    }
  }

  private ensureSeedAdmins() {
    let changed = false;
    for (const email of ADMIN_SEED_EMAILS) {
      const clean = email.toLowerCase();
      if (!this.db.users.some((u) => u.email === clean)) {
        const clientId = `adm_${clean.replace(/[^a-z0-9]/g, '').slice(0, 12)}`;
        const profile = makeDefaultProfile({
          email: clean,
          firstName: clean.startsWith('raki') ? 'Raki' : 'Ashikur',
          lastName: clean.startsWith('raki') ? 'Hasan' : 'Rahat',
          role: 'admin',
          verified: true,
        });
        this.db.accounts[clientId] = {
          clientId,
          isAuthenticated: true,
          role: 'admin',
          name: `${profile.firstName} ${profile.lastName}`.trim(),
          email: clean,
          currency: 'USD',
          accountMode: 'live',
          demoBalance: 10000,
          liveBalance: 5000,
          profile,
          trades: [],
          pendingOrders: [],
          transactions: [],
          depositRequests: [],
          withdrawalRequests: [],
        };
        this.db.users.push({ email: clean, password: ADMIN_SEED_PASS, clientId });
        changed = true;
      }
    }
    if (changed) this.saveDb();
  }

  public start() {
    if (this.started) return;
    this.started = true;

    this.seedAllMarkets();
    this.fetchLiveFxSpots();
    this.seedBinanceTickers();
    this.connectBinanceWs();
    this.connectCoinbaseWs();

    window.setInterval(() => this.tickOtcAndMarketFallback(), 400);
    window.setInterval(() => this.settlementLoop(), 100);
    window.setInterval(() => this.fetchLiveFxSpots(), 300_000);
  }

  public subscribe(listener: EventListener): () => void {
    this.start();
    this.listeners.add(listener);
    listener({
      type: 'init',
      quotes: Array.from(this.quotes.values()),
    });
    return () => {
      this.listeners.delete(listener);
    };
  }

  private emit(msg: Record<string, unknown>) {
    for (const fn of this.listeners) {
      try {
        fn(msg);
      } catch {
        // Ignore listener error
      }
    }
  }

  private seedHistoryForSymbol(symbol: string, anchor: number, decimals: number) {
    const nowSec = Math.floor(Date.now() / 1000);
    const candles: Candle[] = [];
    const stepBase = anchor * 0.00018;
    let price = anchor * (1 - 0.002 + (Math.random() - 0.5) * 0.002);

    for (let i = 1500; i >= 0; i--) {
      const t = nowSec - i;
      const drift = (anchor - price) * 0.004;
      const delta = drift + (Math.random() - 0.5) * stepBase * 1.8;
      const open = Number(price.toFixed(decimals));
      price = Math.max(anchor * 0.85, price + delta);
      const close = Number(price.toFixed(decimals));
      const wick = Math.abs(delta) * 0.6 + stepBase * 0.35;
      const high = Number((Math.max(open, close) + Math.random() * wick).toFixed(decimals));
      const low = Number((Math.min(open, close) - Math.random() * wick).toFixed(decimals));
      candles.push({ time: t, open, high, low, close, volume: Math.round(5 + Math.random() * 40) });
    }
    this.live1sCandles.set(symbol, candles);

    const lastClose = candles[candles.length - 1].close;
    const spread = Math.max(Math.pow(10, -decimals), lastClose * 0.00012);
    const open24h = candles[0].open;
    this.quotes.set(symbol, {
      symbol,
      price: lastClose,
      open24h,
      high24h: Math.max(...candles.map((c) => c.high)),
      low24h: Math.min(...candles.map((c) => c.low)),
      changePct: ((lastClose - open24h) / open24h) * 100,
      timestamp: Date.now(),
      bid: Number((lastClose - spread / 2).toFixed(decimals)),
      ask: Number((lastClose + spread / 2).toFixed(decimals)),
      buySentiment: 50,
      isLive: true,
      provider: ASSET_MAP.get(symbol)?.category === 'otc' ? 'Binarx OTC 24/7' : 'Live Feed',
    });
  }

  private seedAllMarkets() {
    for (const asset of ASSETS) {
      const anchor =
        OTC_FALLBACK_SPOTS[asset.symbol] ??
        MARKET_FALLBACK_SPOTS[asset.symbol] ??
        100;
      this.seedHistoryForSymbol(asset.symbol, anchor, asset.decimals);
    }
  }

  private async fetchLiveFxSpots() {
    try {
      const res = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!res.ok) return;
      const data = (await res.json()) as { rates?: Record<string, number> };
      const rates = data.rates;
      if (!rates) return;

      for (const asset of ASSETS) {
        if (asset.category !== 'otc' && asset.category !== 'forex') continue;
        const rBase = asset.baseCurrency === 'USD' ? 1 : rates[asset.baseCurrency];
        const rQuote = asset.quoteCurrency === 'USD' ? 1 : rates[asset.quoteCurrency];
        if (rBase && rQuote) {
          const spot = Number((rQuote / rBase).toFixed(asset.decimals));
          this.updateQuote(asset.symbol, spot, { provider: asset.category === 'otc' ? 'Binarx OTC 24/7' : 'FX Live' });
        }
      }
    } catch {
      // Keep seeded spots
    }
  }

  private async seedBinanceTickers() {
    try {
      const binanceAssets = ASSETS.filter((a) => a.source === 'binance');
      const symbols = JSON.stringify(binanceAssets.map((a) => a.providerSymbol));
      const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
      if (!res.ok) return;
      const list = (await res.json()) as Array<{
        symbol: string;
        lastPrice: string;
        openPrice: string;
        highPrice: string;
        lowPrice: string;
      }>;
      const byProvider = new Map(binanceAssets.map((a) => [a.providerSymbol.toUpperCase(), a]));
      for (const item of list) {
        const asset = byProvider.get(item.symbol.toUpperCase());
        if (!asset) continue;
        this.updateQuote(asset.symbol, parseFloat(item.lastPrice), {
          open24h: parseFloat(item.openPrice),
          high24h: parseFloat(item.highPrice),
          low24h: parseFloat(item.lowPrice),
          provider: 'Binance Live',
        });
      }
    } catch {
      // Fallback already seeded
    }
  }

  private connectBinanceWs() {
    try {
      const binanceAssets = ASSETS.filter((a) => a.source === 'binance');
      const byProvider = new Map(binanceAssets.map((a) => [a.providerSymbol.toUpperCase(), a]));
      const streams = binanceAssets.map((a) => `${a.providerSymbol.toLowerCase()}@trade`).join('/');
      const ws = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
      let lastEmit = new Map<string, number>();

      ws.onmessage = (evt) => {
        try {
          const parsed = JSON.parse(evt.data as string) as { data?: { s: string; p: string; q: string; T: number } };
          const d = parsed.data;
          if (!d?.s) return;
          const asset = byProvider.get(d.s.toUpperCase());
          if (!asset) return;
          const price = parseFloat(d.p);
          const now = d.T || Date.now();
          this.record1sTick(asset.symbol, price, parseFloat(d.q) || 1, now);
          if (now - (lastEmit.get(asset.symbol) ?? 0) >= 150) {
            lastEmit.set(asset.symbol, now);
            const q = this.updateQuote(asset.symbol, price, { timestamp: now, provider: 'Binance Live' });
            this.emit({ type: 'tick', quote: q });
          }
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        window.setTimeout(() => this.connectBinanceWs(), 4000);
      };
    } catch {
      // ignore
    }
  }

  private connectCoinbaseWs() {
    try {
      const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
      const map: Record<string, string> = {
        'PAXG-USD': 'XAU/USD',
        'BTC-USD': 'BTC/USD',
        'ETH-USD': 'ETH/USD',
        'SOL-USD': 'SOL/USD',
      };
      ws.onopen = () => {
        ws.send(JSON.stringify({ type: 'subscribe', product_ids: Object.keys(map), channels: ['ticker'] }));
      };
      ws.onmessage = (evt) => {
        try {
          const d = JSON.parse(evt.data as string) as { type?: string; product_id?: string; price?: string };
          if (d.type !== 'ticker' || !d.product_id || !d.price) return;
          const sym = map[d.product_id];
          if (!sym) return;
          const price = parseFloat(d.price);
          if (!Number.isFinite(price)) return;
          this.record1sTick(sym, price, 1, Date.now());
          const q = this.updateQuote(sym, price, { provider: 'Coinbase Live' });
          this.emit({ type: 'tick', quote: q });
        } catch {
          // ignore
        }
      };
      ws.onclose = () => {
        window.setTimeout(() => this.connectCoinbaseWs(), 5000);
      };
    } catch {
      // ignore
    }
  }

  private record1sTick(symbol: string, price: number, volume: number, timestampMs: number) {
    const sec = Math.floor(timestampMs / 1000);
    let buf = this.live1sCandles.get(symbol);
    if (!buf) {
      buf = [];
      this.live1sCandles.set(symbol, buf);
    }
    const last = buf[buf.length - 1];
    if (last && last.time === sec) {
      last.high = Math.max(last.high, price);
      last.low = Math.min(last.low, price);
      last.close = price;
      last.volume += volume;
    } else {
      buf.push({
        time: sec,
        open: last ? last.close : price,
        high: price,
        low: price,
        close: price,
        volume,
      });
      if (buf.length > 3600) buf.shift();
    }
  }

  private updateQuote(
    symbol: string,
    rawPrice: number,
    meta: Partial<MarketQuote> = {}
  ): MarketQuote {
    const asset = ASSET_MAP.get(symbol);
    const dec = asset?.decimals ?? 4;
    const price = Number(rawPrice.toFixed(dec));
    const prev = this.quotes.get(symbol);

    const dirs = this.recentTickDirs.get(symbol) ?? [];
    if (prev && price !== prev.price) {
      dirs.push(price > prev.price ? 1 : -1);
      if (dirs.length > 30) dirs.shift();
      this.recentTickDirs.set(symbol, dirs);
    }
    const upCount = dirs.filter((d) => d > 0).length;
    const buySentiment = dirs.length > 0 ? Math.round((upCount / dirs.length) * 100) : 50;
    const open24h = meta.open24h ?? prev?.open24h ?? price;
    const spread = Math.max(Math.pow(10, -dec), price * 0.0001);

    const next: MarketQuote = {
      symbol,
      price,
      open24h,
      high24h: Math.max(meta.high24h ?? prev?.high24h ?? price, price),
      low24h: Math.min(meta.low24h ?? prev?.low24h ?? price, price),
      changePct: open24h > 0 ? ((price - open24h) / open24h) * 100 : 0,
      timestamp: meta.timestamp ?? Date.now(),
      bid: Number((price - spread / 2).toFixed(dec)),
      ask: Number((price + spread / 2).toFixed(dec)),
      buySentiment,
      isLive: true,
      provider: meta.provider ?? prev?.provider ?? 'Binarx Live',
    };
    this.quotes.set(symbol, next);
    return next;
  }

  private computeOtcExposure(symbol: string, now: number) {
    let upVolume = 0;
    let downVolume = 0;
    let upCount = 0;
    let downCount = 0;
    for (const acc of Object.values(this.db.accounts)) {
      for (const tr of acc.trades) {
        if (tr.status !== 'active' || tr.symbol !== symbol || tr.expiryTime <= now) continue;
        if (tr.direction === 'UP') {
          upVolume += tr.amount;
          upCount += 1;
        } else {
          downVolume += tr.amount;
          downCount += 1;
        }
      }
    }
    return { upVolume, downVolume, upCount, downCount };
  }

  private tickOtcAndMarketFallback() {
    const now = Date.now();
    const updated: MarketQuote[] = [];

    for (const asset of ASSETS) {
      if (asset.category !== 'otc' && asset.source === 'binance') continue;
      const prevQ = this.quotes.get(asset.symbol);
      if (!prevQ) continue;

      let bias = 0;
      let stepScale = 0.0001;
      if (asset.category === 'otc' && this.db.otcCounterFlowEnabled) {
        const exp = this.computeOtcExposure(asset.symbol, now);
        if (exp.upVolume > exp.downVolume) {
          bias = -Math.min(0.85, 0.35 + (exp.upVolume - exp.downVolume) / (exp.upVolume + exp.downVolume + 10) * 0.5);
          stepScale = 0.00018;
        } else if (exp.downVolume > exp.upVolume) {
          bias = Math.min(0.85, 0.35 + (exp.downVolume - exp.upVolume) / (exp.upVolume + exp.downVolume + 10) * 0.5);
          stepScale = 0.00018;
        }
      }

      const delta = (bias + (Math.random() - 0.5) * 1.4) * (prevQ.price * stepScale);
      const minTick = Math.pow(10, -asset.decimals);
      const nextPrice = Number(Math.max(minTick, prevQ.price + delta).toFixed(asset.decimals));
      this.record1sTick(asset.symbol, nextPrice, 10, now);
      updated.push(this.updateQuote(asset.symbol, nextPrice, { timestamp: now }));
    }

    if (updated.length > 0) {
      this.emit({ type: 'ticks', quotes: updated });
    }
  }

  private settlementLoop() {
    const now = Date.now();
    for (const acc of Object.values(this.db.accounts)) {
      let changed = false;
      for (const order of acc.pendingOrders) {
        const q = this.quotes.get(order.symbol);
        if (order.status !== 'pending' || !q) continue;
        const hitPrice =
          order.triggerType === 'price' &&
          order.targetPrice !== undefined &&
          ((order.condition === 'above' && q.price >= order.targetPrice) ||
            (order.condition === 'below' && q.price <= order.targetPrice));
        const hitTime =
          order.triggerType === 'time' && order.targetTime !== undefined && now >= order.targetTime;
        if (hitPrice || hitTime) {
          order.status = 'triggered';
          changed = true;
          this.placeTradeOnAcc(acc, {
            symbol: order.symbol,
            direction: order.direction,
            amount: order.amount,
            durationSeconds: order.durationSeconds,
            accountMode: order.accountMode,
          });
        }
      }

      for (const tr of acc.trades) {
        if (tr.status !== 'active' || now < tr.expiryTime) continue;
        const exitPrice = this.quotes.get(tr.symbol)?.price ?? tr.entryPrice;
        tr.exitPrice = exitPrice;
        const win =
          (tr.direction === 'UP' && exitPrice > tr.entryPrice) ||
          (tr.direction === 'DOWN' && exitPrice < tr.entryPrice);
        if (win) {
          tr.status = 'won';
          tr.payoutAmount = Math.round(tr.amount * (1 + tr.payoutRate / 100) * 100) / 100;
          tr.profit = Math.round((tr.payoutAmount - tr.amount) * 100) / 100;
          if (tr.accountMode === 'demo') acc.demoBalance = Math.round((acc.demoBalance + tr.payoutAmount) * 100) / 100;
          else acc.liveBalance = Math.round((acc.liveBalance + tr.payoutAmount) * 100) / 100;
        } else if (exitPrice === tr.entryPrice) {
          tr.status = 'tie';
          tr.payoutAmount = tr.amount;
          tr.profit = 0;
          if (tr.accountMode === 'demo') acc.demoBalance = Math.round((acc.demoBalance + tr.amount) * 100) / 100;
          else acc.liveBalance = Math.round((acc.liveBalance + tr.amount) * 100) / 100;
        } else {
          tr.status = 'lost';
          tr.payoutAmount = 0;
          tr.profit = -tr.amount;
        }
        changed = true;
        this.emit({ type: 'trade:settled', trade: tr });
      }

      if (changed) {
        this.saveDb();
        this.emit({ type: 'account:update', account: acc });
      }
    }
  }

  private getOrCreateAccount(clientId: string): TraderAccountState {
    if (!this.db.accounts[clientId]) {
      const profile = makeDefaultProfile({ email: 'guest@binarxtrade.com', role: 'user', verified: false });
      this.db.accounts[clientId] = {
        clientId,
        isAuthenticated: false,
        role: 'user',
        name: 'Guest Trader',
        email: 'guest@binarxtrade.com',
        currency: 'USD',
        accountMode: 'demo',
        demoBalance: 10000,
        liveBalance: 0,
        profile,
        trades: [],
        pendingOrders: [],
        transactions: [],
        depositRequests: [],
        withdrawalRequests: [],
      };
      this.saveDb();
    }
    const acc = this.db.accounts[clientId];
    acc.depositRequests = this.db.depositRequests.filter((d) => d.clientId === acc.clientId);
    acc.withdrawalRequests = this.db.withdrawalRequests.filter((w) => w.clientId === acc.clientId);
    return acc;
  }

  private getAuthFromHeaders(headers?: HeadersInit, tokenParam?: string | null): TraderAccountState | null {
    let token = tokenParam || '';
    if (!token && headers) {
      const h = new Headers(headers);
      const auth = h.get('authorization');
      if (auth?.startsWith('Bearer ')) token = auth.slice(7);
    }
    if (!token) return null;
    const email = this.db.sessions[token];
    if (!email) return null;
    const user = this.db.users.find((u) => u.email === email);
    if (!user) return null;
    return this.getOrCreateAccount(user.clientId);
  }

  private placeTradeOnAcc(
    acc: TraderAccountState,
    params: {
      symbol: string;
      direction: TradeDirection;
      amount: number;
      durationSeconds: number;
      accountMode?: AccountMode;
    }
  ): { ok: true; trade: Trade } | { ok: false; error: string } {
    const asset = ASSET_MAP.get(params.symbol);
    const quote = this.quotes.get(params.symbol);
    if (!asset || !quote) return { ok: false, error: 'Asset not ready.' };
    const mode = params.accountMode || acc.accountMode;
    const bal = mode === 'demo' ? acc.demoBalance : acc.liveBalance;
    if (params.amount < 1 || params.amount > bal) {
      return { ok: false, error: `Insufficient ${mode} balance ($${bal.toFixed(2)}).` };
    }
    if (mode === 'demo') acc.demoBalance = Math.round((acc.demoBalance - params.amount) * 100) / 100;
    else acc.liveBalance = Math.round((acc.liveBalance - params.amount) * 100) / 100;

    const now = Date.now();
    const trade: Trade = {
      id: `tr_${now}_${Math.random().toString(36).slice(2, 6)}`,
      symbol: asset.symbol,
      accountMode: mode,
      direction: params.direction,
      amount: params.amount,
      payoutRate: asset.payout,
      entryPrice: quote.price,
      entryTime: now,
      expiryTime: now + params.durationSeconds * 1000,
      durationSeconds: params.durationSeconds,
      status: 'active',
      payoutAmount: Math.round(params.amount * (1 + asset.payout / 100) * 100) / 100,
      profit: 0,
    };
    acc.trades.unshift(trade);
    this.saveDb();
    this.emit({ type: 'account:update', account: acc });
    return { ok: true, trade };
  }

  private async fetchBinanceCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
    const asset = ASSET_MAP.get(symbol);
    if (!asset || asset.source !== 'binance') return [];
    const intervalMap: Record<Timeframe, string> = {
      '5s': '1m',
      '10s': '1m',
      '15s': '1m',
      '30s': '1m',
      '1m': '1m',
      '5m': '5m',
      '15m': '15m',
      '1h': '1h',
    };
    try {
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${asset.providerSymbol}&interval=${intervalMap[tf]}&limit=240`
      );
      if (!res.ok) return [];
      const rows = (await res.json()) as Array<[number, string, string, string, string, string]>;
      return rows.map((r) => ({
        time: Math.floor(r[0] / 1000),
        open: parseFloat(r[1]),
        high: parseFloat(r[2]),
        low: parseFloat(r[3]),
        close: parseFloat(r[4]),
        volume: parseFloat(r[5]),
      }));
    } catch {
      return [];
    }
  }

  public async handleRequest(pathWithQuery: string, init: RequestInit = {}): Promise<{ ok: boolean; status: number; data: unknown }> {
    this.start();
    const url = new URL(pathWithQuery, 'http://standalone.local');
    const path = url.pathname;
    const method = (init.method || 'GET').toUpperCase();
    const body = init.body ? JSON.parse(String(init.body)) : {};

    if (path === '/api/bootstrap' && method === 'GET') {
      const authAcc = this.getAuthFromHeaders(init.headers, url.searchParams.get('token'));
      const clientId = authAcc ? authAcc.clientId : url.searchParams.get('clientId') || 'default_trader';
      const account = authAcc || this.getOrCreateAccount(clientId);
      return {
        ok: true,
        status: 200,
        data: {
          assets: ASSETS,
          quotes: Array.from(this.quotes.values()),
          account,
          paymentConfig: this.db.paymentConfig,
        },
      };
    }

    if (path === '/api/payment-config' && method === 'GET') {
      return { ok: true, status: 200, data: { paymentConfig: this.db.paymentConfig } };
    }

    if (path === '/api/candles' && method === 'GET') {
      const symbol = url.searchParams.get('symbol') || 'GBP/USD (OTC)';
      const tf = (url.searchParams.get('tf') as Timeframe) || '1m';
      const tfSec = TIMEFRAME_SECONDS[tf] || 60;
      const asset = ASSET_MAP.get(symbol);

      if (asset?.source === 'binance' && tfSec >= 60) {
        const real = await this.fetchBinanceCandles(symbol, tf);
        if (real.length > 0) {
          return { ok: true, status: 200, data: { symbol, tf, candles: real } };
        }
      }

      const raw = this.live1sCandles.get(symbol) || [];
      const map = new Map<number, Candle>();
      for (const c of raw) {
        const bucket = Math.floor(c.time / tfSec) * tfSec;
        const ex = map.get(bucket);
        if (!ex) map.set(bucket, { ...c, time: bucket });
        else {
          ex.high = Math.max(ex.high, c.high);
          ex.low = Math.min(ex.low, c.low);
          ex.close = c.close;
          ex.volume += c.volume;
        }
      }
      return { ok: true, status: 200, data: { symbol, tf, candles: Array.from(map.values()).slice(-240) } };
    }

    if (path === '/api/leaderboard' && method === 'GET') {
      const acc = this.getOrCreateAccount(url.searchParams.get('clientId') || 'default_trader');
      const closed = acc.trades.filter((t) => t.status !== 'active');
      const profit = closed.reduce((s, t) => s + t.profit, 0);
      const wins = closed.filter((t) => t.status === 'won').length;
      const entries: LeaderboardEntry[] = [
        { rank: 1, name: 'Marcus Vance', country: 'SG', tradesCount: 148, winRate: 76.4, profit: 18420.5 },
        { rank: 2, name: 'Elena Rostova', country: 'DE', tradesCount: 112, winRate: 73.2, profit: 14190 },
        { rank: 3, name: 'Kenji Takahashi', country: 'JP', tradesCount: 94, winRate: 71.8, profit: 11245.75 },
        {
          rank: 4,
          name: acc.name,
          country: 'BD',
          tradesCount: closed.length,
          winRate: closed.length ? Math.round((wins / closed.length) * 1000) / 10 : 0,
          profit: Math.round(profit * 100) / 100,
          isCurrentUser: true,
        },
      ].sort((a, b) => b.profit - a.profit);
      entries.forEach((e, i) => (e.rank = i + 1));
      return { ok: true, status: 200, data: { leaderboard: entries } };
    }

    if (path === '/api/trade' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      const res = this.placeTradeOnAcc(acc, body);
      if (!res.ok) return { ok: false, status: 400, data: { error: res.error } };
      return { ok: true, status: 200, data: { trade: res.trade, account: acc } };
    }

    if (path === '/api/pending-order' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      const q = this.quotes.get(body.symbol);
      const asset = ASSET_MAP.get(body.symbol);
      if (!q || !asset) return { ok: false, status: 400, data: { error: 'Asset not found.' } };
      const order: PendingOrder = {
        id: `po_${Date.now()}`,
        symbol: body.symbol,
        accountMode: acc.accountMode,
        direction: body.direction,
        amount: Number(body.amount),
        payoutRate: asset.payout,
        durationSeconds: Number(body.durationSeconds),
        triggerType: body.triggerType,
        targetPrice: body.triggerType === 'price' ? Number(body.targetPrice) : undefined,
        condition:
          body.triggerType === 'price' ? (Number(body.targetPrice) >= q.price ? 'above' : 'below') : undefined,
        targetTime: body.triggerType === 'time' ? Number(body.targetTime) : undefined,
        createdAt: Date.now(),
        status: 'pending',
      };
      acc.pendingOrders.unshift(order);
      this.saveDb();
      return { ok: true, status: 200, data: { order, account: acc } };
    }

    if (path.startsWith('/api/pending-order/') && method === 'DELETE') {
      const id = path.split('/').pop();
      const acc = this.getOrCreateAccount(url.searchParams.get('clientId') || 'default_trader');
      const order = acc.pendingOrders.find((o) => o.id === id);
      if (order) order.status = 'cancelled';
      this.saveDb();
      return { ok: true, status: 200, data: { account: acc } };
    }

    if (path === '/api/account/mode' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      if (body.accountMode === 'demo' || body.accountMode === 'live') acc.accountMode = body.accountMode;
      this.saveDb();
      return { ok: true, status: 200, data: { account: acc } };
    }

    if (path === '/api/auth/register' && method === 'POST') {
      const cleanEmail = String(body.email || '').trim().toLowerCase();
      if (!cleanEmail.includes('@')) return { ok: false, status: 400, data: { error: 'Valid email required.' } };
      if (!body.password || String(body.password).length < 4) {
        return { ok: false, status: 400, data: { error: 'Password must be at least 4 characters.' } };
      }
      if (this.db.users.some((u) => u.email === cleanEmail)) {
        return { ok: false, status: 400, data: { error: 'Email already registered. Please sign in.' } };
      }
      const clientId = `usr_${Math.random().toString(36).slice(2, 10)}`;
      const profile = makeDefaultProfile({
        email: cleanEmail,
        firstName: body.firstName || '',
        lastName: body.lastName || '',
        country: body.country || 'Bangladesh',
        role: ADMIN_SEED_EMAILS.includes(cleanEmail) ? 'admin' : 'user',
        verified: false,
      });
      const acc: TraderAccountState = {
        clientId,
        isAuthenticated: true,
        role: profile.role,
        name: `${profile.firstName} ${profile.lastName}`.trim() || cleanEmail.split('@')[0],
        email: cleanEmail,
        currency: 'USD',
        accountMode: 'demo',
        demoBalance: 10000,
        liveBalance: 0,
        profile,
        trades: [],
        pendingOrders: [],
        transactions: [],
        depositRequests: [],
        withdrawalRequests: [],
      };
      this.db.accounts[clientId] = acc;
      this.db.users.push({ email: cleanEmail, password: String(body.password), clientId });
      const token = `st_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      this.db.sessions[token] = cleanEmail;
      this.saveDb();
      return { ok: true, status: 200, data: { token, account: acc, paymentConfig: this.db.paymentConfig } };
    }

    if (path === '/api/auth/login' && method === 'POST') {
      const cleanEmail = String(body.email || '').trim().toLowerCase();
      const user = this.db.users.find((u) => u.email === cleanEmail);
      if (!user || user.password !== body.password) {
        return { ok: false, status: 401, data: { error: 'Invalid email or password.' } };
      }
      const acc = this.getOrCreateAccount(user.clientId);
      acc.isAuthenticated = true;
      acc.profile.lastLoginAt = Date.now();
      const token = `st_${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      this.db.sessions[token] = cleanEmail;
      this.saveDb();
      return { ok: true, status: 200, data: { token, account: acc, paymentConfig: this.db.paymentConfig } };
    }

    if (path === '/api/auth/logout' && method === 'POST') {
      if (body.token) delete this.db.sessions[body.token];
      this.saveDb();
      return { ok: true, status: 200, data: { ok: true } };
    }

    if (path === '/api/account/profile' && method === 'POST') {
      const acc = this.getAuthFromHeaders(init.headers) || this.getOrCreateAccount(body.clientId || 'default_trader');
      const fields = ['nickname', 'firstName', 'lastName', 'dob', 'country', 'address', 'language', 'timezone'] as const;
      for (const f of fields) {
        if (typeof body[f] === 'string') acc.profile[f] = body[f];
      }
      if (typeof body.twoFactorLogin === 'boolean') acc.profile.twoFactorLogin = body.twoFactorLogin;
      if (typeof body.twoFactorWithdraw === 'boolean') acc.profile.twoFactorWithdraw = body.twoFactorWithdraw;
      if (typeof body.currency === 'string') acc.currency = body.currency;
      const full = `${acc.profile.firstName} ${acc.profile.lastName}`.trim();
      if (full) acc.name = full;
      this.saveDb();
      return { ok: true, status: 200, data: { account: acc } };
    }

    if (path === '/api/account/password' && method === 'POST') {
      const acc = this.getAuthFromHeaders(init.headers);
      if (!acc) return { ok: false, status: 401, data: { error: 'Sign in required.' } };
      const user = this.db.users.find((u) => u.email === acc.email.toLowerCase());
      if (!user || user.password !== body.currentPassword) {
        return { ok: false, status: 400, data: { error: 'Current password is incorrect.' } };
      }
      user.password = body.newPassword;
      this.saveDb();
      return { ok: true, status: 200, data: { ok: true } };
    }

    if (path === '/api/account' && method === 'DELETE') {
      const acc = this.getAuthFromHeaders(init.headers);
      if (!acc) return { ok: false, status: 401, data: { error: 'Sign in required.' } };
      if (acc.role === 'admin') return { ok: false, status: 400, data: { error: 'Primary admins cannot be deleted.' } };
      this.db.users = this.db.users.filter((u) => u.email !== acc.email.toLowerCase());
      delete this.db.accounts[acc.clientId];
      this.saveDb();
      return { ok: true, status: 200, data: { ok: true } };
    }

    if (path === '/api/wallet/refill-demo' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      acc.demoBalance = 10000;
      this.saveDb();
      return { ok: true, status: 200, data: { account: acc } };
    }

    if (path === '/api/wallet/deposit' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      const numAmount = Math.round(Number(body.amount) * 100) / 100;
      if (!Number.isFinite(numAmount) || numAmount < 10) {
        return { ok: false, status: 400, data: { error: 'Minimum deposit is $10.00.' } };
      }
      const bonus = String(body.promoCode || '').trim().toUpperCase() === 'BONUS50' ? Math.round(numAmount * 50) / 100 : 0;
      const reqId = `dep_${Date.now()}`;
      const dep: DepositRequest = {
        id: reqId,
        clientId: acc.clientId,
        email: acc.email,
        userName: acc.name,
        method: body.method || 'USDT (TRC-20)',
        amount: numAmount,
        bonus,
        txHash: body.txHash || undefined,
        status: 'pending',
        createdAt: Date.now(),
      };
      this.db.depositRequests.unshift(dep);
      acc.transactions.unshift({
        id: reqId,
        type: 'deposit',
        method: dep.method,
        amount: numAmount,
        status: 'processing',
        timestamp: Date.now(),
        note: 'Pending Admin approval',
      });
      this.saveDb();
      this.emit({ type: 'admin:update' });
      return { ok: true, status: 200, data: { account: this.getOrCreateAccount(acc.clientId), depositRequest: dep, bonus } };
    }

    if (path === '/api/wallet/withdraw' && method === 'POST') {
      const acc = this.getOrCreateAccount(body.clientId || 'default_trader');
      const numAmount = Math.round(Number(body.amount) * 100) / 100;
      if (numAmount < 10 || numAmount > acc.liveBalance) {
        return { ok: false, status: 400, data: { error: 'Invalid withdrawal amount or insufficient Live balance.' } };
      }
      acc.liveBalance = Math.round((acc.liveBalance - numAmount) * 100) / 100;
      const reqId = `wdr_${Date.now()}`;
      const wdr: WithdrawalRequest = {
        id: reqId,
        clientId: acc.clientId,
        email: acc.email,
        userName: acc.name,
        method: body.method || 'USDT (TRC-20)',
        amount: numAmount,
        destination: body.destination || 'Wallet',
        status: 'pending',
        createdAt: Date.now(),
      };
      this.db.withdrawalRequests.unshift(wdr);
      acc.transactions.unshift({
        id: reqId,
        type: 'withdrawal',
        method: wdr.method,
        amount: numAmount,
        status: 'processing',
        timestamp: Date.now(),
        note: `Pending Admin approval · To ${wdr.destination}`,
      });
      this.saveDb();
      this.emit({ type: 'admin:update' });
      return { ok: true, status: 200, data: { account: this.getOrCreateAccount(acc.clientId), withdrawalRequest: wdr } };
    }

    // ADMIN ROUTES
    if (path.startsWith('/api/admin/')) {
      const adminAcc = this.getAuthFromHeaders(init.headers);
      if (!adminAcc || adminAcc.role !== 'admin') {
        return { ok: false, status: 403, data: { error: 'Admin authorization required.' } };
      }

      if (path === '/api/admin/overview' && method === 'GET') {
        const users: AdminUserSummary[] = this.db.users
          .map((u) => {
            const acc = this.db.accounts[u.clientId];
            if (!acc) return null;
            return {
              clientId: acc.clientId,
              email: acc.email,
              name: acc.name,
              role: acc.role,
              demoBalance: acc.demoBalance,
              liveBalance: acc.liveBalance,
              verified: acc.profile.verified,
              profile: acc.profile,
              tradesCount: acc.trades.length,
              createdAt: acc.profile.createdAt,
              lastLoginAt: acc.profile.lastLoginAt,
            };
          })
          .filter(Boolean) as AdminUserSummary[];

        const now = Date.now();
        const otcExposure = ASSETS.filter((a) => a.category === 'otc')
          .map((a) => {
            const exp = this.computeOtcExposure(a.symbol, now);
            return {
              symbol: a.symbol,
              payout: a.payout,
              price: this.quotes.get(a.symbol)?.price ?? 0,
              ...exp,
            };
          })
          .filter((e) => e.upVolume > 0 || e.downVolume > 0);

        return {
          ok: true,
          status: 200,
          data: {
            users,
            depositRequests: this.db.depositRequests,
            withdrawalRequests: this.db.withdrawalRequests,
            paymentConfig: this.db.paymentConfig,
            otcCounterFlowEnabled: this.db.otcCounterFlowEnabled,
            otcExposure,
          },
        };
      }

      const depMatch = path.match(/^\/api\/admin\/deposit\/([^/]+)\/(approve|reject)$/);
      if (depMatch && method === 'POST') {
        const [, id, action] = depMatch;
        const dep = this.db.depositRequests.find((d) => d.id === id);
        if (!dep) return { ok: false, status: 404, data: { error: 'Not found.' } };
        dep.status = action === 'approve' ? 'approved' : 'rejected';
        dep.reviewedAt = Date.now();
        dep.reviewedBy = adminAcc.email;
        const target = this.getOrCreateAccount(dep.clientId);
        if (action === 'approve') {
          target.liveBalance = Math.round((target.liveBalance + dep.amount + dep.bonus) * 100) / 100;
          target.accountMode = 'live';
          this.emit({ type: 'deposit:approved', amount: dep.amount + dep.bonus, method: dep.method });
        }
        const tx = target.transactions.find((t) => t.id === dep.id);
        if (tx) tx.status = action === 'approve' ? 'completed' : 'rejected';
        this.saveDb();
        this.emit({ type: 'account:update', account: this.getOrCreateAccount(target.clientId) });
        return { ok: true, status: 200, data: { depositRequest: dep } };
      }

      const wdrMatch = path.match(/^\/api\/admin\/withdrawal\/([^/]+)\/(approve|reject)$/);
      if (wdrMatch && method === 'POST') {
        const [, id, action] = wdrMatch;
        const wdr = this.db.withdrawalRequests.find((w) => w.id === id);
        if (!wdr) return { ok: false, status: 404, data: { error: 'Not found.' } };
        wdr.status = action === 'approve' ? 'approved' : 'rejected';
        wdr.reviewedAt = Date.now();
        wdr.reviewedBy = adminAcc.email;
        const target = this.getOrCreateAccount(wdr.clientId);
        if (action === 'reject') {
          target.liveBalance = Math.round((target.liveBalance + wdr.amount) * 100) / 100;
        }
        const tx = target.transactions.find((t) => t.id === wdr.id);
        if (tx) tx.status = action === 'approve' ? 'completed' : 'rejected';
        this.saveDb();
        this.emit({ type: 'account:update', account: this.getOrCreateAccount(target.clientId) });
        return { ok: true, status: 200, data: { withdrawalRequest: wdr } };
      }

      if (path === '/api/admin/payment-config' && method === 'POST') {
        this.db.paymentConfig = body.methods;
        this.saveDb();
        this.emit({ type: 'config:update', paymentConfig: this.db.paymentConfig });
        return { ok: true, status: 200, data: { paymentConfig: this.db.paymentConfig } };
      }

      const userUpd = path.match(/^\/api\/admin\/user\/([^/]+)\/update$/);
      if (userUpd && method === 'POST') {
        const target = this.db.accounts[decodeURIComponent(userUpd[1])];
        if (!target) return { ok: false, status: 404, data: { error: 'User not found.' } };
        if (typeof body.liveBalance === 'number') target.liveBalance = body.liveBalance;
        if (typeof body.demoBalance === 'number') target.demoBalance = body.demoBalance;
        if (typeof body.verified === 'boolean') target.profile.verified = body.verified;
        if ((body.role === 'user' || body.role === 'admin') && !ADMIN_SEED_EMAILS.includes(target.email.toLowerCase())) {
          target.role = body.role;
          target.profile.role = body.role;
        }
        this.saveDb();
        return { ok: true, status: 200, data: { account: target } };
      }

      const userDel = path.match(/^\/api\/admin\/user\/([^/]+)$/);
      if (userDel && method === 'DELETE') {
        const cid = decodeURIComponent(userDel[1]);
        const target = this.db.accounts[cid];
        if (target && !ADMIN_SEED_EMAILS.includes(target.email.toLowerCase())) {
          this.db.users = this.db.users.filter((u) => u.email !== target.email.toLowerCase());
          delete this.db.accounts[cid];
          this.saveDb();
        }
        return { ok: true, status: 200, data: { ok: true } };
      }

      if (path === '/api/admin/otc-settings' && method === 'POST') {
        if (typeof body.counterFlowEnabled === 'boolean') {
          this.db.otcCounterFlowEnabled = body.counterFlowEnabled;
        }
        if (body.symbol && typeof body.payout === 'number') {
          const a = ASSET_MAP.get(body.symbol);
          if (a) a.payout = body.payout;
        }
        this.saveDb();
        return { ok: true, status: 200, data: { otcCounterFlowEnabled: this.db.otcCounterFlowEnabled, assets: ASSETS } };
      }
    }

    return { ok: false, status: 404, data: { error: 'Endpoint not found.' } };
  }
}

export const standaloneBroker = new StandaloneBrokerEngine();
