import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  Award,
  BarChart3,
  BookOpen,
  Check,
  RefreshCw,
  Settings,
  TrendingUp,
  User,
} from 'lucide-react';
import type {
  AssetDefinition,
  Candle,
  LeaderboardEntry,
  MarketQuote,
  TerminalSettings,
  TraderAccountState,
} from '../types/trading.ts';
import { computeTechnicalSignal, type TechnicalSummary } from '../utils/indicators.ts';
import { brokerFetch } from '../utils/brokerApi.ts';

// ==========================================
// 1. LIVE TECHNICAL SIGNALS VIEW
// ==========================================
interface SignalsViewProps {
  assets: AssetDefinition[];
  quotes: Record<string, MarketQuote>;
  onSelectAssetAndTrade: (symbol: string) => void;
}

export const SignalsView: React.FC<SignalsViewProps> = ({ assets, quotes, onSelectAssetAndTrade }) => {
  const [signals, setSignals] = useState<Record<string, TechnicalSummary>>({});
  const [loading, setLoading] = useState(true);
  const [filterCat, setFilterCat] = useState<string>('all');

  const loadSignals = async () => {
    setLoading(true);
    const targetAssets = assets.slice(0, 20);
    const results: Record<string, TechnicalSummary> = {};
    await Promise.allSettled(
      targetAssets.map(async (asset) => {
        const { ok, data } = await brokerFetch<{ candles: Candle[] }>(
          `/api/candles?symbol=${encodeURIComponent(asset.symbol)}&tf=1m`
        );
        if (!ok) return;
        if (data.candles && data.candles.length >= 30) {
          results[asset.symbol] = computeTechnicalSignal(data.candles);
        }
      })
    );
    setSignals(results);
    setLoading(false);
  };

  useEffect(() => {
    loadSignals();
  }, []);

  const visibleAssets = assets.filter((a) => filterCat === 'all' || a.category === filterCat);

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-6xl mx-auto space-y-4 sm:space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="font-display font-bold text-xl text-slate-900 dark:text-white">
              Live Technical Market Signals
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Computed directly from real-time 1-minute candles using RSI (14), EMA (9/21), and MACD (12,26,9).
            </p>
          </div>
          <button
            onClick={loadSignals}
            disabled={loading}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md bg-[#2962FF] hover:bg-blue-500 text-white text-xs font-semibold transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            Recalculate Signals
          </button>
        </div>

        <div className="flex items-center gap-1.5 border-b border-slate-200 dark:border-[#2A3142] pb-3 flex-wrap">
          {['all', 'otc', 'crypto', 'forex', 'commodities', 'stocks'].map((cat) => (
            <button
              key={cat}
              onClick={() => setFilterCat(cat)}
              className={`px-3 py-1.5 rounded text-xs font-semibold uppercase transition-colors ${
                filterCat === cat
                  ? 'bg-[#2962FF] text-white'
                  : 'text-slate-600 dark:text-slate-400 hover:bg-slate-200/70 dark:hover:bg-[#1C212D]'
              }`}
            >
              {cat === 'otc' ? 'OTC 24/7' : cat}
            </button>
          ))}
        </div>

        <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#2A3142] text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#161B26]">
                  <th className="py-3 px-4">Asset</th>
                  <th className="py-3 px-4 text-right">Live Price</th>
                  <th className="py-3 px-4 text-right">24h Move</th>
                  <th className="py-3 px-4 text-right">RSI (14)</th>
                  <th className="py-3 px-4 text-right">Payout</th>
                  <th className="py-3 px-4">Technical Signal</th>
                  <th className="py-3 px-4 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232938] text-xs">
                {visibleAssets.map((asset) => {
                  const q = quotes[asset.symbol];
                  const sig = signals[asset.symbol];
                  const chg = q?.changePct ?? 0;

                  const isBuy = sig?.signal === 'BUY' || sig?.signal === 'STRONG BUY';
                  const isSell = sig?.signal === 'SELL' || sig?.signal === 'STRONG SELL';

                  return (
                    <tr key={asset.symbol} className="hover:bg-slate-50 dark:hover:bg-[#232938]/50">
                      <td className="py-3 px-4">
                        <div className="font-display font-bold text-slate-900 dark:text-white">{asset.symbol}</div>
                        <div className="text-[11px] text-slate-500 dark:text-slate-400">{asset.name}</div>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-semibold text-slate-900 dark:text-white">
                        {q ? q.price.toFixed(asset.decimals) : '--'}
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-tabular font-semibold ${
                          chg >= 0 ? 'text-emerald-600 dark:text-[#0FAF59]' : 'text-rose-600 dark:text-[#FF4757]'
                        }`}
                      >
                        {chg >= 0 ? '+' : ''}
                        {chg.toFixed(2)}%
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-700 dark:text-slate-300">
                        {sig?.rsi != null ? sig.rsi.toFixed(1) : loading ? '...' : '--'}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular font-bold text-amber-500">
                        {asset.payout}%
                      </td>
                      <td className="py-3 px-4">
                        {sig ? (
                          <span
                            className={`inline-flex items-center gap-1 font-mono-tabular font-bold ${
                              isBuy
                                ? 'text-emerald-600 dark:text-[#0FAF59]'
                                : isSell
                                  ? 'text-rose-600 dark:text-[#FF4757]'
                                  : 'text-slate-500 dark:text-slate-400'
                            }`}
                          >
                            {isBuy && <ArrowUpRight className="w-3.5 h-3.5" />}
                            {isSell && <ArrowDownRight className="w-3.5 h-3.5" />}
                            {sig.signal}
                          </span>
                        ) : (
                          <span className="text-slate-400">{loading ? 'Computing...' : 'N/A'}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right">
                        <button
                          onClick={() => onSelectAssetAndTrade(asset.symbol)}
                          className="px-3 py-1.5 rounded bg-[#2962FF] hover:bg-blue-500 text-white text-[11px] font-semibold transition-colors"
                        >
                          Open Chart
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 2. ANALYTICS VIEW
// ==========================================
export const AnalyticsView: React.FC<{ account: TraderAccountState; onGoTrade: () => void }> = ({
  account,
  onGoTrade,
}) => {
  const closed = useMemo(
    () => account.trades.filter((t) => t.status !== 'active' && t.accountMode === account.accountMode),
    [account.trades, account.accountMode]
  );

  const stats = useMemo(() => {
    const wins = closed.filter((t) => t.status === 'won');
    const losses = closed.filter((t) => t.status === 'lost');
    const netProfit = closed.reduce((acc, t) => acc + t.profit, 0);
    const totalTurnover = closed.reduce((acc, t) => acc + t.amount, 0);
    const winRate = closed.length > 0 ? (wins.length / closed.length) * 100 : 0;
    const bestTrade = closed.reduce((max, t) => (t.profit > max ? t.profit : max), 0);
    const grossWin = wins.reduce((s, t) => s + t.profit, 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + t.profit, 0));
    const profitFactor = grossLoss > 0 ? grossWin / grossLoss : grossWin > 0 ? 99 : 0;

    // Build chronological equity curve
    const chrono = [...closed].reverse();
    let cum = 0;
    const curve = [0, ...chrono.map((t) => (cum += t.profit))];

    return {
      totalTrades: closed.length,
      winsCount: wins.length,
      lossesCount: losses.length,
      netProfit,
      totalTurnover,
      winRate,
      bestTrade,
      profitFactor,
      curve,
    };
  }, [closed]);

  // SVG Equity Curve geometry
  const svgWidth = 720;
  const svgHeight = 200;
  const minVal = Math.min(...stats.curve, 0);
  const maxVal = Math.max(...stats.curve, 10);
  const range = maxVal - minVal || 1;
  const points = stats.curve
    .map((val, idx) => {
      const x = stats.curve.length > 1 ? (idx / (stats.curve.length - 1)) * svgWidth : svgWidth;
      const y = svgHeight - 16 - ((val - minVal) / range) * (svgHeight - 32);
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-5xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white">
              Trader Performance Analytics ({account.accountMode === 'demo' ? 'Demo' : 'Live'})
            </h1>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Real-time trade execution metrics and equity progression.
            </p>
          </div>
          <button
            onClick={onGoTrade}
            className="px-4 py-2 rounded-md bg-[#2962FF] hover:bg-blue-500 text-white text-xs font-semibold"
          >
            Back to Chart
          </button>
        </div>

        {/* 4 KPI Strip */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div className="p-4 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
            <div className="text-xs text-slate-500 dark:text-slate-400">Net Profit / Loss</div>
            <div
              className={`font-mono-tabular text-2xl font-bold mt-1 ${
                stats.netProfit >= 0 ? 'text-emerald-600 dark:text-[#0FAF59]' : 'text-rose-600 dark:text-[#FF4757]'
              }`}
            >
              {stats.netProfit >= 0 ? '+' : '-'}${Math.abs(stats.netProfit).toFixed(2)}
            </div>
          </div>
          <div className="p-4 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
            <div className="text-xs text-slate-500 dark:text-slate-400">Win Rate</div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1">
              {stats.winRate.toFixed(1)}%
            </div>
            <div className="text-[11px] font-mono-tabular text-slate-500 mt-0.5">
              {stats.winsCount}W / {stats.lossesCount}L ({stats.totalTrades} total)
            </div>
          </div>
          <div className="p-4 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
            <div className="text-xs text-slate-500 dark:text-slate-400">Trading Turnover</div>
            <div className="font-mono-tabular text-2xl font-bold text-slate-900 dark:text-white mt-1">
              ${stats.totalTurnover.toFixed(2)}
            </div>
          </div>
          <div className="p-4 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
            <div className="text-xs text-slate-500 dark:text-slate-400">Profit Factor</div>
            <div className="font-mono-tabular text-2xl font-bold text-amber-500 mt-1">
              {stats.profitFactor.toFixed(2)}
            </div>
          </div>
        </div>

        {/* Equity Curve */}
        <div className="p-5 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
          <div className="flex items-center justify-between mb-4">
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <BarChart3 className="w-4 h-4 text-[#2962FF]" />
              Cumulative P&L Curve
            </h2>
            <span className="font-mono-tabular text-xs text-slate-500 dark:text-slate-400">
              Best Trade: +${stats.bestTrade.toFixed(2)}
            </span>
          </div>

          {closed.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-500 dark:text-slate-400 space-y-3">
              <p>Complete at least one trade in {account.accountMode} mode to visualize your equity curve.</p>
              <button
                onClick={onGoTrade}
                className="px-4 py-2 rounded bg-[#0FAF59] text-white font-semibold text-xs"
              >
                Place Your First Trade
              </button>
            </div>
          ) : (
            <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} className="w-full h-52 overflow-visible">
              <line
                x1={0}
                x2={svgWidth}
                y1={svgHeight - 16 - ((0 - minVal) / range) * (svgHeight - 32)}
                y2={svgHeight - 16 - ((0 - minVal) / range) * (svgHeight - 32)}
                stroke="rgba(148,163,184,0.25)"
                strokeDasharray="4 4"
              />
              <polyline
                fill="none"
                stroke={stats.netProfit >= 0 ? '#0FAF59' : '#FF4757'}
                strokeWidth="2.5"
                points={points}
              />
            </svg>
          )}
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 3. LEADERBOARD VIEW
// ==========================================
export const LeaderboardView: React.FC<{ clientId: string }> = ({ clientId }) => {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    brokerFetch<{ leaderboard: LeaderboardEntry[] }>(
      `/api/leaderboard?clientId=${encodeURIComponent(clientId)}`
    )
      .then(({ data }) => {
        setEntries(data?.leaderboard || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [clientId]);

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-4xl mx-auto space-y-4 sm:space-y-5">
        <div>
          <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <Award className="w-5 h-5 text-amber-500" />
            Top Traders Leaderboard
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Ranked by net realized trading profit. Your session performance updates live.
          </p>
        </div>

        <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#2A3142] text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#161B26]">
                  <th className="py-3 px-4">Rank</th>
                  <th className="py-3 px-4">Trader</th>
                  <th className="py-3 px-4 text-right">Trades</th>
                  <th className="py-3 px-4 text-right">Win Rate</th>
                  <th className="py-3 px-4 text-right">Net Profit</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232938] text-xs">
                {loading ? (
                  <tr>
                    <td colSpan={5} className="py-10 text-center text-slate-400">
                      Loading leaderboard...
                    </td>
                  </tr>
                ) : (
                  entries.map((row) => (
                    <tr
                      key={`${row.rank}-${row.name}`}
                      className={
                        row.isCurrentUser
                          ? 'bg-blue-50 dark:bg-[#2962FF]/15 font-semibold'
                          : 'hover:bg-slate-50 dark:hover:bg-[#232938]/40'
                      }
                    >
                      <td className="py-3 px-4 font-mono-tabular font-bold text-slate-700 dark:text-slate-200">
                        #{row.rank}
                      </td>
                      <td className="py-3 px-4 text-slate-900 dark:text-white whitespace-nowrap">
                        {row.name}{' '}
                        <span className="text-slate-400 font-normal">
                          · {row.country} {row.isCurrentUser ? '(You)' : ''}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {row.tradesCount}
                      </td>
                      <td className="py-3 px-4 text-right font-mono-tabular text-slate-600 dark:text-slate-300">
                        {row.winRate.toFixed(1)}%
                      </td>
                      <td
                        className={`py-3 px-4 text-right font-mono-tabular font-bold whitespace-nowrap ${
                          row.profit >= 0 ? 'text-emerald-600 dark:text-[#0FAF59]' : 'text-rose-600 dark:text-[#FF4757]'
                        }`}
                      >
                        {row.profit >= 0 ? '+' : '-'}${Math.abs(row.profit).toLocaleString('en-US', { minimumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 4. ACCOUNT & TRANSACTIONS VIEW
// ==========================================
export const AccountView: React.FC<{
  account: TraderAccountState;
  onUpdateProfile: (name: string, email: string) => Promise<void>;
  onOpenWallet: () => void;
}> = ({ account, onUpdateProfile, onOpenWallet }) => {
  const [name, setName] = useState(account.name);
  const [email, setEmail] = useState(account.email);
  const [saved, setSaved] = useState(false);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    await onUpdateProfile(name, email);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  };

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <User className="w-5 h-5 text-[#2962FF]" />
            Trader Profile & Wallet Ledger
          </h1>
          <button
            onClick={onOpenWallet}
            className="px-4 py-2 rounded-md bg-[#0FAF59] hover:bg-[#12c464] text-white text-xs font-bold"
          >
            Open Cashier
          </button>
        </div>

        <form
          onSubmit={handleSave}
          className="p-5 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] grid grid-cols-1 md:grid-cols-3 gap-4 items-end"
        >
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Display Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">Email Address</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
            />
          </div>
          <button
            type="submit"
            className="py-2 px-4 rounded bg-[#2962FF] hover:bg-blue-500 text-white text-xs font-semibold inline-flex items-center justify-center gap-1.5 h-[38px]"
          >
            {saved ? (
              <>
                <Check className="w-4 h-4" /> Profile Saved
              </>
            ) : (
              'Save Profile'
            )}
          </button>
        </form>

        <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
          <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A3142] font-display font-semibold text-sm text-slate-900 dark:text-white">
            Transaction History
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 dark:border-[#2A3142] text-[11px] font-semibold text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-[#161B26]">
                  <th className="py-2.5 px-4">Type</th>
                  <th className="py-2.5 px-4">Method</th>
                  <th className="py-2.5 px-4">Notes</th>
                  <th className="py-2.5 px-4 text-right">Amount</th>
                  <th className="py-2.5 px-4 text-right">Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-[#232938] text-xs">
                {account.transactions.map((tx) => (
                  <tr key={tx.id}>
                    <td className="py-2.5 px-4 font-semibold capitalize text-slate-900 dark:text-white">
                      {tx.type.replace('_', ' ')}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600 dark:text-slate-300">{tx.method}</td>
                    <td className="py-2.5 px-4 text-slate-500 dark:text-slate-400">{tx.note || '--'}</td>
                    <td
                      className={`py-2.5 px-4 text-right font-mono-tabular font-bold ${
                        tx.type === 'withdrawal' ? 'text-rose-500' : 'text-emerald-600 dark:text-[#0FAF59]'
                      }`}
                    >
                      {tx.type === 'withdrawal' ? '-' : '+'}${tx.amount.toFixed(2)}
                    </td>
                    <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-500 dark:text-slate-400 whitespace-nowrap">
                      {new Date(tx.timestamp).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 5. SUPPORT & GUIDE VIEW
// ==========================================
export const SupportView: React.FC<{ onGoTrade: () => void }> = ({ onGoTrade }) => {
  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-4xl mx-auto space-y-5 sm:space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-[#2962FF]" />
            Trading Manual & Keyboard Shortcuts
          </h1>
          <button
            onClick={onGoTrade}
            className="px-4 py-2 rounded-md bg-[#2962FF] text-white text-xs font-semibold"
          >
            Return to Terminal
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="p-5 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-2">
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[#0FAF59]" />
              How Digital Options Work
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Select an asset, choose an expiration time (5 seconds to 1 hour), set your investment amount, and predict
              whether the live exchange price will close strictly above (Up) or below (Down) your entry strike at
              expiration. Winning contracts pay your stake plus up to 92% return; exact ties refund your stake.
            </p>
          </div>

          <div className="p-5 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-2">
            <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white">
              Real-Time Exchange Feeds
            </h2>
            <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
              Crypto pairs and tokenized spot Gold stream live 24/7 via direct WebSocket feeds from Binance and Coinbase
              Exchange. Forex, commodities, and equities stream live spot quotes and historical OHLC candles via Yahoo
              Finance during active market hours.
            </p>
          </div>
        </div>

        <div className="p-5 rounded-lg bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
          <h2 className="font-display font-semibold text-sm text-slate-900 dark:text-white mb-3">
            Terminal Keyboard Shortcuts
          </h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[#232938]">
              <span className="text-slate-600 dark:text-slate-300">Execute UP (Call) Trade</span>
              <kbd className="px-2 py-0.5 font-mono-tabular bg-slate-100 dark:bg-[#131722] border border-slate-300 dark:border-[#2A3142] rounded text-slate-800 dark:text-slate-200">
                W
              </kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[#232938]">
              <span className="text-slate-600 dark:text-slate-300">Execute DOWN (Put) Trade</span>
              <kbd className="px-2 py-0.5 font-mono-tabular bg-slate-100 dark:bg-[#131722] border border-slate-300 dark:border-[#2A3142] rounded text-slate-800 dark:text-slate-200">
                S
              </kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[#232938]">
              <span className="text-slate-600 dark:text-slate-300">Zoom Chart In / Out</span>
              <kbd className="px-2 py-0.5 font-mono-tabular bg-slate-100 dark:bg-[#131722] border border-slate-300 dark:border-[#2A3142] rounded text-slate-800 dark:text-slate-200">
                Mouse Wheel
              </kbd>
            </div>
            <div className="flex items-center justify-between py-1.5 border-b border-slate-100 dark:border-[#232938]">
              <span className="text-slate-600 dark:text-slate-300">Pan Historical Candles</span>
              <kbd className="px-2 py-0.5 font-mono-tabular bg-slate-100 dark:bg-[#131722] border border-slate-300 dark:border-[#2A3142] rounded text-slate-800 dark:text-slate-200">
                Click + Drag
              </kbd>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

// ==========================================
// 6. SETTINGS VIEW
// ==========================================
export const SettingsView: React.FC<{
  settings: TerminalSettings;
  onUpdate: (patch: Partial<TerminalSettings>) => void;
}> = ({ settings, onUpdate }) => {
  const toggles: Array<{ key: keyof TerminalSettings; label: string; desc: string }> = [
    {
      key: 'oneClickTrade',
      label: '1-Click Instant Trading',
      desc: 'Execute UP/DOWN trades immediately without a confirmation dialog.',
    },
    {
      key: 'soundEnabled',
      label: 'Audio Trade Alerts',
      desc: 'Play synthesized Web Audio feedback on trade entry and settlement.',
    },
    {
      key: 'showGrid',
      label: 'Chart Gridlines',
      desc: 'Display horizontal price and vertical time grid lines on the canvas.',
    },
    {
      key: 'showSentiment',
      label: 'Trader Sentiment Gauge',
      desc: 'Show the vertical buyer/seller pressure bar along the left chart edge.',
    },
    {
      key: 'showOpenTradesOnChart',
      label: 'Plot Active Trades on Chart',
      desc: 'Render strike price lines, direction badges, and expiry flags directly on the chart.',
    },
  ];

  return (
    <div className="flex-1 overflow-y-auto p-3.5 sm:p-6 bg-slate-50 dark:bg-[#131722]">
      <div className="max-w-3xl mx-auto space-y-4 sm:space-y-5">
        <h1 className="font-display font-bold text-lg sm:text-xl text-slate-900 dark:text-white flex items-center gap-2">
          <Settings className="w-5 h-5 text-[#2962FF]" />
          Terminal Preferences
        </h1>

        <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg divide-y divide-slate-100 dark:divide-[#232938]">
          {/* Template (2 options: Light Mode | Full Light) */}
          <div className="flex flex-wrap items-center justify-between gap-3 p-4">
            <div>
              <div className="text-sm font-semibold text-slate-900 dark:text-white">Template</div>
              <div className="text-xs text-slate-500 dark:text-slate-400">
                Choose Light Mode (dark/black chart & broker template) or Full Light (all-white Quotex layout).
              </div>
            </div>
            <div className="flex items-center gap-1 p-1 rounded-md bg-slate-100 dark:bg-[#131722] shrink-0">
              <button
                onClick={() => onUpdate({ templateMode: 'light_mode' })}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  settings.templateMode === 'light_mode'
                    ? 'bg-[#2962FF] text-white'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Light Mode
              </button>
              <button
                onClick={() => onUpdate({ templateMode: 'full_light' })}
                className={`px-3 py-1.5 text-xs font-semibold rounded transition-colors ${
                  settings.templateMode === 'full_light'
                    ? 'bg-white text-slate-900 shadow-sm'
                    : 'text-slate-600 dark:text-slate-400'
                }`}
              >
                Full Light
              </button>
            </div>
          </div>

          {toggles.map((item) => {
            const active = Boolean(settings[item.key]);
            return (
              <div key={item.key} className="flex items-center justify-between p-4 gap-4">
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white">{item.label}</div>
                  <div className="text-xs text-slate-500 dark:text-slate-400">{item.desc}</div>
                </div>
                <button
                  onClick={() => onUpdate({ [item.key]: !active })}
                  className={`w-11 h-6 rounded-full transition-colors p-0.5 shrink-0 ${
                    active ? 'bg-[#0FAF59]' : 'bg-slate-300 dark:bg-slate-700'
                  }`}
                >
                  <div
                    className={`w-5 h-5 rounded-full bg-white transition-transform ${
                      active ? 'translate-x-5' : 'translate-x-0'
                    }`}
                  />
                </button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
