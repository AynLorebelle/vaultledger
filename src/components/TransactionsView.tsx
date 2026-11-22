import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  CheckCircle2,
  CircleDashed,
  Edit3,
  Trash2,
  Paperclip,
  Split,
  RotateCcw,
  X,
  Tag,
  Check,
  Filter,
  Plus,
  Inbox,
  ArrowRightLeft,
  SlidersHorizontal,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { filterTransactionsByRange } from '../core/analytics';
import { convertCurrency } from '../core/currency';
import { loadReceiptDataUrl } from '../core/storage';
import type { ReceiptAttachment, Transaction } from '../types/finance';
import { CategoryIcon, Modal, Money, formatShortDate } from './ui';

type TxTab = 'all' | 'inbox' | 'expense' | 'income' | 'transfer' | 'refund';

export const TransactionsView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const timeRange = useFinanceStore((s) => s.timeRange);
  const selectedCategoryFilter = useFinanceStore((s) => s.selectedCategoryFilter);
  const selectedDateFilter = useFinanceStore((s) => s.selectedDateFilter);
  const selectedSearchFilter = useFinanceStore((s) => s.selectedSearchFilter);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const drillDownDate = useFinanceStore((s) => s.drillDownDate);
  const drillDownSearch = useFinanceStore((s) => s.drillDownSearch);
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const updateTransaction = useFinanceStore((s) => s.updateTransaction);
  const deleteTransactions = useFinanceStore((s) => s.deleteTransactions);
  const bulkUpdateTransactions = useFinanceStore((s) => s.bulkUpdateTransactions);
  const addRule = useFinanceStore((s) => s.addRule);
  const showToast = useFinanceStore((s) => s.showToast);

  const [activeTab, setActiveTab] = useState<TxTab>('all');
  const [search, setSearch] = useState(() => selectedSearchFilter ?? '');
  const [accountFilter, setAccountFilter] = useState('');
  const [localCategoryFilter, setLocalCategoryFilter] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastClickedRowId, setLastClickedRowId] = useState<string | null>(null);
  const [bulkTagInput, setBulkTagInput] = useState('');
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [receiptModal, setReceiptModal] = useState<{
    receipt: ReceiptAttachment;
    payee: string;
    url: string | null;
  } | null>(null);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  // Sync store search drill-down into local search bar
  useEffect(() => {
    if (selectedSearchFilter !== null) {
      setSearch(selectedSearchFilter);
    }
  }, [selectedSearchFilter]);

  const accountMap = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a])),
    [data.accounts],
  );
  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories],
  );

  const unreviewedCount = useMemo(
    () => data.transactions.filter((t) => !t.reviewed).length,
    [data.transactions],
  );

  const effectiveCategoryFilter = selectedCategoryFilter || localCategoryFilter;

  const filteredTransactions = useMemo(() => {
    // If drilling down to a specific date, search query, or viewing Inbox, search across all dates so items aren't hidden by range
    const baseList =
      selectedDateFilter || selectedSearchFilter || activeTab === 'inbox'
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

        if (
          accountFilter &&
          tx.accountId !== accountFilter &&
          tx.transferAccountId !== accountFilter
        ) {
          return false;
        }

        if (effectiveCategoryFilter) {
          const matchesPrimary = tx.categoryId === effectiveCategoryFilter;
          const matchesSplit = Boolean(
            tx.splits?.some((sp) => sp.categoryId === effectiveCategoryFilter),
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
    selectedSearchFilter,
    accountFilter,
    effectiveCategoryFilter,
    search,
    categoryMap,
    accountMap,
  ]);

  // Compute live selected transactions & net sum in base currency
  const selectedNetSum = useMemo(() => {
    if (selectedIds.size === 0) return 0;
    let sum = 0;
    for (const tx of data.transactions) {
      if (!selectedIds.has(tx.id)) continue;
      if (tx.type === 'transfer') continue;
      const accCurrency = accountMap.get(tx.accountId)?.currency ?? currency;
      const converted = convertCurrency(tx.amount, accCurrency, currency, data.settings);
      if (tx.type === 'expense') {
        sum -= Math.abs(converted);
      } else {
        sum += Math.abs(converted);
      }
    }
    return sum;
  }, [selectedIds, data.transactions, accountMap, currency, data.settings]);

  const allVisibleSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((t) => selectedIds.has(t.id));

  const clearSelection = () => {
    setSelectedIds(new Set());
    setConfirmBulkDelete(false);
    setLastClickedRowId(null);
  };

  const toggleSelectAll = () => {
    setConfirmBulkDelete(false);
    if (allVisibleSelected) {
      setSelectedIds(new Set());
      setLastClickedRowId(null);
    } else {
      setSelectedIds(new Set(filteredTransactions.map((t) => t.id)));
    }
  };

  const handleRowSelect = (id: string, shiftKey: boolean) => {
    setConfirmBulkDelete(false);
    if (shiftKey && lastClickedRowId) {
      const visibleIds = filteredTransactions.map((t) => t.id);
      const startIdx = visibleIds.indexOf(lastClickedRowId);
      const endIdx = visibleIds.indexOf(id);
      if (startIdx !== -1 && endIdx !== -1) {
        const [lo, hi] = startIdx <= endIdx ? [startIdx, endIdx] : [endIdx, startIdx];
        const rangeIds = visibleIds.slice(lo, hi + 1);
        setSelectedIds((prev) => {
          const next = new Set(prev);
          const shouldSelect = !prev.has(id);
          for (const rid of rangeIds) {
            if (shouldSelect) next.add(rid);
            else next.delete(rid);
          }
          return next;
        });
        setLastClickedRowId(id);
        return;
      }
    }

    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    setLastClickedRowId(id);
  };

  const handleBulkReview = (reviewed: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkUpdateTransactions(ids, { reviewed });
    clearSelection();
    showToast(
      `Marked ${ids.length} transaction${ids.length === 1 ? '' : 's'} as ${
        reviewed ? 'reviewed' : 'unreviewed'
      }`,
      'success',
    );
  };

  const handleBulkCategory = (catId: string) => {
    if (!catId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const catName = categoryMap.get(catId)?.name ?? 'selected category';
    bulkUpdateTransactions(ids, { categoryId: catId });
    clearSelection();
    showToast(
      `Updated ${ids.length} transaction${ids.length === 1 ? '' : 's'} to ${catName}`,
      'success',
    );
  };

  const handleBulkMoveAccount = (accountId: string) => {
    if (!accountId) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    const accName = accountMap.get(accountId)?.name ?? 'selected account';
    bulkUpdateTransactions(ids, { accountId });
    clearSelection();
    showToast(
      `Moved ${ids.length} transaction${ids.length === 1 ? '' : 's'} to ${accName}`,
      'success',
    );
  };

  const handleBulkAddTag = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = bulkTagInput.replace(/^#/, '').trim().toLowerCase();
    if (!cleaned) return;
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    bulkUpdateTransactions(ids, { addTags: [cleaned] });
    setBulkTagInput('');
    clearSelection();
    showToast(
      `Added #${cleaned} to ${ids.length} transaction${ids.length === 1 ? '' : 's'}`,
      'success',
    );
  };

  const handleConfirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    const count = ids.length;
    if (count === 0) return;
    deleteTransactions(ids);
    clearSelection();
    showToast(`Deleted ${count} transactions`, 'info', {
      label: 'Undo',
      onClick: () => useFinanceStore.getState().undo(),
    });
  };

  const handleDeleteSingle = (tx: Transaction) => {
    deleteTransactions([tx.id]);
    setSelectedIds((prev) => {
      if (!prev.has(tx.id)) return prev;
      const next = new Set(prev);
      next.delete(tx.id);
      return next;
    });
    showToast(`Deleted "${tx.payee}"`, 'info', {
      label: 'Undo',
      onClick: () => useFinanceStore.getState().undo(),
    });
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
    showToast(`Created auto-rule for "${tx.payee}"`, 'success');
  };

  const handleMarkAllInboxReviewed = () => {
    const inboxIds = data.transactions.filter((t) => !t.reviewed).map((t) => t.id);
    if (inboxIds.length === 0) return;
    bulkUpdateTransactions(inboxIds, { reviewed: true });
    clearSelection();
    showToast(`Inbox Zero! Marked ${inboxIds.length} transactions as reviewed`, 'success');
  };

  const handleClearSearchFilter = () => {
    drillDownSearch(null);
    setSearch('');
  };

  const openReceiptPreview = async (tx: Transaction) => {
    if (!tx.receipt) return;
    setReceiptModal({ receipt: tx.receipt, payee: tx.payee, url: null });
    const url = await loadReceiptDataUrl(tx.receipt);
    setReceiptModal((cur) => (cur ? { ...cur, url } : null));
  };

  const hasDrillDownChip = Boolean(
    selectedCategoryFilter || selectedDateFilter || selectedSearchFilter,
  );

  const tabs: Array<{ id: TxTab; label: string; count?: number }> = [
    { id: 'all', label: 'All Transactions' },
    { id: 'inbox', label: 'Inbox to Review', count: unreviewedCount },
    { id: 'expense', label: 'Expenses' },
    { id: 'income', label: 'Income' },
    { id: 'transfer', label: 'Transfers' },
    { id: 'refund', label: 'Refunds' },
  ];

  const iconBtnFocus =
    'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]';

  return (
    <div className="space-y-5 pb-20">
      {/* Header & Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Transactions Ledger
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
            {filteredTransactions.length} matching{' '}
            {filteredTransactions.length === 1 ? 'entry' : 'entries'} · Shift+Click to select a range
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1.5" role="tablist" aria-label="Transaction type filters">
          {tabs.map((tab) => {
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-medium transition-colors cursor-pointer ${iconBtnFocus} ${
                  active ? 'tactile-btn-primary' : 'tactile-btn text-[var(--text-secondary)]'
                }`}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && tab.count > 0 && (
                  <span
                    className="px-1.5 py-0.5 rounded-full text-[10px] font-bold tabular-nums"
                    style={
                      active
                        ? { backgroundColor: 'rgba(255,255,255,0.2)', color: '#FFFFFF' }
                        : {
                            backgroundColor: 'var(--accent-warning-soft)',
                            color: 'var(--accent-warning)',
                          }
                    }
                  >
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Inbox Zero Status Banner */}
      {unreviewedCount > 0 ? (
        <div className="tactile-well px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <span
              className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-warning-soft)',
                color: 'var(--accent-warning)',
              }}
              aria-hidden="true"
            >
              <Inbox className="w-4 h-4" />
            </span>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-[var(--text-primary)] tabular-nums">
                {unreviewedCount} unreviewed {unreviewedCount === 1 ? 'transaction' : 'transactions'} in your Inbox
              </p>
              <p className="text-[11px] text-[var(--text-muted)]">
                Review imported or newly logged items to reach Inbox Zero.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {activeTab !== 'inbox' ? (
              <button
                type="button"
                onClick={() => setActiveTab('inbox')}
                className={`tactile-btn px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
              >
                Open Inbox ({unreviewedCount})
              </button>
            ) : (
              <button
                type="button"
                onClick={handleMarkAllInboxReviewed}
                className={`tactile-btn-primary inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
              >
                <Check className="w-3.5 h-3.5" aria-hidden="true" />
                Mark All Reviewed
              </button>
            )}
          </div>
        </div>
      ) : (
        activeTab === 'inbox' && (
          <div className="tactile-well px-4 py-3 flex items-center gap-2.5">
            <CheckCircle2
              className="w-4 h-4 shrink-0"
              style={{ color: 'var(--accent-positive)' }}
              aria-hidden="true"
            />
            <span className="text-xs font-semibold text-[var(--text-primary)]">
              Inbox Zero achieved — every transaction in your vault is reviewed.
            </span>
          </div>
        )
      )}

      {/* Active Drill-Down Chips */}
      {hasDrillDownChip && (
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-[var(--text-muted)] inline-flex items-center gap-1">
            <Filter className="w-3.5 h-3.5" aria-hidden="true" />
            Active drill-down:
          </span>
          {selectedCategoryFilter && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <span>
                Category: {categoryMap.get(selectedCategoryFilter)?.name ?? selectedCategoryFilter}
              </span>
              <button
                type="button"
                onClick={() => drillDownCategory(null)}
                className={`rounded-full p-0.5 hover:bg-[var(--bg-surface)] cursor-pointer ${iconBtnFocus}`}
                aria-label="Clear category filter"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {selectedDateFilter && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <span>Date: {formatShortDate(selectedDateFilter)}</span>
              <button
                type="button"
                onClick={() => drillDownDate(null)}
                className={`rounded-full p-0.5 hover:bg-[var(--bg-surface)] cursor-pointer ${iconBtnFocus}`}
                aria-label="Clear date filter"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
          {selectedSearchFilter && (
            <span
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold border"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                borderColor: 'var(--accent-primary)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <span>Search: {selectedSearchFilter}</span>
              <button
                type="button"
                onClick={handleClearSearchFilter}
                className={`rounded-full p-0.5 hover:bg-[var(--bg-surface)] cursor-pointer ${iconBtnFocus}`}
                aria-label="Clear search drill-down filter"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </span>
          )}
        </div>
      )}

      {/* Search & Filter Toolbar */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
        <div className="md:col-span-6 relative">
          <Search
            className="w-4 h-4 text-[var(--text-muted)] absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none"
            aria-hidden="true"
          />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search payee, notes, #tags, category, or amount..."
            aria-label="Search transactions"
            className="tactile-input w-full pl-10 pr-9 py-2.5 text-sm placeholder:text-[var(--text-muted)]"
          />
          {search && (
            <button
              type="button"
              onClick={() => {
                setSearch('');
                if (selectedSearchFilter) drillDownSearch(null);
              }}
              aria-label="Clear search query"
              className={`absolute right-2.5 top-1/2 -translate-y-1/2 p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer ${iconBtnFocus}`}
            >
              <X className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          )}
        </div>

        <select
          value={accountFilter}
          onChange={(e) => setAccountFilter(e.target.value)}
          aria-label="Filter by account"
          className="tactile-input md:col-span-3 px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]"
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
          className="tactile-input md:col-span-3 px-3 py-2.5 text-xs font-medium text-[var(--text-primary)]"
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
      <div className="tactile-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-xs font-semibold text-[var(--text-muted)]">
                <th className="py-3 pl-4 pr-2 w-10">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleSelectAll}
                    aria-label="Select all visible transactions"
                    className={`rounded border-[var(--border-strong)] accent-[var(--accent-primary)] cursor-pointer ${iconBtnFocus}`}
                  />
                </th>
                <th className="py-3 px-3">Date</th>
                <th className="py-3 px-3">Payee &amp; Details</th>
                <th className="py-3 px-3">Category</th>
                <th className="py-3 px-3">Account</th>
                <th className="py-3 px-3 text-right">Amount</th>
                <th className="py-3 pl-2 pr-4 text-right w-36">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-hairline)] text-sm">
              {filteredTransactions.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-12 px-4 text-center">
                    <p className="text-sm font-semibold text-[var(--text-primary)]">
                      {activeTab === 'inbox'
                        ? 'Inbox Zero! All transactions are reviewed.'
                        : 'No transactions match your current filters.'}
                    </p>
                    <p className="text-xs text-[var(--text-muted)] mt-1">
                      {activeTab === 'inbox'
                        ? 'New imports and unreviewed entries will appear here.'
                        : 'Try clearing a filter or log a new transaction.'}
                    </p>
                    <div className="mt-4 flex items-center justify-center gap-2">
                      {(search || accountFilter || effectiveCategoryFilter || hasDrillDownChip) && (
                        <button
                          type="button"
                          onClick={() => {
                            setSearch('');
                            setAccountFilter('');
                            setLocalCategoryFilter('');
                            drillDownCategory(null);
                            drillDownDate(null);
                            drillDownSearch(null);
                          }}
                          className={`tactile-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
                          aria-label="Clear all active filters"
                        >
                          <X className="w-3.5 h-3.5" aria-hidden="true" />
                          Clear Filters
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => openQuickAdd()}
                        className={`tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
                      >
                        <Plus className="w-3.5 h-3.5" aria-hidden="true" />
                        Add Transaction
                      </button>
                    </div>
                  </td>
                </tr>
              ) : (
                filteredTransactions.map((tx) => {
                  const cat = categoryMap.get(tx.categoryId);
                  const acc = accountMap.get(tx.accountId);
                  const destAcc = tx.transferAccountId
                    ? accountMap.get(tx.transferAccountId)
                    : null;
                  const checked = selectedIds.has(tx.id);
                  const hasSplits = Boolean(tx.splits && tx.splits.length > 0);
                  const signedVal =
                    tx.type === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount);

                  return (
                    <tr
                      key={tx.id}
                      className={`group transition-colors ${
                        checked
                          ? 'bg-[var(--accent-primary-soft)]'
                          : 'hover:bg-[var(--bg-surface-hover)]'
                      }`}
                    >
                      <td className="py-3 pl-4 pr-2">
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => {}}
                          onClick={(e) => handleRowSelect(tx.id, e.shiftKey)}
                          aria-label={`Select ${tx.payee}`}
                          className={`rounded border-[var(--border-strong)] accent-[var(--accent-primary)] cursor-pointer ${iconBtnFocus}`}
                        />
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-[var(--text-muted)] tabular-nums">
                        {tx.date}
                      </td>
                      <td className="py-3 px-3 max-w-[320px]">
                        <div className="flex items-center gap-2 flex-wrap">
                          {!tx.reviewed && (
                            <span
                              className="w-2 h-2 rounded-full shrink-0"
                              style={{ backgroundColor: 'var(--accent-warning)' }}
                              title="Unreviewed in Inbox"
                              aria-label="Unreviewed"
                            />
                          )}
                          <span className="font-medium text-[var(--text-primary)] truncate">
                            {tx.payee}
                          </span>
                          {hasSplits && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums"
                              style={{
                                backgroundColor: 'var(--accent-primary-soft)',
                                color: 'var(--accent-primary-text)',
                              }}
                            >
                              <Split className="w-2.5 h-2.5" aria-hidden="true" />
                              Split ({tx.splits!.length})
                            </span>
                          )}
                          {tx.type === 'refund' && (
                            <span
                              className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                              style={{
                                backgroundColor: 'var(--accent-warning-soft)',
                                color: 'var(--accent-warning)',
                              }}
                            >
                              <RotateCcw className="w-2.5 h-2.5" aria-hidden="true" />
                              Refund Offset
                            </span>
                          )}
                          {tx.receipt && (
                            <button
                              type="button"
                              onClick={() => openReceiptPreview(tx)}
                              aria-label={`Preview receipt for ${tx.payee}`}
                              className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] hover:text-[var(--accent-primary-text)] hover:border-[var(--border-strong)] text-[10px] font-medium cursor-pointer transition-colors ${iconBtnFocus}`}
                              title={`View receipt: ${tx.receipt.name}`}
                            >
                              <Paperclip className="w-2.5 h-2.5" aria-hidden="true" />
                              Receipt
                            </button>
                          )}
                        </div>
                        {(tx.notes || tx.tags.length > 0) && (
                          <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[11px] text-[var(--text-muted)]">
                            {tx.notes && <span className="truncate max-w-[200px]">{tx.notes}</span>}
                            {tx.tags.map((tg) => (
                              <span
                                key={tg}
                                className="px-1.5 py-0.5 rounded border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-secondary)] text-[10px] font-medium"
                              >
                                #{tg}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap">
                        {tx.type === 'transfer' ? (
                          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-xs font-medium">
                            <ArrowRightLeft className="w-3 h-3" aria-hidden="true" />
                            Transfer
                          </span>
                        ) : (
                          <span
                            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium"
                            style={{
                              backgroundColor: `${cat?.color ?? '#64748b'}18`,
                              color: cat?.color ?? 'var(--text-secondary)',
                            }}
                          >
                            <CategoryIcon icon={cat?.icon} className="w-3 h-3" />
                            <span>{cat?.name ?? 'Uncategorized'}</span>
                          </span>
                        )}
                      </td>
                      <td className="py-3 px-3 whitespace-nowrap text-xs text-[var(--text-secondary)]">
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
                              ? 'text-[var(--accent-positive)]'
                              : tx.type === 'refund'
                              ? 'text-[var(--accent-warning)]'
                              : tx.type === 'transfer'
                              ? 'text-[var(--accent-info)]'
                              : 'text-[var(--text-primary)]'
                          }`}
                        />
                      </td>
                      <td className="py-3 pl-2 pr-4 whitespace-nowrap text-right">
                        <div className="inline-flex items-center justify-end gap-1 opacity-85 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                          <button
                            type="button"
                            onClick={() =>
                              updateTransaction(tx.id, { reviewed: !tx.reviewed })
                            }
                            aria-label={
                              tx.reviewed
                                ? `Mark ${tx.payee} as unreviewed`
                                : `Mark ${tx.payee} as reviewed`
                            }
                            title={tx.reviewed ? 'Mark as unreviewed' : 'Mark as reviewed'}
                            className={`p-1.5 rounded-lg transition-colors cursor-pointer ${iconBtnFocus} ${
                              tx.reviewed
                                ? 'text-[var(--text-muted)] hover:text-[var(--accent-warning)] hover:bg-[var(--accent-warning-soft)]'
                                : 'text-[var(--accent-positive)] bg-[var(--accent-positive-soft)] hover:brightness-95'
                            }`}
                          >
                            {tx.reviewed ? (
                              <CircleDashed className="w-3.5 h-3.5" aria-hidden="true" />
                            ) : (
                              <CheckCircle2 className="w-3.5 h-3.5" aria-hidden="true" />
                            )}
                          </button>
                          {tx.type !== 'transfer' && (
                            <button
                              type="button"
                              onClick={() => handleQuickCreateRule(tx)}
                              aria-label={`Create auto-categorization rule for ${tx.payee}`}
                              title="1-click Create Rule for this payee"
                              className={`p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-primary-text)] hover:bg-[var(--accent-primary-soft)] transition-colors cursor-pointer ${iconBtnFocus}`}
                            >
                              <SlidersHorizontal className="w-3.5 h-3.5" aria-hidden="true" />
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => openQuickAdd(tx.id)}
                            aria-label={`Edit transaction ${tx.payee}`}
                            title="Edit transaction"
                            className={`p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer ${iconBtnFocus}`}
                          >
                            <Edit3 className="w-3.5 h-3.5" aria-hidden="true" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteSingle(tx)}
                            aria-label={`Delete transaction ${tx.payee}`}
                            title="Delete transaction"
                            className={`p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer ${iconBtnFocus}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
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

      {/* Floating Sticky Multi-Row Batch Action Bar */}
      {selectedIds.size > 0 && (
        <div
          role="region"
          aria-label="Bulk transaction actions"
          className="tactile-card-elevated vl-fade-up fixed bottom-5 left-1/2 -translate-x-1/2 z-40 max-w-[96vw] px-3.5 py-2.5 flex flex-wrap items-center gap-2"
        >
          {/* Count + Live Selected Net Sum */}
          <div className="flex items-center gap-1.5 shrink-0">
            <span
              className="text-xs font-semibold tabular-nums px-2.5 py-1 rounded-lg text-white"
              style={{ backgroundColor: 'var(--accent-primary)' }}
            >
              {selectedIds.size} selected
            </span>
            <span
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold tabular-nums border border-[var(--border-hairline)] bg-[var(--bg-subtle)]"
              title="Net sum of selected non-transfer transactions in base currency"
            >
              <span className="text-[var(--text-muted)] font-medium">Net:</span>
              <Money
                amount={selectedNetSum}
                currency={currency}
                privacyMask={privacyMask}
                showSign
                className={
                  selectedNetSum >= 0
                    ? 'text-[var(--accent-positive)]'
                    : 'text-[var(--accent-danger)]'
                }
              />
            </span>
          </div>

          <span
            className="hidden sm:inline-block h-5 w-px bg-[var(--border-hairline)]"
            aria-hidden="true"
          />

          {/* 1. Mark Reviewed */}
          <button
            type="button"
            onClick={() => handleBulkReview(true)}
            className={`tactile-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
            style={{ color: 'var(--accent-positive)' }}
          >
            <Check className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark Reviewed</span>
          </button>

          {/* 2. Mark Unreviewed */}
          <button
            type="button"
            onClick={() => handleBulkReview(false)}
            className={`tactile-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
            style={{ color: 'var(--accent-warning)' }}
          >
            <CircleDashed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Mark Unreviewed</span>
          </button>

          {/* 3. Change Category */}
          <select
            defaultValue=""
            onChange={(e) => {
              handleBulkCategory(e.target.value);
              e.target.value = '';
            }}
            aria-label="Bulk change category"
            className={`tactile-input px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] max-w-[160px] ${iconBtnFocus}`}
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

          {/* 4. Move Account */}
          <select
            defaultValue=""
            onChange={(e) => {
              handleBulkMoveAccount(e.target.value);
              e.target.value = '';
            }}
            aria-label="Bulk move account"
            className={`tactile-input px-2.5 py-1.5 text-xs font-medium text-[var(--text-primary)] max-w-[155px] ${iconBtnFocus}`}
          >
            <option value="" disabled>
              Move Account...
            </option>
            {data.accounts.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name}
              </option>
            ))}
          </select>

          {/* 5. Add Tag */}
          <form onSubmit={handleBulkAddTag} className="flex items-center gap-1">
            <div className="tactile-input flex items-center gap-1.5 px-2 py-1">
              <Tag className="w-3 h-3 text-[var(--text-muted)] shrink-0" aria-hidden="true" />
              <input
                type="text"
                value={bulkTagInput}
                onChange={(e) => setBulkTagInput(e.target.value)}
                placeholder="Add tag..."
                aria-label="Add tag to selected transactions"
                className="w-20 bg-transparent text-xs text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
            </div>
            {bulkTagInput.trim().length > 0 && (
              <button
                type="submit"
                className={`tactile-btn-primary px-2 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
                aria-label="Apply tag to selected transactions"
              >
                Add
              </button>
            )}
          </form>

          {/* 6. Inline 2-Step Bulk Delete */}
          {confirmBulkDelete ? (
            <div className="inline-flex items-center gap-1.5">
              <button
                type="button"
                onClick={handleConfirmBulkDelete}
                className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold text-white cursor-pointer transition-opacity hover:opacity-90 ${iconBtnFocus}`}
                style={{ backgroundColor: 'var(--accent-danger)' }}
              >
                <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
                <span className="tabular-nums">Confirm Delete ({selectedIds.size})</span>
              </button>
              <button
                type="button"
                onClick={() => setConfirmBulkDelete(false)}
                className={`tactile-btn px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setConfirmBulkDelete(true)}
              className={`tactile-btn inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-xs font-semibold cursor-pointer ${iconBtnFocus}`}
              style={{ color: 'var(--accent-danger)' }}
            >
              <Trash2 className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Delete</span>
            </button>
          )}

          {/* Clear Selection */}
          <button
            type="button"
            onClick={clearSelection}
            className={`p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] cursor-pointer transition-colors ${iconBtnFocus}`}
            aria-label="Clear selection"
          >
            <X className="w-4 h-4" aria-hidden="true" />
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
              className="max-h-[65vh] w-auto rounded-xl border border-[var(--border-hairline)] object-contain"
            />
          ) : (
            <p className="text-xs text-[var(--text-muted)]">Loading local receipt image...</p>
          )}
        </div>
      </Modal>
    </div>
  );
};
