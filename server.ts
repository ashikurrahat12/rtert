import 'dotenv/config';
import crypto from 'node:crypto';
import express from 'express';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import WebSocket, { WebSocketServer } from 'ws';
import { ASSETS, ASSET_MAP, TIMEFRAME_SECONDS } from './src/constants/assets.ts';
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
} from './src/types/trading.ts';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = Number(process.env.PORT) || 3000;
const DB_DIR = path.join(__dirname, 'data');
const DB_PATH = path.join(DB_DIR, 'broker-db.json');

// Real-time quote state across all assets
const quotes = new Map<string, MarketQuote>();
// Rolling 1-second candle buffer per symbol built from real exchange ticks
const live1sCandles = new Map<string, Candle[]>();
// Momentum tracking for live trader sentiment (Buy % vs Sell %)
const recentTickDirections = new Map<string, number[]>();

// Server-authoritative trader accounts keyed by clientId
const accounts = new Map<string, TraderAccountState>();
// Registered user credentials keyed by lowercase email
interface StoredUserRecord {
  email: string;
  passwordHash: string;
  clientId: string;
}
const usersByEmail = new Map<string, StoredUserRecord>();
// Active auth tokens -> lowercase email
const sessionTokens = new Map<string, string>();

// Global deposit & withdrawal requests
let depositRequests: DepositRequest[] = [];
let withdrawalRequests: WithdrawalRequest[] = [];
let otcCounterFlowEnabled = true;

let paymentConfig: CryptoPaymentMethodConfig[] = [
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

// Connected WebSocket clients keyed by clientId
const clientSockets = new Map<string, Set<WebSocket>>();

const ADMIN_SEED_EMAILS = ['rakishasan19@gmail.com', 'ashikurrahat021@gmail.com'];
const ADMIN_SEED_PASS = 'asdfg@#$%';

function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password: string, stored: string): boolean {
  const [salt, keyHex] = stored.split(':');
  if (!salt || !keyHex) return false;
  const derived = crypto.scryptSync(password, salt, 64);
  const storedBuf = Buffer.from(keyHex, 'hex');
  if (derived.length !== storedBuf.length) return false;
  return crypto.timingSafeEqual(derived, storedBuf);
}

function makeDefaultProfile(opts: {
  userId?: string;
  email?: string;
  firstName?: string;
  lastName?: string;
  country?: string;
  role?: 'user' | 'admin';
  verified?: boolean;
}): UserProfile {
  const numericId = opts.userId || String(79000000 + Math.floor(Math.random() * 999999));
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

let saveTimer: ReturnType<typeof setTimeout> | null = null;
function saveDbNow() {
  try {
    if (!fs.existsSync(DB_DIR)) fs.mkdirSync(DB_DIR, { recursive: true });
    const serialized = {
      users: Array.from(usersByEmail.values()),
      accounts: Array.from(accounts.entries()).filter(([, acc]) => acc.isAuthenticated),
      sessions: Array.from(sessionTokens.entries()),
      depositRequests,
      withdrawalRequests,
      paymentConfig,
      otcCounterFlowEnabled,
    };
    fs.writeFileSync(DB_PATH, JSON.stringify(serialized, null, 2), 'utf-8');
  } catch (err) {
    console.warn('Failed to persist broker DB:', (err as Error).message);
  }
}

function scheduleSaveDb() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    saveDbNow();
  }, 400);
}

function loadAndSeedDb() {
  try {
    if (fs.existsSync(DB_PATH)) {
      const raw = fs.readFileSync(DB_PATH, 'utf-8');
      const parsed = JSON.parse(raw) as {
        users?: StoredUserRecord[];
        accounts?: Array<[string, TraderAccountState]>;
        sessions?: Array<[string, string]>;
        depositRequests?: DepositRequest[];
        withdrawalRequests?: WithdrawalRequest[];
        paymentConfig?: CryptoPaymentMethodConfig[];
        otcCounterFlowEnabled?: boolean;
      };
      if (Array.isArray(parsed.users)) {
        for (const u of parsed.users) usersByEmail.set(u.email.toLowerCase(), u);
      }
      if (Array.isArray(parsed.accounts)) {
        for (const [cid, acc] of parsed.accounts) {
          accounts.set(cid, {
            ...acc,
            depositRequests: acc.depositRequests || [],
            withdrawalRequests: acc.withdrawalRequests || [],
          });
        }
      }
      if (Array.isArray(parsed.sessions)) {
        for (const [tok, em] of parsed.sessions) sessionTokens.set(tok, em);
      }
      if (Array.isArray(parsed.depositRequests)) depositRequests = parsed.depositRequests;
      if (Array.isArray(parsed.withdrawalRequests)) withdrawalRequests = parsed.withdrawalRequests;
      if (Array.isArray(parsed.paymentConfig) && parsed.paymentConfig.length > 0) {
        paymentConfig = parsed.paymentConfig;
      }
      if (typeof parsed.otcCounterFlowEnabled === 'boolean') {
        otcCounterFlowEnabled = parsed.otcCounterFlowEnabled;
      }
    }
  } catch (err) {
    console.warn('Could not load existing broker DB, starting fresh:', (err as Error).message);
  }

  // Always ensure both specified admin accounts exist with exact credentials
  for (const adminEmail of ADMIN_SEED_EMAILS) {
    const cleanEmail = adminEmail.toLowerCase();
    const existing = usersByEmail.get(cleanEmail);
    if (!existing) {
      const clientId = `adm_${crypto.createHash('md5').update(cleanEmail).digest('hex').slice(0, 10)}`;
      const profile = makeDefaultProfile({
        email: cleanEmail,
        firstName: cleanEmail.startsWith('raki') ? 'Raki' : 'Ashikur',
        lastName: cleanEmail.startsWith('raki') ? 'Hasan' : 'Rahat',
        role: 'admin',
        verified: true,
      });
      const acc: TraderAccountState = {
        clientId,
        isAuthenticated: true,
        role: 'admin',
        name: `${profile.firstName} ${profile.lastName}`.trim(),
        email: cleanEmail,
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
      accounts.set(clientId, acc);
      usersByEmail.set(cleanEmail, {
        email: cleanEmail,
        passwordHash: hashPassword(ADMIN_SEED_PASS),
        clientId,
      });
    } else {
      const acc = accounts.get(existing.clientId);
      if (acc) {
        acc.role = 'admin';
        acc.profile.role = 'admin';
        acc.profile.verified = true;
      }
    }
  }
  saveDbNow();
}

function getOrCreateAccount(clientId: string): TraderAccountState {
  let acc = accounts.get(clientId);
  if (!acc) {
    const profile = makeDefaultProfile({ role: 'user', verified: false });
    acc = {
      clientId,
      isAuthenticated: false,
      role: 'user',
      name: 'Guest Trader',
      email: profile.email,
      currency: 'USD',
      accountMode: 'demo',
      demoBalance: 10000,
      liveBalance: 0,
      profile,
      trades: [],
      pendingOrders: [],
      transactions: [
        {
          id: `tx_${Date.now()}`,
          type: 'demo_refill',
          method: 'Demo Allocation',
          amount: 10000,
          status: 'completed',
          timestamp: Date.now(),
          note: 'Initial $10,000.00 practice balance',
        },
      ],
      depositRequests: [],
      withdrawalRequests: [],
    };
    accounts.set(clientId, acc);
  }
  return acc;
}

function syncUserRequestsOnAccount(acc: TraderAccountState) {
  acc.depositRequests = depositRequests.filter((d) => d.clientId === acc.clientId);
  acc.withdrawalRequests = withdrawalRequests.filter((w) => w.clientId === acc.clientId);
}

function notifyAdmins(payload: unknown) {
  const raw = JSON.stringify(payload);
  for (const [cid, sockets] of clientSockets.entries()) {
    const acc = accounts.get(cid);
    if (acc?.role === 'admin') {
      for (const ws of sockets) {
        if (ws.readyState === WebSocket.OPEN) ws.send(raw);
      }
    }
  }
}

function sendToClient(clientId: string, payload: unknown) {
  const sockets = clientSockets.get(clientId);
  if (!sockets) return;
  const raw = JSON.stringify(payload);
  for (const ws of sockets) {
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(raw);
    }
  }
}

function broadcastAll(payload: unknown) {
  const raw = JSON.stringify(payload);
  for (const sockets of clientSockets.values()) {
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(raw);
      }
    }
  }
}

function record1sTick(symbol: string, price: number, volume: number, timestampMs: number) {
  const sec = Math.floor(timestampMs / 1000);
  let buf = live1sCandles.get(symbol);
  if (!buf) {
    buf = [];
    live1sCandles.set(symbol, buf);
  }
  const last = buf[buf.length - 1];
  if (last && last.time === sec) {
    if (price > last.high) last.high = price;
    if (price < last.low) last.low = price;
    last.close = price;
    last.volume += volume;
  } else {
    buf.push({
      time: sec,
      open: price,
      high: price,
      low: price,
      close: price,
      volume,
    });
    if (buf.length > 1800) {
      buf.shift();
    }
  }
}

