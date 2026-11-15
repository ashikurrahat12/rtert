import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Camera,
  Check,
  CheckCircle2,
  Coins,
  Globe,
  Lock,
  LogOut,
  Pencil,
  Plus,
  RefreshCw,
  Shield,
  ShieldCheck,
  Trash2,
  User,
  Users,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import type {
  AdminUserSummary,
  AssetDefinition,
  CryptoPaymentMethodConfig,
  DepositRequest,
  NavSection,
  TraderAccountState,
  UserProfile,
  WithdrawalRequest,
} from '../types/trading.ts';
import { brokerFetch } from '../utils/brokerApi.ts';

interface AdminExposureItem {
  symbol: string;
  payout: number;
  price: number;
  upVolume: number;
  downVolume: number;
  upCount: number;
  downCount: number;
}

interface AdminOverviewData {
  users: AdminUserSummary[];
  depositRequests: DepositRequest[];
  withdrawalRequests: WithdrawalRequest[];
  paymentConfig: CryptoPaymentMethodConfig[];
  otcCounterFlowEnabled: boolean;
  otcExposure: AdminExposureItem[];
}

interface AccountAndAdminViewProps {
  account: TraderAccountState;
  authToken: string | null;
  paymentConfig: CryptoPaymentMethodConfig[];
  assets: AssetDefinition[];
  adminRefreshKey: number;
  onNavigate: (section: NavSection) => void;
  onOpenWallet: (tab: 'deposit' | 'withdraw' | 'demo') => void;
  onLogin: (email: string, password: string) => Promise<void>;
  onRegister: (params: {
    email: string;
    password: string;
    firstName: string;
    lastName: string;
    country: string;
  }) => Promise<void>;
  onLogout: () => Promise<void>;
  onSaveProfile: (patch: Partial<UserProfile> & { currency?: string }) => Promise<void>;
  onChangePassword: (currentPassword: string, newPassword: string) => Promise<void>;
  onDeleteAccount: () => Promise<void>;
  onPaymentConfigUpdated: (methods: CryptoPaymentMethodConfig[]) => void;
}

const COUNTRIES = [
  'Bangladesh',
  'India',
  'Pakistan',
  'Indonesia',
  'Brazil',
  'Nigeria',
  'United States',
  'United Kingdom',
  'United Arab Emirates',
  'Malaysia',
  'Singapore',
  'Germany',
  'Turkey',
  'Philippines',
  'Vietnam',
];

const LANGUAGES = ['English', 'Bengali', 'Hindi', 'Indonesian', 'Portuguese', 'Spanish', 'Arabic'];
const TIMEZONES = [
  '(UTC+06:00)',
  '(UTC+05:30)',
  '(UTC+05:00)',
  '(UTC+07:00)',
  '(UTC+08:00)',
  '(UTC+00:00)',
  '(UTC-05:00)',
  '(UTC-03:00)',
  '(UTC+03:00)',
];

type AccountSubTab = 'my_account' | 'payments' | 'trades' | 'admin';
type AdminSubTab = 'deposits' | 'withdrawals' | 'crypto' | 'users' | 'otc';

