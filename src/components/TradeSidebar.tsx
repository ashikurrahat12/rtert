import React, { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Clock,
  Inbox,
  Minus,
  Plus,
  Repeat,
  Trash2,
  X,
} from 'lucide-react';
import type {
  AccountMode,
  AssetDefinition,
  MarketQuote,
  PendingOrder,
  Trade,
  TradeDirection,
} from '../types/trading.ts';
import { ASSET_MAP } from '../constants/assets.ts';
import { AssetIcon } from './AssetIcon.tsx';

interface TradeSidebarProps {
  asset: AssetDefinition;
  quote?: MarketQuote;
  accountMode: AccountMode;
  balance: number;
  durationSeconds: number;
  onDurationChange: (sec: number) => void;
  amount: number;
  onAmountChange: (amt: number) => void;
  onHoverDirection: (dir: TradeDirection | null) => void;
  onPlaceTrade: (direction: TradeDirection, overrideAmount?: number, overrideDuration?: number) => Promise<void>;
  onPlacePendingOrder: (params: {
    direction: TradeDirection;
    triggerType: 'price' | 'time';
    targetPrice?: number;
    targetTime?: number;
  }) => Promise<void>;
  onCancelPendingOrder: (id: string) => Promise<void>;
  trades: Trade[];
  pendingOrders: PendingOrder[];
  oneClickTrade: boolean;
  onOpenWallet: () => void;
}

const DURATION_PRESETS = [
  { label: '5s', sec: 5 },
  { label: '15s', sec: 15 },
  { label: '30s', sec: 30 },
  { label: '1m', sec: 60 },
  { label: '2m', sec: 120 },
  { label: '5m', sec: 300 },
];