function updateQuote(
  symbol: string,
  price: number,
  options?: {
    open24h?: number;
    high24h?: number;
    low24h?: number;
    bid?: number;
    ask?: number;
    volume?: number;
    timestamp?: number;
    isLive?: boolean;
    provider?: string;
    skipBroadcast?: boolean;
    overrideBuySentiment?: number;
  }
): MarketQuote | undefined {
  if (!Number.isFinite(price) || price <= 0) return undefined;
  const now = options?.timestamp ?? Date.now();
  const prev = quotes.get(symbol);

  // Track short-term price pressure for dynamic trader sentiment
  let dirs = recentTickDirections.get(symbol);
  if (!dirs) {
    dirs = [];
    recentTickDirections.set(symbol, dirs);
  }
  if (prev && price !== prev.price) {
    dirs.push(price > prev.price ? 1 : -1);
    if (dirs.length > 40) dirs.shift();
  }
  const sumDir = dirs.reduce((a, b) => a + b, 0);
  const sentimentRaw = dirs.length > 0 ? 50 + (sumDir / dirs.length) * 32 : 54;
  const buySentiment =
    options?.overrideBuySentiment ?? Math.round(Math.max(15, Math.min(85, sentimentRaw)));

  const open24h = options?.open24h ?? prev?.open24h ?? price;
  const high24h = Math.max(options?.high24h ?? prev?.high24h ?? price, price);
  const low24h = Math.min(options?.low24h ?? prev?.low24h ?? price, price);
  const changePct = open24h > 0 ? ((price - open24h) / open24h) * 100 : 0;

  const quote: MarketQuote = {
    symbol,
    price,
    open24h,
    high24h,
    low24h,
    changePct,
    timestamp: now,
    bid: options?.bid ?? price,
    ask: options?.ask ?? price,
    buySentiment,
    isLive: options?.isLive ?? true,
    provider: options?.provider ?? prev?.provider ?? 'exchange',
  };

  quotes.set(symbol, quote);
  record1sTick(symbol, price, options?.volume ?? 0, now);

  // Evaluate pending orders for this symbol immediately
  evaluatePendingOrdersForSymbol(symbol, price, now);

  // Broadcast live tick to connected browsers unless batched
  if (!options?.skipBroadcast) {
    broadcastAll({ type: 'tick', quote });
  }
  return quote;
}

// Execute a trade on an account
function executeTradeOnAccount(
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
  if (!asset) return { ok: false, error: 'Unknown trading asset.' };

  const quote = quotes.get(params.symbol);
  if (!quote || quote.price <= 0) {
    return { ok: false, error: 'Live quote unavailable for this asset right now.' };
  }

  const mode = params.accountMode ?? acc.accountMode;
  const amount = Math.round(params.amount * 100) / 100;
  if (!Number.isFinite(amount) || amount < 1 || amount > 50000) {
    return { ok: false, error: 'Trade amount must be between $1 and $50,000.' };
  }

  const durationSeconds = Math.max(5, Math.min(3600, Math.round(params.durationSeconds)));
  const currentBalance = mode === 'demo' ? acc.demoBalance : acc.liveBalance;
  if (amount > currentBalance) {
    return {
      ok: false,
      error: `Insufficient ${mode === 'demo' ? 'Demo' : 'Live'} balance ($${currentBalance.toFixed(2)}).`,
    };
  }

  if (mode === 'demo') {
    acc.demoBalance = Math.round((acc.demoBalance - amount) * 100) / 100;
  } else {
    acc.liveBalance = Math.round((acc.liveBalance - amount) * 100) / 100;
  }

  const now = Date.now();
  const trade: Trade = {
    id: `tr_${now}_${Math.random().toString(36).slice(2, 7)}`,
    symbol: asset.symbol,
    accountMode: mode,
    direction: params.direction,
    amount,
    payoutRate: asset.payout,
    entryPrice: quote.price,
    entryTime: now,
    expiryTime: now + durationSeconds * 1000,
    durationSeconds,
    status: 'active',
    payoutAmount: Math.round(amount * (1 + asset.payout / 100) * 100) / 100,
    profit: 0,
  };

  acc.trades.unshift(trade);
  if (acc.trades.length > 200) acc.trades.length = 200;

  sendToClient(acc.clientId, { type: 'trade:created', trade });
  sendToClient(acc.clientId, { type: 'account:update', account: acc });

  return { ok: true, trade };
}

function evaluatePendingOrdersForSymbol(symbol: string, currentPrice: number, now: number) {
  for (const acc of accounts.values()) {
    let changed = false;
    for (const order of acc.pendingOrders) {
      if (order.status !== 'pending' || order.symbol !== symbol) continue;

      let shouldTrigger = false;
      if (order.triggerType === 'price' && order.targetPrice !== undefined) {
        if (order.condition === 'above' && currentPrice >= order.targetPrice) {
          shouldTrigger = true;
        } else if (order.condition === 'below' && currentPrice <= order.targetPrice) {
          shouldTrigger = true;
        }
      } else if (order.triggerType === 'time' && order.targetTime !== undefined && now >= order.targetTime) {
        shouldTrigger = true;
      }

      if (shouldTrigger) {
        order.status = 'triggered';
        changed = true;
        executeTradeOnAccount(acc, {
          symbol: order.symbol,
          direction: order.direction,
          amount: order.amount,
          durationSeconds: order.durationSeconds,
          accountMode: order.accountMode,
        });
      }
    }
    if (changed) {
      sendToClient(acc.clientId, { type: 'account:update', account: acc });
    }
  }
}

// High-precision settlement loop (100ms)
setInterval(() => {
  const now = Date.now();
  for (const acc of accounts.values()) {
    let settledAny = false;

    // Check time-based pending orders even if no tick just arrived
    for (const order of acc.pendingOrders) {
      if (order.status === 'pending' && order.triggerType === 'time' && order.targetTime && now >= order.targetTime) {
        order.status = 'triggered';
        settledAny = true;
        executeTradeOnAccount(acc, {
          symbol: order.symbol,
          direction: order.direction,
          amount: order.amount,
          durationSeconds: order.durationSeconds,
          accountMode: order.accountMode,
        });
      }
    }

    for (const trade of acc.trades) {
      if (trade.status !== 'active') continue;
      if (now >= trade.expiryTime) {
        const quote = quotes.get(trade.symbol);
        const exitPrice = quote?.price ?? trade.entryPrice;
        trade.exitPrice = exitPrice;

        const isUpWin = trade.direction === 'UP' && exitPrice > trade.entryPrice;
        const isDownWin = trade.direction === 'DOWN' && exitPrice < trade.entryPrice;
        const isTie = exitPrice === trade.entryPrice;

        if (isUpWin || isDownWin) {
          trade.status = 'won';
          trade.payoutAmount = Math.round(trade.amount * (1 + trade.payoutRate / 100) * 100) / 100;
          trade.profit = Math.round((trade.payoutAmount - trade.amount) * 100) / 100;
          if (trade.accountMode === 'demo') {
            acc.demoBalance = Math.round((acc.demoBalance + trade.payoutAmount) * 100) / 100;
          } else {
            acc.liveBalance = Math.round((acc.liveBalance + trade.payoutAmount) * 100) / 100;
          }
        } else if (isTie) {
          trade.status = 'tie';
          trade.payoutAmount = trade.amount;
          trade.profit = 0;
          if (trade.accountMode === 'demo') {
            acc.demoBalance = Math.round((acc.demoBalance + trade.amount) * 100) / 100;
          } else {
            acc.liveBalance = Math.round((acc.liveBalance + trade.amount) * 100) / 100;
          }
        } else {
          trade.status = 'lost';
          trade.payoutAmount = 0;
          trade.profit = -trade.amount;
        }

        settledAny = true;
        sendToClient(acc.clientId, { type: 'trade:settled', trade });
      }
    }

    if (settledAny) {
      sendToClient(acc.clientId, { type: 'account:update', account: acc });
      if (acc.isAuthenticated) scheduleSaveDb();
    }
  }
}, 100);

// ==========================================
// REAL-TIME EXCHANGE FEED CONNECTORS
// ==========================================

const binancePairs = ASSETS.filter((a) => a.source === 'binance');
const binanceSymbolToAsset = new Map(binancePairs.map((a) => [a.providerSymbol.toUpperCase(), a]));

// 1. Seed initial 24h crypto tickers from Binance REST
async function seedBinance24hTickers() {
  try {
    const symbols = JSON.stringify(binancePairs.map((a) => a.providerSymbol));
    const res = await fetch(`https://api.binance.com/api/v3/ticker/24hr?symbols=${encodeURIComponent(symbols)}`);
    if (!res.ok) return;
    const list = (await res.json()) as Array<{
      symbol: string;
      lastPrice: string;
      openPrice: string;
      highPrice: string;
      lowPrice: string;
      bidPrice: string;
      askPrice: string;
    }>;
    for (const item of list) {
      const asset = binanceSymbolToAsset.get(item.symbol.toUpperCase());
      if (!asset) continue;
      updateQuote(asset.symbol, parseFloat(item.lastPrice), {
        open24h: parseFloat(item.openPrice),
        high24h: parseFloat(item.highPrice),
        low24h: parseFloat(item.lowPrice),
        bid: parseFloat(item.bidPrice),
        ask: parseFloat(item.askPrice),
        provider: 'Binance Live',
        isLive: true,
      });
    }
  } catch (err) {
    console.warn('Binance 24h ticker seed failed:', (err as Error).message);
  }
}