export const AccountAndAdminView: React.FC<AccountAndAdminViewProps> = ({
  account,
  authToken,
  paymentConfig,
  assets,
  adminRefreshKey,
  onNavigate,
  onOpenWallet,
  onLogin,
  onRegister,
  onLogout,
  onSaveProfile,
  onChangePassword,
  onDeleteAccount,
  onPaymentConfigUpdated,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [authEmail, setAuthEmail] = useState('');
  const [authPassword, setAuthPassword] = useState('');
  const [regFirstName, setRegFirstName] = useState('');
  const [regLastName, setRegLastName] = useState('');
  const [regCountry, setRegCountry] = useState('Bangladesh');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authBusy, setAuthBusy] = useState(false);

  const [subTab, setSubTab] = useState<AccountSubTab>('my_account');
  const [adminTab, setAdminTab] = useState<AdminSubTab>('deposits');

  // Profile form fields (synced from account.profile)
  const [nickname, setNickname] = useState(account.profile.nickname);
  const [firstName, setFirstName] = useState(account.profile.firstName);
  const [lastName, setLastName] = useState(account.profile.lastName);
  const [dob, setDob] = useState(account.profile.dob);
  const [country, setCountry] = useState(account.profile.country || 'Bangladesh');
  const [address, setAddress] = useState(account.profile.address);
  const [language, setLanguage] = useState(account.profile.language || 'English');
  const [timezone, setTimezone] = useState(account.profile.timezone || '(UTC+06:00)');
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaved, setProfileSaved] = useState(false);

  // Currency switcher
  const [showCurrencyPicker, setShowCurrencyPicker] = useState(false);

  // Security password inline form
  const [showPasswordForm, setShowPasswordForm] = useState(false);
  const [currPass, setCurrPass] = useState('');
  const [newPass, setNewPass] = useState('');
  const [confirmPass, setConfirmPass] = useState('');
  const [passMsg, setPassMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  // Delete account inline confirm
  const [confirmDeleteSelf, setConfirmDeleteSelf] = useState(false);
  const [deleteErr, setDeleteErr] = useState<string | null>(null);

  // Admin panel state
  const [adminData, setAdminData] = useState<AdminOverviewData | null>(null);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminNotice, setAdminNotice] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);
  const [editableMethods, setEditableMethods] = useState<CryptoPaymentMethodConfig[]>(paymentConfig);
  const [userDrafts, setUserDrafts] = useState<Record<string, { live: string; demo: string }>>({});
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [selectedOtcSymbol, setSelectedOtcSymbol] = useState('GBP/USD (OTC)');
  const [payoutInput, setPayoutInput] = useState('85');

  useEffect(() => {
    setNickname(account.profile.nickname || `#${account.profile.userId}`);
    setFirstName(account.profile.firstName || '');
    setLastName(account.profile.lastName || '');
    setDob(account.profile.dob || '');
    setCountry(account.profile.country || 'Bangladesh');
    setAddress(account.profile.address || '');
    setLanguage(account.profile.language || 'English');
    setTimezone(account.profile.timezone || '(UTC+06:00)');
  }, [account.profile]);

  useEffect(() => {
    setEditableMethods(paymentConfig);
  }, [paymentConfig]);

  const fetchAdminOverview = useCallback(async () => {
    if (!authToken || account.role !== 'admin') return;
    setAdminLoading(true);
    try {
      const { ok, data } = await brokerFetch<AdminOverviewData>('/api/admin/overview', {
        headers: { Authorization: `Bearer ${authToken}` },
      });
      if (!ok || !data) return;
      setAdminData(data);
      setEditableMethods(data.paymentConfig);
      const drafts: Record<string, { live: string; demo: string }> = {};
      for (const u of data.users) {
        drafts[u.clientId] = {
          live: String(u.liveBalance),
          demo: String(u.demoBalance),
        };
      }
      setUserDrafts(drafts);
    } finally {
      setAdminLoading(false);
    }
  }, [account.role, authToken]);

  useEffect(() => {
    if (account.isAuthenticated && account.role === 'admin') {
      fetchAdminOverview();
    }
  }, [account.isAuthenticated, account.role, adminRefreshKey, fetchAdminOverview]);

  const activeBalance = account.accountMode === 'demo' ? account.demoBalance : account.liveBalance;
  const otcAssetsList = useMemo(() => assets.filter((a) => a.category === 'otc'), [assets]);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthBusy(true);
    try {
      if (authMode === 'login') {
        await onLogin(authEmail, authPassword);
      } else {
        await onRegister({
          email: authEmail,
          password: authPassword,
          firstName: regFirstName,
          lastName: regLastName,
          country: regCountry,
        });
      }
      setAuthPassword('');
    } catch (err) {
      setAuthError((err as Error).message);
    } finally {
      setAuthBusy(false);
    }
  };

  // ==========================================
  // UNAUTHENTICATED LOGIN / REGISTER VIEW
  // ==========================================
  if (!account.isAuthenticated) {
    return (
      <div className="flex-1 overflow-y-auto bg-[#F8FAFC] dark:bg-[#131722] p-3 sm:p-8 flex items-center justify-center">
        <div className="w-full max-w-md bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-xl shadow-xl overflow-hidden">
          <div className="px-4 sm:px-6 pt-5 sm:pt-6 pb-4 border-b border-slate-200 dark:border-[#2A3142] flex items-center justify-between gap-2">
            <div className="min-w-0">
              <h1 className="font-display font-bold text-base sm:text-lg text-slate-900 dark:text-white">
                {authMode === 'login' ? 'Sign In to Binarx Trade' : 'Create Binarx Trade Account'}
              </h1>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                Save your profile, trade history, and wallet permanently.
              </p>
            </div>
            <User className="w-6 h-6 text-[#1D74F5] shrink-0" />
          </div>

          <div className="flex border-b border-slate-200 dark:border-[#2A3142] px-4 sm:px-6 gap-6">
            <button
              type="button"
              onClick={() => {
                setAuthMode('login');
                setAuthError(null);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors ${
                authMode === 'login'
                  ? 'border-[#1D74F5] text-[#1D74F5]'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              Sign In
            </button>
            <button
              type="button"
              onClick={() => {
                setAuthMode('register');
                setAuthError(null);
              }}
              className={`py-3 text-xs font-bold border-b-2 transition-colors ${
                authMode === 'register'
                  ? 'border-[#1D74F5] text-[#1D74F5]'
                  : 'border-transparent text-slate-500 dark:text-slate-400'
              }`}
            >
              Create Account
            </button>
          </div>

          <form onSubmit={handleAuthSubmit} className="p-4 sm:p-6 space-y-3.5 sm:space-y-4">
            <div className="px-3 py-2 rounded-md bg-emerald-500/10 border border-emerald-500/25 flex items-center gap-2 text-[11px] font-medium text-emerald-700 dark:text-[#0FAF59]">
              <ShieldCheck className="w-4 h-4 shrink-0" />
              <span>Instant access — no NID or document verification required.</span>
            </div>

            {authError && (
              <div className="p-2.5 rounded bg-rose-500/10 border border-rose-500/30 text-xs text-rose-500 font-medium">
                {authError}
              </div>
            )}

            {authMode === 'register' && (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                    <legend className="text-[11px] px-1 text-slate-500 dark:text-slate-400">First Name</legend>
                    <input
                      type="text"
                      value={regFirstName}
                      onChange={(e) => setRegFirstName(e.target.value)}
                      placeholder="First Name"
                      className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                    />
                  </fieldset>
                  <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                    <legend className="text-[11px] px-1 text-slate-500 dark:text-slate-400">Last Name</legend>
                    <input
                      type="text"
                      value={regLastName}
                      onChange={(e) => setRegLastName(e.target.value)}
                      placeholder="Last Name"
                      className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                    />
                  </fieldset>
                </div>

                <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                  <legend className="text-[11px] px-1 text-slate-500 dark:text-slate-400">Country</legend>
                  <select
                    value={regCountry}
                    onChange={(e) => setRegCountry(e.target.value)}
                    className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
                  >
                    {COUNTRIES.map((c) => (
                      <option key={c} value={c} className="bg-white dark:bg-[#1C212D]">
                        {c}
                      </option>
                    ))}
                  </select>
                </fieldset>
              </>
            )}

            <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
              <legend className="text-[11px] px-1 text-slate-500 dark:text-slate-400">Email</legend>
              <input
                type="email"
                required
                value={authEmail}
                onChange={(e) => setAuthEmail(e.target.value)}
                placeholder="name@example.com"
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
              />
            </fieldset>

            <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
              <legend className="text-[11px] px-1 text-slate-500 dark:text-slate-400">Password</legend>
              <input
                type="password"
                required
                value={authPassword}
                onChange={(e) => setAuthPassword(e.target.value)}
                placeholder="Enter your password"
                className="w-full bg-transparent text-sm text-slate-900 dark:text-white focus:outline-none"
              />
            </fieldset>

            <button
              type="submit"
              disabled={authBusy}
              className="w-full py-2.5 rounded-md bg-[#1D74F5] hover:bg-blue-600 text-white font-display font-bold text-sm transition-colors disabled:opacity-50"
            >
              {authBusy
                ? 'Please wait...'
                : authMode === 'login'
                  ? 'Sign In & Save Session'
                  : 'Create Account & Start Trading'}
            </button>

            <button
              type="button"
              onClick={() => onNavigate('trade')}
              className="w-full py-2 text-xs font-semibold text-slate-500 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white"
            >
              Continue Demo Trading as Guest
            </button>
          </form>
        </div>
      </div>
    );
  }

  // ==========================================
  // PROFILE & ADMIN ACTIONS
  // ==========================================
  const handleSavePersonal = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      await onSaveProfile({
        nickname,
        firstName,
        lastName,
        dob,
        country,
        address,
        language,
        timezone,
      });
      setProfileSaved(true);
      setTimeout(() => setProfileSaved(false), 2500);
    } finally {
      setProfileSaving(false);
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassMsg(null);
    if (newPass !== confirmPass) {
      setPassMsg({ type: 'err', text: 'New passwords do not match.' });
      return;
    }
    try {
      await onChangePassword(currPass, newPass);
      setCurrPass('');
      setNewPass('');
      setConfirmPass('');
      setPassMsg({ type: 'ok', text: 'Password updated successfully.' });
      setTimeout(() => {
        setShowPasswordForm(false);
        setPassMsg(null);
      }, 1500);
    } catch (err) {
      setPassMsg({ type: 'err', text: (err as Error).message });
    }
  };

  const adminRequest = async <T extends Record<string, unknown> = Record<string, unknown>>(
    url: string,
    options: RequestInit = {}
  ): Promise<T | null> => {
    if (!authToken) return null;
    setAdminNotice(null);
    const { ok, data } = await brokerFetch<{ error?: string } & T>(url, {
      ...options,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${authToken}`,
        ...(options.headers || {}),
      },
    });
    if (!ok) {
      setAdminNotice({ type: 'err', text: data?.error || 'Action failed.' });
      return null;
    }
    await fetchAdminOverview();
    return data;
  };

  const handleApproveDeposit = async (id: string) => {
    const res = await adminRequest(`/api/admin/deposit/${id}/approve`, { method: 'POST' });
    if (res) setAdminNotice({ type: 'ok', text: 'Deposit approved and Live balance credited.' });
  };

  const handleRejectDeposit = async (id: string) => {
    const res = await adminRequest(`/api/admin/deposit/${id}/reject`, { method: 'POST' });
    if (res) setAdminNotice({ type: 'ok', text: 'Deposit request rejected.' });
  };

  const handleApproveWithdrawal = async (id: string) => {
    const res = await adminRequest(`/api/admin/withdrawal/${id}/approve`, { method: 'POST' });
    if (res) setAdminNotice({ type: 'ok', text: 'Withdrawal marked as paid.' });
  };

  const handleRejectWithdrawal = async (id: string) => {
    const res = await adminRequest(`/api/admin/withdrawal/${id}/reject`, { method: 'POST' });
    if (res) setAdminNotice({ type: 'ok', text: 'Withdrawal rejected and refunded to user Live balance.' });
  };

  const handleSavePaymentMethods = async () => {
    const res = await adminRequest<{ paymentConfig?: CryptoPaymentMethodConfig[] }>('/api/admin/payment-config', {
      method: 'POST',
      body: JSON.stringify({ methods: editableMethods }),
    });
    if (res?.paymentConfig) {
      onPaymentConfigUpdated(res.paymentConfig);
      setAdminNotice({ type: 'ok', text: 'Crypto wallet addresses saved & pushed live to all users.' });
    }
  };

  const handleSaveUserRow = async (u: AdminUserSummary) => {
    const draft = userDrafts[u.clientId];
    const res = await adminRequest(`/api/admin/user/${encodeURIComponent(u.clientId)}/update`, {
      method: 'POST',
      body: JSON.stringify({
        liveBalance: Number(draft?.live ?? u.liveBalance),
        demoBalance: Number(draft?.demo ?? u.demoBalance),
      }),
    });
    if (res) setAdminNotice({ type: 'ok', text: `Updated balances for ${u.email}.` });
  };

  const handleToggleUserFlag = async (u: AdminUserSummary, patch: { verified?: boolean; role?: 'user' | 'admin' }) => {
    const res = await adminRequest(`/api/admin/user/${encodeURIComponent(u.clientId)}/update`, {
      method: 'POST',
      body: JSON.stringify(patch),
    });
    if (res) setAdminNotice({ type: 'ok', text: `Updated permissions for ${u.email}.` });
  };

  const handleDeleteUser = async (clientId: string) => {
    const res = await adminRequest(`/api/admin/user/${encodeURIComponent(clientId)}`, {
      method: 'DELETE',
    });
    if (res) {
      setConfirmDeleteUserId(null);
      setAdminNotice({ type: 'ok', text: 'User removed.' });
    }
  };

  const handleToggleCounterFlow = async () => {
    if (!adminData) return;
    const res = await adminRequest('/api/admin/otc-settings', {
      method: 'POST',
      body: JSON.stringify({ counterFlowEnabled: !adminData.otcCounterFlowEnabled }),
    });
    if (res) {
      setAdminNotice({
        type: 'ok',
        text: `OTC Counter-Flow Engine ${res.otcCounterFlowEnabled ? 'enabled' : 'paused'}.`,
      });
    }
  };

  const handleUpdatePayout = async (e: React.FormEvent) => {
    e.preventDefault();
    const res = await adminRequest('/api/admin/otc-settings', {
      method: 'POST',
      body: JSON.stringify({ symbol: selectedOtcSymbol, payout: Number(payoutInput) }),
    });
    if (res) {
      setAdminNotice({ type: 'ok', text: `Updated ${selectedOtcSymbol} payout to ${payoutInput}%.` });
    }
  };

  const pendingDepositsCount =
    adminData?.depositRequests.filter((d) => d.status === 'pending').length ?? 0;
  const pendingWithdrawalsCount =
    adminData?.withdrawalRequests.filter((w) => w.status === 'pending').length ?? 0;
  const totalPendingAdmin = pendingDepositsCount + pendingWithdrawalsCount;

  return (
    <div className="flex-1 overflow-y-auto bg-white dark:bg-[#131722] text-slate-900 dark:text-slate-100">
      <div className="max-w-[1380px] mx-auto px-3 sm:px-6 py-3 sm:py-4 space-y-4 sm:space-y-5">
        {/* TOP SEGMENTED BAR + CURRENCY / BALANCES SUMMARY (Matches Screenshot 25) */}
        <div className="flex flex-col xl:flex-row xl:items-center justify-between gap-3 sm:gap-4 border-b border-slate-200 dark:border-[#262D3F] pb-3.5">
          {/* Segmented Nav Pills */}
          <div className="max-w-full overflow-x-auto no-scrollbar">
            <div className="inline-flex sm:flex items-center flex-nowrap sm:flex-wrap gap-1 bg-[#F1F5F9] dark:bg-[#1C212D] p-1 rounded-md border border-slate-200/70 dark:border-[#2A3142]">
              <button
                onClick={() => onOpenWallet('withdraw')}
                className="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B] transition-colors"
              >
                Withdrawal
              </button>
              <button
                onClick={() => setSubTab('payments')}
                className={`whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  subTab === 'payments'
                    ? 'bg-[#364152] text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B]'
                }`}
              >
                Payments
              </button>
              <button
                onClick={() => setSubTab('trades')}
                className={`whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  subTab === 'trades'
                    ? 'bg-[#364152] text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B]'
                }`}
              >
                Trades
              </button>
              <button
                onClick={() => setSubTab('my_account')}
                className={`whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold transition-colors ${
                  subTab === 'my_account'
                    ? 'bg-[#364152] text-white shadow-xs'
                    : 'text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B]'
                }`}
              >
                My account
              </button>
              <button
                onClick={() => onNavigate('market')}
                className="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B] transition-colors"
              >
                Market
              </button>
              <button
                onClick={() => onNavigate('tournaments')}
                className="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B] transition-colors"
              >
                Tournaments
              </button>
              <button
                onClick={() => onNavigate('analytics')}
                className="whitespace-nowrap shrink-0 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-semibold text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-[#252B3B] transition-colors"
              >
                Analytics
              </button>
              {account.role === 'admin' && (
                <button
                  onClick={() => setSubTab('admin')}
                  className={`whitespace-nowrap shrink-0 inline-flex items-center gap-1.5 px-2.5 sm:px-3.5 py-1.5 rounded text-xs font-bold transition-colors ${
                    subTab === 'admin'
                      ? 'bg-[#1D74F5] text-white shadow-xs'
                      : 'bg-amber-500/15 text-amber-600 dark:text-amber-400 hover:bg-amber-500/25'
                  }`}
                >
                  <Shield className="w-3.5 h-3.5" />
                  Admin Panel
                  {totalPendingAdmin > 0 && (
                    <span className="px-1.5 py-0.2 rounded-full bg-rose-500 text-white text-[10px] font-mono-tabular">
                      {totalPendingAdmin}
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>

          {/* Right Currency & Balance Readout (Matches Screenshot 25) */}
          <div className="flex flex-wrap items-center justify-between sm:justify-end gap-3 sm:gap-6 text-left sm:text-right">
            <div className="relative">
              <div className="text-[10px] sm:text-[11px] text-slate-400">My current currency</div>
              <div className="flex items-center sm:justify-end gap-1.5 mt-0.5">
                <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-[10px] font-bold">
                  $
                </span>
                <span className="font-display font-bold text-xs text-slate-900 dark:text-white">
                  {account.currency || 'USD'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowCurrencyPicker((v) => !v)}
                  className="px-1.5 py-0.5 rounded bg-[#1D74F5] hover:bg-blue-600 text-white text-[9px] font-bold tracking-wide"
                >
                  CHANGE
                </button>
              </div>
              {showCurrencyPicker && (
                <div className="absolute left-0 sm:left-auto sm:right-0 mt-1.5 w-32 bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-md shadow-xl p-1 z-40">
                  {['USD', 'EUR', 'GBP', 'BDT'].map((cur) => (
                    <button
                      key={cur}
                      type="button"
                      onClick={() => {
                        onSaveProfile({ currency: cur });
                        setShowCurrencyPicker(false);
                      }}
                      className="w-full text-left px-2.5 py-1.5 text-xs font-semibold rounded hover:bg-slate-100 dark:hover:bg-[#252B3B]"
                    >
                      {cur}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div>
              <div className="text-[10px] sm:text-[11px] text-slate-400">Available for withdrawal</div>
              <div className="font-mono-tabular font-bold text-xs sm:text-sm text-slate-900 dark:text-white mt-0.5">
                {account.liveBalance.toFixed(2)}$
              </div>
            </div>

            <div>
              <div className="text-[10px] sm:text-[11px] text-slate-400">In the account</div>
              <div className="font-mono-tabular font-bold text-xs sm:text-sm text-slate-900 dark:text-white mt-0.5">
                {activeBalance.toFixed(2)}$
              </div>
            </div>
          </div>
        </div>

        {/* ========================================== */}
        {/* SUB-TAB 1: MY ACCOUNT (3-COLUMN SCREENSHOT 25) */}
        {/* ========================================== */}
        {subTab === 'my_account' && (
          <div className="grid grid-cols-1 lg:grid-cols-3 divide-y lg:divide-y-0 lg:divide-x divide-slate-200 dark:divide-[#262D3F]">
            {/* COLUMN 1: Personal data */}
            <form onSubmit={handleSavePersonal} className="pb-6 lg:pb-0 lg:pr-8 space-y-4">
              <h2 className="font-display font-bold text-sm text-slate-900 dark:text-white">Personal data:</h2>

              <div className="flex items-center gap-3.5">
                <div className="relative w-14 h-14 rounded-full bg-slate-100 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] flex items-center justify-center text-[#1D74F5]">
                  <User className="w-7 h-7" />
                  <span className="absolute -bottom-0.5 -right-0.5 w-5 h-5 rounded-full bg-white dark:bg-[#252B3B] border border-slate-200 dark:border-[#2A3142] flex items-center justify-center text-slate-500">
                    <Camera className="w-3 h-3" />
                  </span>
                </div>
                <div className="min-w-0">
                  <div className="font-semibold text-xs text-slate-900 dark:text-white truncate">
                    {account.email}
                  </div>
                  <div className="text-[11px] font-mono-tabular text-slate-500 dark:text-slate-400">
                    ID: {account.profile.userId}
                  </div>
                  <div className="inline-flex items-center gap-1 mt-0.5 text-[11px] font-semibold text-[#0FAF59]">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>{account.profile.verified ? 'Verified' : 'Active (No NID Required)'}</span>
                    {account.role === 'admin' && (
                      <span className="ml-1.5 px-1.5 py-0.2 rounded bg-[#1D74F5]/15 text-[#1D74F5] text-[10px] font-bold">
                        ADMIN
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Nickname</legend>
                <input
                  type="text"
                  value={nickname}
                  onChange={(e) => setNickname(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                />
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">First Name</legend>
                <input
                  type="text"
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  placeholder="Enter first name"
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                />
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Last Name</legend>
                <input
                  type="text"
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  placeholder="Enter last name"
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                />
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Date of birth</legend>
                <input
                  type="text"
                  value={dob}
                  onChange={(e) => setDob(e.target.value)}
                  placeholder="MM/DD/YYYY"
                  className="w-full bg-transparent text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none"
                />
              </fieldset>

              <fieldset className="relative border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5 bg-slate-50/70 dark:bg-[#1A1F2B]">
                <legend className="text-[11px] px-1 text-slate-400">Email</legend>
                <span className="absolute -top-2 right-3 bg-white dark:bg-[#131722] px-1 text-[10px] font-semibold text-[#0FAF59]">
                  Saved
                </span>
                <input
                  type="email"
                  readOnly
                  value={account.email}
                  className="w-full bg-transparent text-xs text-slate-500 dark:text-slate-300 focus:outline-none"
                />
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Country</legend>
                <select
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                >
                  {COUNTRIES.map((c) => (
                    <option key={c} value={c} className="bg-white dark:bg-[#1C212D]">
                      {c}
                    </option>
                  ))}
                </select>
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Address</legend>
                <input
                  type="text"
                  value={address}
                  onChange={(e) => setAddress(e.target.value)}
                  placeholder="Street, City, Postal Code"
                  className="w-full bg-transparent text-xs text-slate-900 dark:text-white focus:outline-none"
                />
              </fieldset>

              <button
                type="submit"
                disabled={profileSaving}
                className="w-full py-2.5 rounded-md bg-[#1D74F5] hover:bg-blue-600 text-white font-display font-bold text-xs transition-colors flex items-center justify-center gap-1.5"
              >
                {profileSaved ? (
                  <>
                    <Check className="w-4 h-4" /> Saved
                  </>
                ) : profileSaving ? (
                  'Saving...'
                ) : (
                  'Save'
                )}
              </button>
            </form>

            {/* COLUMN 2: Security */}
            <div className="py-6 lg:py-0 lg:px-8 space-y-5">
              <h2 className="font-display font-bold text-sm text-slate-900 dark:text-white">Security:</h2>

              <div className="space-y-4">
                <div className="flex items-start gap-3">
                  <div className="w-6 h-6 rounded-full bg-[#0FAF59] text-white flex items-center justify-center shrink-0 mt-0.5">
                    <Check className="w-3.5 h-3.5" />
                  </div>
                  <div>
                    <div className="font-display font-bold text-xs text-slate-900 dark:text-white">
                      Two-step verification
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-1 mt-0.5">
                      <span>Receiving codes via Email</span>
                      <Pencil className="w-3 h-3 text-[#1D74F5]" />
                    </div>
                  </div>
                </div>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => onSaveProfile({ twoFactorLogin: !account.profile.twoFactorLogin })}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                      account.profile.twoFactorLogin ? 'bg-[#1D74F5]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        account.profile.twoFactorLogin ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    To enter the platform
                  </span>
                </label>

                <label className="flex items-center gap-3 cursor-pointer select-none">
                  <button
                    type="button"
                    onClick={() => onSaveProfile({ twoFactorWithdraw: !account.profile.twoFactorWithdraw })}
                    className={`w-10 h-5 rounded-full p-0.5 transition-colors ${
                      account.profile.twoFactorWithdraw ? 'bg-[#1D74F5]' : 'bg-slate-300 dark:bg-slate-700'
                    }`}
                  >
                    <div
                      className={`w-4 h-4 rounded-full bg-white transition-transform ${
                        account.profile.twoFactorWithdraw ? 'translate-x-5' : 'translate-x-0'
                      }`}
                    />
                  </button>
                  <span className="text-xs font-semibold text-slate-800 dark:text-slate-200">
                    To withdraw funds
                  </span>
                </label>
              </div>

              <div className="border-t border-slate-200 dark:border-[#262D3F] pt-5 space-y-3">
                <div className="flex items-start gap-3">
                  <Lock className="w-5 h-5 text-slate-400 shrink-0 mt-0.5" />
                  <div>
                    <div className="font-display font-bold text-xs text-slate-900 dark:text-white">Password</div>
                    <div className="text-[11px] text-slate-400 mt-0.5">Change your account password</div>
                    {!showPasswordForm && (
                      <button
                        type="button"
                        onClick={() => {
                          setShowPasswordForm(true);
                          setPassMsg(null);
                        }}
                        className="mt-1.5 text-xs font-semibold text-[#1D74F5] hover:underline"
                      >
                        Change
                      </button>
                    )}
                  </div>
                </div>

                {showPasswordForm && (
                  <form
                    onSubmit={handlePasswordSubmit}
                    className="p-3.5 rounded-md bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-2.5"
                  >
                    {passMsg && (
                      <div
                        className={`text-[11px] font-semibold ${
                          passMsg.type === 'ok' ? 'text-[#0FAF59]' : 'text-rose-500'
                        }`}
                      >
                        {passMsg.text}
                      </div>
                    )}
                    <input
                      type="password"
                      required
                      placeholder="Current password"
                      value={currPass}
                      onChange={(e) => setCurrPass(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                    />
                    <input
                      type="password"
                      required
                      placeholder="New password"
                      value={newPass}
                      onChange={(e) => setNewPass(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                    />
                    <input
                      type="password"
                      required
                      placeholder="Confirm new password"
                      value={confirmPass}
                      onChange={(e) => setConfirmPass(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                    />
                    <div className="flex items-center gap-2 pt-1">
                      <button
                        type="submit"
                        className="px-3 py-1.5 rounded bg-[#1D74F5] text-white text-xs font-semibold"
                      >
                        Update Password
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowPasswordForm(false)}
                        className="px-3 py-1.5 rounded text-xs font-semibold text-slate-500"
                      >
                        Cancel
                      </button>
                    </div>
                  </form>
                )}
              </div>
            </div>

            {/* COLUMN 3: Language, Timezone, Log out & Delete account */}
            <div className="pt-6 lg:pt-0 lg:pl-8 space-y-4">
              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Language</legend>
                <div className="flex items-center gap-2">
                  <Globe className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <select
                    value={language}
                    onChange={(e) => {
                      setLanguage(e.target.value);
                      onSaveProfile({ language: e.target.value });
                    }}
                    className="w-full bg-transparent text-xs font-medium text-slate-900 dark:text-white focus:outline-none"
                  >
                    {LANGUAGES.map((l) => (
                      <option key={l} value={l} className="bg-white dark:bg-[#1C212D]">
                        {l}
                      </option>
                    ))}
                  </select>
                </div>
              </fieldset>

              <fieldset className="border border-slate-300 dark:border-[#2F374C] rounded-md px-3 pb-2 pt-0.5">
                <legend className="text-[11px] px-1 text-slate-400">Timezone</legend>
                <select
                  value={timezone}
                  onChange={(e) => {
                    setTimezone(e.target.value);
                    onSaveProfile({ timezone: e.target.value });
                  }}
                  className="w-full bg-transparent text-xs font-mono-tabular text-slate-900 dark:text-white focus:outline-none"
                >
                  {TIMEZONES.map((tz) => (
                    <option key={tz} value={tz} className="bg-white dark:bg-[#1C212D]">
                      {tz}
                    </option>
                  ))}
                </select>
              </fieldset>

              <div className="pt-2 space-y-3">
                <button
                  type="button"
                  onClick={onLogout}
                  className="inline-flex items-center gap-2 px-3.5 py-2 rounded-md border border-slate-200 dark:border-[#2A3142] hover:bg-slate-100 dark:hover:bg-[#1C212D] text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Log out
                </button>

                <div>
                  {!confirmDeleteSelf ? (
                    <button
                      type="button"
                      onClick={() => {
                        setConfirmDeleteSelf(true);
                        setDeleteErr(null);
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#F05044] hover:underline"
                    >
                      <X className="w-3.5 h-3.5" />
                      Delete My account
                    </button>
                  ) : (
                    <div className="p-3 rounded-md bg-rose-500/10 border border-rose-500/30 space-y-2">
                      <div className="text-[11px] font-semibold text-rose-500">
                        Permanently delete this account and session data?
                      </div>
                      {deleteErr && <div className="text-[11px] text-rose-500">{deleteErr}</div>}
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              await onDeleteAccount();
                            } catch (err) {
                              setDeleteErr((err as Error).message);
                            }
                          }}
                          className="px-3 py-1 rounded bg-rose-600 text-white text-[11px] font-bold"
                        >
                          Confirm Delete
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteSelf(false)}
                          className="px-3 py-1 rounded text-[11px] font-semibold text-slate-500"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SUB-TAB 2: PAYMENTS & REQUESTS             */}
        {/* ========================================== */}
        {subTab === 'payments' && (
          <div className="space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-base text-slate-900 dark:text-white">
                  Payments, Deposits & Withdrawals
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Track your pending admin approvals and completed wallet transactions.
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => onOpenWallet('deposit')}
                  className="px-3.5 py-2 rounded-md bg-[#0FAF59] hover:bg-[#12c464] text-white text-xs font-bold"
                >
                  + New Deposit
                </button>
                <button
                  onClick={() => onOpenWallet('withdraw')}
                  className="px-3.5 py-2 rounded-md bg-[#364152] hover:bg-[#28313F] text-white text-xs font-bold"
                >
                  Withdraw
                </button>
              </div>
            </div>

            {account.depositRequests.length > 0 && (
              <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
                <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2A3142] font-display font-semibold text-xs text-slate-900 dark:text-white">
                  Your Deposit Requests
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                        <th className="py-2.5 px-4">Method</th>
                        <th className="py-2.5 px-4">TxID / Ref</th>
                        <th className="py-2.5 px-4 text-right">Amount</th>
                        <th className="py-2.5 px-4">Status</th>
                        <th className="py-2.5 px-4 text-right">Date</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                      {account.depositRequests.map((d) => (
                        <tr key={d.id}>
                          <td className="py-2.5 px-4 font-semibold">{d.method}</td>
                          <td className="py-2.5 px-4 font-mono-tabular text-slate-500">{d.txHash || '--'}</td>
                          <td className="py-2.5 px-4 text-right font-mono-tabular font-bold text-[#0FAF59]">
                            +${d.amount.toFixed(2)}
                          </td>
                          <td className="py-2.5 px-4">
                            <span
                              className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                d.status === 'approved'
                                  ? 'bg-emerald-500/15 text-[#0FAF59]'
                                  : d.status === 'rejected'
                                    ? 'bg-rose-500/15 text-rose-500'
                                    : 'bg-amber-500/15 text-amber-500'
                              }`}
                            >
                              {d.status}
                            </span>
                          </td>
                          <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-500">
                            {new Date(d.createdAt).toLocaleString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
              <div className="px-4 py-2.5 border-b border-slate-200 dark:border-[#2A3142] font-display font-semibold text-xs text-slate-900 dark:text-white">
                Transaction Ledger
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                      <th className="py-2.5 px-4">Type</th>
                      <th className="py-2.5 px-4">Method</th>
                      <th className="py-2.5 px-4">Notes</th>
                      <th className="py-2.5 px-4">Status</th>
                      <th className="py-2.5 px-4 text-right">Amount</th>
                      <th className="py-2.5 px-4 text-right">Date</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                    {account.transactions.map((tx) => (
                      <tr key={tx.id}>
                        <td className="py-2.5 px-4 font-semibold capitalize">{tx.type.replace('_', ' ')}</td>
                        <td className="py-2.5 px-4">{tx.method}</td>
                        <td className="py-2.5 px-4 text-slate-500">{tx.note || '--'}</td>
                        <td className="py-2.5 px-4">
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                              tx.status === 'completed'
                                ? 'bg-emerald-500/15 text-[#0FAF59]'
                                : tx.status === 'rejected'
                                  ? 'bg-rose-500/15 text-rose-500'
                                  : 'bg-amber-500/15 text-amber-500'
                            }`}
                          >
                            {tx.status}
                          </span>
                        </td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono-tabular font-bold ${
                            tx.type === 'withdrawal' ? 'text-rose-500' : 'text-[#0FAF59]'
                          }`}
                        >
                          {tx.type === 'withdrawal' ? '-' : '+'}${tx.amount.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-500">
                          {new Date(tx.timestamp).toLocaleString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SUB-TAB 3: TRADES HISTORY                  */}
        {/* ========================================== */}
        {subTab === 'trades' && (
          <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 dark:border-[#2A3142] flex items-center justify-between">
              <span className="font-display font-bold text-sm">
                Trade History ({account.trades.length})
              </span>
              <button
                onClick={() => onNavigate('trade')}
                className="px-3 py-1.5 rounded bg-[#1D74F5] text-white text-xs font-semibold"
              >
                Open Terminal
              </button>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                    <th className="py-2.5 px-4">Asset</th>
                    <th className="py-2.5 px-4">Account</th>
                    <th className="py-2.5 px-4">Direction</th>
                    <th className="py-2.5 px-4 text-right">Entry</th>
                    <th className="py-2.5 px-4 text-right">Exit</th>
                    <th className="py-2.5 px-4 text-right">Amount</th>
                    <th className="py-2.5 px-4 text-right">Payout / P&L</th>
                    <th className="py-2.5 px-4 text-right">Time</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                  {account.trades.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="py-10 text-center text-slate-400">
                        No trades recorded yet.
                      </td>
                    </tr>
                  ) : (
                    account.trades.map((tr) => (
                      <tr key={tr.id}>
                        <td className="py-2.5 px-4 font-bold">{tr.symbol}</td>
                        <td className="py-2.5 px-4 uppercase text-[10px] font-bold text-slate-500">
                          {tr.accountMode}
                        </td>
                        <td
                          className={`py-2.5 px-4 font-bold ${
                            tr.direction === 'UP' ? 'text-[#0FAF59]' : 'text-[#F05044]'
                          }`}
                        >
                          {tr.direction === 'UP' ? 'BUY ▲' : 'SELL ▼'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-tabular">{tr.entryPrice}</td>
                        <td className="py-2.5 px-4 text-right font-mono-tabular">{tr.exitPrice ?? '--'}</td>
                        <td className="py-2.5 px-4 text-right font-mono-tabular">${tr.amount.toFixed(2)}</td>
                        <td
                          className={`py-2.5 px-4 text-right font-mono-tabular font-bold ${
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
                              ? 'ACTIVE'
                              : tr.status === 'tie'
                                ? `$${tr.amount.toFixed(2)}`
                                : '$0.00'}
                        </td>
                        <td className="py-2.5 px-4 text-right font-mono-tabular text-slate-500">
                          {new Date(tr.entryTime).toLocaleTimeString()}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ========================================== */}
        {/* SUB-TAB 4: ADMIN PANEL (FULL CONTROL)      */}
        {/* ========================================== */}
        {subTab === 'admin' && account.role === 'admin' && (
          <div className="space-y-5">
            {/* Admin Header + Refresh */}
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h2 className="font-display font-bold text-lg text-slate-900 dark:text-white flex items-center gap-2">
                  <Shield className="w-5 h-5 text-[#1D74F5]" />
                  Binarx Trade Admin Control Panel
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  Approve/reject deposits & withdrawals, manage crypto wallet addresses, edit user balances, and
                  control OTC execution.
                </p>
              </div>
              <button
                onClick={fetchAdminOverview}
                disabled={adminLoading}
                className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md bg-[#1D74F5] hover:bg-blue-600 text-white text-xs font-bold transition-colors disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${adminLoading ? 'animate-spin' : ''}`} />
                Refresh Data
              </button>
            </div>

            {adminNotice && (
              <div
                className={`p-3 rounded-md border text-xs font-semibold flex items-center justify-between ${
                  adminNotice.type === 'ok'
                    ? 'bg-emerald-500/10 border-emerald-500/30 text-[#0FAF59]'
                    : 'bg-rose-500/10 border-rose-500/30 text-rose-500'
                }`}
              >
                <span>{adminNotice.text}</span>
                <button onClick={() => setAdminNotice(null)}>
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Admin KPI Strip */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-3.5">
              <div className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Users className="w-3.5 h-3.5 text-[#1D74F5]" />
                  Registered Users
                </div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-bold mt-1">
                  {adminData?.users.length ?? 0}
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Coins className="w-3.5 h-3.5 text-amber-500" />
                  Pending Deposits
                </div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-amber-500 mt-1">
                  {pendingDepositsCount}
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Wallet className="w-3.5 h-3.5 text-rose-500" />
                  Pending Withdrawals
                </div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-rose-500 mt-1">
                  {pendingWithdrawalsCount}
                </div>
              </div>
              <div className="p-3 sm:p-4 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142]">
                <div className="text-[11px] text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
                  <Activity className="w-3.5 h-3.5 text-[#0FAF59]" />
                  Total Live Balances
                </div>
                <div className="font-mono-tabular text-xl sm:text-2xl font-bold text-[#0FAF59] mt-1">
                  $
                  {(adminData?.users.reduce((s, u) => s + u.liveBalance, 0) ?? 0).toLocaleString('en-US', {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {/* Admin Sub-tabs */}
            <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar sm:flex-wrap border-b border-slate-200 dark:border-[#2A3142] pb-2.5">
              {(
                [
                  { id: 'deposits', label: `Deposit Requests (${pendingDepositsCount})` },
                  { id: 'withdrawals', label: `Withdrawals (${pendingWithdrawalsCount})` },
                  { id: 'crypto', label: 'Crypto Addresses' },
                  { id: 'users', label: `Users (${adminData?.users.length ?? 0})` },
                  { id: 'otc', label: 'OTC & Payouts' },
                ] as const
              ).map((t) => (
                <button
                  key={t.id}
                  onClick={() => setAdminTab(t.id)}
                  className={`whitespace-nowrap shrink-0 px-3 sm:px-3.5 py-1.5 rounded-md text-xs font-bold transition-colors ${
                    adminTab === t.id
                      ? 'bg-[#1D74F5] text-white'
                      : 'bg-slate-100 dark:bg-[#1C212D] text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-[#252B3B]'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>

            {/* 1. DEPOSIT REQUESTS */}
            {adminTab === 'deposits' && (
              <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">TxID / Hash</th>
                        <th className="py-3 px-4 text-right">Amount (+Bonus)</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4">Requested</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                      {(adminData?.depositRequests ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={7} className="py-10 text-center text-slate-400">
                            No deposit requests yet.
                          </td>
                        </tr>
                      ) : (
                        adminData?.depositRequests.map((d) => (
                          <tr key={d.id} className="hover:bg-slate-50/70 dark:hover:bg-[#232938]/40">
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{d.email}</div>
                              <div className="text-[11px] text-slate-400">{d.userName}</div>
                            </td>
                            <td className="py-3 px-4 font-medium">{d.method}</td>
                            <td className="py-3 px-4 font-mono-tabular text-[11px] text-slate-500 max-w-[180px] truncate">
                              {d.txHash || '--'}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-bold text-[#0FAF59]">
                              ${d.amount.toFixed(2)}
                              {d.bonus > 0 && (
                                <span className="block text-[10px] text-amber-500">+${d.bonus.toFixed(2)} bonus</span>
                              )}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  d.status === 'approved'
                                    ? 'bg-emerald-500/15 text-[#0FAF59]'
                                    : d.status === 'rejected'
                                      ? 'bg-rose-500/15 text-rose-500'
                                      : 'bg-amber-500/15 text-amber-500'
                                }`}
                              >
                                {d.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 font-mono-tabular text-[11px] text-slate-500">
                              {new Date(d.createdAt).toLocaleString()}
                            </td>
                            <td className="py-3 px-4 text-right">
                              {d.status === 'pending' ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApproveDeposit(d.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-[#0FAF59] hover:bg-[#12c464] text-white text-[11px] font-bold"
                                  >
                                    <Check className="w-3 h-3" /> Approve
                                  </button>
                                  <button
                                    onClick={() => handleRejectDeposit(d.id)}
                                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-rose-500 hover:bg-rose-600 text-white text-[11px] font-bold"
                                  >
                                    <XCircle className="w-3 h-3" /> Reject
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">
                                  {d.reviewedBy ? `By ${d.reviewedBy.split('@')[0]}` : 'Reviewed'}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. WITHDRAWAL REQUESTS */}
            {adminTab === 'withdrawals' && (
              <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Method</th>
                        <th className="py-3 px-4">Destination</th>
                        <th className="py-3 px-4 text-right">Amount</th>
                        <th className="py-3 px-4">Status</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                      {(adminData?.withdrawalRequests ?? []).length === 0 ? (
                        <tr>
                          <td colSpan={6} className="py-10 text-center text-slate-400">
                            No withdrawal requests yet.
                          </td>
                        </tr>
                      ) : (
                        adminData?.withdrawalRequests.map((w) => (
                          <tr key={w.id}>
                            <td className="py-3 px-4">
                              <div className="font-bold">{w.email}</div>
                              <div className="text-[11px] text-slate-400">{w.userName}</div>
                            </td>
                            <td className="py-3 px-4">{w.method}</td>
                            <td className="py-3 px-4 font-mono-tabular text-[11px] text-slate-500">
                              {w.destination}
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular font-bold text-rose-500">
                              ${w.amount.toFixed(2)}
                            </td>
                            <td className="py-3 px-4">
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  w.status === 'approved'
                                    ? 'bg-emerald-500/15 text-[#0FAF59]'
                                    : w.status === 'rejected'
                                      ? 'bg-rose-500/15 text-rose-500'
                                      : 'bg-amber-500/15 text-amber-500'
                                }`}
                              >
                                {w.status}
                              </span>
                            </td>
                            <td className="py-3 px-4 text-right">
                              {w.status === 'pending' ? (
                                <div className="inline-flex items-center gap-1.5">
                                  <button
                                    onClick={() => handleApproveWithdrawal(w.id)}
                                    className="px-2.5 py-1 rounded bg-[#0FAF59] text-white text-[11px] font-bold"
                                  >
                                    Mark Paid
                                  </button>
                                  <button
                                    onClick={() => handleRejectWithdrawal(w.id)}
                                    className="px-2.5 py-1 rounded bg-rose-500 text-white text-[11px] font-bold"
                                  >
                                    Reject & Refund
                                  </button>
                                </div>
                              ) : (
                                <span className="text-[11px] text-slate-400">Reviewed</span>
                              )}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. CRYPTO ADDRESSES & PAYMENT METHODS */}
            {adminTab === 'crypto' && (
              <div className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {editableMethods.map((m, idx) => (
                    <div
                      key={m.id}
                      className="p-4 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-3"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <input
                          type="text"
                          value={m.label}
                          onChange={(e) => {
                            const next = [...editableMethods];
                            next[idx] = { ...next[idx], label: e.target.value };
                            setEditableMethods(next);
                          }}
                          className="font-display font-bold text-sm bg-transparent border-b border-transparent focus:border-[#1D74F5] focus:outline-none text-slate-900 dark:text-white"
                        />
                        <label className="inline-flex items-center gap-1.5 text-xs font-semibold cursor-pointer">
                          <input
                            type="checkbox"
                            checked={m.enabled}
                            onChange={(e) => {
                              const next = [...editableMethods];
                              next[idx] = { ...next[idx], enabled: e.target.checked };
                              setEditableMethods(next);
                            }}
                          />
                          Enabled
                        </label>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">Network</label>
                          <input
                            type="text"
                            value={m.network}
                            onChange={(e) => {
                              const next = [...editableMethods];
                              next[idx] = { ...next[idx], network: e.target.value };
                              setEditableMethods(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                            Wallet Address / Pay ID
                          </label>
                          <input
                            type="text"
                            value={m.address}
                            onChange={(e) => {
                              const next = [...editableMethods];
                              next[idx] = { ...next[idx], address: e.target.value };
                              setEditableMethods(next);
                            }}
                            className="w-full px-2.5 py-1.5 rounded text-xs font-mono-tabular bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                          />
                        </div>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-400 mb-0.5">
                          User Instructions / Note
                        </label>
                        <input
                          type="text"
                          value={m.note}
                          onChange={(e) => {
                            const next = [...editableMethods];
                            next[idx] = { ...next[idx], note: e.target.value };
                            setEditableMethods(next);
                          }}
                          className="w-full px-2.5 py-1.5 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                        />
                      </div>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center justify-between gap-3">
                  <button
                    type="button"
                    onClick={() =>
                      setEditableMethods((prev) => [
                        ...prev,
                        {
                          id: `custom_${Date.now()}`,
                          label: 'Solana (SOL)',
                          network: 'Solana Mainnet',
                          address: 'Enter SOL Wallet Address',
                          note: 'Send SOL and paste transaction signature.',
                          enabled: true,
                        },
                      ])
                    }
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-md border border-slate-300 dark:border-[#2A3142] text-xs font-bold hover:bg-slate-100 dark:hover:bg-[#1C212D]"
                  >
                    <Plus className="w-3.5 h-3.5" /> Add Payment Method
                  </button>

                  <button
                    type="button"
                    onClick={handleSavePaymentMethods}
                    className="px-5 py-2.5 rounded-md bg-[#0FAF59] hover:bg-[#12c464] text-white text-xs font-bold shadow-xs"
                  >
                    Save Crypto Addresses (Live Update)
                  </button>
                </div>
              </div>
            )}

            {/* 4. USERS MANAGEMENT */}
            {adminTab === 'users' && (
              <div className="bg-white dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] rounded-lg overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 dark:bg-[#161B26] border-b border-slate-200 dark:border-[#2A3142] text-[11px] text-slate-500">
                        <th className="py-3 px-4">User</th>
                        <th className="py-3 px-4">Role</th>
                        <th className="py-3 px-4">Verified</th>
                        <th className="py-3 px-4">Live Balance ($)</th>
                        <th className="py-3 px-4">Demo Balance ($)</th>
                        <th className="py-3 px-4 text-right">Trades</th>
                        <th className="py-3 px-4 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-[#232938]">
                      {(adminData?.users ?? []).map((u) => {
                        const draft = userDrafts[u.clientId] || {
                          live: String(u.liveBalance),
                          demo: String(u.demoBalance),
                        };
                        return (
                          <tr key={u.clientId}>
                            <td className="py-3 px-4">
                              <div className="font-bold text-slate-900 dark:text-white">{u.email}</div>
                              <div className="text-[11px] text-slate-400">
                                {u.name} · ID: {u.profile.userId}
                              </div>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() =>
                                  handleToggleUserFlag(u, { role: u.role === 'admin' ? 'user' : 'admin' })
                                }
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                                  u.role === 'admin'
                                    ? 'bg-[#1D74F5]/15 text-[#1D74F5]'
                                    : 'bg-slate-200 dark:bg-[#252B3B] text-slate-600 dark:text-slate-300'
                                }`}
                              >
                                {u.role}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              <button
                                onClick={() => handleToggleUserFlag(u, { verified: !u.verified })}
                                className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                                  u.verified
                                    ? 'bg-emerald-500/15 text-[#0FAF59]'
                                    : 'bg-slate-200 dark:bg-[#252B3B] text-slate-500'
                                }`}
                              >
                                {u.verified ? 'Verified' : 'Standard'}
                              </button>
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                step="0.01"
                                value={draft.live}
                                onChange={(e) =>
                                  setUserDrafts((prev) => ({
                                    ...prev,
                                    [u.clientId]: { ...draft, live: e.target.value },
                                  }))
                                }
                                className="w-24 px-2 py-1 rounded font-mono-tabular text-xs bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                              />
                            </td>
                            <td className="py-3 px-4">
                              <input
                                type="number"
                                step="0.01"
                                value={draft.demo}
                                onChange={(e) =>
                                  setUserDrafts((prev) => ({
                                    ...prev,
                                    [u.clientId]: { ...draft, demo: e.target.value },
                                  }))
                                }
                                className="w-24 px-2 py-1 rounded font-mono-tabular text-xs bg-slate-50 dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                              />
                            </td>
                            <td className="py-3 px-4 text-right font-mono-tabular">{u.tradesCount}</td>
                            <td className="py-3 px-4 text-right">
                              <div className="inline-flex items-center gap-1.5">
                                <button
                                  onClick={() => handleSaveUserRow(u)}
                                  className="px-2.5 py-1 rounded bg-[#1D74F5] text-white text-[11px] font-bold"
                                >
                                  Save
                                </button>
                                {u.role !== 'admin' && (
                                  confirmDeleteUserId === u.clientId ? (
                                    <button
                                      onClick={() => handleDeleteUser(u.clientId)}
                                      className="px-2 py-1 rounded bg-rose-600 text-white text-[11px] font-bold"
                                    >
                                      Confirm
                                    </button>
                                  ) : (
                                    <button
                                      onClick={() => setConfirmDeleteUserId(u.clientId)}
                                      className="p-1.5 rounded text-rose-500 hover:bg-rose-500/10"
                                      title="Delete User"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 5. OTC & PAYOUTS CONTROL */}
            {adminTab === 'otc' && adminData && (
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
                <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <div>
                      <div className="font-display font-bold text-sm">OTC Majority Counter-Flow Engine</div>
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                        Automatically moves OTC candles opposite to the heavier Buy/Sell volume side.
                      </p>
                    </div>
                    <button
                      onClick={handleToggleCounterFlow}
                      className={`px-4 py-1.5 rounded-md text-xs font-bold transition-colors ${
                        adminData.otcCounterFlowEnabled
                          ? 'bg-[#0FAF59] text-white'
                          : 'bg-slate-300 dark:bg-slate-700 text-slate-800 dark:text-slate-200'
                      }`}
                    >
                      {adminData.otcCounterFlowEnabled ? 'ACTIVE (ON)' : 'PAUSED (OFF)'}
                    </button>
                  </div>

                  <form onSubmit={handleUpdatePayout} className="pt-3 border-t border-slate-200 dark:border-[#2A3142] space-y-3">
                    <div className="font-display font-bold text-xs">Adjust Asset Payout %</div>
                    <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
                      <select
                        value={selectedOtcSymbol}
                        onChange={(e) => {
                          setSelectedOtcSymbol(e.target.value);
                          const found = assets.find((a) => a.symbol === e.target.value);
                          if (found) setPayoutInput(String(found.payout));
                        }}
                        className="flex-1 min-w-[140px] px-2.5 py-2 rounded text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                      >
                        {otcAssetsList.map((a) => (
                          <option key={a.symbol} value={a.symbol}>
                            {a.symbol} ({a.payout}%)
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        min={50}
                        max={98}
                        value={payoutInput}
                        onChange={(e) => setPayoutInput(e.target.value)}
                        className="w-20 px-2.5 py-2 rounded font-mono-tabular text-xs bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                      />
                      <button
                        type="submit"
                        className="px-4 py-2 rounded bg-[#1D74F5] text-white text-xs font-bold shrink-0"
                      >
                        Set %
                      </button>
                    </div>
                  </form>
                </div>

                <div className="p-5 rounded-lg bg-slate-50 dark:bg-[#1C212D] border border-slate-200 dark:border-[#2A3142] space-y-3">
                  <div className="font-display font-bold text-sm">Live Active OTC Exposure</div>
                  {adminData.otcExposure.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      No active open OTC positions right now.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {adminData.otcExposure.map((e) => (
                        <div
                          key={e.symbol}
                          className="flex items-center justify-between text-xs p-2.5 rounded bg-white dark:bg-[#131722] border border-slate-200 dark:border-[#2A3142]"
                        >
                          <div>
                            <div className="font-bold">{e.symbol}</div>
                            <div className="font-mono-tabular text-[11px] text-slate-400">Price: {e.price}</div>
                          </div>
                          <div className="flex items-center gap-4 font-mono-tabular">
                            <span className="text-[#0FAF59] font-bold">
                              BUY: ${e.upVolume.toFixed(0)} ({e.upCount})
                            </span>
                            <span className="text-[#F05044] font-bold">
                              SELL: ${e.downVolume.toFixed(0)} ({e.downCount})
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
