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
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { evaluateAmountExpression, parseQuickExpenseInput } from '../core/quickParse';
import { loadReceiptDataUrl, saveReceiptAttachment } from '../core/storage';
import type { ReceiptAttachment, TransactionSplit, TransactionType } from '../types/finance';
import { Modal, formatMoney, todayIso } from './ui';

const TYPE_OPTIONS: Array<{
  value: TransactionType;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
  hint: string;
  activeClass: string;
}> = [
  {
    value: 'expense',
    label: 'Expense',
    icon: TrendingDown,
    hint: 'Tracks spending against your monthly category budgets.',
    activeClass: 'bg-rose-500/12 border-rose-500/40 text-rose-700 dark:text-rose-300',
  },
  {
    value: 'income',
    label: 'Income',
    icon: TrendingUp,
    hint: 'Adds to net cashflow and powers your Sankey income pool.',
    activeClass: 'bg-emerald-500/12 border-emerald-500/40 text-emerald-700 dark:text-emerald-300',
  },
  {
    value: 'transfer',
    label: 'Transfer',
    icon: ArrowRightLeft,
    hint: 'Moves balances between accounts without inflating income or expenses.',
    activeClass: 'bg-indigo-500/12 border-indigo-500/40 text-indigo-700 dark:text-indigo-300',
  },
  {
    value: 'refund',
    label: 'Refund',
    icon: RotateCcw,
    hint: 'Refunds credit back your expense category cleanly instead of counting as income.',
    activeClass: 'bg-amber-500/12 border-amber-500/40 text-amber-700 dark:text-amber-300',
  },
];

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

  const currency = data.settings.baseCurrency;
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

  const [splitEnabled, setSplitEnabled] = useState(false);
  const [splits, setSplits] = useState<TransactionSplit[]>([]);

  const [receipt, setReceipt] = useState<ReceiptAttachment | undefined>(undefined);
  const [receiptPreview, setReceiptPreview] = useState<string | null>(null);
  const [uploadingReceipt, setUploadingReceipt] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const fileInputRef = useRef<HTMLInputElement>(null);

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
    if (editingTx) {
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
      setNlText('');
      setType('expense');
      setAmountExpr('');
      setPayee('');
      setDate(todayIso());
      setAccountId(activeAccounts[0]?.id ?? '');
      setTransferAccountId(activeAccounts[1]?.id ?? activeAccounts[0]?.id ?? '');
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
  }, [open, editingTx, activeAccounts, defaultExpenseCatId]);

  const evaluatedAmount = useMemo(() => evaluateAmountExpression(amountExpr), [amountExpr]);
  const hasMathOperator = useMemo(() => /[+\-*/()]/.test(amountExpr.trim()), [amountExpr]);

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
          `Split amounts must equal ${formatMoney(totalAmount, currency)} (${formatMoney(splitRemaining, currency)} remaining)`,
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
          <div className="rounded-xl bg-indigo-500/8 dark:bg-indigo-500/10 border border-indigo-500/25 p-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500 shrink-0" />
              <input
                type="text"
                value={nlText}
                onChange={(e) => setNlText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    applyNaturalLanguage();
                  }
                }}
                placeholder='Try: "Starbucks 6.75 dining #coffee" or "refund Amazon 29.99 shopping"'
                className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 dark:placeholder-slate-500 outline-none"
                autoFocus
              />
              <button
                type="button"
                onClick={applyNaturalLanguage}
                disabled={!nlText.trim()}
                className="px-3 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-medium transition-colors cursor-pointer shrink-0"
              >
                Parse
              </button>
            </div>
            {nlPreview && (
              <div className="mt-2 pt-2 border-t border-indigo-500/15 flex flex-wrap items-center gap-1.5 text-[11px]">
                <span className="text-slate-500 dark:text-slate-400">Preview:</span>
                <span className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-200 font-medium capitalize">
                  {nlPreview.type}
                </span>
                {nlPreview.payee && (
                  <span className="px-1.5 py-0.5 rounded bg-white/80 dark:bg-slate-900 text-slate-700 dark:text-slate-200">
                    Payee: <strong>{nlPreview.payee}</strong>
                  </span>
                )}
                {nlPreview.amount !== null && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 font-semibold tabular-nums">
                    {formatMoney(nlPreview.amount, currency)}
                  </span>
                )}
                {nlPreview.categoryId && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-700 dark:text-indigo-300">
                    {data.categories.find((c) => c.id === nlPreview.categoryId)?.name}
                  </span>
                )}
                {nlPreview.tags.map((tg) => (
                  <span
                    key={tg}
                    className="px-1.5 py-0.5 rounded bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-300"
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
          <div className="grid grid-cols-4 gap-2">
            {TYPE_OPTIONS.map((opt) => {
              const Icon = opt.icon;
              const selected = type === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => handleTypeChange(opt.value)}
                  className={`flex items-center justify-center gap-1.5 py-2 px-2 rounded-xl border text-xs font-semibold transition-all cursor-pointer ${
                    selected
                      ? opt.activeClass
                      : 'border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  <span>{opt.label}</span>
                </button>
              );
            })}
          </div>
          <p className="text-[11px] text-slate-500 dark:text-slate-400 px-0.5">
            {activeTypeMeta.hint}
          </p>
        </div>

        {/* Amount + Date Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Amount ({currency})
              </label>
              <span className="text-[10px] text-slate-400 flex items-center gap-1">
                <Calculator className="w-3 h-3" />
                Supports math (e.g. 24.50 + 8.75)
              </span>
            </div>
            <div className="relative">
              <input
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
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-3.5 py-2.5 text-base font-semibold tabular-nums text-slate-900 dark:text-white outline-none"
              />
              {hasMathOperator && evaluatedAmount !== null && (
                <button
                  type="button"
                  onClick={() => setAmountExpr(String(evaluatedAmount))}
                  className="absolute right-2 top-1/2 -translate-y-1/2 px-2 py-0.5 rounded-lg bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 text-xs font-semibold tabular-nums cursor-pointer"
                  title="Click to apply evaluated total"
                >
                  = {formatMoney(Math.abs(evaluatedAmount), currency)}
                </button>
              )}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>

        {/* Payee + Account Row */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {type === 'transfer' ? 'Transfer Description' : 'Payee / Merchant'}
            </label>
            <input
              type="text"
              list="vault-payees-datalist"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              placeholder={type === 'transfer' ? 'e.g. Monthly Savings Transfer' : 'e.g. Trader Joe’s'}
              required={type !== 'transfer'}
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            />
            <datalist id="vault-payees-datalist">
              {existingPayees.map((p) => (
                <option key={p} value={p} />
              ))}
            </datalist>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              {type === 'transfer' ? 'From Account' : 'Account'}
            </label>
            <select
              value={accountId}
              onChange={(e) => setAccountId(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              {activeAccounts.map((acc) => (
                <option key={acc.id} value={acc.id}>
                  {acc.name} ({acc.type})
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Destination Account (Transfer) OR Category + Split Toggle */}
        {type === 'transfer' ? (
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              To Destination Account
            </label>
            <select
              value={transferAccountId}
              onChange={(e) => setTransferAccountId(e.target.value)}
              required
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            >
              {activeAccounts
                .filter((a) => a.id !== accountId)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} ({acc.type})
                  </option>
                ))}
            </select>
          </div>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-medium text-slate-600 dark:text-slate-400">
                Category
              </label>
              <button
                type="button"
                onClick={toggleSplitMode}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  splitEnabled
                    ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                <Split className="w-3.5 h-3.5" />
                <span>{splitEnabled ? 'Disable Split' : 'Split across categories'}</span>
              </button>
            </div>

            {!splitEnabled ? (
              <select
                value={categoryId}
                onChange={(e) => setCategoryId(e.target.value)}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
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
              <div className="rounded-xl bg-slate-50 dark:bg-slate-950/70 border border-slate-200 dark:border-slate-800 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span
                    className={`font-semibold tabular-nums ${
                      Math.abs(splitRemaining) <= 0.01
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-amber-600 dark:text-amber-400'
                    }`}
                  >
                    {Math.abs(splitRemaining) <= 0.01
                      ? 'Balanced ✓'
                      : `Remaining: ${formatMoney(splitRemaining, currency)}`}
                  </span>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={splitEvenly}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Split Evenly
                    </button>
                    <button
                      type="button"
                      onClick={fillRemainderOnLast}
                      className="px-2 py-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-[11px] font-medium hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                    >
                      Fill Remainder
                    </button>
                    <button
                      type="button"
                      onClick={addSplitRow}
                      className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-indigo-600 text-white text-[11px] font-medium hover:bg-indigo-500 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      Add Row
                    </button>
                  </div>
                </div>

                <div className="space-y-2">
                  {splits.map((row, idx) => (
                    <div key={row.id} className="grid grid-cols-12 gap-2 items-center">
                      <select
                        value={row.categoryId}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, categoryId: e.target.value } : r
                            )
                          )
                        }
                        className="col-span-5 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs outline-none"
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
                        value={row.amount || ''}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) =>
                              i === idx ? { ...r, amount: Number(e.target.value) || 0 } : r
                            )
                          )
                        }
                        placeholder="0.00"
                        className="col-span-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs tabular-nums outline-none"
                      />
                      <input
                        type="text"
                        value={row.note ?? ''}
                        onChange={(e) =>
                          setSplits((prev) =>
                            prev.map((r, i) => (i === idx ? { ...r, note: e.target.value } : r))
                          )
                        }
                        placeholder="Optional note"
                        className="col-span-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setSplits((prev) => prev.filter((_, i) => i !== idx))}
                        disabled={splits.length <= 2}
                        className="col-span-1 flex justify-center p-1.5 text-slate-400 hover:text-rose-500 disabled:opacity-30 cursor-pointer"
                        aria-label="Remove split row"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
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
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Tags
            </label>
            <div className="rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 flex flex-wrap items-center gap-1.5 min-h-[42px]">
              {tags.map((t) => (
                <span
                  key={t}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-xs font-medium"
                >
                  #{t}
                  <button
                    type="button"
                    onClick={() => setTags((prev) => prev.filter((item) => item !== t))}
                    className="hover:text-rose-500 cursor-pointer"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
              <input
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
                className="flex-1 min-w-[80px] bg-transparent text-xs text-slate-900 dark:text-white placeholder-slate-400 outline-none py-1"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Notes
            </label>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Optional memo or reference..."
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 focus:border-indigo-500 px-3.5 py-2.5 text-sm text-slate-900 dark:text-white outline-none"
            />
          </div>
        </div>

        {/* Receipt Attachment */}
        <div>
          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
            Local Receipt Attachment
          </label>
          {receipt ? (
            <div className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800">
              <div className="flex items-center gap-3 min-w-0">
                {receiptPreview ? (
                  <img
                    src={receiptPreview}
                    alt={receipt.name}
                    className="w-12 h-12 rounded-lg object-cover border border-slate-200 dark:border-slate-700 shrink-0"
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-200 dark:bg-slate-800 flex items-center justify-center shrink-0">
                    <ImageIcon className="w-5 h-5 text-slate-500" />
                  </div>
                )}
                <div className="min-w-0">
                  <div className="text-xs font-medium text-slate-800 dark:text-slate-200 truncate">
                    {receipt.name}
                  </div>
                  <div className="text-[11px] text-slate-400 tabular-nums">
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
                className="px-2.5 py-1 rounded-lg text-xs text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 cursor-pointer"
              >
                Remove
              </button>
            </div>
          ) : (
            <div
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
              className={`rounded-xl border border-dashed px-4 py-3.5 text-center cursor-pointer transition-colors ${
                dragOver
                  ? 'border-indigo-500 bg-indigo-500/10'
                  : 'border-slate-300 dark:border-slate-700 hover:border-indigo-400 bg-slate-50/50 dark:bg-slate-950/40'
              }`}
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
              <div className="flex items-center justify-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <Paperclip className="w-4 h-4 text-slate-400" />
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
        <div className="pt-3 border-t border-slate-200/80 dark:border-slate-800/80 flex items-center justify-between gap-3">
          <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-400 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={reviewed}
              onChange={(e) => setReviewed(e.target.checked)}
              className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500"
            />
            <span>Mark as reviewed (skip inbox)</span>
          </label>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={closeQuickAdd}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
            >
              {editingTx ? <Check className="w-3.5 h-3.5" /> : <TagIcon className="w-3.5 h-3.5" />}
              <span>{editingTx ? 'Save Changes' : 'Add Transaction'}</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
