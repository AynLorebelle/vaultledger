import React, { useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  Edit3,
  Trash2,
  Paperclip,
  Split,
  RotateCcw,
  Sparkles,
  X,
  Tag,
  Check,
  Filter,
  Plus,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { filterTransactionsByRange } from '../core/analytics';
import { loadReceiptDataUrl } from '../core/storage';
import type { ReceiptAttachment, Transaction } from '../types/finance';
import { CategoryIcon, Modal, Money, formatShortDate } from './ui';

type TxTab = 'all' | 'inbox' | 'expense' | 'income' | 'transfer' | 'refund';

export const TransactionsView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const timeRange = useFinanceStore((s) => s.timeRange);
  const selectedCategoryFilter = useFinanceStore((s) => s.selectedCategoryFilter);
  const selectedDateFilter = useFinanceStore((s) => s.selectedDateFilter);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const drillDownDate = useFinanceStore((s) => s.drillDownDate);
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransactions = useFinanceStore((s) => s.deleteTransactions);
  const bulkUpdateTransactions = useFinanceStore((s) => s.bulkUpdateTransactions);
  const addRule = useFinanceStore((s) => s.addRule);
  const showToast = useFinanceStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<TxTab>('all');
  const [search, setSearch] = useState('');
  const [accountFilter, setAccountFilter] = useState('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [receiptModal, setReceiptModal] = useState<{
    receipt: ReceiptAttachment;
    payee: string;
    url: string | null;
  } | null>(null);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  const accountMap = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a])),
    [data.accounts]
  );
  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories]
  );

  const unreviewedCount = useMemo(
    () => data.transactions.filter((t) => !t.reviewed).length,
    [data.transactions]
  );

  const effectiveCategoryFilter = selectedCategoryFilter || localCategoryFilter;

  const filteredTransactions = useMemo(() => {
    // If drilling down to a specific date or viewing Inbox, search across all dates so items aren't hidden by range
    const baseList =
      selectedDateFilter || activeTab === 'inbox'
        ? data.transactions
        : filterTransactionsByRange(data.transactions, timeRange);

    const q = search.trim().toLowerCase();

    return baseList
      .filter((tx) => {
        if (activeTab === 'inbox' && tx.reviewed) return false;
        if (activeTab === 'expense' && tx.type !== 'expense') return false;
        if (activeTab === 'income' && tx.type !== 'income') return false;
        if (activeTab === 'transfer' && tx.type !== 'transfer') return false;
        if (activeTab === 'refund' && tx.type !== 'refund') return false;

        if (selectedDateFilter && tx.date !== selectedDateFilter) return false;

        if (accountFilter && tx.accountId !== accountFilter && tx.transferAccountId !== accountFilter) {
          return false;
        }

        if (effectiveCategoryFilter) {
          const matchesPrimary = tx.categoryId === effectiveCategoryFilter;
          const matchesSplit = Boolean(
            tx.splits?.some((sp) => sp.categoryId === effectiveCategoryFilter)
          );
          if (!matchesPrimary && !matchesSplit) return false;
        }

        if (q) {
          const catName = categoryMap.get(tx.categoryId)?.name.toLowerCase() ?? '';
          const accName = accountMap.get(tx.accountId)?.name.toLowerCase() ?? '';
          const haystack = `${tx.payee} ${tx.notes} ${tx.tags.join(' ')} ${catName} ${accName} ${tx.amount} ${tx.date}`.toLowerCase();
          if (!haystack.includes(q)) return false;
        }

        return true;
      })
      .sort((a, b) => b.date.localeCompare(a.date) || b.createdAt.localeCompare(a.createdAt));
  }, [
    data.transactions,
    timeRange,
    activeTab,
    selectedDateFilter,
    accountFilter,
    effectiveCategoryFilter,
    search,
    categoryMap,
    accountMap,
  ]);

  const allVisibleSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((t) => selectedIds.has(t.id));

  const toggleSelectAll = () => {
    if (allVisibleSelected) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const toggleRow = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkReview = () => {
    const ids = Array.from(selectedIds);
    bulkUpdateTransactions(ids, { reviewed: true });
    setSelectedIds(new Set());
  };

  const handleBulkCategory = (catId: string) => {
    if (!catId) return;
    const ids = Array.from(selectedIds);
    bulkUpdateTransactions(ids, { categoryId: catId });
    setSelectedIds(new Set());
  };

  const handleBulkAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = bulkTagInput.replace(/^#/, '').trim().toLowerCase();
    if (!cleaned) return;
    const ids = Array.from(selectedIds);
    bulkUpdateTransactions(ids, { addTags: [cleaned] });
    setBulkTagInput('');
    setSelectedIds(new Set());
    showToast(`Added #${cleaned} to ${ids.length} transactions`, 'success');
  };

  const handleBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (window.confirm(`Delete ${ids.length} selected transaction(s)? You can still Undo with Ctrl+Z.`)) {
      deleteTransactions(ids);
      setSelectedIds(new Set());
    }
  };

  const handleQuickCreateRule = (tx: Transaction) => {
    const cat = categoryMap.get(tx.categoryId);
    addRule({
      name: `${tx.payee} → ${cat?.name ?? 'Category'}`,
      enabled: true,
      matchField: 'payee',
      matchType: 'contains',
      pattern: tx.payee,
      assignCategoryId: tx.categoryId,
      markReviewed: true,
      priority: (data.rules.length + 1) * 10,
    });
  };

  const openReceiptPreview = async (tx: Transaction) => {
    if (!tx.receipt) return;
    setReceiptModal({ receipt: tx.receipt, payee: tx.payee, url: null });
    const url = await loadReceiptDataUrl(tx.receipt);
    setReceiptModal((cur) => (cur ? { ...cur, url } : null));
  };

  const tabs: Array<{ id: TxTab; label: string; count?: number }> = [
    { id: 'all', label: 'All Transactions' },
    { id: 'inbox', label: 'Inbox to Review', count: unreviewedCount },
    { id: 'expense', label: 'Expenses' },
    { id: 'income', label: 'Income' },
    { id: 'transfer', label: 'Transfers' },
    { id: 'refund', label: 'Refunds' },
  ];

  return (
    <div className="space-y-5 pb-16">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Transactions Ledger
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {filteredTransactions.length} matching{' '}
            {filteredTransactions.length === 1 ? 'entry' : 'entries'}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-all cursor-pointer ${
                  active
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums ${
                      active
                        ? 'bg-white/20 text-white'
                        : 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                    }`}
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Active Drill-Down Chips */}
      {(selectedCategoryFilter || selectedDateFilter) && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" />
            Active drill-down:
          </span>
          {selectedCategoryFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              Category: {categoryMap.get(selectedCategoryFilter)?.name ?? selectedCategoryFilter}
              <button
                type="button"
                onClick={() => drillDownCategory(null)}
                className="hover:text-rose-500 cursor-pointer"
                aria-label="Clear category filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
          {selectedDateFilter && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/15 border border-indigo-500/30 text-indigo-700 dark:text-indigo-300 text-xs font-semibold">
              Date: {formatShortDate(selectedDateFilter)}
              <button
                type="button"
                onClick={() => drillDownDate(null)}
                className="hover:text-rose-500 cursor-pointer"
                aria-label="Clear date filter"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payee, notes, #tags, category, or amount..."
            className="w-full rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 pl-10 pr-8 py-2.5 text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none focus:border-indigo-500"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 p-1 text-slate-400 hover:text-slate-600 cursor-pointer"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Filter by account"
          className="md:col-span-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="">All Accounts</option>
          {data.accounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name}
            </option>
          ))}
        </select>

        <select
          value={effectiveCategoryFilter}
          onChange={(e) => {
            if (selectedCategoryFilter) drillDownCategory(null);
            setLocalCategoryFilter(e.target.value);
          }}
          aria-label="Filter by category"
          className="md:col-span-3 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none focus:border-indigo-500"
        >
          <option value="">All Categories</option>
          {data.categories.map((cat) => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>
      </div>

      {/* Ledger Table */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-slate-200/80 dark:border-slate-800/80 bg-slate-50/80 dark:bg-slate-950/60 text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
                <th className="py-3 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible transactions"
                    className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                  />
                </th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Payee &amp; Details</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Account</th>
                <th className="py-3 px-3 text-right">Amount</th>
                <th className="py-3 pl-2 pr-4 text-right w-32">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/70 text-sm">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 text-center">
                    <p className="text-sm font-medium text-slate-600 dark:text-slate-300">
                      {activeTab === 'inbox'
                        ? 'Inbox Zero! All transactions are reviewed.'
                        : 'No transactions match your current filters.'}
                    </p>
                    <button
                      type="button"
                      onClick={() => openQuickAdd()}
                      className="mt-3 inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Add Transaction
                    </button>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const cat = categoryMap.get(tx.categoryId);
                  const acc = accountMap.get(tx.accountId);
                  const destAcc = tx.transferAccountId ? accountMap.get(tx.transferAccountId) : null;
                  const checked = selectedIds.has(tx.id);
                  const hasSplits = Boolean(tx.splits && tx.splits.length > 0);
                  const signedVal =
                    tx.type === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount);

                  return (
                    <tr
                      key={tx.id}
                      className={`group transition-colors ${
                        checked
                          ? 'bg-indigo-500/8 dark:bg-indigo-500/12'
                          : 'hover:bg-slate-50/90 dark:hover:bg-slate-800/40'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleRow(tx.id)}
                          aria-label={`Select ${tx.payee}`}
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600 focus:ring-indigo-500 cursor-pointer"
                        />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-500 dark:text-slate-400 tabular-nums">
                        {tx.date}
                      </td>
                      <td className="py-3 px-3 max-w-[300px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!tx.reviewed && (
                            <span
                              className="w-2 h-2 rounded-full bg-amber-500 shrink-0"
                              title="Unreviewed in Inbox"
                            />
                          )}
                          <span className="font-medium text-slate-900 dark:text-slate-100 truncate">
                            {tx.payee}
                          </span>
                          {hasSplits && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 text-[10px] font-semibold">
                              <Split className="w-2.5 h-2.5" />
                              Split ({tx.splits!.length})
                            </span>
                          )}
                          {tx.type === 'refund' && (
                            <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-500/15 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                              <RotateCcw className="w-2.5 h-2.5" />
                              Refund Offset
                            </span>
                          )}
                          {tx.receipt && (
                            <button
                              type="button"
                              onClick={() => openReceiptPreview(tx)}
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 hover:bg-indigo-500/15 text-slate-600 dark:text-slate-300 hover:text-indigo-600 text-[10px] font-medium cursor-pointer"
                              title={`View receipt: ${tx.receipt.name}`}
                            >
                              <Paperclip className="w-2.5 h-2.5" />
                              Receipt
                            </button>
                          )}
                        </div>
                        {(tx.notes || tx.tags.length > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-slate-400">
                            {tx.notes && <span className="truncate max-w-[200px]">{tx.notes}</span>}
                            {tx.tags.map((tg) => (
                              <span
                                key={tg}
                                className="px-1.5 py-0.2 rounded bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400"
                              >
                                #{tg}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {tx.type === 'transfer' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-xs font-medium">
                            Transfer
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${cat?.color ?? '#64748b'}18`,
                              color: cat?.color ?? '#64748b',
                            }}
                          >
                            <CategoryIcon icon={cat?.icon} className="w-3 h-3" />
                            <span>{cat?.name ?? 'Uncategorized'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-slate-600 dark:text-slate-400">
                        {acc?.name ?? 'Account'}
                        {destAcc ? ` → ${destAcc.name}` : ''}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-right">
                        <Money
                          amount={tx.type === 'transfer' ? tx.amount : signedVal}
                          currency={acc?.currency ?? currency}
                          privacyMask={privacyMask}
                          showSign={tx.type !== 'transfer'}
                          className={`font-semibold text-sm ${
                            tx.type === 'income'
                              ? 'text-emerald-600 dark:text-emerald-400'
                              : tx.type === 'refund'
                              ? 'text-amber-600 dark:text-amber-400'
                              : tx.type === 'transfer'
                              ? 'text-indigo-600 dark:text-indigo-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        />
                      </td>
                      <td className="py-3 pl-2 pr-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1 opacity-75 group-hover:opacity-100 transition-opacity">
                          {!tx.reviewed && (
                            <button
                              type="button"
                              onClick={() => updateTransaction(tx.id, { reviewed: true })}
                              className="p-1.5 rounded-lg text-emerald-600 hover:bg-emerald-500/15 cursor-pointer"
                              title="Mark as reviewed"
                            >
                              <CheckCircle2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                          {tx.type !== 'transfer' && (
                            <button
                              type="button"
                              onClick={() => handleQuickCreateRule(tx)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-indigo-500 hover:bg-indigo-500/10 cursor-pointer"
                              title="1-click Create Rule for this payee"
                            >
                              <Sparkles className="w-3.5 h-3.5" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openQuickAdd(tx.id)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                            title="Edit transaction"
                          >
                            <Edit3 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => deleteTransactions([tx.id])}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                            title="Delete transaction"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Floating Bulk Action Bar */}
      {selectedIds.size > 0 && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[95vw] rounded-2xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-700/90 shadow-2xl px-4 py-2.5 flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold tabular-nums px-2 py-0.5 rounded-lg bg-indigo-600">
            {selectedIds.size} selected
          </span>

          <button
            type="button"
            onClick={handleBulkReview}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-emerald-600/20 hover:bg-emerald-600/35 text-emerald-300 text-xs font-medium cursor-pointer"
          >
            <Check className="w-3.5 h-3.5" />
            Mark Reviewed
          </button>

          <select
            defaultValue=""
            onChange={(e) => {
              handleBulkCategory(e.target.value);
              e.target.value = '';
            }}
            aria-label="Bulk change category"
            className="rounded-lg bg-slate-800 border border-slate-700 px-2.5 py-1.5 text-xs text-slate-200 outline-none"
          >
            <option value="" disabled>
              Change Category...
            </option>
            {data.categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          <form onSubmit={handleBulkAddTag} className="flex items-center gap-1">
            <Tag className="w-3.5 h-3.5 text-slate-400" />
            <input
              type="text"
              value={bulkTagInput}
              onChange={(e) => setBulkTagInput(e.target.value)}
              placeholder="Add tag..."
              className="w-24 rounded-lg bg-slate-800 border border-slate-700 px-2 py-1 text-xs text-white placeholder-slate-400 outline-none"
            />
          </form>

          <button
            type="button"
            onClick={handleBulkDelete}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/35 text-rose-300 text-xs font-medium cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            Delete
          </button>

          <button
            type="button"
            onClick={() => setSelectedIds(new Set())}
            className="p-1 text-slate-400 hover:text-white cursor-pointer"
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Receipt Preview Modal */}
      <Modal
        open={Boolean(receiptModal)}
        onClose={() => setReceiptModal(null)}
        title={receiptModal ? `Receipt · ${receiptModal.payee}` : 'Receipt'}
        subtitle={receiptModal?.receipt.name}
        maxWidthClass="max-w-lg"
      >
        <div className="p-5 flex flex-col items-center justify-center min-h-[240px]">
          {receiptModal?.url ? (
            <img
              src={receiptModal.url}
              alt={receiptModal.receipt.name}
              className="max-h-[65vh] w-auto rounded-xl border border-slate-200 dark:border-slate-800 object-contain"
            />
          ) : (
            <p className="text-xs text-slate-400">Loading local receipt image...</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