// 2. Connect Binance real-time trade WebSocket stream
function connectBinanceStream() {
  const streams = binancePairs.map((a) => `${a.providerSymbol.toLowerCase()}@trade`).join('/');
  const url = `wss://stream.binance.com:9443/stream?streams=${streams}`;
  const ws = new WebSocket(url);

  let lastEmitPerSymbol = new Map<string, number>();

  ws.on('open', () => {
    console.log('Connected to Binance Real-Time Trade WebSocket');
  });

  ws.on('message', (raw) => {
    try {
      const parsed = JSON.parse(raw.toString()) as {
        data?: { s: string; p: string; q: string; T: number };
      };
      const d = parsed.data;
      if (!d || !d.s) return;
      const asset = binanceSymbolToAsset.get(d.s.toUpperCase());
      if (!asset) return;

      const price = parseFloat(d.p);
      const qty = parseFloat(d.q);
      const now = d.T || Date.now();

      // Always record 1s candle accuracy, throttle UI WS broadcast to max 10 updates/sec per symbol
      record1sTick(asset.symbol, price, qty, now);
      const lastEmit = lastEmitPerSymbol.get(asset.symbol) ?? 0;
      if (now - lastEmit >= 120) {
        lastEmitPerSymbol.set(asset.symbol, now);
        updateQuote(asset.symbol, price, {
          volume: qty,
          timestamp: now,
          provider: 'Binance Live',
          isLive: true,
        });
      }
    } catch {
      // Ignore malformed frame
    }
  });

  ws.on('close', () => {
    console.warn('Binance WS closed, reconnecting in 3s...');
    setTimeout(connectBinanceStream, 3000);
  });

  ws.on('error', () => {
    ws.close();
  });
}

// 3. Connect Coinbase Exchange WebSocket for redundancy & Gold (PAXG-USD) + Crypto
function connectCoinbaseStream() {
  const productMap: Record<string, string> = {
    'BTC-USD': 'BTC/USD',
    'ETH-USD': 'ETH/USD',
    'SOL-USD': 'SOL/USD',
    'XRP-USD': 'XRP/USD',
    'ADA-USD': 'ADA/USD',
    'DOGE-USD': 'DOGE/USD',
    'AVAX-USD': 'AVAX/USD',
    'LINK-USD': 'LINK/USD',
    'LTC-USD': 'LTC/USD',
    'PAXG-USD': 'XAU/USD',
  };

  const ws = new WebSocket('wss://ws-feed.exchange.coinbase.com');
  ws.on('open', () => {
    console.log('Connected to Coinbase Real-Time Ticker WebSocket');
    ws.send(
      JSON.stringify({
        type: 'subscribe',
        product_ids: Object.keys(productMap),
        channels: ['ticker'],
      })
    );
  });

  ws.on('message', (raw) => {
    try {
      const msg = JSON.parse(raw.toString()) as {
        type: string;
        product_id?: string;
        price?: string;
        open_24h?: string;
        high_24h?: string;
        low_24h?: string;
        best_bid?: string;
        best_ask?: string;
        last_size?: string;
      };
      if (msg.type !== 'ticker' || !msg.product_id || !msg.price) return;
      const symbol = productMap[msg.product_id];
      if (!symbol) return;

      const existing = quotes.get(symbol);
      // Use Coinbase strictly for XAU/USD or as fallback only if Binance has been silent > 5s
      if (symbol === 'XAU/USD' || !existing || Date.now() - existing.timestamp > 5000) {
        updateQuote(symbol, parseFloat(msg.price), {
          open24h: msg.open_24h ? parseFloat(msg.open_24h) : undefined,
          high24h: msg.high_24h ? parseFloat(msg.high_24h) : undefined,
          low24h: msg.low_24h ? parseFloat(msg.low_24h) : undefined,
          bid: msg.best_bid ? parseFloat(msg.best_bid) : undefined,
          ask: msg.best_ask ? parseFloat(msg.best_ask) : undefined,
          volume: msg.last_size ? parseFloat(msg.last_size) : 0,
          provider: 'Coinbase Live',
          isLive: true,
        });
      }
    } catch {
      // Ignore
    }
  });

  ws.on('close', () => {
    setTimeout(connectCoinbaseStream, 4000);
  });

  ws.on('error', () => {
    ws.close();
  });
}

// 4. Poll Yahoo Finance & Open Exchange Rates for Forex, Commodities & Stocks
const yahooAssets = ASSETS.filter((a) => a.source === 'yahoo');

