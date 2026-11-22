import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  Sparkles,
  Calculator,
  Split,
  Plus,
  Trash2,
  Paperclip,
  Image as ImageIcon,
  X,
  ArrowRightLeft,
  RotateCcw,
  TrendingDown,
  TrendingUp,
  Check,
  Tag as TagIcon,
  Globe,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  CURRENCY_METADATA,
  SUPPORTED_CURRENCIES,
  convertCurrency,
} from '../core/currency';
import { evaluateAmountExpression, parseQuickExpenseInput } from '../core/quickParse';
import { loadReceiptDataUrl, saveReceiptAttachment } from '../core/storage';
import type {
  CurrencyCode,
  ReceiptAttachment,
  TransactionSplit,
  TransactionType,
} from '../types/finance';
import { Modal, formatMoney, todayIso } from './ui';

const TYPE_OPTIONS: Array<{
  value: TransactionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  accentBg: string;
  accentColor: string;
}> = [
  {
    value: 'expense',
    label: 'Expense',
    icon: TrendingDown,
    hint: 'Tracks spending against your monthly category budgets.',
    accentBg: 'var(--accent-danger-soft)',
    accentColor: 'var(--accent-danger)',
  },
  {
    value: 'income',
    label: 'Income',
    icon: TrendingUp,
    hint: 'Adds to net cashflow and powers your Sankey income pool.',
    accentBg: 'var(--accent-positive-soft)',
    accentColor: 'var(--accent-positive)',
  },
  {
    value: 'transfer',
    label: 'Transfer',
    icon: ArrowRightLeft,
    hint: 'Moves balances between accounts without inflating income or expenses.',
    accentBg: 'var(--accent-info-soft)',
    accentColor: 'var(--accent-info)',
  },
  {
    value: 'refund',
    label: 'Refund',
    icon: RotateCcw,
    hint: 'Refunds credit back your expense category cleanly instead of counting as income.',
    accentBg: 'var(--accent-warning-soft)',
    accentColor: 'var(--accent-warning)',
  },
];

function formatRateDisplay(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '0.0000';
  }
  if (rate < 0.0001) {
    return rate.toFixed(6);
  }
  return rate.toFixed(4);
}