export const TradeSidebar: React.FC<TradeSidebarProps> = ({
  asset,
  quote,
  accountMode,
  balance,
  durationSeconds,
  onDurationChange,
  amount,
  onAmountChange,
  onHoverDirection,
  onPlaceTrade,
  onPlacePendingOrder,
  onCancelPendingOrder,
  trades,
  pendingOrders,
  oneClickTrade,
  onOpenWallet,
}) => {
  const [execMode, setExecMode] = useState<'instant' | 'pending'>('instant');
  const [timeMode, setTimeMode] = useState<'duration' | 'clock'>('duration');
  const [amountInputMode, setAmountInputMode] = useState<'usd' | 'pct'>('usd');
  const [pctValue, setPctValue] = useState<number>(5);
  const [showTimePresets, setShowTimePresets] = useState(false);

  const [pendingTriggerType, setPendingTriggerType] = useState<'price' | 'time'>('price');
  const [targetPriceInput, setTargetPriceInput] = useState<string>('');
  const [targetTimeDelayMin, setTargetTimeDelayMin] = useState<number>(2);
  const [bottomTab, setBottomTab] = useState<'trades' | 'orders'>('orders');
  const [mobileListOpen, setMobileListOpen] = useState<boolean>(false);
  const [expandedTradeId, setExpandedTradeId] = useState<string | null>(null);
  const [confirmDir, setConfirmDir] = useState<TradeDirection | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 250);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (quote?.price) {
      setTargetPriceInput(quote.price.toFixed(asset.decimals));
    }
  }, [asset.symbol, asset.decimals]);

  useEffect(() => {
    if (amountInputMode === 'pct') {
      const computed = Math.max(1, Math.round((balance * pctValue) / 100));
      onAmountChange(computed);
    }
  }, [amountInputMode, pctValue, balance]);

  const clockSlots = useMemo(() => {
    const slots: { label: string; sec: number }[] = [];
    const baseSec = Math.ceil(nowMs / 1000 / 60) * 60;
    for (let i = 1; i <= 5; i++) {
      const targetSec = baseSec + i * 60;
      const diff = Math.max(15, targetSec - Math.floor(nowMs / 1000));
      const d = new Date(targetSec * 1000);
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      slots.push({ label: `${hh}:${mm}`, sec: diff });
    }
    return slots;
  }, [nowMs]);

  const accountTrades = useMemo(
    () => trades.filter((t) => t.accountMode === accountMode),
    [trades, accountMode]
  );
  const activeTradesCount = useMemo(
    () => accountTrades.filter((t) => t.status === 'active').length,
    [accountTrades]
  );
  const activePending = useMemo(
    () => pendingOrders.filter((o) => o.status === 'pending' && o.accountMode === accountMode),
    [pendingOrders, accountMode]
  );

  // Switch to trades tab automatically once trades exist
  useEffect(() => {
    if (accountTrades.length > 0 && bottomTab === 'orders' && activePending.length === 0) {
      setBottomTab('trades');
    }
  }, [accountTrades.length]);

  const groupedTrades = useMemo(() => {
    const groups: Array<{ dateLabel: string; items: Trade[] }> = [];
    const map = new Map<string, Trade[]>();
    for (const tr of accountTrades.slice(0, 50)) {
      const d = new Date(tr.entryTime);
      const label = `${d.getDate()} ${d.toLocaleString('en-US', { month: 'long' }).toUpperCase()}`;
      let list = map.get(label);
      if (!list) {
        list = [];
        map.set(label, list);
        groups.push({ dateLabel: label, items: list });
      }
      list.push(tr);
    }
    return groups;
  }, [accountTrades]);

  const payoutMultiplier = 1 + asset.payout / 100;
  const totalPayout = Math.round(amount * payoutMultiplier * 100) / 100;

  const formatHMS = (sec: number) => {
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const formatClockTarget = (sec: number) => {
    const d = new Date(nowMs + sec * 1000);
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  };

  const handleActionClick = async (dir: TradeDirection) => {
    if (submitting) return;
    if (execMode === 'pending') {
      setSubmitting(true);
      try {
        if (pendingTriggerType === 'price') {
          const parsed = parseFloat(targetPriceInput);
          if (!Number.isFinite(parsed) || parsed <= 0) return;
          await onPlacePendingOrder({
            direction: dir,
            triggerType: 'price',
            targetPrice: parsed,
          });
        } else {
          await onPlacePendingOrder({
            direction: dir,
            triggerType: 'time',
            targetTime: Date.now() + targetTimeDelayMin * 60 * 1000,
          });
        }
        setBottomTab('orders');
      } finally {
        setSubmitting(false);
      }
      return;
    }

    if (!oneClickTrade && !confirmDir) {
      setConfirmDir(dir);
      return;
    }

    setConfirmDir(null);
    setSubmitting(true);
    try {
      await onPlaceTrade(dir);
      setBottomTab('trades');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <aside className="w-full lg:w-[272px] shrink-0 bg-white dark:bg-[#1C2030] border-t lg:border-t-0 lg:border-l border-slate-200 dark:border-[#2B3146] text-slate-900 dark:text-white flex flex-col lg:h-full overflow-hidden">
      {/* Top Execution Panel */}
      <div className="p-2.5 sm:p-3.5 space-y-2 sm:space-y-3 border-b border-slate-200 dark:border-[#2B3146]">
        {/* Asset Pair Title Row + Mobile Trades/Orders Toggle */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <AssetIcon
              base={asset.baseCurrency}
              quote={asset.quoteCurrency}
              category={asset.category}
              size="sm"
            />
            <span className="font-display font-bold text-[13px] text-slate-900 dark:text-white truncate">
              {asset.symbol}
            </span>
            <span className="font-mono-tabular text-xs font-bold text-amber-500 lg:text-slate-400 lg:dark:text-slate-300 shrink-0">
              {asset.payout}%
            </span>
          </div>

          <button
            type="button"
            onClick={() => setMobileListOpen((v) => !v)}
            className={`lg:hidden inline-flex items-center gap-1 px-2 py-1 rounded text-[10px] font-semibold border transition-colors shrink-0 ${
              mobileListOpen
                ? 'bg-[#2962FF] border-[#2962FF] text-white'
                : 'bg-slate-100 dark:bg-[#252B3B] border-slate-200 dark:border-[#343B52] text-slate-700 dark:text-slate-200'
            }`}
          >
            <ArrowLeftRight className="w-3 h-3" />
            <span>Trades</span>
            <span className="font-mono-tabular px-1 rounded-full bg-black/10 dark:bg-white/15">
              {activeTradesCount}
            </span>
          </button>
        </div>

        {/* PENDING TRADE Toggle Row (Matches Screenshot 2) */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5 text-[11px] font-bold tracking-wide text-[#2962FF]">
            <Clock className="w-3.5 h-3.5" />
            <span>PENDING TRADE</span>
          </div>
          <button
            type="button"
            onClick={() => setExecMode((m) => (m === 'instant' ? 'pending' : 'instant'))}
            aria-label="Toggle Pending Trade"
            className={`w-9 h-5 rounded-full transition-colors p-0.5 flex items-center ${
              execMode === 'pending'
                ? 'bg-[#2962FF] justify-end'
                : 'bg-slate-200 dark:bg-[#2D3348] justify-start border border-slate-300 dark:border-[#3A425C]'
            }`}
          >
            <span className="w-3.5 h-3.5 rounded-full bg-white shadow-sm block" />
          </button>
        </div>

        {/* Pending Order Target Config */}
        {execMode === 'pending' && (
          <div className="p-2 rounded bg-slate-50 dark:bg-[#141724] border border-slate-200 dark:border-[#2B3146] space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-slate-500 dark:text-slate-400">Trigger by:</span>
              <div className="flex gap-1">
                <button
                  onClick={() => setPendingTriggerType('price')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    pendingTriggerType === 'price'
                      ? 'bg-[#2962FF] text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Price
                </button>
                <button
                  onClick={() => setPendingTriggerType('time')}
                  className={`px-1.5 py-0.5 rounded font-semibold ${
                    pendingTriggerType === 'time'
                      ? 'bg-[#2962FF] text-white'
                      : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  Timer
                </button>
              </div>
            </div>
            {pendingTriggerType === 'price' ? (
              <input
                type="number"
                step="any"
                value={targetPriceInput}
                onChange={(e) => setTargetPriceInput(e.target.value)}
                className="w-full px-2 py-1 text-xs font-mono-tabular bg-white dark:bg-[#1C2030] border border-slate-300 dark:border-[#2E354D] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
              />
            ) : (
              <div className="grid grid-cols-4 gap-1">
                {[1, 2, 5, 10].map((m) => (
                  <button
                    key={m}
                    onClick={() => setTargetTimeDelayMin(m)}
                    className={`py-1 text-[11px] font-mono-tabular rounded border ${
                      targetTimeDelayMin === m
                        ? 'bg-[#2962FF] border-[#2962FF] text-white'
                        : 'bg-white dark:bg-[#1C2030] border-slate-200 dark:border-[#2E354D] text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {m}m
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* TIME & INVESTMENT GRID (2-column compact on Phone, stacked on PC) */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 sm:gap-3 pt-0.5">
        {/* TIME FIELDSET */}
        <div className="pt-1">
          <div className="relative border border-slate-300 dark:border-[#343B52] rounded-md px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-between">
            <span className="absolute -top-2 left-2.5 sm:left-3 px-1 bg-white dark:bg-[#1C2030] text-[10px] sm:text-[11px] font-medium text-slate-400">
              Time
            </span>
            <button
              onClick={() => onDurationChange(Math.max(5, durationSeconds - (durationSeconds >= 60 ? 60 : 5)))}
              className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#2D3348] hover:bg-slate-200 dark:hover:bg-[#3A425C] flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors"
              title="Decrease time"
            >
              <Minus className="w-3 h-3" />
            </button>
            <button
              onClick={() => setShowTimePresets((v) => !v)}
              className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white tracking-wide hover:text-[#2962FF] transition-colors"
              title="Click for quick presets"
            >
              {timeMode === 'clock' ? formatClockTarget(durationSeconds) : formatHMS(durationSeconds)}
            </button>
            <button
              onClick={() => onDurationChange(Math.min(3600, durationSeconds + (durationSeconds >= 60 ? 60 : 5)))}
              className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#2D3348] hover:bg-slate-200 dark:hover:bg-[#3A425C] flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors"
              title="Increase time"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="flex justify-center mt-0.5">
            <button
              onClick={() => {
                setTimeMode((m) => (m === 'duration' ? 'clock' : 'duration'));
                setShowTimePresets(true);
              }}
              className="text-[10px] font-bold tracking-wider text-[#2962FF] hover:underline uppercase"
            >
              SWITCH TIME
            </button>
          </div>
        </div>

        {/* INVESTMENT FIELDSET */}
        <div className="pt-1">
          <div className="relative border border-slate-300 dark:border-[#343B52] rounded-md px-2 sm:px-2.5 py-1.5 sm:py-2 flex items-center justify-between">
            <span className="absolute -top-2 left-2.5 sm:left-3 px-1 bg-white dark:bg-[#1C2030] text-[10px] sm:text-[11px] font-medium text-slate-400">
              Investment
            </span>
            <button
              onClick={() => {
                if (amountInputMode === 'pct') {
                  setPctValue((p) => Math.max(1, p - 1));
                } else {
                  onAmountChange(Math.max(1, Math.round(amount - (amount > 100 ? 20 : amount > 10 ? 5 : 1))));
                }
              }}
              className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#2D3348] hover:bg-slate-200 dark:hover:bg-[#3A425C] flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors"
              title="Decrease investment"
            >
              <Minus className="w-3 h-3" />
            </button>

            {amountInputMode === 'usd' ? (
              <div className="flex items-center justify-center">
                <input
                  type="number"
                  min={1}
                  max={50000}
                  value={amount}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    onAmountChange(Number.isFinite(val) ? Math.max(1, Math.min(50000, val)) : 1);
                  }}
                  className="w-16 bg-transparent text-right font-mono-tabular text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                />
                <span className="font-mono-tabular text-sm font-bold text-slate-900 dark:text-white ml-1">$</span>
              </div>
            ) : (
              <div className="flex items-center justify-center">
                <input
                  type="number"
                  min={1}
                  max={100}
                  value={pctValue}
                  onChange={(e) => {
                    const val = parseFloat(e.target.value);
                    setPctValue(Number.isFinite(val) ? Math.max(1, Math.min(100, val)) : 1);
                  }}
                  className="w-12 bg-transparent text-right font-mono-tabular text-sm font-bold text-slate-900 dark:text-white focus:outline-none"
                />
                <span className="font-mono-tabular text-sm font-bold text-slate-500 dark:text-slate-300 ml-1">%</span>
              </div>
            )}

            <button
              onClick={() => {
                if (amountInputMode === 'pct') {
                  setPctValue((p) => Math.min(100, p + 1));
                } else {
                  onAmountChange(Math.min(50000, Math.round(amount + (amount >= 100 ? 20 : amount >= 10 ? 5 : 1))));
                }
              }}
              className="w-6 h-6 rounded-full bg-slate-100 dark:bg-[#2D3348] hover:bg-slate-200 dark:hover:bg-[#3A425C] flex items-center justify-center text-slate-700 dark:text-slate-200 transition-colors"
              title="Increase investment"
            >
              <Plus className="w-3 h-3" />
            </button>
          </div>

          <div className="flex justify-center mt-0.5">
            <button
              onClick={() => setAmountInputMode((m) => (m === 'usd' ? 'pct' : 'usd'))}
              className="text-[10px] font-bold tracking-wider text-[#2962FF] hover:underline uppercase"
            >
              SWITCH
            </button>
          </div>
        </div>
        </div>

        {/* Full-width Time Presets Tray (avoids crowding inside narrow mobile column) */}
        {showTimePresets && (
          <div className="grid grid-cols-6 lg:grid-cols-3 gap-1 pt-0.5">
            {timeMode === 'duration'
              ? DURATION_PRESETS.map((p) => (
                  <button
                    key={p.sec}
                    onClick={() => {
                      onDurationChange(p.sec);
                      setShowTimePresets(false);
                    }}
                    className={`py-1 text-[11px] font-mono-tabular font-semibold rounded border ${
                      durationSeconds === p.sec
                        ? 'bg-[#2962FF] border-[#2962FF] text-white'
                        : 'bg-slate-50 dark:bg-[#141724] border-slate-200 dark:border-[#2B3146] text-slate-700 dark:text-slate-300 hover:border-slate-400'
                    }`}
                  >
                    {p.label}
                  </button>
                ))
              : clockSlots.map((slot) => (
                  <button
                    key={slot.label}
                    onClick={() => {
                      onDurationChange(slot.sec);
                      setShowTimePresets(false);
                    }}
                    className="py-1 text-[11px] font-mono-tabular font-semibold rounded border bg-slate-50 dark:bg-[#141724] border-slate-200 dark:border-[#2B3146] text-slate-700 dark:text-slate-300 hover:border-[#2962FF]"
                  >
                    {slot.label}
                  </button>
                ))}
          </div>
        )}

        {/* PAYOUT DOTTED LEADER ROW */}
        <div className="flex items-baseline justify-between gap-2 text-xs pt-0.5">
          <span className="text-slate-500 dark:text-slate-400 font-medium shrink-0">Payout</span>
          <div className="flex-1 border-b border-dotted border-slate-300 dark:border-[#3A415A] mb-1" />
          <span className="font-mono-tabular font-bold text-sm text-slate-900 dark:text-white shrink-0">
            {totalPayout.toFixed(2)} $
          </span>
        </div>

        {/* Insufficient Balance Callout */}
        {amount > balance && (
          <div className="p-2 rounded bg-amber-500/10 border border-amber-500/30 flex items-center justify-between gap-2 text-[11px]">
            <span className="text-amber-600 dark:text-amber-400 font-medium">Low {accountMode} funds</span>
            <button onClick={onOpenWallet} className="font-bold text-[#2962FF] hover:underline">
              {accountMode === 'demo' ? 'Refill' : 'Deposit'}
            </button>
          </div>
        )}

        {/* Confirmation Prompt if 1-Click Trade is Off */}
        {confirmDir && (
          <div className="p-2 rounded bg-slate-100 dark:bg-[#141724] border border-[#2962FF] space-y-1.5">
            <div className="flex items-center justify-between text-[11px]">
              <span className="font-semibold text-slate-900 dark:text-white">
                Confirm {confirmDir === 'UP' ? 'Buy' : 'Sell'} ${amount}?
              </span>
              <button onClick={() => setConfirmDir(null)} className="text-slate-400 hover:text-slate-700 dark:hover:text-white">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-1.5">
              <button
                onClick={() => setConfirmDir(null)}
                className="py-1 text-[11px] font-medium rounded bg-slate-200 dark:bg-[#2B3146] text-slate-700 dark:text-slate-300"
              >
                Cancel
              </button>
              <button
                onClick={() => handleActionClick(confirmDir)}
                className={`py-1 text-[11px] font-bold rounded text-white ${
                  confirmDir === 'UP' ? 'bg-[#0FAF59]' : 'bg-[#F05044]'
                }`}
              >
                Confirm
              </button>
            </div>
          </div>
        )}

        {/* BUY & SELL BUTTONS */}
        <div className="grid grid-cols-2 lg:grid-cols-1 gap-2 sm:gap-2.5 pt-0.5">
          <button
            onClick={() => handleActionClick('UP')}
            onMouseEnter={() => onHoverDirection('UP')}
            onMouseLeave={() => onHoverDirection(null)}
            disabled={submitting || amount > balance}
            className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-md bg-[#0FAF59] hover:bg-[#13c465] active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed text-white font-display font-bold text-xs sm:text-sm transition-all shadow-sm"
          >
            <span>{execMode === 'pending' ? 'Pending Buy' : 'Buy'}</span>
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/25 flex items-center justify-center">
              <ArrowUp className="w-3.5 h-3.5 stroke-[2.75]" />
            </span>
          </button>

          <button
            onClick={() => handleActionClick('DOWN')}
            onMouseEnter={() => onHoverDirection('DOWN')}
            onMouseLeave={() => onHoverDirection(null)}
            disabled={submitting || amount > balance}
            className="flex items-center justify-between px-3 sm:px-4 py-2.5 sm:py-3 rounded-md bg-[#E6493E] hover:bg-[#f0584d] active:scale-[0.99] disabled:opacity-45 disabled:cursor-not-allowed text-white font-display font-bold text-xs sm:text-sm transition-all shadow-sm"
          >
            <span>{execMode === 'pending' ? 'Pending Sell' : 'Sell'}</span>
            <span className="w-5 h-5 sm:w-6 sm:h-6 rounded-full bg-white/25 flex items-center justify-center">
              <ArrowDown className="w-3.5 h-3.5 stroke-[2.75]" />
            </span>
          </button>
        </div>
      </div>

      {/* BOTTOM TRADES & ORDERS PANEL (Always shown on PC; toggleable drawer on Phone so Chart stays large) */}
      <div className={`${mobileListOpen ? 'flex max-h-[28dvh]' : 'hidden'} lg:flex lg:max-h-none lg:flex-1 flex-col min-h-0 bg-white dark:bg-[#191D2B]`}>
        <div className="grid grid-cols-2 border-b border-slate-200 dark:border-[#2B3146] bg-slate-100 dark:bg-[#151824] shrink-0">
          <button
            onClick={() => setBottomTab('trades')}
            className={`py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
              bottomTab === 'trades'
                ? 'bg-white dark:bg-[#1C2030] text-slate-900 dark:text-white border-t-2 border-t-[#2962FF]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <ArrowLeftRight className="w-3.5 h-3.5" />
            <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-[#2D3348] text-[10px] font-mono-tabular text-slate-700 dark:text-slate-200">
              {activeTradesCount}
            </span>
          </button>

          <button
            onClick={() => setBottomTab('orders')}
            className={`py-2.5 px-3 flex items-center justify-center gap-2 text-xs font-semibold transition-colors ${
              bottomTab === 'orders'
                ? 'bg-white dark:bg-[#1C2030] text-slate-900 dark:text-white border-t-2 border-t-[#2962FF]'
                : 'text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            <span>Orders</span>
            <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-[#2D3348] text-[10px] font-mono-tabular text-slate-700 dark:text-slate-200">
              {activePending.length}
            </span>
          </button>
        </div>

        <div className="flex-1 overflow-y-auto divide-y divide-slate-100 dark:divide-[#252A3D]">
          {bottomTab === 'trades' &&
            (groupedTrades.length === 0 ? (
              <div className="py-12 px-5 flex flex-col items-center text-center text-xs text-slate-400 space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#252A3D] flex items-center justify-center text-slate-400">
                  <Inbox className="w-5 h-5" />
                </div>
                <p>No active or closed trades yet. Click Buy or Sell to open your first position.</p>
              </div>
            ) : (
              groupedTrades.map((group) => (
                <div key={group.dateLabel}>
                  <div className="py-2 px-3 flex items-center justify-center gap-1.5 bg-slate-50 dark:bg-[#161A26] text-[10px] font-bold tracking-wider text-slate-400">
                    <span>{group.dateLabel}</span>
                    <span className="px-1.5 py-0.5 rounded-full bg-slate-200 dark:bg-[#2D3348] text-slate-700 dark:text-slate-200 font-mono-tabular">
                      {group.items.length}
                    </span>
                  </div>

                  <div className="divide-y divide-slate-100 dark:divide-[#252A3D]">
                    {group.items.map((tr) => {
                      const def = ASSET_MAP.get(tr.symbol);
                      const isActive = tr.status === 'active';
                      const remSec = isActive ? Math.max(0, Math.ceil((tr.expiryTime - nowMs) / 1000)) : 0;
                      const currentP = tr.symbol === asset.symbol && quote ? quote.price : tr.entryPrice;
                      const isCurrentlyWinning =
                        isActive &&
                        ((tr.direction === 'UP' && currentP > tr.entryPrice) ||
                          (tr.direction === 'DOWN' && currentP < tr.entryPrice));
                      const isExpanded = expandedTradeId === tr.id;

                      const rightAmountStr = isActive
                        ? isCurrentlyWinning
                          ? `+${tr.payoutAmount.toFixed(2)} $`
                          : '0.00 $'
                        : tr.status === 'won'
                          ? `+${tr.payoutAmount.toFixed(2)} $`
                          : tr.status === 'tie'
                            ? `${tr.amount.toFixed(2)} $`
                            : '0.00 $';

                      const rightAmountColor =
                        (isActive && isCurrentlyWinning) || tr.status === 'won'
                          ? 'text-[#0FAF59]'
                          : 'text-slate-400';

                      return (
                        <div key={tr.id} className="px-3 py-2.5 hover:bg-slate-50 dark:hover:bg-[#22273A]/60 transition-colors">
                          <div
                            onClick={() => setExpandedTradeId(isExpanded ? null : tr.id)}
                            className="cursor-pointer space-y-1"
                          >
                            <div className="flex items-center justify-between gap-2 text-xs">
                              <div className="flex items-center gap-1.5 min-w-0">
                                {isExpanded ? (
                                  <ChevronDown className="w-3 h-3 text-slate-400 shrink-0" />
                                ) : (
                                  <ChevronRight className="w-3 h-3 text-slate-400 shrink-0" />
                                )}
                                {def && (
                                  <AssetIcon
                                    base={def.baseCurrency}
                                    quote={def.quoteCurrency}
                                    category={def.category}
                                    size="sm"
                                  />
                                )}
                                <span className="font-display font-bold text-slate-900 dark:text-white truncate">
                                  {tr.symbol}
                                </span>
                              </div>
                              <span
                                className={`font-mono-tabular text-[11px] shrink-0 ${
                                  isActive ? 'text-amber-500 font-bold' : 'text-slate-400'
                                }`}
                              >
                                {isActive ? formatHMS(remSec) : formatHMS(tr.durationSeconds)}
                              </span>
                            </div>

                            <div className="flex items-center justify-between pl-4 text-xs font-mono-tabular">
                              <div className="flex items-center gap-1 text-slate-600 dark:text-slate-300">
                                <span
                                  className={`inline-flex items-center justify-center w-3.5 h-3.5 rounded-full text-[9px] ${
                                    tr.direction === 'UP'
                                      ? 'bg-[#0FAF59]/20 text-[#0FAF59]'
                                      : 'bg-[#F05044]/20 text-[#F05044]'
                                  }`}
                                >
                                  {tr.direction === 'UP' ? '↑' : '↓'}
                                </span>
                                <span>{tr.amount} $</span>
                              </div>
                              <span className={`font-bold ${rightAmountColor}`}>{rightAmountStr}</span>
                            </div>
                          </div>

                          {isExpanded && (
                            <div className="mt-2 pt-2 pl-4 border-t border-slate-200 dark:border-[#2B3146] text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400 space-y-1">
                              <div className="flex justify-between">
                                <span>Entry: {tr.entryPrice}</span>
                                <span>{isActive ? 'ACTIVE' : tr.status.toUpperCase()}</span>
                              </div>
                              {!isActive && (
                                <div className="flex items-center justify-between">
                                  <span>Close: {tr.exitPrice ?? '--'}</span>
                                  <button
                                    onClick={() => onPlaceTrade(tr.direction, tr.amount, tr.durationSeconds)}
                                    className="inline-flex items-center gap-1 text-[#2962FF] hover:underline font-sans font-semibold"
                                  >
                                    <Repeat className="w-3 h-3" /> Repeat
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              ))
            ))}

          {bottomTab === 'orders' &&
            (activePending.length === 0 ? (
              <div className="py-12 px-5 flex flex-col items-center text-center text-xs text-slate-400 space-y-2.5">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-[#252A3D] flex items-center justify-center text-slate-400">
                  <Inbox className="w-5 h-5" />
                </div>
                <p className="leading-relaxed">
                  Order list is empty. Create a pending trade using the form above.
                </p>
              </div>
            ) : (
              activePending.map((po) => (
                <div key={po.id} className="p-3 space-y-1 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-slate-900 dark:text-white">
                      {po.symbol} · {po.direction === 'UP' ? 'Buy' : 'Sell'} {po.amount} $
                    </span>
                    <button
                      onClick={() => onCancelPendingOrder(po.id)}
                      className="text-slate-400 hover:text-rose-500"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <div className="font-mono-tabular text-[11px] text-amber-500">
                    {po.triggerType === 'price'
                      ? `Trigger ${po.condition === 'above' ? '≥' : '≤'} ${po.targetPrice}`
                      : `Opens in ${Math.max(0, Math.ceil(((po.targetTime ?? nowMs) - nowMs) / 1000))}s`}
                  </div>
                </div>
              ))
            ))}
        </div>
      </div>
    </aside>
  );
};