async function pollYahooQuotes() {
  await Promise.allSettled(
    yahooAssets.map(async (asset) => {
      try {
        const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.providerSymbol)}?interval=1m&range=1d`;
        const res = await fetch(url, {
          headers: { 'User-Agent': 'Mozilla/5.0' },
        });
        if (!res.ok) return;
        const json = (await res.json()) as {
          chart?: {
            result?: Array<{
              meta: {
                regularMarketPrice?: number;
                chartPreviousClose?: number;
                regularMarketDayHigh?: number;
                regularMarketDayLow?: number;
                regularMarketTime?: number;
                marketState?: string;
              };
            }>;
          };
        };
        const meta = json.chart?.result?.[0]?.meta;
        if (!meta?.regularMarketPrice) return;
        const isMarketOpen = meta.marketState === 'REGULAR' || meta.marketState === 'PRE' || meta.marketState === 'POST';
        updateQuote(asset.symbol, meta.regularMarketPrice, {
          open24h: meta.chartPreviousClose ?? meta.regularMarketPrice,
          high24h: meta.regularMarketDayHigh ?? meta.regularMarketPrice,
          low24h: meta.regularMarketDayLow ?? meta.regularMarketPrice,
          provider: isMarketOpen ? 'Yahoo Live' : 'Yahoo Spot (Closed)',
          isLive: isMarketOpen,
        });
      } catch {
        // Silent retry next poll
      }
    })
  );
}

// ==========================================
// 24/7 OTC ENGINE & COUNTER-FLOW LIQUIDITY BOOK
// ==========================================
const otcAssets = ASSETS.filter((a) => a.source === 'otc');
const otcAnchorPrices = new Map<string, number>();
const otcMomentum = new Map<string, number>();
// Pre-seeded historical timeframes for instant 24/7 OTC charts
const otcHistoryByTf = new Map<string, Map<string, Candle[]>>();

const USD_RATES_FALLBACK: Record<string, number> = {
  USD: 1,
  EUR: 0.946,
  GBP: 0.792,
  JPY: 154.6,
  AUD: 1.544,
  NZD: 1.698,
  CAD: 1.408,
  CHF: 0.888,
  BRL: 5.79,
  MXN: 20.42,
  NGN: 1665.0,
  BDT: 119.5,
  IDR: 15880.0,
  ARS: 998.0,
  DZD: 133.6,
  PKR: 277.8,
  ZAR: 18.15,
  COP: 4445.0,
  EGP: 49.3,
  PHP: 58.7,
};

let currentFxUsdRates: Record<string, number> = { ...USD_RATES_FALLBACK };

async function refreshOtcFxRates() {
  try {
    const res = await fetch('https://open.er-api.com/v6/latest/USD');
    if (!res.ok) return;
    const json = (await res.json()) as { result?: string; rates?: Record<string, number> };
    if (json.result === 'success' && json.rates) {
      currentFxUsdRates = { ...USD_RATES_FALLBACK, ...json.rates };
      for (const asset of otcAssets) {
        const baseRate = currentFxUsdRates[asset.baseCurrency];
        const quoteRate = currentFxUsdRates[asset.quoteCurrency];
        if (baseRate && quoteRate) {
          const spot = Number((quoteRate / baseRate).toFixed(asset.decimals));
          otcAnchorPrices.set(asset.symbol, spot);
        }
      }
    }
  } catch {
    // Keep existing FX anchor rates if network check fails
  }
}

function generateBackwardCandles(
  endPrice: number,
  endBucketSec: number,
  stepSec: number,
  count: number,
  decimals: number,
  volPct: number
): Candle[] {
  const minPip = Math.pow(10, -decimals);
  const out: Candle[] = new Array(count);
  let cursorClose = endPrice;
  const round = (v: number) => Number(Math.max(minPip, v).toFixed(decimals));

  for (let i = count - 1; i >= 0; i--) {
    const t = endBucketSec - (count - 1 - i) * stepSec;
    const stepMove = (Math.random() - 0.5) * 2.1 * cursorClose * volPct;
    const open = round(cursorClose - stepMove);
    const wickUp = Math.random() * cursorClose * volPct * 0.9;
    const wickDown = Math.random() * cursorClose * volPct * 0.9;
    const high = round(Math.max(open, cursorClose) + wickUp);
    const low = round(Math.min(open, cursorClose) - wickDown);
    out[i] = {
      time: t,
      open,
      high,
      low,
      close: round(cursorClose),
      volume: Math.round(50 + Math.random() * 250),
    };
    cursorClose = open;
  }
  return out;
}

async function seedOtcMarkets() {
  await refreshOtcFxRates();
  const nowMs = Date.now();
  const nowSec = Math.floor(nowMs / 1000);

  for (const asset of otcAssets) {
    const baseRate = currentFxUsdRates[asset.baseCurrency] ?? 1;
    const quoteRate = currentFxUsdRates[asset.quoteCurrency] ?? 1;
    const spot = Number((quoteRate / baseRate).toFixed(asset.decimals));
    otcAnchorPrices.set(asset.symbol, spot);
    otcMomentum.set(asset.symbol, (Math.random() - 0.5) * 0.4);

    // Seed 1,800 continuous 1s bars (30 minutes of 5s/10s/15s/30s resolution)
    const oneSecBars = generateBackwardCandles(spot, nowSec, 1, 1800, asset.decimals, 0.000045);
    live1sCandles.set(asset.symbol, oneSecBars);

    // Seed 1m, 5m, 15m, 1h historical series aligned seamlessly up to nowSec
    const tfMap = new Map<string, Candle[]>();
    const first1s = oneSecBars[0];
    for (const [tfKey, tfSec, vol] of [
      ['1m', 60, 0.00028],
      ['5m', 300, 0.00055],
      ['15m', 900, 0.0009],
      ['1h', 3600, 0.0016],
    ] as const) {
      const hist = generateBackwardCandles(
        first1s.open,
        Math.floor(first1s.time / tfSec) * tfSec - tfSec,
        tfSec,
        240,
        asset.decimals,
        vol
      );
      const agg = aggregateCandles(oneSecBars, tfSec);
      const merged = [...hist];
      for (const c of agg) {
        const last = merged[merged.length - 1];
        if (!last || c.time > last.time) merged.push(c);
        else if (c.time === last.time) {
          last.high = Math.max(last.high, c.high);
          last.low = Math.min(last.low, c.low);
          last.close = c.close;
          last.volume += c.volume;
        }
      }
      tfMap.set(tfKey, merged.slice(-260));
    }
    otcHistoryByTf.set(asset.symbol, tfMap);

    const dayOpen = oneSecBars[0].open;
    updateQuote(asset.symbol, spot, {
      open24h: dayOpen,
      high24h: Math.max(...oneSecBars.map((b) => b.high)),
      low24h: Math.min(...oneSecBars.map((b) => b.low)),
      timestamp: nowMs,
      provider: 'OTC 24/7 Live',
      isLive: true,
      skipBroadcast: true,
    });
  }
  console.log(`Initialized ${otcAssets.length} 24/7 OTC markets with live FX spot anchors`);
}

interface OtcExposure {
  upVolume: number;
  downVolume: number;
  upCount: number;
  downCount: number;
  dominantDir: TradeDirection | null;
  targetStrike: number;
  minRemainingMs: number;
}

function computeOtcExposure(symbol: string, nowMs: number): OtcExposure {
  let upVolume = 0;
  let downVolume = 0;
  let upCount = 0;
  let downCount = 0;
  let minUpEntry = Infinity;
  let maxDownEntry = -Infinity;
  let minRemainingMs = Infinity;

  for (const acc of accounts.values()) {
    for (const tr of acc.trades) {
      if (tr.status !== 'active' || tr.symbol !== symbol) continue;
      const rem = Math.max(0, tr.expiryTime - nowMs);
      if (rem < minRemainingMs) minRemainingMs = rem;
      if (tr.direction === 'UP') {
        upVolume += tr.amount;
        upCount += 1;
        if (tr.entryPrice < minUpEntry) minUpEntry = tr.entryPrice;
      } else {
        downVolume += tr.amount;
        downCount += 1;
        if (tr.entryPrice > maxDownEntry) maxDownEntry = tr.entryPrice;
      }
    }
  }

  let dominantDir: TradeDirection | null = null;
  if (Math.abs(upVolume - downVolume) >= 0.01) {
    dominantDir = upVolume > downVolume ? 'UP' : 'DOWN';
  } else if (upCount !== downCount) {
    dominantDir = upCount > downCount ? 'UP' : 'DOWN';
  }

  const targetStrike =
    dominantDir === 'UP' ? minUpEntry : dominantDir === 'DOWN' ? maxDownEntry : 0;

  return {
    upVolume,
    downVolume,
    upCount,
    downCount,
    dominantDir,
    targetStrike,
    minRemainingMs,
  };
}

function tickOtcMarkets() {
  const now = Date.now();
  const nowSec = Math.floor(now / 1000);
  const batchQuotes: MarketQuote[] = [];

  for (const asset of otcAssets) {
    const prev = quotes.get(asset.symbol);
    const price = prev?.price ?? otcAnchorPrices.get(asset.symbol) ?? 1;
    const anchor = otcAnchorPrices.get(asset.symbol) ?? price;
    const minPip = Math.pow(10, -asset.decimals);
    const volStep = Math.max(minPip * 1.6, price * 0.000032);

    const exp = computeOtcExposure(asset.symbol, now);
    let delta = 0;
    let overrideSentiment: number | undefined;

    if (otcCounterFlowEnabled && exp.dominantDir === 'UP') {
      // Majority / higher quantity is on BUY (UP) -> push OTC candle OPPOSITE (DOWN)
      const total = exp.upVolume + exp.downVolume;
      overrideSentiment = total > 0 ? Math.round(Math.max(10, Math.min(92, (exp.upVolume / total) * 100))) : 78;
      const buffer = Math.max(minPip * 3, volStep * 2.4);
      const targetCeiling = exp.targetStrike - buffer;

      if (exp.minRemainingMs <= 4500 && price >= exp.targetStrike - minPip * 2) {
        const gap = Math.max(0, price - (exp.targetStrike - buffer));
        delta = -(Math.max(minPip * 3, gap * 0.6 + volStep * 1.4));
      } else if (price > targetCeiling) {
        delta = -volStep * (0.65 + Math.random() * 0.95) + (Math.random() - 0.5) * volStep * 0.3;
      } else {
        // Stay below entry strike with natural micro-fluctuations
        delta = (Math.random() - 0.56) * volStep * 0.85;
        if (price + delta >= exp.targetStrike - minPip * 2) {
          delta = -Math.max(minPip * 2, volStep * 0.7);
        }
      }
      if (Math.abs(delta) < minPip) delta = -minPip * 2;
    } else if (otcCounterFlowEnabled && exp.dominantDir === 'DOWN') {
      // Majority / higher quantity is on SELL (DOWN) -> push OTC candle OPPOSITE (UP)
      const total = exp.upVolume + exp.downVolume;
      overrideSentiment = total > 0 ? Math.round(Math.max(8, Math.min(90, (exp.upVolume / total) * 100))) : 22;
      const buffer = Math.max(minPip * 3, volStep * 2.4);
      const targetFloor = exp.targetStrike + buffer;

      if (exp.minRemainingMs <= 4500 && price <= exp.targetStrike + minPip * 2) {
        const gap = Math.max(0, exp.targetStrike + buffer - price);
        delta = Math.max(minPip * 3, gap * 0.6 + volStep * 1.4);
      } else if (price < targetFloor) {
        delta = volStep * (0.65 + Math.random() * 0.95) + (Math.random() - 0.5) * volStep * 0.3;
      } else {
        // Stay above entry strike with natural micro-fluctuations
        delta = (Math.random() - 0.44) * volStep * 0.85;
        if (price + delta <= exp.targetStrike + minPip * 2) {
          delta = Math.max(minPip * 2, volStep * 0.7);
        }
      }
      if (Math.abs(delta) < minPip) delta = minPip * 2;
    } else {
      // Balanced / idle book: organic 24/7 mean-reverting FX motion around spot anchor
      const prevMom = otcMomentum.get(asset.symbol) ?? 0;
      const nextMom = Math.max(-0.9, Math.min(0.9, prevMom * 0.85 + (Math.random() - 0.5) * 0.55));
      otcMomentum.set(asset.symbol, nextMom);
      const reversion = ((anchor - price) / anchor) * price * 0.015;
      delta = nextMom * volStep * 0.9 + (Math.random() - 0.5) * volStep * 1.1 + reversion;
      if (Math.abs(delta) < minPip && Math.random() > 0.35) {
        delta = (delta >= 0 ? 1 : -1) * minPip;
      }
    }

    const nextPrice = Number(Math.max(minPip, price + delta).toFixed(asset.decimals));
    const spread = Math.max(minPip, Number((nextPrice * 0.00008).toFixed(asset.decimals)));
    const tickVol = Math.round(10 + Math.random() * 65);

    // Keep 1m, 5m, 15m, 1h OTC history synced continuously
    const tfMap = otcHistoryByTf.get(asset.symbol);
    if (tfMap) {
      for (const [tfKey, tfSec] of [
        ['1m', 60],
        ['5m', 300],
        ['15m', 900],
        ['1h', 3600],
      ] as const) {
        const arr = tfMap.get(tfKey);
        if (!arr) continue;
        const bucket = Math.floor(nowSec / tfSec) * tfSec;
        const last = arr[arr.length - 1];
        if (last && last.time === bucket) {
          if (nextPrice > last.high) last.high = nextPrice;
          if (nextPrice < last.low) last.low = nextPrice;
          last.close = nextPrice;
          last.volume += tickVol;
        } else if (!last || bucket > last.time) {
          const openPrice = last ? last.close : nextPrice;
          arr.push({
            time: bucket,
            open: openPrice,
            high: Math.max(openPrice, nextPrice),
            low: Math.min(openPrice, nextPrice),
            close: nextPrice,
            volume: tickVol,
          });
          if (arr.length > 260) arr.shift();
        }
      }
    }

    const q = updateQuote(asset.symbol, nextPrice, {
      bid: Number((nextPrice - spread * 0.5).toFixed(asset.decimals)),
      ask: Number((nextPrice + spread * 0.5).toFixed(asset.decimals)),
      volume: tickVol,
      timestamp: now,
      provider: 'OTC 24/7 Live',
      isLive: true,
      skipBroadcast: true,
      overrideBuySentiment: overrideSentiment,
    });
    if (q) batchQuotes.push(q);
  }

  if (batchQuotes.length > 0 && clientSockets.size > 0) {
    broadcastAll({ type: 'ticks', quotes: batchQuotes });
  }
}

// Historical candles fetcher from real exchanges & 24/7 OTC engine
function aggregateCandles(sourceCandles: Candle[], targetSec: number): Candle[] {
  if (sourceCandles.length === 0) return [];
  const buckets = new Map<number, Candle>();
  for (const c of sourceCandles) {
    const bucketTime = Math.floor(c.time / targetSec) * targetSec;
    const existing = buckets.get(bucketTime);
    if (!existing) {
      buckets.set(bucketTime, {
        time: bucketTime,
        open: c.open,
        high: c.high,
        low: c.low,
        close: c.close,
        volume: c.volume,
      });
    } else {
      if (c.high > existing.high) existing.high = c.high;
      if (c.low < existing.low) existing.low = c.low;
      existing.close = c.close;
      existing.volume += c.volume;
    }
  }
  return Array.from(buckets.values()).sort((a, b) => a.time - b.time);
}

async function fetchRealCandles(symbol: string, tf: Timeframe): Promise<Candle[]> {
  const asset = ASSET_MAP.get(symbol);
  if (!asset) return [];
  const tfSec = TIMEFRAME_SECONDS[tf] ?? 60;
  let candles: Candle[] = [];

  if (asset.source === 'otc') {
    const liveBuf = live1sCandles.get(symbol) ?? [];
    if (tfSec < 60) {
      candles = aggregateCandles(liveBuf, tfSec);
    } else {
      const tfMap = otcHistoryByTf.get(symbol);
      const baseHistory = tfMap?.get(tf) ?? [];
      candles = baseHistory.map((c) => ({ ...c }));
    }
  } else if (asset.source === 'binance') {
    if (tfSec < 60) {
      // Fetch real 1-second historical klines from Binance & aggregate into 5s/10s/15s/30s
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(asset.providerSymbol)}&interval=1s&limit=1000`
      );
      if (res.ok) {
        const raw = (await res.json()) as Array<[number, string, string, string, string, string]>;
        const oneSec: Candle[] = raw.map((k) => ({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
        candles = aggregateCandles(oneSec, tfSec);
      }
    } else {
      const binanceInterval = tf === '1m' ? '1m' : tf === '5m' ? '5m' : tf === '15m' ? '15m' : '1h';
      const res = await fetch(
        `https://api.binance.com/api/v3/klines?symbol=${encodeURIComponent(asset.providerSymbol)}&interval=${binanceInterval}&limit=300`
      );
      if (res.ok) {
        const raw = (await res.json()) as Array<[number, string, string, string, string, string]>;
        candles = raw.map((k) => ({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        }));
      }
    }
  } else {
    // Yahoo Finance historical chart candles
    const yInterval = tfSec <= 60 ? '1m' : tf === '5m' ? '5m' : tf === '15m' ? '15m' : '1h';
    const yRange = yInterval === '1m' ? '1d' : yInterval === '5m' ? '5d' : '1mo';
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(asset.providerSymbol)}?interval=${yInterval}&range=${yRange}`;
    const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
    if (res.ok) {
      const json = (await res.json()) as {
        chart?: {
          result?: Array<{
            timestamp?: number[];
            indicators?: {
              quote?: Array<{
                open: (number | null)[];
                high: (number | null)[];
                low: (number | null)[];
                close: (number | null)[];
                volume: (number | null)[];
              }>;
            };
          }>;
        };
      };
      const result = json.chart?.result?.[0];
      const timestamps = result?.timestamp ?? [];
      const q = result?.indicators?.quote?.[0];
      if (q) {
        for (let i = 0; i < timestamps.length; i++) {
          const o = q.open[i];
          const h = q.high[i];
          const l = q.low[i];
          const c = q.close[i];
          if (o == null || h == null || l == null || c == null) continue;
          candles.push({
            time: timestamps[i],
            open: o,
            high: h,
            low: l,
            close: c,
            volume: q.volume[i] ?? 0,
          });
        }
      }
    }
  }

  // Merge any live 1s server buffer ticks so latest candle matches live tick
  const liveBuf = live1sCandles.get(symbol);
  if (liveBuf && liveBuf.length > 0) {
    const aggLive = aggregateCandles(liveBuf, tfSec);
    for (const lc of aggLive) {
      const last = candles[candles.length - 1];
      if (!last || lc.time > last.time) {
        candles.push(lc);
      } else if (lc.time === last.time) {
        last.high = Math.max(last.high, lc.high);
        last.low = Math.min(last.low, lc.low);
        last.close = lc.close;
        last.volume = Math.max(last.volume, lc.volume);
      }
    }
  }

  // Ensure exact continuity between final historical candle and canonical live quote
  const liveQ = quotes.get(symbol);
  if (liveQ && candles.length > 0) {
    const last = candles[candles.length - 1];
    const liveBucket = Math.floor(liveQ.timestamp / 1000 / tfSec) * tfSec;
    if (liveBucket > last.time) {
      candles.push({
        time: liveBucket,
        open: last.close,
        high: Math.max(last.close, liveQ.price),
        low: Math.min(last.close, liveQ.price),
        close: liveQ.price,
        volume: 0,
      });
    } else if (liveBucket === last.time) {
      last.close = liveQ.price;
      last.high = Math.max(last.high, liveQ.price);
      last.low = Math.min(last.low, liveQ.price);
    }
  }

  return candles.slice(-260);
}

// ==========================================
// EXPRESS + WEBSOCKET SERVER
// ==========================================

async function startServer() {
  const app = express();
  app.use(express.json());

  const server = http.createServer(app);
  const wss = new WebSocketServer({ server, path: '/ws' });

  wss.on('connection', (ws, req) => {
    const reqUrl = new URL(req.url || '/', `http://localhost:${PORT}`);
    const clientId = reqUrl.searchParams.get('clientId') || 'default_trader';

    let set = clientSockets.get(clientId);
    if (!set) {
      set = new Set();
      clientSockets.set(clientId, set);
    }
    set.add(ws);

    const acc = getOrCreateAccount(clientId);
    ws.send(
      JSON.stringify({
        type: 'init',
        quotes: Array.from(quotes.values()),
        account: acc,
      })
    );

    ws.on('close', () => {
      set?.delete(ws);
      if (set && set.size === 0) {
        clientSockets.delete(clientId);
      }
    });
  });

  function getAuthAccountFromReq(req: express.Request): TraderAccountState | null {
    const authHeader = req.headers.authorization;
    const rawToken =
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined) ||
      (req.headers['x-auth-token'] as string | undefined) ||
      (typeof req.query.token === 'string' ? req.query.token : undefined);
    if (!rawToken) return null;
    const email = sessionTokens.get(rawToken);
    if (!email) return null;
    const user = usersByEmail.get(email);
    if (!user) return null;
    return accounts.get(user.clientId) || null;
  }

  function requireAdmin(req: express.Request, res: express.Response): TraderAccountState | null {
    const acc = getAuthAccountFromReq(req);
    if (!acc || acc.role !== 'admin') {
      res.status(403).json({ error: 'Admin authorization required.' });
      return null;
    }
    return acc;
  }

  // Bootstrap endpoint (supports ?token=... for restoring authenticated session)
  app.get('/api/bootstrap', (req, res) => {
    const authAcc = getAuthAccountFromReq(req);
    const clientId = authAcc ? authAcc.clientId : String(req.query.clientId || 'default_trader');
    const account = authAcc || getOrCreateAccount(clientId);
    syncUserRequestsOnAccount(account);
    res.json({
      assets: ASSETS,
      quotes: Array.from(quotes.values()),
      account,
      paymentConfig,
    });
  });

  // Public payment config endpoint
  app.get('/api/payment-config', (_req, res) => {
    res.json({ paymentConfig });
  });

  // ==========================================
  // AUTHENTICATION ENDPOINTS (NO NID/KYC REQUIRED)
  // ==========================================
  app.post('/api/auth/register', (req, res) => {
    const { email, password, firstName, lastName, country } = req.body as {
      email?: string;
      password?: string;
      firstName?: string;
      lastName?: string;
      country?: string;
    };
    const cleanEmail = (email || '').trim().toLowerCase();
    if (!cleanEmail || !cleanEmail.includes('@')) {
      return res.status(400).json({ error: 'Please enter a valid email address.' });
    }
    if (!password || password.length < 4) {
      return res.status(400).json({ error: 'Password must be at least 4 characters.' });
    }
    if (usersByEmail.has(cleanEmail)) {
      return res.status(400).json({ error: 'An account with this email already exists. Please sign in.' });
    }

    const clientId = `usr_${crypto.randomBytes(6).toString('hex')}`;
    const isSeedAdmin = ADMIN_SEED_EMAILS.includes(cleanEmail);
    const profile = makeDefaultProfile({
      email: cleanEmail,
      firstName: (firstName || '').trim(),
      lastName: (lastName || '').trim(),
      country: (country || 'Bangladesh').trim(),
      role: isSeedAdmin ? 'admin' : 'user',
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
      transactions: [
        {
          id: `tx_${Date.now()}`,
          type: 'demo_refill',
          method: 'Demo Allocation',
          amount: 10000,
          status: 'completed',
          timestamp: Date.now(),
          note: 'Welcome $10,000.00 Demo Balance',
        },
      ],
      depositRequests: [],
      withdrawalRequests: [],
    };

    accounts.set(clientId, acc);
    usersByEmail.set(cleanEmail, {
      email: cleanEmail,
      passwordHash: hashPassword(password),
      clientId,
    });

    const token = crypto.randomBytes(24).toString('hex');
    sessionTokens.set(token, cleanEmail);
    saveDbNow();
    notifyAdmins({ type: 'admin:update' });

    return res.json({ token, account: acc, paymentConfig });
  });

  app.post('/api/auth/login', (req, res) => {
    const { email, password } = req.body as { email?: string; password?: string };
    const cleanEmail = (email || '').trim().toLowerCase();
    const record = usersByEmail.get(cleanEmail);
    if (!record || !password || !verifyPassword(password, record.passwordHash)) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const acc = accounts.get(record.clientId) || getOrCreateAccount(record.clientId);
    acc.isAuthenticated = true;
    acc.profile.lastLoginAt = Date.now();
    syncUserRequestsOnAccount(acc);

    const token = crypto.randomBytes(24).toString('hex');
    sessionTokens.set(token, cleanEmail);
    saveDbNow();

    return res.json({ token, account: acc, paymentConfig });
  });

  app.post('/api/auth/logout', (req, res) => {
    const authHeader = req.headers.authorization;
    const token =
      (authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : undefined) ||
      (req.body?.token as string | undefined);
    if (token) {
      sessionTokens.delete(token);
      saveDbNow();
    }
    res.json({ ok: true });
  });

  // Historical + Live candles endpoint
  app.get('/api/candles', async (req, res) => {
    const symbol = String(req.query.symbol || 'BTC/USD');
    const tf = (String(req.query.tf || '1m') as Timeframe) || '1m';
    try {
      const candles = await fetchRealCandles(symbol, tf);
      res.json({ symbol, tf, candles });
    } catch (err) {
      res.status(500).json({ error: (err as Error).message, candles: [] });
    }
  });

  // Place instant binary/digital option trade
  app.post('/api/trade', (req, res) => {
    const { clientId = 'default_trader', symbol, direction, amount, durationSeconds, accountMode } = req.body as {
      clientId?: string;
      symbol: string;
      direction: TradeDirection;
      amount: number;
      durationSeconds: number;
      accountMode?: AccountMode;
    };
    const acc = getOrCreateAccount(clientId);
    const result = executeTradeOnAccount(acc, {
      symbol,
      direction,
      amount: Number(amount),
      durationSeconds: Number(durationSeconds),
      accountMode,
    });
    if (!result.ok) {
      return res.status(400).json({ error: result.error });
    }
    if (acc.isAuthenticated) scheduleSaveDb();
    return res.json({ trade: result.trade, account: acc });
  });

  // Create pending order (by price or time)
  app.post('/api/pending-order', (req, res) => {
    const {
      clientId = 'default_trader',
      symbol,
      direction,
      amount,
      durationSeconds,
      triggerType,
      targetPrice,
      targetTime,
    } = req.body as {
      clientId?: string;
      symbol: string;
      direction: TradeDirection;
      amount: number;
      durationSeconds: number;
      triggerType: 'price' | 'time';
      targetPrice?: number;
      targetTime?: number;
    };

    const acc = getOrCreateAccount(clientId);
    const asset = ASSET_MAP.get(symbol);
    const quote = quotes.get(symbol);
    if (!asset || !quote) {
      return res.status(400).json({ error: 'Asset or live quote not found.' });
    }

    const order: PendingOrder = {
      id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      symbol,
      accountMode: acc.accountMode,
      direction,
      amount: Number(amount),
      payoutRate: asset.payout,
      durationSeconds: Number(durationSeconds),
      triggerType,
      targetPrice: triggerType === 'price' ? Number(targetPrice) : undefined,
      condition:
        triggerType === 'price' && targetPrice !== undefined
          ? Number(targetPrice) >= quote.price
            ? 'above'
            : 'below'
          : undefined,
      targetTime: triggerType === 'time' ? Number(targetTime) : undefined,
      createdAt: Date.now(),
      status: 'pending',
    };

    acc.pendingOrders.unshift(order);
    sendToClient(clientId, { type: 'account:update', account: acc });
    if (acc.isAuthenticated) scheduleSaveDb();
    return res.json({ order, account: acc });
  });

  // Cancel pending order
  app.delete('/api/pending-order/:id', (req, res) => {
    const clientId = String(req.query.clientId || 'default_trader');
    const acc = getOrCreateAccount(clientId);
    const order = acc.pendingOrders.find((o) => o.id === req.params.id);
    if (order && order.status === 'pending') {
      order.status = 'cancelled';
      sendToClient(clientId, { type: 'account:update', account: acc });
      if (acc.isAuthenticated) scheduleSaveDb();
    }
    res.json({ account: acc });
  });

  // Switch Demo / Live account
  app.post('/api/account/mode', (req, res) => {
    const { clientId = 'default_trader', accountMode } = req.body as {
      clientId?: string;
      accountMode: AccountMode;
    };
    const acc = getOrCreateAccount(clientId);
    if (accountMode === 'demo' || accountMode === 'live') {
      acc.accountMode = accountMode;
      sendToClient(clientId, { type: 'account:update', account: acc });
      if (acc.isAuthenticated) scheduleSaveDb();
    }
    res.json({ account: acc });
  });

  // Update full trader profile details (Persisted!)
  app.post('/api/account/profile', (req, res) => {
    const {
      clientId = 'default_trader',
      name,
      email,
      nickname,
      firstName,
      lastName,
      dob,
      country,
      address,
      language,
      timezone,
      twoFactorLogin,
      twoFactorWithdraw,
      currency,
    } = req.body as {
      clientId?: string;
      name?: string;
      email?: string;
      nickname?: string;
      firstName?: string;
      lastName?: string;
      dob?: string;
      country?: string;
      address?: string;
      language?: string;
      timezone?: string;
      twoFactorLogin?: boolean;
      twoFactorWithdraw?: boolean;
      currency?: string;
    };
    const acc = getAuthAccountFromReq(req) || getOrCreateAccount(clientId);
    if (typeof nickname === 'string') acc.profile.nickname = nickname.trim().slice(0, 32);
    if (typeof firstName === 'string') acc.profile.firstName = firstName.trim().slice(0, 48);
    if (typeof lastName === 'string') acc.profile.lastName = lastName.trim().slice(0, 48);
    if (typeof dob === 'string') acc.profile.dob = dob.trim().slice(0, 24);
    if (typeof country === 'string') acc.profile.country = country.trim().slice(0, 48);
    if (typeof address === 'string') acc.profile.address = address.trim().slice(0, 160);
    if (typeof language === 'string') acc.profile.language = language.trim().slice(0, 32);
    if (typeof timezone === 'string') acc.profile.timezone = timezone.trim().slice(0, 32);
    if (typeof twoFactorLogin === 'boolean') acc.profile.twoFactorLogin = twoFactorLogin;
    if (typeof twoFactorWithdraw === 'boolean') acc.profile.twoFactorWithdraw = twoFactorWithdraw;
    if (typeof currency === 'string' && currency.trim()) acc.currency = currency.trim().slice(0, 8);

    const combinedName = `${acc.profile.firstName} ${acc.profile.lastName}`.trim();
    if (combinedName) acc.name = combinedName;
    else if (name && name.trim()) acc.name = name.trim().slice(0, 48);

    if (email && email.trim() && !acc.isAuthenticated) {
      acc.email = email.trim().slice(0, 80);
      acc.profile.email = acc.email;
    }

    syncUserRequestsOnAccount(acc);
    sendToClient(clientId, { type: 'account:update', account: acc });
    if (acc.isAuthenticated) saveDbNow();
    res.json({ account: acc });
  });

  // Change account password
  app.post('/api/account/password', (req, res) => {
    const authAcc = getAuthAccountFromReq(req);
    if (!authAcc) return res.status(401).json({ error: 'Sign in required.' });
    const { currentPassword, newPassword } = req.body as {
      currentPassword?: string;
      newPassword?: string;
    };
    const record = usersByEmail.get(authAcc.email.toLowerCase());
    if (!record || !currentPassword || !verifyPassword(currentPassword, record.passwordHash)) {
      return res.status(400).json({ error: 'Current password is incorrect.' });
    }
    if (!newPassword || newPassword.length < 4) {
      return res.status(400).json({ error: 'New password must be at least 4 characters.' });
    }
    record.passwordHash = hashPassword(newPassword);
    saveDbNow();
    return res.json({ ok: true });
  });

  // Delete own non-admin account
  app.delete('/api/account', (req, res) => {
    const authAcc = getAuthAccountFromReq(req);
    if (!authAcc) return res.status(401).json({ error: 'Sign in required.' });
    if (authAcc.role === 'admin') {
      return res.status(400).json({ error: 'Primary admin accounts cannot be deleted.' });
    }
    usersByEmail.delete(authAcc.email.toLowerCase());
    accounts.delete(authAcc.clientId);
    for (const [tok, em] of sessionTokens.entries()) {
      if (em === authAcc.email.toLowerCase()) sessionTokens.delete(tok);
    }
    saveDbNow();
    notifyAdmins({ type: 'admin:update' });
    return res.json({ ok: true });
  });

  // Refill demo balance back to $10,000
  app.post('/api/wallet/refill-demo', (req, res) => {
    const { clientId = 'default_trader' } = req.body as { clientId?: string };
    const acc = getOrCreateAccount(clientId);
    const delta = Math.max(0, 10000 - acc.demoBalance);
    acc.demoBalance = 10000;
    acc.transactions.unshift({
      id: `tx_${Date.now()}`,
      type: 'demo_refill',
      method: 'Demo Refill',
      amount: delta > 0 ? delta : 10000,
      status: 'completed',
      timestamp: Date.now(),
      note: 'Demo balance reset to $10,000.00',
    });
    syncUserRequestsOnAccount(acc);
    sendToClient(clientId, { type: 'account:update', account: acc });
    if (acc.isAuthenticated) saveDbNow();
    res.json({ account: acc });
  });

  // Submit Deposit Request (Pending Admin Approval!)
  app.post('/api/wallet/deposit', (req, res) => {
    const { clientId = 'default_trader', amount, method, promoCode, txHash } = req.body as {
      clientId?: string;
      amount: number;
      method: string;
      promoCode?: string;
      txHash?: string;
    };
    const acc = getOrCreateAccount(clientId);
    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount < 10 || numAmount > 100000) {
      return res.status(400).json({ error: 'Deposit must be between $10 and $100,000.' });
    }

    let bonus = 0;
    const cleanCode = (promoCode || '').trim().toUpperCase();
    if (cleanCode === 'BONUS50') bonus = Math.round(numAmount * 0.5 * 100) / 100;
    else if (cleanCode === 'QUANTAX30') bonus = Math.round(numAmount * 0.3 * 100) / 100;

    const methodCfg = paymentConfig.find((m) => m.label === method || m.id === method);
    const reqId = `dep_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const depReq: DepositRequest = {
      id: reqId,
      clientId: acc.clientId,
      email: acc.email,
      userName: acc.name,
      method: method || 'USDT (TRC-20)',
      amount: numAmount,
      bonus,
      promoCode: cleanCode || undefined,
      txHash: (txHash || '').trim() || undefined,
      addressUsed: methodCfg?.address,
      status: 'pending',
      createdAt: Date.now(),
    };

    depositRequests.unshift(depReq);
    acc.transactions.unshift({
      id: reqId,
      type: 'deposit',
      method: depReq.method,
      amount: numAmount,
      status: 'processing',
      timestamp: Date.now(),
      note: txHash ? `Pending approval · TxID: ${txHash}` : 'Pending Admin approval',
    });

    syncUserRequestsOnAccount(acc);
    sendToClient(acc.clientId, { type: 'account:update', account: acc });
    notifyAdmins({ type: 'admin:update', depositRequest: depReq });
    saveDbNow();

    return res.json({ account: acc, depositRequest: depReq, bonus });
  });

  // Submit Withdrawal Request (Pending Admin Approval)
  app.post('/api/wallet/withdraw', (req, res) => {
    const { clientId = 'default_trader', amount, method, destination } = req.body as {
      clientId?: string;
      amount: number;
      method: string;
      destination?: string;
    };
    const acc = getOrCreateAccount(clientId);
    const numAmount = Math.round(Number(amount) * 100) / 100;
    if (!Number.isFinite(numAmount) || numAmount < 10) {
      return res.status(400).json({ error: 'Minimum withdrawal is $10.00.' });
    }
    if (numAmount > acc.liveBalance) {
      return res.status(400).json({ error: 'Insufficient Live balance for withdrawal.' });
    }

    acc.liveBalance = Math.round((acc.liveBalance - numAmount) * 100) / 100;
    const reqId = `wdr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
    const wReq: WithdrawalRequest = {
      id: reqId,
      clientId: acc.clientId,
      email: acc.email,
      userName: acc.name,
      method: method || 'USDT (TRC-20)',
      amount: numAmount,
      destination: (destination || '').trim() || 'Wallet Address',
      status: 'pending',
      createdAt: Date.now(),
    };

    withdrawalRequests.unshift(wReq);
    acc.transactions.unshift({
      id: reqId,
      type: 'withdrawal',
      method: wReq.method,
      amount: numAmount,
      status: 'processing',
      timestamp: Date.now(),
      note: `Pending Admin approval · To ${wReq.destination}`,
    });

    syncUserRequestsOnAccount(acc);
    sendToClient(acc.clientId, { type: 'account:update', account: acc });
    notifyAdmins({ type: 'admin:update', withdrawalRequest: wReq });
    saveDbNow();

    return res.json({ account: acc, withdrawalRequest: wReq });
  });

  // ==========================================
  // ADMIN PANEL CONTROL ENDPOINTS
  // ==========================================
  app.get('/api/admin/overview', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const users: AdminUserSummary[] = [];
    for (const u of usersByEmail.values()) {
      const acc = accounts.get(u.clientId);
      if (!acc) continue;
      users.push({
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
      });
    }
    // Also include active guest sessions with trades or deposit requests
    for (const acc of accounts.values()) {
      if (!acc.isAuthenticated && (acc.trades.length > 0 || depositRequests.some((d) => d.clientId === acc.clientId))) {
        users.push({
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
        });
      }
    }

    // Active OTC book exposure summary
    const now = Date.now();
    const otcExposure = otcAssets
      .map((a) => {
        const exp = computeOtcExposure(a.symbol, now);
        return {
          symbol: a.symbol,
          payout: a.payout,
          price: quotes.get(a.symbol)?.price ?? 0,
          upVolume: exp.upVolume,
          downVolume: exp.downVolume,
          upCount: exp.upCount,
          downCount: exp.downCount,
        };
      })
      .filter((e) => e.upVolume > 0 || e.downVolume > 0);

    res.json({
      users,
      depositRequests,
      withdrawalRequests,
      paymentConfig,
      otcCounterFlowEnabled,
      otcExposure,
    });
  });

  app.post('/api/admin/deposit/:id/approve', (req, res) => {
    const adminAcc = requireAdmin(req, res);
    if (!adminAcc) return;
    const dep = depositRequests.find((d) => d.id === req.params.id);
    if (!dep) return res.status(404).json({ error: 'Deposit request not found.' });
    if (dep.status !== 'pending') return res.status(400).json({ error: `Deposit already ${dep.status}.` });

    dep.status = 'approved';
    dep.reviewedAt = Date.now();
    dep.reviewedBy = adminAcc.email;

    const targetAcc = getOrCreateAccount(dep.clientId);
    const totalCredit = Math.round((dep.amount + dep.bonus) * 100) / 100;
    targetAcc.liveBalance = Math.round((targetAcc.liveBalance + totalCredit) * 100) / 100;
    targetAcc.accountMode = 'live';

    const tx = targetAcc.transactions.find((t) => t.id === dep.id);
    if (tx) {
      tx.status = 'completed';
      tx.note = dep.bonus > 0 ? `Approved (+$${dep.bonus.toFixed(2)} bonus)` : 'Approved by Admin';
    }
    syncUserRequestsOnAccount(targetAcc);
    sendToClient(targetAcc.clientId, { type: 'account:update', account: targetAcc });
    sendToClient(targetAcc.clientId, {
      type: 'deposit:approved',
      amount: totalCredit,
      method: dep.method,
    });
    saveDbNow();
    return res.json({ depositRequest: dep });
  });

  app.post('/api/admin/deposit/:id/reject', (req, res) => {
    const adminAcc = requireAdmin(req, res);
    if (!adminAcc) return;
    const dep = depositRequests.find((d) => d.id === req.params.id);
    if (!dep) return res.status(404).json({ error: 'Deposit request not found.' });
    if (dep.status !== 'pending') return res.status(400).json({ error: `Deposit already ${dep.status}.` });

    dep.status = 'rejected';
    dep.reviewedAt = Date.now();
    dep.reviewedBy = adminAcc.email;

    const targetAcc = getOrCreateAccount(dep.clientId);
    const tx = targetAcc.transactions.find((t) => t.id === dep.id);
    if (tx) {
      tx.status = 'rejected';
      tx.note = 'Rejected by Admin';
    }
    syncUserRequestsOnAccount(targetAcc);
    sendToClient(targetAcc.clientId, { type: 'account:update', account: targetAcc });
    saveDbNow();
    return res.json({ depositRequest: dep });
  });

  app.post('/api/admin/withdrawal/:id/approve', (req, res) => {
    const adminAcc = requireAdmin(req, res);
    if (!adminAcc) return;
    const wdr = withdrawalRequests.find((w) => w.id === req.params.id);
    if (!wdr) return res.status(404).json({ error: 'Withdrawal request not found.' });
    if (wdr.status !== 'pending') return res.status(400).json({ error: `Withdrawal already ${wdr.status}.` });

    wdr.status = 'approved';
    wdr.reviewedAt = Date.now();
    wdr.reviewedBy = adminAcc.email;

    const targetAcc = getOrCreateAccount(wdr.clientId);
    const tx = targetAcc.transactions.find((t) => t.id === wdr.id);
    if (tx) {
      tx.status = 'completed';
      tx.note = `Paid to ${wdr.destination}`;
    }
    syncUserRequestsOnAccount(targetAcc);
    sendToClient(targetAcc.clientId, { type: 'account:update', account: targetAcc });
    saveDbNow();
    return res.json({ withdrawalRequest: wdr });
  });

  app.post('/api/admin/withdrawal/:id/reject', (req, res) => {
    const adminAcc = requireAdmin(req, res);
    if (!adminAcc) return;
    const wdr = withdrawalRequests.find((w) => w.id === req.params.id);
    if (!wdr) return res.status(404).json({ error: 'Withdrawal request not found.' });
    if (wdr.status !== 'pending') return res.status(400).json({ error: `Withdrawal already ${wdr.status}.` });

    wdr.status = 'rejected';
    wdr.reviewedAt = Date.now();
    wdr.reviewedBy = adminAcc.email;

    const targetAcc = getOrCreateAccount(wdr.clientId);
    targetAcc.liveBalance = Math.round((targetAcc.liveBalance + wdr.amount) * 100) / 100;
    const tx = targetAcc.transactions.find((t) => t.id === wdr.id);
    if (tx) {
      tx.status = 'rejected';
      tx.note = 'Rejected & refunded to Live balance';
    }
    syncUserRequestsOnAccount(targetAcc);
    sendToClient(targetAcc.clientId, { type: 'account:update', account: targetAcc });
    saveDbNow();
    return res.json({ withdrawalRequest: wdr });
  });

  app.post('/api/admin/payment-config', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { methods } = req.body as { methods?: CryptoPaymentMethodConfig[] };
    if (!Array.isArray(methods)) {
      return res.status(400).json({ error: 'Invalid payment config payload.' });
    }
    paymentConfig = methods.map((m) => ({
      id: String(m.id),
      label: String(m.label),
      network: String(m.network),
      address: String(m.address).trim(),
      note: String(m.note),
      enabled: Boolean(m.enabled),
    }));
    saveDbNow();
    broadcastAll({ type: 'config:update', paymentConfig });
    return res.json({ paymentConfig });
  });

  app.post('/api/admin/user/:clientId/update', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const targetAcc = accounts.get(req.params.clientId);
    if (!targetAcc) return res.status(404).json({ error: 'User not found.' });

    const { liveBalance, demoBalance, verified, role } = req.body as {
      liveBalance?: number;
      demoBalance?: number;
      verified?: boolean;
      role?: 'user' | 'admin';
    };

    if (typeof liveBalance === 'number' && Number.isFinite(liveBalance) && liveBalance >= 0) {
      targetAcc.liveBalance = Math.round(liveBalance * 100) / 100;
    }
    if (typeof demoBalance === 'number' && Number.isFinite(demoBalance) && demoBalance >= 0) {
      targetAcc.demoBalance = Math.round(demoBalance * 100) / 100;
    }
    if (typeof verified === 'boolean') {
      targetAcc.profile.verified = verified;
    }
    if (role === 'user' || role === 'admin') {
      if (!ADMIN_SEED_EMAILS.includes(targetAcc.email.toLowerCase())) {
        targetAcc.role = role;
        targetAcc.profile.role = role;
      }
    }

    syncUserRequestsOnAccount(targetAcc);
    sendToClient(targetAcc.clientId, { type: 'account:update', account: targetAcc });
    saveDbNow();
    return res.json({ account: targetAcc });
  });

  app.delete('/api/admin/user/:clientId', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const targetAcc = accounts.get(req.params.clientId);
    if (!targetAcc) return res.status(404).json({ error: 'User not found.' });
    if (ADMIN_SEED_EMAILS.includes(targetAcc.email.toLowerCase())) {
      return res.status(400).json({ error: 'Primary admin accounts cannot be removed.' });
    }
    usersByEmail.delete(targetAcc.email.toLowerCase());
    accounts.delete(targetAcc.clientId);
    saveDbNow();
    return res.json({ ok: true });
  });

  app.post('/api/admin/otc-settings', (req, res) => {
    if (!requireAdmin(req, res)) return;
    const { counterFlowEnabled, symbol, payout } = req.body as {
      counterFlowEnabled?: boolean;
      symbol?: string;
      payout?: number;
    };
    if (typeof counterFlowEnabled === 'boolean') {
      otcCounterFlowEnabled = counterFlowEnabled;
    }
    if (symbol && typeof payout === 'number' && payout >= 50 && payout <= 98) {
      const asset = ASSET_MAP.get(symbol);
      if (asset) asset.payout = Math.round(payout);
    }
    saveDbNow();
    return res.json({ otcCounterFlowEnabled, assets: ASSETS });
  });

  // Leaderboard combining active traders + user's real session profit
  app.get('/api/leaderboard', (req, res) => {
    const clientId = String(req.query.clientId || 'default_trader');
    const acc = getOrCreateAccount(clientId);
    const closed = acc.trades.filter((t) => t.status !== 'active');
    const userProfit = closed.reduce((sum, t) => sum + t.profit, 0);
    const wins = closed.filter((t) => t.status === 'won').length;
    const winRate = closed.length > 0 ? (wins / closed.length) * 100 : 0;

    const entries: LeaderboardEntry[] = [
      { rank: 1, name: 'Marcus Vance', country: 'SG', tradesCount: 148, winRate: 76.4, profit: 18420.5 },
      { rank: 2, name: 'Elena Rostova', country: 'DE', tradesCount: 112, winRate: 73.2, profit: 14190.0 },
      { rank: 3, name: 'Kenji Takahashi', country: 'JP', tradesCount: 94, winRate: 71.8, profit: 11245.75 },
      { rank: 4, name: 'Sofia Lindqvist', country: 'SE', tradesCount: 83, winRate: 68.7, profit: 8930.2 },
      { rank: 5, name: 'Tariq Al-Mansoor', country: 'AE', tradesCount: 79, winRate: 66.1, profit: 7210.4 },
      { rank: 6, name: 'Lucas Ferreira', country: 'BR', tradesCount: 64, winRate: 64.5, profit: 5490.0 },
      { rank: 7, name: 'Hannah Kim', country: 'KR', tradesCount: 58, winRate: 62.1, profit: 3840.8 },
      {
        rank: 8,
        name: acc.name,
        country: 'US',
        tradesCount: closed.length,
        winRate: Math.round(winRate * 10) / 10,
        profit: Math.round(userProfit * 100) / 100,
        isCurrentUser: true,
      },
    ];

    entries.sort((a, b) => b.profit - a.profit);
    entries.forEach((e, i) => {
      e.rank = i + 1;
    });
    res.json({ leaderboard: entries });
  });

  // Mount Vite middleware in dev, or serve static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // Load persisted users, sessions, deposit requests, and crypto wallet addresses
  loadAndSeedDb();

  // Start 24/7 OTC markets + real-time exchange streams before listening
  await seedOtcMarkets();
  await seedBinance24hTickers();
  await pollYahooQuotes();
  connectBinanceStream();
  connectCoinbaseStream();
  setInterval(tickOtcMarkets, 400);
  setInterval(refreshOtcFxRates, 300_000);
  setInterval(pollYahooQuotes, 2000);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Binarx Trade Server running at http://localhost:${PORT}`);
  });
}

startServer();
