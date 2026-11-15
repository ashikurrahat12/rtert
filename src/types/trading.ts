export type AssetCategory = 'otc' | 'crypto' | 'forex' | 'commodities' | 'stocks';

export type ChartType = 'area' | 'candles' | 'bars' | 'heikin_ashi';

export type Timeframe = '5s' | '10s' | '15s' | '30s' | '1m' | '5m' | '15m' | '1h';

export type AccountMode = 'demo' | 'live';

export type TradeDirection = 'UP' | 'DOWN';

export type TradeStatus = 'active' | 'won' | 'lost' | 'tie';

export type DrawingTool =
  | 'crosshair'
  | 'trendline'
  | 'horizontal'
  | 'vertical'
  | 'ray'
  | 'rectangle'
  | 'fibonacci';

export type IndicatorId = 'sma' | 'ema' | 'bollinger' | 'rsi' | 'macd' | 'stochastic';

export type NavSection =
  | 'trade'
  | 'support'
  | 'account'
  | 'tournaments'
  | 'market'
  | 'analytics'
  | 'settings';

export type TemplateMode = 'light_mode' | 'full_light';

export interface TerminalSettings {
  templateMode: TemplateMode;
  soundEnabled: boolean;
  oneClickTrade: boolean;
  showGrid: boolean;
  showSentiment: boolean;
  showOpenTradesOnChart: boolean;
  timezoneOffsetMinutes: number;
}

export interface AssetDefinition {
  symbol: string;
  name: string;
  category: AssetCategory;
  payout: number;
  decimals: number;
  baseCurrency: string;
  quoteCurrency: string;
  source: 'otc' | 'coinbase' | 'binance' | 'yahoo';
  providerSymbol: string;
  marketHours: '24/7' | 'market';
}

export interface MarketQuote {
  symbol: string;
  price: number;
  open24h: number;
  high24h: number;
  low24h: number;
  changePct: number;
  timestamp: number;
  bid: number;
  ask: number;
  buySentiment: number; // 0 - 100
  isLive: boolean;
  provider: string;
}

export interface Candle {
  time: number; // Unix timestamp in seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface IndicatorConfig {
  uid: string;
  id: IndicatorId;
  name: string;
  period: number;
  period2?: number;
  period3?: number;
  color: string;
  enabled: boolean;
}

export interface DrawingPoint {
  time: number; // Unix seconds
  price: number;
}

export interface ChartDrawing {
  id: string;
  symbol: string;
  tool: Exclude<DrawingTool, 'crosshair'>;
  points: DrawingPoint[];
  color: string;
}

export interface Trade {
  id: string;
  symbol: string;
  accountMode: AccountMode;
  direction: TradeDirection;
  amount: number;
  payoutRate: number;
  entryPrice: number;
  exitPrice?: number;
  entryTime: number; // ms
  expiryTime: number; // ms
  durationSeconds: number;
  status: TradeStatus;
  payoutAmount: number;
  profit: number;
}

export interface PendingOrder {
  id: string;
  symbol: string;
  accountMode: AccountMode;
  direction: TradeDirection;
  amount: number;
  payoutRate: number;
  durationSeconds: number;
  triggerType: 'price' | 'time';
  targetPrice?: number;
  condition?: 'above' | 'below';
  targetTime?: number; // ms
  createdAt: number;
  status: 'pending' | 'triggered' | 'cancelled';
}

export interface WalletTransaction {
  id: string;
  type: 'deposit' | 'withdrawal' | 'bonus' | 'demo_refill';
  method: string;
  amount: number;
  status: 'completed' | 'processing' | 'rejected';
  timestamp: number;
  note?: string;
}

export interface UserProfile {
  userId: string;
  nickname: string;
  firstName: string;
  lastName: string;
  dob: string;
  email: string;
  country: string;
  address: string;
  language: string;
  timezone: string;
  twoFactorLogin: boolean;
  twoFactorWithdraw: boolean;
  verified: boolean;
  role: 'user' | 'admin';
  createdAt: number;
  lastLoginAt: number;
}

export interface DepositRequest {
  id: string;
  clientId: string;
  email: string;
  userName: string;
  method: string;
  amount: number;
  bonus: number;
  promoCode?: string;
  txHash?: string;
  addressUsed?: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface WithdrawalRequest {
  id: string;
  clientId: string;
  email: string;
  userName: string;
  method: string;
  amount: number;
  destination: string;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  reviewedAt?: number;
  reviewedBy?: string;
}

export interface CryptoPaymentMethodConfig {
  id: string;
  label: string;
  network: string;
  address: string;
  note: string;
  enabled: boolean;
}

export interface TraderAccountState {
  clientId: string;
  isAuthenticated: boolean;
  role: 'user' | 'admin';
  name: string;
  email: string;
  currency: string;
  accountMode: AccountMode;
  demoBalance: number;
  liveBalance: number;
  profile: UserProfile;
  trades: Trade[];
  pendingOrders: PendingOrder[];
  transactions: WalletTransaction[];
  depositRequests: DepositRequest[];
  withdrawalRequests: WithdrawalRequest[];
}

export interface AdminUserSummary {
  clientId: string;
  email: string;
  name: string;
  role: 'user' | 'admin';
  demoBalance: number;
  liveBalance: number;
  verified: boolean;
  profile: UserProfile;
  tradesCount: number;
  createdAt: number;
  lastLoginAt: number;
}

export interface LeaderboardEntry {
  rank: number;
  name: string;
  country: string;
  tradesCount: number;
  winRate: number;
  profit: number;
  isCurrentUser?: boolean;
}
