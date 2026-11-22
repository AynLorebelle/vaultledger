import React, { useMemo, useState } from 'react';
import {
  Landmark,
  CreditCard,
  TrendingUp,
  Wallet,
  Plus,
  ArrowRightLeft,
  Edit3,
  Trash2,
  Lock,
  Unlock,
  Shield,
  Sparkles,
  RotateCcw,
  Globe,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeAllAccountBalances } from '../core/analytics';
import type { Account, AccountType, CurrencyCode } from '../types/finance';
import { Modal, Money, PALETTE_COLORS, todayIso } from './ui';

const CURRENCIES: CurrencyCode[] = ['USD', 'EUR', 'GBP', 'PHP', 'JPY', 'CAD', 'AUD', 'SGD'];

const GROUPS: Array<{
  id: string;
  title: string;
  types: AccountType[];
  icon: React.ComponentType<{ className?: string }>;
}> = [
  { id: 'liquid', title: 'Liquid Cash', types: ['checking', 'savings', 'cash'], icon: Wallet },
  { id: 'credit', title: 'Credit Cards', types: ['credit'], icon: CreditCard },
  { id: 'investment', title: 'Investments', types: ['investment'], icon: TrendingUp },
  { id: 'loan', title: 'Loans & Liabilities', types: ['loan'], icon: Landmark },
];

interface AccountDraft {
  id?: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  openingBalance: string;
  creditLimit: string;
  apr: string;
  minPayment: string;
  institution: string;
  color: string;
}

