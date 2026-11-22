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
  RotateCcw,
  Globe,
  Eye,
  EyeOff,
  Archive,
  ArchiveRestore,
  Database,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeAllAccountBalances } from '../core/analytics';
import {
  CURRENCY_METADATA,
  SUPPORTED_CURRENCIES,
  convertCurrency,
} from '../core/currency';
import type { Account, AccountType, CurrencyCode } from '../types/finance';
import { CurrencyRateHelper } from './CurrencyRateHelper';
import { Modal, Money, PALETTE_COLORS, todayIso } from './ui';

const PALETTE_COLOR_LABELS: Record<string, string> = {
  '#1B4D3E': 'Treasury Pine',
  '#0F766E': 'Deep Teal',
  '#1D4ED8': 'Cobalt Blue',
  '#B45309': 'Ochre Amber',
  '#BE123C': 'Crimson Rose',
  '#6D28D9': 'Royal Violet',
  '#0E7490': 'Ocean Cyan',
  '#9D174D': 'Plum Berry',
  '#C2410C': 'Burnt Sienna',
  '#475569': 'Ledger Slate',
};

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
  const setBaseCurrency = useFinanceStore((s) => s.setBaseCurrency);
  const updateExchangeRate = useFinanceStore((s) => s.updateExchangeRate);
  const resetExchangeRates = useFinanceStore((s) => s.resetExchangeRates);
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

  const activeAccounts = useMemo(
    () => data.accounts.filter((a) => !a.archived),
    [data.accounts]
  );

  const archivedAccounts = useMemo(
    () => data.accounts.filter((a) => Boolean(a.archived)),
    [data.accounts]
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
  const [showPasscode, setShowPasscode] = useState(false);
  const [savingPasscode, setSavingPasscode] = useState(false);

  const transferFromAccount = useMemo(
    () => data.accounts.find((a) => a.id === txFrom) ?? null,
    [data.accounts, txFrom]
  );

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
    const first = activeAccounts[0] ?? data.accounts[0];
    const second = activeAccounts[1] ?? data.accounts[1] ?? first;
    setTxFrom(first?.id ?? '');
    setTxTo(second?.id ?? '');
    setTxAmount('');
    setTxDate(todayIso());
    setTxNote('');
    setTransferOpen(true);
  };

  const handleTransferFromChange = (nextFrom: string) => {
    setTxFrom(nextFrom);
    if (nextFrom === txTo) {
      const alt = activeAccounts.find((a) => a.id !== nextFrom) ?? data.accounts.find((a) => a.id !== nextFrom);
      if (alt) setTxTo(alt.id);
    }
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
      setShowPasscode(false);
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
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            AYNLYTICS Accounts &amp; Vault Settings
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Track liquid cash, credit utilization, investments, loans, offline FX rates, and local security preferences
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={openTransferModal}
            disabled={activeAccounts.length < 2}
            className="tactile-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
          >
            <ArrowRightLeft
              className="w-3.5 h-3.5"
              style={{ color: 'var(--accent-primary-text)' }}
              aria-hidden="true"
            />
            <span>Transfer</span>
          </button>
          <button
            type="button"
            onClick={openNewAccount}
            className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Add Account</span>
          </button>
        </div>
      </div>

      {/* Grouped Accounts Grid */}
      <div className="space-y-6">
        {GROUPS.map((grp) => {
          const accs = activeAccounts.filter((a) => grp.types.includes(a.type));
          if (accs.length === 0) return null;
          const GroupIcon = grp.icon;
          const hasMixedCurrency = accs.some((a) => a.currency !== currency);
          const groupTotal = accs.reduce((sum, a) => {
            const bal = balances[a.id] ?? a.openingBalance;
            return sum + convertCurrency(bal, a.currency, currency, data.settings);
          }, 0);

          return (
            <section key={grp.id} className="space-y-3" aria-label={grp.title}>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <div
                    className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
                    style={{
                      background: 'var(--accent-primary-soft)',
                      color: 'var(--accent-primary-text)',
                    }}
                  >
                    <GroupIcon className="w-3.5 h-3.5" aria-hidden="true" />
                  </div>
                  <h2 className="text-xs font-bold text-[var(--text-secondary)]">
                    {grp.title}
                  </h2>
                  {hasMixedCurrency && (
                    <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)]">
                      Converted to {currency}
                    </span>
                  )}
                </div>
                <Money
                  amount={groupTotal}
                  currency={currency}
                  privacyMask={privacyMask}
                  className="text-sm font-bold text-[var(--text-primary)] tabular-nums"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                {accs.map((acc) => {
                  const bal = balances[acc.id] ?? acc.openingBalance;
                  const isForeign = acc.currency !== currency;
                  const baseEquivalent = isForeign
                    ? convertCurrency(bal, acc.currency, currency, data.settings)
                    : bal;
                  const isCredit = acc.type === 'credit';
                  const usedAmt = isCredit && bal < 0 ? Math.abs(bal) : 0;
                  const utilPct =
                    isCredit && acc.creditLimit && acc.creditLimit > 0
                      ? Math.min(100, Math.round((usedAmt / acc.creditLimit) * 100))
                      : null;

                  const utilColor =
                    utilPct !== null
                      ? utilPct >= 70
                        ? 'var(--accent-danger)'
                        : utilPct >= 30
                          ? 'var(--accent-warning)'
                          : 'var(--accent-positive)'
                      : 'var(--accent-positive)';

                  return (
                    <div
                      key={acc.id}
                      className="tactile-card p-5 flex flex-col justify-between gap-4 transition-colors hover:border-[var(--border-strong)]"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-3 min-w-0">
                          <span
                            className="w-2.5 h-10 rounded-full shrink-0"
                            style={{ backgroundColor: acc.color }}
                            aria-hidden="true"
                          />
                          <div className="min-w-0">
                            <div className="text-sm font-bold text-[var(--text-primary)] truncate">
                              {acc.name}
                            </div>
                            <div className="text-xs text-[var(--text-muted)] truncate">
                              {acc.institution ? `${acc.institution} · ` : ''}
                              <span className="capitalize">{acc.type}</span> · {acc.currency}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1 shrink-0">
                          <button
                            type="button"
                            onClick={() => openEditAccount(acc)}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                            aria-label={`Edit account ${acc.name}`}
                            title="Edit account"
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              updateAccount(acc.id, { archived: true });
                              showToast(`Archived account "${acc.name}"`, 'info');
                            }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                            aria-label={`Archive account ${acc.name}`}
                            title="Archive account"
                          >
                            <Archive className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Delete account "${acc.name}"?`)) {
                                deleteAccount(acc.id);
                              }
                            }}
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                            aria-label={`Delete account ${acc.name}`}
                            title="Delete account"
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                        </div>
                      </div>

                      <div>
                        <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
                          <div
                            className="text-2xl font-bold tracking-tight tabular-nums"
                            style={{
                              color: bal < 0 ? 'var(--accent-danger)' : 'var(--text-primary)',
                            }}
                          >
                            <Money amount={bal} currency={acc.currency} privacyMask={privacyMask} />
                          </div>
                          {isForeign && (
                            <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums">
                              ≈{' '}
                              <Money
                                amount={baseEquivalent}
                                currency={currency}
                                privacyMask={privacyMask}
                              />
                            </span>
                          )}
                        </div>

                        {/* Credit Utilization Meter */}
                        {utilPct !== null && acc.creditLimit && (
                          <div className="mt-3 space-y-1.5">
                            <div className="flex items-center justify-between text-[11px]">
                              <span className="text-[var(--text-muted)]">Credit Utilization</span>
                              <span
                                className="font-semibold tabular-nums"
                                style={{ color: utilColor }}
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
                            <div className="h-1.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                              <div
                                className="h-full rounded-full transition-all"
                                style={{ width: `${utilPct}%`, backgroundColor: utilColor }}
                              />
                            </div>
                          </div>
                        )}

                        {(acc.apr !== undefined || acc.minPayment !== undefined) && (
                          <div className="mt-2.5 flex items-center gap-3 text-[11px] text-[var(--text-muted)] tabular-nums">
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

        {/* Archived Accounts Strip (only shown when archived accounts exist) */}
        {archivedAccounts.length > 0 && (
          <section className="tactile-well p-4 space-y-2.5" aria-label="Archived Accounts">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-secondary)]">
                <Archive className="w-3.5 h-3.5 text-[var(--text-muted)]" aria-hidden="true" />
                <span>Archived Accounts ({archivedAccounts.length})</span>
              </div>
              <span className="text-[11px] text-[var(--text-muted)]">
                Hidden from active groups
              </span>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
              {archivedAccounts.map((acc) => {
                const bal = balances[acc.id] ?? acc.openingBalance;
                return (
                  <div
                    key={acc.id}
                    className="flex items-center justify-between gap-2 px-3 py-2 rounded-xl bg-[var(--bg-surface)] border border-[var(--border-hairline)]"
                  >
                    <div className="min-w-0">
                      <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                        {acc.name}
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                        <Money amount={bal} currency={acc.currency} privacyMask={privacyMask} /> ·{' '}
                        {acc.currency}
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => {
                          updateAccount(acc.id, { archived: false });
                          showToast(`Restored account "${acc.name}"`, 'success');
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary-text)] hover:bg-[var(--accent-primary-soft)] transition-colors cursor-pointer"
                        aria-label={`Unarchive account ${acc.name}`}
                        title="Restore account"
                      >
                        <ArchiveRestore className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          if (window.confirm(`Permanently delete archived account "${acc.name}"?`)) {
                            deleteAccount(acc.id);
                          }
                        }}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                        aria-label={`Delete archived account ${acc.name}`}
                        title="Delete account"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}
      </div>

      {/* Vault Settings Card */}
      <section className="tactile-card p-6 space-y-6" aria-label="Vault Settings">
        <div className="flex items-center gap-3">
          <div
            className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
            style={{
              background: 'var(--accent-primary-soft)',
              color: 'var(--accent-primary-text)',
            }}
          >
            <Shield className="w-4 h-4" aria-hidden="true" />
          </div>
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Currency &amp; Local Vault Security
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              All preferences, FX rates, and passcode hashes stay strictly on this device
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          {/* Base Currency */}
          <div className="tactile-well p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Globe
                  className="w-4 h-4"
                  style={{ color: 'var(--accent-primary-text)' }}
                  aria-hidden="true"
                />
                <label htmlFor="vault-settings-base-currency">Base Display Currency</label>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                Totals, Sankey diagram, and KPIs automatically convert to your base currency and rebase offline FX rates.
              </p>
            </div>
            <select
              id="vault-settings-base-currency"
              value={currency}
              onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
              className="tactile-input w-full px-3 py-2 text-sm font-medium cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {SUPPORTED_CURRENCIES.map((code) => {
                const meta = CURRENCY_METADATA[code];
                return (
                  <option key={code} value={code}>
                    {code} ({meta.symbol}) — {meta.name}
                  </option>
                );
              })}
            </select>
          </div>

          {/* Vault Passcode Lock */}
          <div className="tactile-well p-4 space-y-2.5 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                {hasPasscode ? (
                  <Lock
                    className="w-4 h-4"
                    style={{ color: 'var(--accent-positive)' }}
                    aria-hidden="true"
                  />
                ) : (
                  <Unlock
                    className="w-4 h-4 text-[var(--text-muted)]"
                    aria-hidden="true"
                  />
                )}
                <label htmlFor="vault-passcode-input">Local Passcode Lock</label>
              </div>
              {hasPasscode && (
                <span
                  className="px-2 py-0.5 rounded-full text-[10px] font-semibold"
                  style={{
                    background: 'var(--accent-positive-soft)',
                    color: 'var(--accent-positive)',
                  }}
                >
                  Active
                </span>
              )}
            </div>
            <form onSubmit={handleSetPasscode} className="space-y-2">
              <div className="relative">
                <input
                  id="vault-passcode-input"
                  type={showPasscode ? 'text' : 'password'}
                  value={newPasscode}
                  onChange={(e) => setNewPasscode(e.target.value)}
                  placeholder={hasPasscode ? 'Enter new passcode...' : 'Set passcode (min 4 chars)'}
                  className="tactile-input w-full pl-3 pr-9 py-2 text-xs focus:border-[var(--accent-primary)]"
                />
                <button
                  type="button"
                  onClick={() => setShowPasscode((prev) => !prev)}
                  aria-label={showPasscode ? 'Hide passcode' : 'Show passcode'}
                  title={showPasscode ? 'Hide passcode' : 'Show passcode'}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                >
                  {showPasscode ? (
                    <EyeOff className="w-3.5 h-3.5" aria-hidden="true" />
                  ) : (
                    <Eye className="w-3.5 h-3.5" aria-hidden="true" />
                  )}
                </button>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  disabled={!newPasscode.trim() || savingPasscode}
                  className="tactile-btn-primary flex-1 py-1.5 rounded-lg disabled:opacity-40 text-xs font-semibold cursor-pointer"
                >
                  {hasPasscode ? 'Update' : 'Enable Lock'}
                </button>
                {hasPasscode && (
                  <>
                    <button
                      type="button"
                      onClick={() => lockVault()}
                      className="tactile-btn px-2.5 py-1.5 rounded-lg text-xs font-medium cursor-pointer"
                    >
                      Lock Now
                    </button>
                    <button
                      type="button"
                      onClick={handleRemovePasscode}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer hover:bg-[var(--accent-danger-soft)]"
                      style={{ color: 'var(--accent-danger)' }}
                    >
                      Remove
                    </button>
                  </>
                )}
              </div>
            </form>
          </div>

          {/* Sample Data vs Fresh Vault */}
          <div className="tactile-well p-4 space-y-2.5 flex flex-col justify-between">
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-[var(--text-primary)]">
                <Database
                  className="w-4 h-4"
                  style={{ color: 'var(--accent-warning)' }}
                  aria-hidden="true"
                />
                <span>Vault Mode &amp; Reset</span>
              </div>
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
                {data.settings.isDemoData
                  ? 'Currently exploring realistic sample data. Start fresh whenever you are ready.'
                  : 'Running on your clean personal ledger. You can reload demo data anytime.'}
              </p>
            </div>
            <div className="flex items-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Reset to a clean empty vault?')) {
                    resetToFreshVault();
                    showToast('Fresh empty vault initialized', 'success');
                  }
                }}
                className="tactile-btn flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Start Fresh</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  if (window.confirm('Load sample financial dataset?')) {
                    loadSampleData();
                    showToast('Loaded sample financial dataset', 'info');
                  }
                }}
                className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer"
                style={{
                  background: 'var(--accent-warning-soft)',
                  color: 'var(--accent-warning)',
                  borderColor: 'transparent',
                }}
              >
                <Database className="w-3.5 h-3.5" aria-hidden="true" />
                <span>Load Sample</span>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Dedicated Multi-Currency & Offline FX Section */}
      <section className="space-y-3" aria-label="Multi-Currency and Offline FX">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
              Multi-Currency &amp; Offline FX Helper
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Convert currencies offline and fine-tune your local vault exchange rates
            </p>
          </div>
        </div>

        <CurrencyRateHelper
          settings={data.settings}
          privacyMask={privacyMask}
          onChangeBaseCurrency={setBaseCurrency}
          onUpdateRate={updateExchangeRate}
          onResetRates={resetExchangeRates}
        />
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
              <label
                htmlFor="acc-draft-name"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Account Name
              </label>
              <input
                id="acc-draft-name"
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Main Checking, Chase Sapphire"
                required
                autoFocus
                className="tactile-input w-full px-3 py-2 text-sm focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="acc-draft-institution"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Institution (optional)
              </label>
              <input
                id="acc-draft-institution"
                type="text"
                value={draft.institution}
                onChange={(e) => setDraft({ ...draft, institution: e.target.value })}
                placeholder="e.g. Ally, Chase, Vanguard"
                className="tactile-input w-full px-3 py-2 text-sm focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label
                htmlFor="acc-draft-type"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Type
              </label>
              <select
                id="acc-draft-type"
                value={draft.type}
                onChange={(e) => setDraft({ ...draft, type: e.target.value as AccountType })}
                className="tactile-input w-full px-2.5 py-2 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
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
              <label
                htmlFor="acc-draft-currency"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Currency
              </label>
              <select
                id="acc-draft-currency"
                value={draft.currency}
                onChange={(e) =>
                  setDraft({ ...draft, currency: e.target.value as CurrencyCode })
                }
                className="tactile-input w-full px-2.5 py-2 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
              >
                {SUPPORTED_CURRENCIES.map((code) => (
                  <option key={code} value={code}>
                    {code} ({CURRENCY_METADATA[code].symbol})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="acc-draft-opening"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Opening Balance
              </label>
              <input
                id="acc-draft-opening"
                type="number"
                step="0.01"
                value={draft.openingBalance}
                onChange={(e) => setDraft({ ...draft, openingBalance: e.target.value })}
                placeholder="-500 for debt"
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {(draft.type === 'credit' || draft.type === 'loan') && (
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {draft.type === 'credit' && (
                <div>
                  <label
                    htmlFor="acc-draft-limit"
                    className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Credit Limit
                  </label>
                  <input
                    id="acc-draft-limit"
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.creditLimit}
                    onChange={(e) => setDraft({ ...draft, creditLimit: e.target.value })}
                    className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
                  />
                </div>
              )}
              <div>
                <label
                  htmlFor="acc-draft-apr"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  APR (%)
                </label>
                <input
                  id="acc-draft-apr"
                  type="number"
                  step="0.01"
                  min="0"
                  value={draft.apr}
                  onChange={(e) => setDraft({ ...draft, apr: e.target.value })}
                  className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
                />
              </div>
              <div>
                <label
                  htmlFor="acc-draft-minpayment"
                  className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
                >
                  Min Payment
                </label>
                <input
                  id="acc-draft-minpayment"
                  type="number"
                  min="0"
                  step="0.01"
                  value={draft.minPayment}
                  onChange={(e) => setDraft({ ...draft, minPayment: e.target.value })}
                  className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
                />
              </div>
            </div>
          )}

          <div className="space-y-1.5">
            <span className="block text-xs font-medium text-[var(--text-secondary)]">
              Accent Color
            </span>
            <div className="flex flex-wrap gap-2" role="group" aria-label="Account accent color">
              {PALETTE_COLORS.map((c) => {
                const colorName = PALETTE_COLOR_LABELS[c] ?? c;
                const isSelected = draft.color === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setDraft({ ...draft, color: c })}
                    aria-label={`Select color ${colorName}`}
                    aria-pressed={isSelected}
                    title={colorName}
                    className={`w-6 h-6 rounded-full cursor-pointer transition-transform ${
                      isSelected
                        ? 'scale-110 ring-2 ring-offset-2 ring-[var(--focus-ring)] ring-offset-[var(--bg-surface)]'
                        : 'hover:scale-105'
                    }`}
                    style={{ backgroundColor: c }}
                  />
                );
              })}
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setAccModalOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
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
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="transfer-from-account"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                From Account
              </label>
              <select
                id="transfer-from-account"
                value={txFrom}
                onChange={(e) => handleTransferFromChange(e.target.value)}
                className="tactile-input w-full px-3 py-2 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
              >
                {activeAccounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name} ({a.currency})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label
                htmlFor="transfer-to-account"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                To Account
              </label>
              <select
                id="transfer-to-account"
                value={txTo}
                onChange={(e) => setTxTo(e.target.value)}
                className="tactile-input w-full px-3 py-2 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
              >
                {activeAccounts
                  .filter((a) => a.id !== txFrom)
                  .map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.currency})
                    </option>
                  ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="transfer-amount"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Amount ({transferFromAccount?.currency ?? currency})
              </label>
              <input
                id="transfer-amount"
                type="number"
                step="0.01"
                min="0.01"
                value={txAmount}
                onChange={(e) => setTxAmount(e.target.value)}
                required
                autoFocus
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
              />
            </div>
            <div>
              <label
                htmlFor="transfer-date"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Date
              </label>
              <input
                id="transfer-date"
                type="date"
                value={txDate}
                onChange={(e) => setTxDate(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="transfer-note"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Note (optional)
            </label>
            <input
              id="transfer-note"
              type="text"
              value={txNote}
              onChange={(e) => setTxNote(e.target.value)}
              placeholder="e.g. Pay off credit card statement"
              className="tactile-input w-full px-3 py-2 text-sm focus:border-[var(--accent-primary)]"
            />
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setTransferOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Record Transfer
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