function formatForeignNumber(value: number): string {
  return new Intl.NumberFormat('en-US', {
    minimumFractionDigits: Number.isInteger(value) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(value);
}

export const QuickAddModal: React.FC = () => {
  const open = useFinanceStore((s) => s.quickAddOpen);
  const editingId = useFinanceStore((s) => s.editingTransactionId);
  const closeQuickAdd = useFinanceStore((s) => s.closeQuickAdd);
  const data = useFinanceStore((s) => s.data);
  const addTransaction = useFinanceStore((s) => s.addTransaction);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const showToast = useFinanceStore((s) => s.showToast);

  const editingTx = useMemo(
    () => (editingId ? data.transactions.find((t) => t.id === editingId) ?? null : null),
    [editingId, data.transactions]
  );

  const baseCurrency = data.settings.baseCurrency;
  const activeAccounts = useMemo(
    () => data.accounts.filter((a) => !a.archived),
    [data.accounts]
  );

  const existingPayees = useMemo(() => {
    const set = new Set<string>();
    data.transactions.forEach((t) => {
      if (t.payee.trim()) set.add(t.payee.trim());
    });
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [data.transactions]);

  const [nlText, setNlText] = useState('');
  const [type, setType] = useState<TransactionType>('expense');
  const [amountExpr, setAmountExpr] = useState('');
  const [payee, setPayee] = useState('');
  const [date, setDate] = useState(todayIso());
  const [accountId, setAccountId] = useState('');
  const [transferAccountId, setTransferAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [tagInput, setTagInput] = useState('');
  const [notes, setNotes] = useState('');
  const [reviewed, setReviewed] = useState(true);

  // Inline Foreign Currency Converter state
  const [fxOpen, setFxOpen] = useState(false);
  const [fxCurrency, setFxCurrency] = useState<CurrencyCode>(
    baseCurrency === 'USD' ? 'PHP' : 'USD'
  );
  const [fxAmount, setFxAmount] = useState('');

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);

  const [receipt, setReceipt] = useState<ReceiptAttachment | undefined>(undefined);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const selectedAccount = useMemo(
    () => data.accounts.find((a) => a.id === accountId) ?? null,
    [data.accounts, accountId]
  );
  const targetCurrency: CurrencyCode = selectedAccount?.currency ?? baseCurrency;

  const defaultExpenseCatId = useMemo(
    () =>
      data.categories.find((c) => c.group !== 'income')?.id ??
      data.categories[0]?.id ??
      'cat_uncategorized',
    [data.categories]
  );

  const defaultIncomeCatId = useMemo(
    () =>
      data.categories.find((c) => c.group === 'income')?.id ??
      data.categories[0]?.id ??
      'cat_uncategorized',
    [data.categories]
  );

  // Initialize form whenever modal opens or editingTx changes
  useEffect(() => {
    if (!open) return;
    setFxOpen(false);
    setFxAmount('');

    if (editingTx) {
      const editAccCurrency =
        data.accounts.find((a) => a.id === editingTx.accountId)?.currency ?? baseCurrency;
      setFxCurrency(editAccCurrency === 'USD' ? 'PHP' : 'USD');
      setNlText('');
      setType(editingTx.type);
      setAmountExpr(String(editingTx.amount));
      setPayee(editingTx.payee);
      setDate(editingTx.date);
      setAccountId(editingTx.accountId);
      setTransferAccountId(editingTx.transferAccountId ?? '');
      setCategoryId(editingTx.categoryId);
      setTags(editingTx.tags ?? []);
      setTagInput('');
      setNotes(editingTx.notes ?? '');
      setReviewed(editingTx.reviewed);
      const hasSplits = Boolean(editingTx.splits && editingTx.splits.length > 0);
      setSplitEnabled(hasSplits);
      setSplits(hasSplits ? editingTx.splits!.map((s) => ({ ...s })) : []);
      setReceipt(editingTx.receipt);
      setReceiptPreview(null);
      if (editingTx.receipt) {
        loadReceiptDataUrl(editingTx.receipt).then((url) => setReceiptPreview(url));
      }
    } else {
      const initialAcc = activeAccounts[0];
      const initialAccCurrency = initialAcc?.currency ?? baseCurrency;
      setFxCurrency(initialAccCurrency === 'USD' ? 'PHP' : 'USD');
      setNlText('');
      setType('expense');
      setAmountExpr('');
      setPayee('');
      setDate(todayIso());
      setAccountId(initialAcc?.id ?? '');
      setTransferAccountId(activeAccounts[1]?.id ?? initialAcc?.id ?? '');
      setCategoryId(defaultExpenseCatId);
      setTags([]);
      setTagInput('');
      setNotes('');
      setReviewed(true);
      setSplitEnabled(false);
      setSplits([]);
      setReceipt(undefined);
      setReceiptPreview(null);
    }
  }, [open, editingTx, activeAccounts, defaultExpenseCatId, data.accounts, baseCurrency]);

  const evaluatedAmount = useMemo(() => evaluateAmountExpression(amountExpr), [amountExpr]);
  const hasMathOperator = useMemo(() => /[+\-*/()]/.test(amountExpr.trim()), [amountExpr]);

  // Inline FX converter calculations
  const parsedFxAmount = useMemo(() => {
    const trimmed = fxAmount.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric > 0 ? numeric : 0;
  }, [fxAmount]);

  const fxConvertedAmount = useMemo(
    () => convertCurrency(parsedFxAmount, fxCurrency, targetCurrency, data.settings),
    [parsedFxAmount, fxCurrency, targetCurrency, data.settings]
  );

  const fxUnitRate = useMemo(
    () => convertCurrency(1, fxCurrency, targetCurrency, data.settings),
    [fxCurrency, targetCurrency, data.settings]
  );

  const fxInverseRate = useMemo(
    () => (fxUnitRate > 0 ? 1 / fxUnitRate : 0),
    [fxUnitRate]
  );

  const handleApplyConvertedAmount = () => {
    if (parsedFxAmount <= 0 || fxConvertedAmount <= 0) return;
    const decimals = CURRENCY_METADATA[targetCurrency].decimals;
    const rounded = Number(fxConvertedAmount.toFixed(decimals));
    setAmountExpr(decimals === 0 ? String(Math.round(rounded)) : rounded.toFixed(decimals));

    if (fxCurrency !== targetCurrency) {
      const displayRate =
        fxUnitRate >= 1
          ? fxUnitRate.toFixed(2)
          : fxInverseRate >= 1
            ? fxInverseRate.toFixed(2)
            : formatRateDisplay(fxUnitRate);
      const conversionTag = `[Converted: ${formatForeignNumber(parsedFxAmount)} ${fxCurrency} @ ${displayRate}]`;
      setNotes((prev) => {
        if (prev.includes('[Converted:')) return prev;
        return prev.trim() ? `${prev.trim()} ${conversionTag}` : conversionTag;
      });
    }

    setFxOpen(false);
    setFxAmount('');
  };

  const nlPreview = useMemo(() => {
    if (!nlText.trim()) return null;
    return parseQuickExpenseInput(nlText, data.categories);
  }, [nlText, data.categories]);

  const applyNaturalLanguage = () => {
    if (!nlText.trim()) return;
    const parsed = parseQuickExpenseInput(nlText, data.categories);
    if (parsed.type) setType(parsed.type);
    if (parsed.payee) setPayee(parsed.payee);
    if (parsed.amount !== null && parsed.amount > 0) {
      setAmountExpr(String(parsed.amount));
    }
    if (parsed.categoryId) {
      setCategoryId(parsed.categoryId);
    } else if (parsed.type === 'income') {
      setCategoryId(defaultIncomeCatId);
    }
    if (parsed.tags.length > 0) {
      setTags((prev) => Array.from(new Set([...prev, ...parsed.tags])));
    }
    setNlText('');
  };

  const handleTypeChange = (nextType: TransactionType) => {
    setType(nextType);
    if (nextType === 'transfer') {
      setSplitEnabled(false);
      if (!transferAccountId || transferAccountId === accountId) {
        const other = activeAccounts.find((a) => a.id !== accountId);
        if (other) setTransferAccountId(other.id);
      }
    } else if (nextType === 'income') {
      const currentCat = data.categories.find((c) => c.id === categoryId);
      if (!currentCat || currentCat.group !== 'income') {
        setCategoryId(defaultIncomeCatId);
      }
    } else {
      const currentCat = data.categories.find((c) => c.id === categoryId);
      if (!currentCat || currentCat.group === 'income') {
        setCategoryId(defaultExpenseCatId);
      }
    }
  };

  const handleAmountBlur = () => {
    if (hasMathOperator && evaluatedAmount !== null && evaluatedAmount > 0) {
      setAmountExpr(String(evaluatedAmount));
    }
  };

  const handleAddTag = (raw: string) => {
    const cleaned = raw.replace(/^#/, '').trim().toLowerCase();
    if (!cleaned) return;
    setTags((prev) => (prev.includes(cleaned) ? prev : [...prev, cleaned]));
    setTagInput('');
  };

  const totalAmount = evaluatedAmount !== null ? Math.abs(evaluatedAmount) : 0;
  const splitSum = useMemo(
    () => Math.round(splits.reduce((sum, s) => sum + (Number(s.amount) || 0), 0) * 100) / 100,
    [splits]
  );
  const splitRemaining = Math.round((totalAmount - splitSum) * 100) / 100;

  const toggleSplitMode = () => {
    if (!splitEnabled) {
      const secondCat =
        data.categories.find((c) => c.id !== categoryId && c.group !== 'income')?.id ??
        categoryId;
      const half = totalAmount > 0 ? Math.round((totalAmount / 2) * 100) / 100 : 0;
      const rem = totalAmount > 0 ? Math.round((totalAmount - half) * 100) / 100 : 0;
      setSplits([
        { id: `sp_${Date.now()}_1`, categoryId: categoryId || defaultExpenseCatId, amount: half },
        { id: `sp_${Date.now()}_2`, categoryId: secondCat || defaultExpenseCatId, amount: rem },
      ]);
      setSplitEnabled(true);
    } else {
      setSplitEnabled(false);
    }
  };

  const addSplitRow = () => {
    const rem = Math.max(0, splitRemaining);
    setSplits((prev) => [
      ...prev,
      { id: `sp_${Date.now()}_${prev.length}`, categoryId: defaultExpenseCatId, amount: rem },
    ]);
  };

  const splitEvenly = () => {
    if (splits.length === 0 || totalAmount <= 0) return;
    const base = Math.floor((totalAmount / splits.length) * 100) / 100;
    const remainder = Math.round((totalAmount - base * splits.length) * 100) / 100;
    setSplits((prev) =>
      prev.map((s, idx) => ({
        ...s,
        amount: idx === prev.length - 1 ? Math.round((base + remainder) * 100) / 100 : base,
      }))
    );
  };

  const fillRemainderOnLast = () => {
    if (splits.length === 0) return;
    setSplits((prev) => {
      const others = prev.slice(0, -1).reduce((s, r) => s + (Number(r.amount) || 0), 0);
      const lastAmt = Math.max(0, Math.round((totalAmount - others) * 100) / 100);
      return prev.map((r, i) => (i === prev.length - 1 ? { ...r, amount: lastAmt } : r));
    });
  };

  const handleReceiptFile = async (file: File) => {
    setUploadingReceipt(true);
    try {
      const saved = await saveReceiptAttachment(file);
      setReceipt(saved);
      const url = await loadReceiptDataUrl(saved);
      setReceiptPreview(url);
    } catch {
      showToast('Failed to attach receipt image', 'error');
    } finally {
      setUploadingReceipt(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (totalAmount <= 0) {
      showToast('Enter a valid amount greater than zero', 'error');
      return;
    }
    if (!accountId) {
      showToast('Please select an account', 'error');
      return;
    }
    if (type === 'transfer') {
      if (!transferAccountId || transferAccountId === accountId) {
        showToast('Choose a different destination account for the transfer', 'error');
        return;
      }
    }
    if (splitEnabled && type !== 'transfer') {
      if (splits.length < 2) {
        showToast('Add at least two split rows or disable split mode', 'error');
        return;
      }
      if (Math.abs(splitRemaining) > 0.01) {
        showToast(
          `Split amounts must equal ${formatMoney(totalAmount, targetCurrency)} (${formatMoney(splitRemaining, targetCurrency)} remaining)`,
          'error'
        );
        return;
      }
    }

    const finalTags = tagInput.trim()
      ? Array.from(new Set([...tags, tagInput.replace(/^#/, '').trim().toLowerCase()]))
      : tags;

    const finalPayee =
      payee.trim() ||
      (type === 'transfer'
        ? `Transfer to ${activeAccounts.find((a) => a.id === transferAccountId)?.name ?? 'Account'}`
        : 'Untitled Transaction');

    const payload = {
      date,
      type,
      amount: totalAmount,
      accountId,
      transferAccountId: type === 'transfer' ? transferAccountId : undefined,
      payee: finalPayee,
      categoryId:
        type === 'transfer'
          ? 'cat_transfer'
          : splitEnabled && splits[0]
            ? splits[0].categoryId
            : categoryId || defaultExpenseCatId,
      splits: splitEnabled && type !== 'transfer' ? splits : undefined,
      tags: finalTags,
      notes: notes.trim(),
      reviewed,
      receipt,
    };

    if (editingTx) {
      updateTransaction(editingTx.id, payload);
    } else {
      addTransaction(payload);
    }
    closeQuickAdd();
  };

  const activeTypeMeta = TYPE_OPTIONS.find((t) => t.value === type)!;
  const fxMeta = CURRENCY_METADATA[fxCurrency];

  return (
    <Modal
      open={open}
      onClose={closeQuickAdd}
      title={editingTx ? 'Edit Transaction' : 'Quick Add Transaction'}
      subtitle={
        editingTx
          ? `Editing entry from ${editingTx.date}`
          : 'Type naturally below or fill the fields directly'
      }
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSubmit} className="p-5 space-y-5">
        {/* Natural Language Quick-Add Bar */}
        {!editingTx && (
          <div
            className="rounded-xl border p-3"
            style={{
              background: 'var(--accent-primary-soft)',
              borderColor: 'var(--border-strong)',
            }}
          >
            <div className="flex items-center gap-2">
              <Sparkles
                className="w-4 h-4 shrink-0"
                style={{ color: 'var(--accent-primary-text)' }}
                aria-hidden="true"
              />
              <input
                type="text"
                aria-label="Natural language transaction entry"
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyNaturalLanguage();
                  }
                }}
                placeholder='Try: "Starbucks 6.75 dining #coffee" or "refund Amazon 29.99 shopping"'
                className="flex-1 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] rounded-md px-1 py-0.5"
                autoFocus
              />
              <button
                type="button"
                onClick={applyNaturalLanguage}
                disabled={!nlText.trim()}
                className="tactile-btn-primary px-3 py-1 rounded-lg disabled:opacity-40 text-xs font-semibold cursor-pointer shrink-0"
              >
                Parse
              </button>
            </div>
            {nlPreview && (
              <div className="mt-2 pt-2 border-t border-[var(--border-hairline)] flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-[var(--text-muted)]">Preview:</span>
                <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)] font-medium capitalize">
                  {nlPreview.type}
                </span>
                {nlPreview.payee && (
                  <span className="px-1.5 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-[var(--text-primary)]">
                    Payee: <strong>{nlPreview.payee}</strong>
                  </span>
                )}
                {nlPreview.amount !== null && (
                  <span
                    className="px-1.5 py-0.5 rounded font-semibold tabular-nums"
                    style={{
                      background: 'var(--accent-positive-soft)',
                      color: 'var(--accent-positive)',
                    }}
                  >
                    {formatMoney(nlPreview.amount, targetCurrency)}
                  </span>
                )}
                {nlPreview.categoryId && (
                  <span
                    className="px-1.5 py-0.5 rounded font-medium"
                    style={{
                      background: 'var(--accent-primary-soft)',
                      color: 'var(--accent-primary-text)',
                    }}
                  >
                    {data.categories.find((c) => c.id === nlPreview.categoryId)?.name}
                  </span>
                )}
                {nlPreview.tags.map((tg) => (
                  <span
                    key={tg}
                    className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] text-[var(--text-secondary)]"
                  >
                    #{tg}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Type Switcher */}
        <div className="space-y-1.5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2" role="group" aria-label="Transaction type">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  aria-pressed={selected}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    selected
                      ? ''
                      : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)]'
                  }`}
                  style={
                    selected
                      ? {
                          background: opt.accentBg,
                          borderColor: opt.accentColor,
                          color: opt.accentColor,
                        }
                      : undefined
                  }
                >
                  <Icon className="w-3.5 h-3.5" aria-hidden="true" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-[var(--text-muted)] px-0.5">
            {activeTypeMeta.hint}
          </p>
        </div>

        {/* Amount + Date Row */}
        <div className="space-y-3">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <div className="flex items-center justify-between gap-2 mb-1">
                <label
                  htmlFor="quickadd-amount"
                  className="text-xs font-medium text-[var(--text-secondary)]"
                >
                  Amount ({targetCurrency})
                </label>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setFxOpen((v) => !v)}
                    aria-expanded={fxOpen}
                    aria-controls="quickadd-fx-converter"
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold transition-colors cursor-pointer"
                    style={
                      fxOpen
                        ? {
                            background: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary-text)',
                          }
                        : {
                            background: 'var(--bg-subtle)',
                            color: 'var(--text-secondary)',
                          }
                    }
                  >
                    <Globe className="w-3 h-3" aria-hidden="true" />
                    <span>Convert foreign currency</span>
                  </button>
                </div>
              </div>
              <div className="relative">
                <input
                  id="quickadd-amount"
                  type="text"
                  inputMode="decimal"
                  value={amountExpr}
                  onChange={(e) => setAmountExpr(e.target.value)}
                  onBlur={handleAmountBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && hasMathOperator && evaluatedAmount !== null) {
                      e.preventDefault();
                      setAmountExpr(String(evaluatedAmount));
                    }
                  }}
                  placeholder="0.00 or 24.50 + 8.75"
                  required
                  className="tactile-input w-full px-3.5 py-2.5 text-base font-semibold tabular-nums focus:border-[var(--accent-primary)]"
                />
                {hasMathOperator && evaluatedAmount !== null && (
                  <button
                    type="button"
                    onClick={() => setAmountExpr(String(evaluatedAmount))}
                    className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg text-xs font-semibold tabular-nums cursor-pointer"
                    style={{
                      background: 'var(--accent-positive-soft)',
                      color: 'var(--accent-positive)',
                    }}
                    title="Click to apply evaluated total"
                  >
                    = {formatMoney(Math.abs(evaluatedAmount), targetCurrency)}
                  </button>
                )}
              </div>
              <div className="mt-1 flex items-center gap-1 text-[10px] text-[var(--text-muted)]">
                <Calculator className="w-3 h-3 shrink-0" aria-hidden="true" />
                <span>Supports inline math (e.g. 24.50 + 8.75)</span>
              </div>
            </div>

            <div>
              <label
                htmlFor="quickadd-date"
                className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
              >
                Date
              </label>
              <input
                id="quickadd-date"
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                required
                className="tactile-input w-full px-3.5 py-2.5 text-sm tabular-nums focus:border-[var(--accent-primary)]"
              />
            </div>
          </div>

          {/* Inline Foreign Currency Converter Drawer */}
          {fxOpen && (
            <div
              id="quickadd-fx-converter"
              className="tactile-well p-3.5 space-y-3"
              aria-label="Inline Foreign Currency Converter"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-1.5 text-xs font-semibold text-[var(--text-primary)]">
                  <Globe
                    className="w-3.5 h-3.5"
                    style={{ color: 'var(--accent-primary-text)' }}
                    aria-hidden="true"
                  />
                  <span>Offline Currency Converter → {targetCurrency}</span>
                </div>
                <span className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums">
                  1 {fxCurrency} = {formatRateDisplay(fxUnitRate)} {targetCurrency}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] gap-2.5 items-end">
                <div>
                  <label
                    htmlFor="quickadd-fx-currency"
                    className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Foreign Currency
                  </label>
                  <select
                    id="quickadd-fx-currency"
                    value={fxCurrency}
                    onChange={(e) => setFxCurrency(e.target.value as CurrencyCode)}
                    className="tactile-input w-full px-2.5 py-2 text-xs font-medium cursor-pointer focus:border-[var(--accent-primary)]"
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

                <div>
                  <label
                    htmlFor="quickadd-fx-amount"
                    className="block text-[11px] font-medium text-[var(--text-secondary)] mb-1"
                  >
                    Foreign Amount ({fxCurrency})
                  </label>
                  <div className="relative">
                    <span
                      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)] tabular-nums"
                      aria-hidden="true"
                    >
                      {fxMeta.symbol}
                    </span>
                    <input
                      id="quickadd-fx-amount"
                      type="number"
                      inputMode="decimal"
                      step="any"
                      min="0"
                      value={fxAmount}
                      onChange={(e) => setFxAmount(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleApplyConvertedAmount();
                        }
                      }}
                      placeholder="1500.00"
                      className={`tactile-input w-full ${
                        fxMeta.symbol.length > 1 ? 'pl-10' : 'pl-7'
                      } pr-3 py-2 text-xs font-semibold tabular-nums focus:border-[var(--accent-primary)]`}
                    />
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleApplyConvertedAmount}
                  disabled={parsedFxAmount <= 0}
                  className="tactile-btn-primary px-3.5 py-2 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer whitespace-nowrap"
                >
                  Apply converted amount
                </button>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[var(--border-hairline)] text-xs">
                <div className="flex items-baseline gap-2">
                  <span className="text-[11px] text-[var(--text-muted)]">Converted:</span>
                  <span className="text-sm font-bold text-[var(--text-primary)] tabular-nums">
                    {formatMoney(fxConvertedAmount, targetCurrency)}
                  </span>
                </div>
                <span className="text-[11px] text-[var(--text-muted)] tabular-nums">
                  1 {targetCurrency} = {formatRateDisplay(fxInverseRate)} {fxCurrency}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Payee + Account Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="quickadd-payee"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              {type === 'transfer' ? 'Transfer Description' : 'Payee / Merchant'}
            </label>
            <input
              id="quickadd-payee"
              type="text"
              list="vault-payees-datalist"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder={
                type === 'transfer' ? 'e.g. Monthly Savings Transfer' : 'e.g. Trader Joe’s'
              }
              required={type !== 'transfer'}
              className="tactile-input w-full px-3.5 py-2.5 text-sm focus:border-[var(--accent-primary)]"
            />
            <datalist id="vault-payees-datalist">
              {existingPayees.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label
              htmlFor="quickadd-account"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              {type === 'transfer' ? 'From Account' : 'Account'}
            </label>
            <select
              id="quickadd-account"
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="tactile-input w-full px-3.5 py-2.5 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type} · {acc.currency})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Destination Account (Transfer) OR Category + Split Toggle */}
        {type === 'transfer' ? (
          <div>
            <label
              htmlFor="quickadd-transfer-account"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              To Destination Account
            </label>
            <select
              id="quickadd-transfer-account"
              value={transferAccountId}
              onChange={(e) => setTransferAccountId(e.target.value)}
              required
              className="tactile-input w-full px-3.5 py-2.5 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {activeAccounts
                .filter((a) => a.id !== accountId)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type} · {acc.currency})
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <label
                htmlFor="quickadd-category"
                className="text-xs font-medium text-[var(--text-secondary)]"
              >
                Category
              </label>
              <button
                type="button"
                onClick={toggleSplitMode}
                aria-pressed={splitEnabled}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                style={
                  splitEnabled
                    ? {
                        background: 'var(--accent-primary-soft)',
                        color: 'var(--accent-primary-text)',
                      }
                    : {
                        background: 'var(--bg-subtle)',
                        color: 'var(--text-secondary)',
                      }
                }
              >
                <Split className="w-3.5 h-3.5" aria-hidden="true" />
                <span>{splitEnabled ? 'Disable Split' : 'Split across categories'}</span>
              </button>
            </div>

            {!splitEnabled ? (
              <select
                id="quickadd-category"
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="tactile-input w-full px-3.5 py-2.5 text-sm cursor-pointer focus:border-[var(--accent-primary)]"
              >
                {(['needs', 'wants', 'savings', 'income'] as const).map((grp) => {
                  const groupCats = data.categories.filter((c) => c.group === grp);
                  if (groupCats.length === 0) return null;
                  return (
                    <optgroup key={grp} label={grp.toUpperCase()}>
                      {groupCats.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))}
                    </optgroup>
                  );
                })}
              </select>
            ) : (
              <div className="tactile-well p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className="font-semibold tabular-nums"
                    style={{
                      color:
                        Math.abs(splitRemaining) <= 0.01
                          ? 'var(--accent-positive)'
                          : 'var(--accent-warning)',
                    }}
                  >
                    {Math.abs(splitRemaining) <= 0.01
                      ? 'Balanced ✓'
                      : `Remaining: ${formatMoney(splitRemaining, targetCurrency)}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={splitEvenly}
                      className="tactile-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer"
                    >
                      Split Evenly
                    </button>
                    <button
                      type="button"
                      onClick={fillRemainderOnLast}
                      className="tactile-btn px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer"
                    >
                      Fill Remainder
                    </button>
                    <button
                      type="button"
                      onClick={addSplitRow}
                      className="tactile-btn-primary inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer"
                    >
                      <Plus className="w-3 h-3" aria-hidden="true" />
                      <span>Add Row</span>
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {splits.map((row, idx) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        aria-label={`Split row ${idx + 1} category`}
                        value={row.categoryId}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, categoryId: e.target.value } : r
                            )
                          )
                        }
                        className="tactile-input col-span-5 px-2.5 py-1.5 text-xs cursor-pointer"
                      >
                        {data.categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name}
                          </option>
                        ))}
                      </select>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        aria-label={`Split row ${idx + 1} amount`}
                        value={row.amount || ''}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, amount: Number(e.target.value) || 0 } : r
                            )
                          )
                        }
                        placeholder="0.00"
                        className="tactile-input col-span-3 px-2.5 py-1.5 text-xs tabular-nums"
                      />
                      <input
                        type="text"
                        aria-label={`Split row ${idx + 1} note`}
                        value={row.note ?? ''}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r))
                          )
                        }
                        placeholder="Optional note"
                        className="tactile-input col-span-3 px-2.5 py-1.5 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={splits.length <= 2}
                        className="col-span-1 flex justify-center p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] disabled:opacity-30 transition-colors cursor-pointer"
                        aria-label={`Remove split row ${idx + 1}`}
                        title="Remove split row"
                      >
                        <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tags + Notes */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label
              htmlFor="quickadd-tags-input"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Tags
            </label>
            <div className="tactile-input px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 min-h-[42px]">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium"
                  style={{
                    background: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary-text)',
                  }}
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((item) => item !== t))}
                    aria-label={`Remove tag ${t}`}
                    className="hover:opacity-75 cursor-pointer rounded"
                  >
                    <X className="w-3 h-3" aria-hidden="true" />
                  </button>
                </span>
              ))}
              <input
                id="quickadd-tags-input"
                type="text"
                value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ',') {
                    e.preventDefault();
                    handleAddTag(tagInput);
                  } else if (e.key === 'Backspace' && !tagInput && tags.length > 0) {
                    setTags((prev) => prev.slice(0, -1));
                  }
                }}
                onBlur={() => {
                  if (tagInput.trim()) handleAddTag(tagInput);
                }}
                placeholder={tags.length === 0 ? 'Add tag + Enter...' : 'Add...'}
                className="flex-1 min-w-[80px] bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] py-1"
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="quickadd-notes"
              className="block text-xs font-medium text-[var(--text-secondary)] mb-1"
            >
              Notes
            </label>
            <input
              id="quickadd-notes"
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional memo or reference..."
              className="tactile-input w-full px-3.5 py-2.5 text-sm focus:border-[var(--accent-primary)]"
            />
          </div>
        </div>

        {/* Receipt Attachment */}
        <div>
          <span className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
            Local Receipt Attachment
          </span>
          {receipt ? (
            <div className="tactile-well flex items-center justify-between gap-3 p-3">
              <div className="flex items-center gap-3 min-w-0">
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt={receipt.name}
                    className="w-12 h-12 rounded-lg object-cover border border-[var(--border-hairline)] shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5 text-[var(--text-muted)]" aria-hidden="true" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                    {receipt.name}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                    {(receipt.sizeBytes / 1024).toFixed(1)} KB · Stored locally
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setReceipt(undefined);
                  setReceiptPreview(null);
                }}
                className="px-2.5 py-1 rounded-lg text-xs font-semibold transition-colors cursor-pointer hover:bg-[var(--accent-danger-soft)]"
                style={{ color: 'var(--accent-danger)' }}
              >
                Remove
              </button>
            </div>
          ) : (
            <div
              role="button"
              tabIndex={0}
              aria-label="Upload receipt image"
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0];
                if (file) handleReceiptFile(file);
              }}
              onClick={() => fileInputRef.current?.click()}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  fileInputRef.current?.click();
                }
              }}
              className="rounded-xl border border-dashed px-4 py-3.5 text-center cursor-pointer transition-colors"
              style={
                dragOver
                  ? {
                      borderColor: 'var(--accent-primary)',
                      background: 'var(--accent-primary-soft)',
                    }
                  : {
                      borderColor: 'var(--border-strong)',
                      background: 'var(--bg-subtle)',
                    }
              }
            >
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) handleReceiptFile(file);
                  e.target.value = '';
                }}
              />
              <div className="flex items-center justify-center gap-2 text-xs text-[var(--text-secondary)]">
                <Paperclip className="w-4 h-4 text-[var(--text-muted)]" aria-hidden="true" />
                <span>
                  {uploadingReceipt
                    ? 'Saving receipt locally...'
                    : 'Drop receipt image here or click to browse'}
                </span>
              </div>
            </div>
          )}
        </div>

        {/* Footer Controls */}
        <div className="pt-3 border-t border-[var(--border-hairline)] flex flex-wrap items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              className="rounded border-[var(--border-strong)] accent-[var(--accent-primary)]"
            />
            <span>Mark as reviewed (skip inbox)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeQuickAdd}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              {editingTx ? (
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
              ) : (
                <TagIcon className="w-3.5 h-3.5" aria-hidden="true" />
              )}
              <span>{editingTx ? 'Save Changes' : 'Add Transaction'}</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