export const AccountsView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addAccount = useFinanceStore((s) => s.addAccount);
  const updateAccount = useFinanceStore((s) => s.updateAccount);
  const deleteAccount = useFinanceStore((s) => s.deleteAccount);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const setVaultPasscode = useFinanceStore((s) => s.setVaultPasscode);
  const lockVault = useFinanceStore((s) => s.lockVault);
  const loadSampleData = useFinanceStore((s) => s.loadSampleData);
  const resetToFreshVault = useFinanceStore((s) => s.resetToFreshVault);
  const showToast = useFinanceStore((s) => s.showToast);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const hasPasscode = Boolean(data.settings.passcodeHash);

  const balances = useMemo(
    () => computeAllAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions]
  );

  // Add/Edit Account Modal
  const [accModalOpen, setAccModalOpen] = useState(false);
  const [draft, setDraft] = useState<AccountDraft>({
    name: '',
    type: 'checking',
    currency,
    openingBalance: '0',
    creditLimit: '',
    apr: '',
    minPayment: '',
    institution: '',
    color: PALETTE_COLORS[0],
  });

  // Transfer Modal
  const [transferOpen, setTransferOpen] = useState(false);
  const [txFrom, setTxFrom] = useState('');
  const [txTo, setTxTo] = useState('');
  const [txAmount, setTxAmount] = useState('');
  const [txDate, setTxDate] = useState(todayIso());
  const [txNote, setTxNote] = useState('');

  // Passcode Settings
  const [newPasscode, setNewPasscode] = useState('');
  const [savingPasscode, setSavingPasscode] = useState(false);

  const openNewAccount = () => {
    setDraft({
      name: '',
      type: 'checking',
      currency,
      openingBalance: '0',
      creditLimit: '',
      apr: '',
      minPayment: '',
      institution: '',
      color: PALETTE_COLORS[data.accounts.length % PALETTE_COLORS.length],
    });
    setAccModalOpen(true);
  };

  const openEditAccount = (acc: Account) => {
    setDraft({
      id: acc.id,
      name: acc.name,
      type: acc.type,
      currency: acc.currency,
      openingBalance: String(acc.openingBalance),
      creditLimit: acc.creditLimit !== undefined ? String(acc.creditLimit) : '',
      apr: acc.apr !== undefined ? String(acc.apr) : '',
      minPayment: acc.minPayment !== undefined ? String(acc.minPayment) : '',
      institution: acc.institution ?? '',
      color: acc.color,
    });
    setAccModalOpen(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.name.trim()) return;
    const payload = {
      name: draft.name.trim(),
      type: draft.type,
      currency: draft.currency,
      openingBalance: Number(draft.openingBalance) || 0,
      creditLimit: draft.creditLimit !== '' ? Number(draft.creditLimit) : undefined,
      apr: draft.apr !== '' ? Number(draft.apr) : undefined,
      minPayment: draft.minPayment !== '' ? Number(draft.minPayment) : undefined,
      institution: draft.institution.trim() || undefined,
      color: draft.color,
    };

    if (draft.id) {
      updateAccount(draft.id, payload);
      showToast(`Updated account "${payload.name}"`, 'success');
    } else {
      addAccount(payload);
      showToast(`Added account "${payload.name}"`, 'success');
    }
    setAccModalOpen(false);
  };

  const openTransferModal = () => {
    setTxFrom(data.accounts[0]?.id ?? '');
    setTxTo(data.accounts[1]?.id ?? data.accounts[0]?.id ?? '');
    setTxAmount('');
    setTxDate(todayIso());
    setTxNote('');
    setTransferOpen(true);
  };

  const handleTransfer = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(txAmount);
    if (!txFrom || !txTo || txFrom === txTo || !Number.isFinite(amt) || amt <= 0) {
      showToast('Select two different accounts and a positive transfer amount', 'error');
      return;
    }
    const destName = data.accounts.find((a) => a.id === txTo)?.name ?? 'Account';
    addTransaction({
      date: txDate,
      type: 'transfer',
      amount: amt,
      accountId: txFrom,
      transferAccountId: txTo,
      payee: `Transfer to ${destName}`,
      categoryId: 'cat_transfer',
      notes: txNote.trim(),
      tags: ['transfer'],
      reviewed: true,
    });
    showToast('Transfer recorded cleanly', 'success');
    setTransferOpen(false);
  };

  const handleSetPasscode = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPasscode.trim().length < 4) {
      showToast('Passcode should be at least 4 characters', 'error');
      return;
    }
    setSavingPasscode(true);
    try {
      await setVaultPasscode(newPasscode.trim());
      setNewPasscode('');
      showToast('Vault passcode enabled locally (PBKDF2-SHA256)', 'success');
    } finally {
      setSavingPasscode(false);
    }
  };

  const handleRemovePasscode = async () => {
    if (!window.confirm('Remove local vault passcode lock?')) return;
    await setVaultPasscode(null);
    showToast('Vault passcode removed', 'info');
  };

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Accounts &amp; Vault Settings
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track liquid cash, credit utilization, investments, loans, and local security preferences
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openTransferModal}
            disabled={data.accounts.length < 2}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 disabled:opacity-40 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer"
          >
            <ArrowRightLeft className="w-3.5 h-3.5 text-indigo-500" />
            <span>Transfer</span>
          </button>
          <button
            type="button"
            onClick={openNewAccount}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Grouped Accounts Grid */}
      <div className="space-y-6">
        {GROUPS.map((grp) => {
          const accs = data.accounts.filter((a) => !a.archived && grp.types.includes(a.type));
          if (accs.length === 0) return null;
          const GroupIcon = grp.icon;
          const groupTotal = accs.reduce((s, a) => s + (balances[a.id] ?? a.openingBalance), 0);

          return (
            <section key={grp.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <GroupIcon className="w-4 h-4 text-indigo-500" />
                  <h2 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
                    {grp.title}
                  </h2>
                </div>
                <Money
                  amount={groupTotal}
                  currency={currency}
                  privacyMask={privacyMask}
                  className="text-sm font-bold text-slate-700 dark:text-slate-200"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {accs.map((acc) => {
                  const bal = balances[acc.id] ?? acc.openingBalance;
                  const isCredit = acc.type === 'credit';
                  const usedAmt = isCredit && bal < 0 ? Math.abs(bal) : 0;
                  const utilPct =
                    isCredit && acc.creditLimit && acc.creditLimit > 0
                      ? Math.min(100, Math.round((usedAmt / acc.creditLimit) * 100))
                      : null;

                  return (
                    <div
                      key={acc.id}
                      className="rounded-2xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between gap-4"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-3 h-10 rounded-full shrink-0"
                            style={{ backgroundColor: acc.color }}
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-slate-900 dark:text-white truncate">
                              {acc.name}
                            </div>
                            <div className="text-xs text-slate-400 truncate">
                              {acc.institution ? `${acc.institution} · ` : ''}
                              <span className="capitalize">{acc.type}</span> · {acc.currency}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditAccount(acc)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            aria-label="Edit account"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete account "${acc.name}"?`)) {
                                deleteAccount(acc.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            aria-label="Delete account"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <div
                          className={`text-2xl font-bold tracking-tight ${
                            bal < 0
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-white'
                          }`}
                        >
                          <Money amount={bal} currency={acc.currency} privacyMask={privacyMask} />
                        </div>

                        {/* Credit Utilization Meter */}
                        {utilPct !== null && acc.creditLimit && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-slate-500 dark:text-slate-400">
                                Credit Utilization
                              </span>
                              <span
                                className={`font-semibold tabular-nums ${
                                  utilPct >= 70
                                    ? 'text-rose-500'
                                    : utilPct >= 30
                                    ? 'text-amber-500'
                                    : 'text-emerald-500'
                                }`}
                              >
                                {utilPct}% of{' '}
                                <Money
                                  amount={acc.creditLimit}
                                  currency={acc.currency}
                                  privacyMask={privacyMask}
                                  compact
                                />
                              </span>
                            </div>
                            <div className="h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                              <div
                                className={`h-full rounded-full ${
                                  utilPct >= 70
                                    ? 'bg-rose-500'
                                    : utilPct >= 30
                                    ? 'bg-amber-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${utilPct}%` }}
                              />
                            </div>
                          </div>
                        )}

                        {(acc.apr !== undefined || acc.minPayment !== undefined) && (
                          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-slate-400 tabular-nums">
                            {acc.apr !== undefined && <span>APR: {acc.apr}%</span>}
                            {acc.minPayment !== undefined && (
                              <span>
                                Min:{' '}
                                <Money
                                  amount={acc.minPayment}
                                  currency={acc.currency}
                                  privacyMask={privacyMask}
                                />
                                /mo
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          );
        })}
      </div>

      {/* Currency & Local Vault Settings Card */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-6 shadow-xs space-y-6">
        <div className="flex items-center gap-2.5">
          <Shield className="w-5 h-5 text-indigo-500" />
          <div>
            <h2 className="text-base font-bold text-slate-900 dark:text-white">
              Currency &amp; Local Vault Security
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              All preferences and passcode hashes stay strictly on this device
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Base Currency */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Globe className="w-4 h-4 text-indigo-500" />
              <span>Base Display Currency</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              Totals, Sankey diagram, and KPIs automatically convert to your base currency.
            </p>
            <select
              value={currency}
              onChange={(e) => {
                updateSettings({ baseCurrency: e.target.value as CurrencyCode });
                showToast(`Base currency changed to ${e.target.value}`, 'success');
              }}
              className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm font-medium outline-none"
            >
              {CURRENCIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
          </div>

          {/* Vault Passcode Lock */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
                {hasPasscode ? (
                  <Lock className="w-4 h-4 text-emerald-500" />
                ) : (
                  <Unlock className="w-4 h-4 text-slate-400" />
                )}
                <span>Local Passcode Lock</span>
              </div>
              {hasPasscode && (
                <span className="px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 text-[10px] font-semibold">
                  Active
                </span>
              )}
            </div>
            <form onSubmit={handleSetPasscode} className="space-y-2">
              <input
                type="password"
                value={newPasscode}
                onChange={(e) => setNewPasscode(e.target.value)}
                placeholder={hasPasscode ? 'Enter new passcode...' : 'Set passcode (min 4 chars)'}
                className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2 text-xs outline-none focus:border-indigo-500"
              />
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!newPasscode.trim() || savingPasscode}
                  className="flex-1 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold cursor-pointer"
                >
                  {hasPasscode ? 'Update' : 'Enable Lock'}
                </button>
                {hasPasscode && (
                  <>
                    <button
                      type="button"
                      onClick={() => lockVault()}
                      className="px-2.5 py-1.5 rounded-lg bg-slate-200 dark:bg-slate-800 text-xs font-medium cursor-pointer"
                    >
                      Lock Now
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePasscode}
                      className="px-2.5 py-1.5 rounded-lg text-rose-500 hover:bg-rose-500/10 text-xs font-medium cursor-pointer"
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>

          {/* Sample Data vs Fresh Vault */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-4 space-y-2.5">
            <div className="flex items-center gap-2 text-xs font-semibold text-slate-800 dark:text-slate-200">
              <Sparkles className="w-4 h-4 text-amber-500" />
              <span>Vault Mode &amp; Reset</span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {data.settings.isDemoData
                ? 'Currently exploring realistic sample data. Start fresh whenever you are ready.'
                : 'Running on your clean personal ledger. You can reload demo data anytime.'}
            </p>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Reset to a clean empty vault?')) {
                    resetToFreshVault();
                    showToast('Fresh empty vault initialized', 'success');
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Start Fresh
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Load sample financial dataset?')) {
                    loadSampleData();
                    showToast('Loaded sample financial dataset', 'info');
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg bg-amber-500/15 hover:bg-amber-500/25 text-amber-700 dark:text-amber-300 text-xs font-semibold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Load Sample
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Add / Edit Account Modal */}
      <Modal
        open={accModalOpen}
        onClose={() => setAccModalOpen(false)}
        title={draft.id ? 'Edit Account' : 'Add Account'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSaveAccount} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Account Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Main Checking, Chase Sapphire"
                required
                autoFocus
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Institution (optional)
              </label>
              <input
                type="text"
                value={draft.institution}
                onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
                placeholder="e.g. Ally, Chase, Vanguard"
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Type
              </label>
              <select
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-2 text-sm outline-none"
              >
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
                <option value="cash">Cash</option>
                <option value="credit">Credit Card</option>
                <option value="investment">Investment</option>
                <option value="loan">Loan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Currency
              </label>
              <select
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value as CurrencyCode })
                }
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-2 text-sm outline-none"
              >
                {CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Opening Balance
              </label>
              <input
                type="number"
                step="0.01"
                value={draft.openingBalance}
                onChange={(e) => setDraft({ ...draft, openingBalance: e.target.value })}
                placeholder="-500 for debt"
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none"
              />
            </div>
          </div>

          {(draft.type === 'credit' || draft.type === 'loan') && (
            <div className="grid grid-cols-3 gap-3">
              {draft.type === 'credit' && (
                <div>
                  <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                    Credit Limit
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={draft.creditLimit}
                    onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })}
                    className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none"
                  />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  APR (%)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.apr}
                  onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Min Payment
                </label>
                <input
                  type="number"
                  min="0"
                  value={draft.minPayment}
                  onChange={(e) => setDraft({ ...draft, minPayment: e.target.value })}
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none"
                />
              </div>
            </div>
          )}

          <div className="flex gap-2">
            {PALETTE_COLORS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => setDraft({ ...draft, color: c })}
                className={`w-6 h-6 rounded-full cursor-pointer ${
                  draft.color === c ? 'ring-2 ring-offset-2 ring-indigo-500 dark:ring-offset-slate-900' : ''
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAccModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              {draft.id ? 'Save Account' : 'Create Account'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Transfer Between Accounts Modal */}
      <Modal
        open={transferOpen}
        onClose={() => setTransferOpen(false)}
        title="Transfer Between Accounts"
        subtitle="Moves balance cleanly without affecting income or expense totals"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleTransfer} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                From Account
              </label>
              <select
                value={txFrom}
                onChange={(e) => setTxFrom(e.target.value)}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                To Account
              </label>
              <select
                value={txTo}
                onChange={(e) => setTxTo(e.target.value)}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                {data.accounts
                  .filter((a) => a.id !== txFrom)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Amount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                required
                autoFocus
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Date
              </label>
              <input
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="e.g. Pay off credit card statement"
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-500 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              Record Transfer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
