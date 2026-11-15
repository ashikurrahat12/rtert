import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, Clock, Copy, CreditCard, RefreshCw, ShieldCheck, Wallet, X } from 'lucide-react';
import type { CryptoPaymentMethodConfig, TraderAccountState } from '../types/trading.ts';

interface WalletModalProps {
  isOpen: boolean;
  initialTab?: 'deposit' | 'withdraw' | 'demo';
  onClose: () => void;
  account: TraderAccountState;
  paymentConfig: CryptoPaymentMethodConfig[];
  onDeposit: (amount: number, method: string, promoCode?: string, txHash?: string) => Promise<void>;
  onWithdraw: (amount: number, method: string, destination: string) => Promise<void>;
  onRefillDemo: () => Promise<void>;
}

const FALLBACK_METHODS: CryptoPaymentMethodConfig[] = [
  {
    id: 'usdt_trc20',
    label: 'USDT (TRC-20)',
    network: 'TRON (TRC20)',
    address: 'TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE',
    note: 'Send exact USDT TRC-20 amount and submit your TxID below for fast approval.',
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
];

export const WalletModal: React.FC<WalletModalProps> = ({
  isOpen,
  initialTab = 'deposit',
  onClose,
  account,
  paymentConfig,
  onDeposit,
  onWithdraw,
  onRefillDemo,
}) => {
  const enabledMethods = useMemo(() => {
    const list = paymentConfig.filter((m) => m.enabled);
    return list.length > 0 ? list : FALLBACK_METHODS;
  }, [paymentConfig]);

  const [tab, setTab] = useState<'deposit' | 'withdraw' | 'demo'>(initialTab);
  const [amount, setAmount] = useState<number>(250);
  const [selectedMethodId, setSelectedMethodId] = useState<string>(enabledMethods[0]?.id || 'usdt_trc20');
  const [promoCode, setPromoCode] = useState('');
  const [txHash, setTxHash] = useState('');
  const [withdrawDest, setWithdrawDest] = useState('TQn9Y2khEsLJW1ChVWFMSMeRDow5KcbLSE');
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedMethod = useMemo(
    () => enabledMethods.find((m) => m.id === selectedMethodId) || enabledMethods[0],
    [enabledMethods, selectedMethodId]
  );

  useEffect(() => {
    if (isOpen) {
      setTab(initialTab);
      setError(null);
      setSuccessMsg(null);
      setCopied(false);
      if (enabledMethods.length > 0 && !enabledMethods.some((m) => m.id === selectedMethodId)) {
        setSelectedMethodId(enabledMethods[0].id);
      }
    }
  }, [isOpen, initialTab, enabledMethods, selectedMethodId]);

  if (!isOpen) return null;

  const pendingDeposits = (account.depositRequests || []).filter((d) => d.status === 'pending');

  const handleCopyAddress = () => {
    if (!selectedMethod?.address) return;
    navigator.clipboard?.writeText(selectedMethod.address).catch(() => {});
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  };

  const handleDeposit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await onDeposit(amount, selectedMethod.label, promoCode, txHash);
      setSuccessMsg(
        `Deposit request ($${amount.toFixed(2)} via ${selectedMethod.label}) submitted for Admin approval.`
      );
      setPromoCode('');
      setTxHash('');
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleWithdraw = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await onWithdraw(amount, selectedMethod.label, withdrawDest);
      setSuccessMsg(`Withdrawal request of $${amount.toFixed(2)} submitted for Admin review.`);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const handleRefill = async () => {
    setError(null);
    setSuccessMsg(null);
    setBusy(true);
    try {
      await onRefillDemo();
      setSuccessMsg('Demo balance restored to $10,000.00.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2.5 sm:p-4 bg-black/60 backdrop-blur-[2px]">
      <div className="w-full max-w-xl bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg shadow-2xl overflow-hidden max-h-[92dvh] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-3.5 sm:px-5 py-3 sm:py-3.5 border-b border-slate-200 dark:border-[#2A3142] shrink-0">
          <div className="flex items-center gap-2">
            <Wallet className="w-4 h-4 text-[#0FAF59]" />
            <h2 className="font-display font-bold text-sm sm:text-base text-slate-900 dark:text-white">
              Binarx Trade Cashier
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-[#252B3B]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Account Balances Strip */}
        <div className="grid grid-cols-2 divide-x divide-slate-200 dark:divide-[#2A3142] bg-slate-50 dark:bg-[#131722] border-b border-slate-200 dark:border-[#2A3142] shrink-0">
          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Live Account</div>
            <div className="font-mono-tabular text-base sm:text-lg font-bold text-slate-900 dark:text-white">
              ${account.liveBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
          <div className="px-3.5 sm:px-5 py-2.5 sm:py-3">
            <div className="text-[11px] text-slate-500 dark:text-slate-400">Demo Account</div>
            <div className="font-mono-tabular text-base sm:text-lg font-bold text-amber-500">
              ${account.demoBalance.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex items-center justify-between border-b border-slate-200 dark:border-[#2A3142] px-3.5 sm:px-5 shrink-0 gap-2">
          <div className="flex gap-3 sm:gap-4">
            {(
              [
                { id: 'deposit', label: 'Deposit' },
                { id: 'withdraw', label: 'Withdraw' },
                { id: 'demo', label: 'Refill Demo' },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                onClick={() => {
                  setTab(t.id);
                  setError(null);
                  setSuccessMsg(null);
                }}
                className={`py-2.5 text-xs font-semibold border-b-2 transition-colors whitespace-nowrap ${
                  tab === t.id
                    ? 'border-[#0FAF59] text-slate-900 dark:text-white'
                    : 'border-transparent text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
          <span className="hidden xs:inline-flex sm:inline-flex items-center gap-1 text-[10px] font-semibold text-[#0FAF59] whitespace-nowrap">
            <ShieldCheck className="w-3.5 h-3.5" />
            No NID Required
          </span>
        </div>

        <div className="p-3.5 sm:p-5 space-y-4 overflow-y-auto">
          {error && (
            <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
              {error}
            </div>
          )}
          {successMsg && (
            <div className="p-2.5 rounded bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-600 dark:text-[#0FAF59] font-medium flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{successMsg}</span>
            </div>
          )}

          {tab === 'deposit' && (
            <form onSubmit={handleDeposit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Select Deposit Method
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {enabledMethods.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => {
                        setSelectedMethodId(m.id);
                        setCopied(false);
                      }}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded border text-left transition-colors ${
                        selectedMethod?.id === m.id
                          ? 'bg-[#2962FF]/10 border-[#2962FF] text-[#2962FF] dark:text-white'
                          : 'bg-slate-50 dark:bg-[#131722] border-slate-200 dark:border-[#2A3142] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              {/* Admin-Controlled Live Wallet Address Box */}
              {selectedMethod && (
                <div className="p-3.5 rounded-md bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] space-y-2">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="font-semibold text-slate-600 dark:text-slate-300">
                      Network: <span className="text-slate-900 dark:text-white">{selectedMethod.network}</span>
                    </span>
                    <span className="text-amber-500 font-semibold">Admin Verified Address</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 px-2.5 py-2 rounded bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] font-mono-tabular text-xs text-slate-900 dark:text-white break-all select-all">
                      {selectedMethod.address}
                    </div>
                    <button
                      type="button"
                      onClick={handleCopyAddress}
                      className="shrink-0 inline-flex items-center gap-1 px-3 py-2 rounded bg-[#2962FF] hover:bg-blue-500 text-white text-xs font-semibold transition-colors"
                    >
                      {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                      {copied ? 'Copied' : 'Copy'}
                    </button>
                  </div>
                  {selectedMethod.note && (
                    <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                      {selectedMethod.note}
                    </p>
                  )}
                </div>
              )}

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Amount (USD)
                </label>
                <input
                  type="number"
                  min={10}
                  max={100000}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
                />
                <div className="grid grid-cols-4 gap-2 mt-2">
                  {[50, 100, 250, 1000].map((v) => (
                    <button
                      type="button"
                      key={v}
                      onClick={() => setAmount(v)}
                      className="py-1.5 text-xs font-mono-tabular font-semibold rounded border border-slate-200 dark:border-[#2A3142] bg-slate-50 dark:bg-[#131722] text-slate-700 dark:text-slate-300 hover:border-[#2962FF]"
                    >
                      ${v}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Transaction Hash / Ref ID (Optional)
                  </label>
                  <input
                    type="text"
                    value={txHash}
                    onChange={(e) => setTxHash(e.target.value)}
                    placeholder="Paste TxID or Order ID"
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                    Promo Code (try <span className="font-mono-tabular text-[#0FAF59]">BONUS50</span>)
                  </label>
                  <input
                    type="text"
                    value={promoCode}
                    onChange={(e) => setPromoCode(e.target.value)}
                    placeholder="Enter BONUS50 for +50%"
                    className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={busy}
                className="w-full py-2.5 rounded-md bg-[#0FAF59] hover:bg-[#12c464] text-white font-display font-bold text-sm transition-colors disabled:opacity-50"
              >
                {busy ? 'Submitting Request...' : `Submit Deposit Request ($${amount.toFixed(2)})`}
              </button>

              {pendingDeposits.length > 0 && (
                <div className="pt-2 border-t border-slate-200 dark:border-[#2A3142] space-y-1.5">
                  <div className="text-[11px] font-semibold text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                    <Clock className="w-3.5 h-3.5 text-amber-500" />
                    Pending Deposit Requests ({pendingDeposits.length})
                  </div>
                  {pendingDeposits.slice(0, 3).map((d) => (
                    <div
                      key={d.id}
                      className="flex items-center justify-between text-xs px-2.5 py-1.5 rounded bg-amber-500/10 border border-amber-500/20"
                    >
                      <span className="text-slate-700 dark:text-slate-200 font-medium">
                        {d.method} · ${d.amount.toFixed(2)}
                      </span>
                      <span className="font-mono-tabular text-[11px] font-bold text-amber-500 uppercase">
                        Pending Approval
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </form>
          )}

          {tab === 'withdraw' && (
            <form onSubmit={handleWithdraw} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1.5">
                  Withdrawal Method
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {enabledMethods.map((m) => (
                    <button
                      type="button"
                      key={m.id}
                      onClick={() => setSelectedMethodId(m.id)}
                      className={`flex items-center gap-2 px-3 py-2 text-xs font-medium rounded border text-left transition-colors ${
                        selectedMethod?.id === m.id
                          ? 'bg-[#2962FF]/10 border-[#2962FF] text-[#2962FF] dark:text-white'
                          : 'bg-slate-50 dark:bg-[#131722] border-slate-200 dark:border-[#2A3142] text-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5 shrink-0" />
                      <span className="truncate">{m.label}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Withdrawal Amount (USD)
                </label>
                <input
                  type="number"
                  min={10}
                  max={Math.max(10, account.liveBalance)}
                  value={amount}
                  onChange={(e) => setAmount(Number(e.target.value))}
                  className="w-full px-3 py-2 text-sm font-mono-tabular bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">
                  Destination Wallet Address / Card
                </label>
                <input
                  type="text"
                  value={withdrawDest}
                  onChange={(e) => setWithdrawDest(e.target.value)}
                  className="w-full px-3 py-2 text-xs font-mono-tabular bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142] rounded text-slate-900 dark:text-white focus:outline-none focus:border-[#2962FF]"
                />
              </div>

              <button
                type="submit"
                disabled={busy || account.liveBalance < 10}
                className="w-full py-2.5 rounded-md bg-[#2962FF] hover:bg-blue-500 text-white font-display font-bold text-sm transition-colors disabled:opacity-50"
              >
                {busy ? 'Submitting...' : `Request Withdrawal ($${amount.toFixed(2)})`}
              </button>
            </form>
          )}

          {tab === 'demo' && (
            <div className="space-y-4 text-center py-2">
              <p className="text-xs text-slate-600 dark:text-slate-300 leading-relaxed">
                Practice strategies against live real-time exchange prices with zero financial risk. Restore your
                Demo balance back to $10,000.00 anytime.
              </p>
              <button
                onClick={handleRefill}
                disabled={busy}
                className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-md bg-amber-500 hover:bg-amber-400 text-slate-950 font-display font-bold text-sm transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-4 h-4 ${busy ? 'animate-spin' : ''}`} />
                Refill Demo Balance to $10,000.00
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
