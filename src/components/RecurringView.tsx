import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  Calendar as CalendarIcon,
  List,
  Plus,
  CheckCircle2,
  Pause,
  Play,
  Edit3,
  Trash2,
  Repeat,
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  Zap,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeRecurringSummary } from '../core/analytics';
import type { RecurrenceFrequency, RecurringBill } from '../types/finance';
import { Modal, Money, daysUntil, formatShortDate, todayIso } from './ui';

interface BillDraft {
  id?: string;
  name: string;
  payee: string;
  amount: string;
  type: 'expense' | 'income';
  categoryId: string;
  accountId: string;
  frequency: RecurrenceFrequency;
  nextDueDate: string;
  isSubscription: boolean;
  autoPay: boolean;
  notes: string;
  active: boolean;
}

const FREQ_LABELS: Record<RecurrenceFrequency, string> = {
  weekly: 'Weekly',
  biweekly: 'Every 2 Weeks',
  monthly: 'Monthly',
  quarterly: 'Quarterly',
  yearly: 'Yearly',
};

function getOccurrencesInMonth(bill: RecurringBill, year: number, monthIdx: number): number[] {
  if (!bill.active) return [];
  const parts = bill.nextDueDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return [];
  const [by, bm, bd] = parts;
  const daysInMonth = new Date(year, monthIdx + 1, 0).getDate();
  const anchorUtc = Date.UTC(by, bm - 1, bd);

  if (bill.frequency === 'monthly') {
    return [Math.min(bd, daysInMonth)];
  }
  if (bill.frequency === 'yearly') {
    return bm - 1 === monthIdx ? [Math.min(bd, daysInMonth)] : [];
  }
  if (bill.frequency === 'quarterly') {
    const monthDiff = (year - by) * 12 + (monthIdx - (bm - 1));
    return monthDiff % 3 === 0 ? [Math.min(bd, daysInMonth)] : [];
  }

  // Weekly or biweekly
  const stepDays = bill.frequency === 'weekly' ? 7 : 14;
  const hits: number[] = [];
  for (let day = 1; day <= daysInMonth; day += 1) {
    const curUtc = Date.UTC(year, monthIdx, day);
    const diffDays = Math.round((curUtc - anchorUtc) / 86_400_000);
    if (diffDays % stepDays === 0) {
      hits.push(day);
    }
  }
  return hits;
}

export const RecurringView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addRecurringBill = useFinanceStore((s) => s.addRecurringBill);
  const updateRecurringBill = useFinanceStore((s) => s.updateRecurringBill);
  const deleteRecurringBill = useFinanceStore((s) => s.deleteRecurringBill);
  const markBillPaidAndLog = useFinanceStore((s) => s.markBillPaidAndLog);
  const showToast = useFinanceStore((s) => s.showToast);

  const [viewMode, setViewMode] = useState<'list' | 'calendar'>('list');
  const [calMonth, setCalMonth] = useState(() => {
    const now = new Date();
    return { year: now.getFullYear(), month: now.getMonth() };
  });
  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<BillDraft>({
    name: '',
    payee: '',
    amount: '',
    type: 'expense',
    categoryId: '',
    accountId: '',
    frequency: 'monthly',
    nextDueDate: todayIso(),
    isSubscription: false,
    autoPay: true,
    notes: '',
    active: true,
  });

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  const summary = useMemo(
    () => computeRecurringSummary(data.recurringBills),
    [data.recurringBills]
  );

  const categoryMap = useMemo(
    () => new Map(data.categories.map((c) => [c.id, c])),
    [data.categories]
  );
  const accountMap = useMemo(
    () => new Map(data.accounts.map((a) => [a.id, a])),
    [data.accounts]
  );

  const sortedBills = useMemo(
    () =>
      [...data.recurringBills].sort((a, b) => {
        if (a.active !== b.active) return a.active ? -1 : 1;
        return a.nextDueDate.localeCompare(b.nextDueDate);
      }),
    [data.recurringBills]
  );

  const openNewModal = () => {
    setDraft({
      name: '',
      payee: '',
      amount: '',
      type: 'expense',
      categoryId: data.categories.find((c) => c.group !== 'income')?.id ?? '',
      accountId: data.accounts[0]?.id ?? '',
      frequency: 'monthly',
      nextDueDate: todayIso(),
      isSubscription: false,
      autoPay: true,
      notes: '',
      active: true,
    });
    setModalOpen(true);
  };

  const openEditModal = (bill: RecurringBill) => {
    setDraft({
      id: bill.id,
      name: bill.name,
      payee: bill.payee,
      amount: String(bill.amount),
      type: bill.type,
      categoryId: bill.categoryId,
      accountId: bill.accountId,
      frequency: bill.frequency,
      nextDueDate: bill.nextDueDate,
      isSubscription: bill.isSubscription,
      autoPay: bill.autoPay,
      notes: bill.notes ?? '',
      active: bill.active,
    });
    setModalOpen(true);
  };

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();
    const amt = Number(draft.amount);
    if (!draft.name.trim() || !Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid name and positive amount', 'error');
      return;
    }
    const payload = {
      name: draft.name.trim(),
      payee: draft.payee.trim() || draft.name.trim(),
      amount: amt,
      type: draft.type,
      categoryId: draft.categoryId || data.categories[0]?.id || 'cat_uncategorized',
      accountId: draft.accountId || data.accounts[0]?.id || '',
      frequency: draft.frequency,
      nextDueDate: draft.nextDueDate,
      isSubscription: draft.type === 'expense' ? draft.isSubscription : false,
      autoPay: draft.autoPay,
      notes: draft.notes.trim() || undefined,
      active: draft.active,
    };

    if (draft.id) {
      updateRecurringBill(draft.id, payload);
      showToast(`Updated "${payload.name}"`, 'success');
    } else {
      addRecurringBill(payload);
      showToast(`Added recurring item "${payload.name}"`, 'success');
    }
    setModalOpen(false);
  };

  const handlePayAndLog = (bill: RecurringBill) => {
    const logged = markBillPaidAndLog(bill.id);
    if (logged) {
      showToast(`Logged ${bill.name} and advanced next due date`, 'success');
    }
  };

  // Calendar grid generation
  const calendarData = useMemo(() => {
    const { year, month } = calMonth;
    const firstDow = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const byDay = new Map<number, RecurringBill[]>();

    for (const bill of data.recurringBills) {
      const hits = getOccurrencesInMonth(bill, year, month);
      for (const day of hits) {
        const list = byDay.get(day) ?? [];
        list.push(bill);
        byDay.set(day, list);
      }
    }

    const cells: Array<{ day: number | null; bills: RecurringBill[] }> = [];
    for (let i = 0; i < firstDow; i += 1) {
      cells.push({ day: null, bills: [] });
    }
    for (let d = 1; d <= daysInMonth; d += 1) {
      cells.push({ day: d, bills: byDay.get(d) ?? [] });
    }
    while (cells.length % 7 !== 0) {
      cells.push({ day: null, bills: [] });
    }

    const monthTitle = new Date(year, month, 1).toLocaleDateString('en-US', {
      month: 'long',
      year: 'numeric',
    });

    return { cells, monthTitle };
  }, [calMonth, data.recurringBills]);

  const shiftMonth = (delta: number) => {
    setCalMonth((prev) => {
      const next = new Date(prev.year, prev.month + delta, 1);
      return { year: next.getFullYear(), month: next.getMonth() };
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Recurring Bills &amp; Subscriptions
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Track fixed bills, subscription creep, and paydays with 1-click logging
          </p>
        </div>

        <div className="flex items-center gap-2">
          <div className="flex items-center p-1 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'list'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <List className="w-3.5 h-3.5" />
              List
            </button>
            <button
              type="button"
              onClick={() => setViewMode('calendar')}
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                viewMode === 'calendar'
                  ? 'bg-indigo-600 text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
              }`}
            >
              <CalendarIcon className="w-3.5 h-3.5" />
              Calendar
            </button>
          </div>

          <button
            type="button"
            onClick={openNewModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>Add Recurring</span>
          </button>
        </div>
      </div>

      {/* KPI Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80">
          <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Recurring Total</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            <Money amount={summary.monthlyTotal} currency={currency} privacyMask={privacyMask} />
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Normalized monthly outflow</div>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80">
          <div className="text-xs text-slate-500 dark:text-slate-400">Annualized Commitment</div>
          <div className="text-2xl font-bold text-slate-900 dark:text-white mt-1">
            <Money amount={summary.yearlyTotal} currency={currency} privacyMask={privacyMask} />
          </div>
          <div className="text-[11px] text-slate-400 mt-1">Projected 12-month cost</div>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Repeat className="w-3.5 h-3.5 text-amber-500" />
            <span>Subscription Creep</span>
          </div>
          <div className="text-2xl font-bold text-amber-600 dark:text-amber-400 mt-1">
            <Money
              amount={summary.subscriptionMonthly}
              currency={currency}
              privacyMask={privacyMask}
            />
            <span className="text-xs font-normal text-slate-400"> /mo</span>
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            <Money
              amount={summary.subscriptionMonthly * 12}
              currency={currency}
              privacyMask={privacyMask}
            />{' '}
            per year in subscriptions
          </div>
        </div>

        <div className="rounded-2xl p-4 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80">
          <div className="text-xs text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
            <span>Overdue Bills</span>
          </div>
          <div
            className={`text-2xl font-bold mt-1 tabular-nums ${
              summary.overdue.length > 0
                ? 'text-rose-600 dark:text-rose-400'
                : 'text-emerald-600 dark:text-emerald-400'
            }`}
          >
            {summary.overdue.length}
          </div>
          <div className="text-[11px] text-slate-400 mt-1">
            {summary.upcomingSoon.length} more due within 14 days
          </div>
        </div>
      </div>

      {/* Main Content: List OR Calendar */}
      {viewMode === 'list' ? (
        <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 overflow-hidden shadow-xs">
          {sortedBills.length === 0 ? (
            <div className="p-10 text-center">
              <CalendarClock className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                No recurring bills or paydays configured
              </p>
              <p className="text-xs text-slate-400 mt-1">
                Add rent, subscriptions, or paychecks to power Safe-to-Spend forecasting.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
              {sortedBills.map((bill) => {
                const diff = daysUntil(bill.nextDueDate);
                const overdue = bill.active && diff < 0;
                const cat = categoryMap.get(bill.categoryId);
                const acc = accountMap.get(bill.accountId);

                return (
                  <div
                    key={bill.id}
                    className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                      bill.active ? '' : 'opacity-55 bg-slate-50/50 dark:bg-slate-950/30'
                    }`}
                  >
                    <div className="flex items-start gap-3 min-w-0">
                      <div
                        className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 font-bold text-xs"
                        style={{
                          backgroundColor: `${cat?.color ?? '#6366f1'}1c`,
                          color: cat?.color ?? '#6366f1',
                        }}
                      >
                        {bill.type === 'income' ? '+' : bill.isSubscription ? 'SUB' : 'BILL'}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                            {bill.name}
                          </span>
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-[10px] font-medium text-slate-500 dark:text-slate-400">
                            {FREQ_LABELS[bill.frequency]}
                          </span>
                          {bill.isSubscription && (
                            <span className="px-2 py-0.5 rounded-md bg-amber-500/12 text-amber-700 dark:text-amber-300 text-[10px] font-semibold">
                              Subscription
                            </span>
                          )}
                          {bill.autoPay && (
                            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-indigo-500/10 text-indigo-600 dark:text-indigo-300 text-[10px] font-medium">
                              <Zap className="w-2.5 h-2.5" />
                              Auto-pay
                            </span>
                          )}
                          {!bill.active && (
                            <span className="px-1.5 py-0.5 rounded-md bg-slate-200 dark:bg-slate-800 text-slate-500 text-[10px] font-semibold">
                              Paused
                            </span>
                          )}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                          <span
                            className={
                              overdue ? 'text-rose-600 dark:text-rose-400 font-semibold' : ''
                            }
                          >
                            Next: {formatShortDate(bill.nextDueDate)}
                            {bill.active &&
                              (overdue
                                ? ` (${Math.abs(diff)}d overdue)`
                                : diff === 0
                                ? ' (Today)'
                                : ` (in ${diff}d)`)}
                          </span>
                          <span>•</span>
                          <span>{cat?.name ?? 'Category'}</span>
                          {acc && (
                            <>
                              <span>•</span>
                              <span>{acc.name}</span>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center justify-between md:justify-end gap-3 shrink-0">
                      <Money
                        amount={bill.type === 'income' ? bill.amount : -bill.amount}
                        currency={acc?.currency ?? currency}
                        privacyMask={privacyMask}
                        showSign
                        className={`text-sm font-bold ${
                          bill.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-white'
                        }`}
                      />

                      <div className="flex items-center gap-1.5">
                        {bill.active && (
                          <button
                            type="button"
                            onClick={() => handlePayAndLog(bill)}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Mark Paid &amp; Log</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() =>
                            updateRecurringBill(bill.id, { active: !bill.active })
                          }
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          title={bill.active ? 'Pause recurring bill' : 'Resume recurring bill'}
                        >
                          {bill.active ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
                        </button>
                        <button
                          type="button"
                          onClick={() => openEditModal(bill)}
                          className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                          aria-label="Edit recurring bill"
                        >
                          <Edit3 className="w-4 h-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => deleteRecurringBill(bill.id)}
                          className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                          aria-label="Delete recurring bill"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : (
        /* Interactive Monthly Bill Calendar View */
        <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => shiftMonth(-1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronLeft className="w-4 h-4" />
              </button>
              <h2 className="text-base font-bold text-slate-900 dark:text-white min-w-[150px] text-center">
                {calendarData.monthTitle}
              </h2>
              <button
                type="button"
                onClick={() => shiftMonth(1)}
                className="p-1.5 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              >
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500" /> Payday
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-indigo-500" /> Fixed Bill
              </span>
              <span className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500" /> Subscription
              </span>
            </div>
          </div>

          <div className="grid grid-cols-7 gap-1.5 text-center text-[11px] font-semibold uppercase tracking-wider text-slate-400">
            {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((d) => (
              <div key={d} className="py-1">
                {d}
              </div>
            ))}
          </div>

          <div className="grid grid-cols-7 gap-1.5">
            {calendarData.cells.map((cell, idx) => (
              <div
                key={idx}
                className={`min-h-[92px] rounded-xl p-2 border transition-colors ${
                  cell.day
                    ? 'bg-slate-50/70 dark:bg-slate-950/60 border-slate-200/80 dark:border-slate-800/80'
                    : 'bg-transparent border-transparent'
                }`}
              >
                {cell.day && (
                  <>
                    <div className="text-xs font-semibold text-slate-500 dark:text-slate-400 tabular-nums mb-1.5">
                      {cell.day}
                    </div>
                    <div className="space-y-1">
                      {cell.bills.map((b) => {
                        const pillTone =
                          b.type === 'income'
                            ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300 border-emerald-500/25'
                            : b.isSubscription
                            ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300 border-amber-500/25'
                            : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border-indigo-500/25';

                        return (
                          <button
                            key={b.id}
                            type="button"
                            onClick={() => openEditModal(b)}
                            className={`w-full text-left px-1.5 py-1 rounded-md border text-[10px] font-medium leading-tight truncate cursor-pointer hover:brightness-110 ${pillTone}`}
                            title={`${b.name} (${b.amount}) — Click to edit`}
                          >
                            <div className="truncate font-semibold">{b.name}</div>
                            <Money
                              amount={b.amount}
                              currency={currency}
                              privacyMask={privacyMask}
                              className="opacity-85"
                            />
                          </button>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Add / Edit Recurring Bill Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={draft.id ? 'Edit Recurring Item' : 'Add Recurring Bill or Payday'}
        maxWidthClass="max-w-lg"
      >
        <form onSubmit={handleSave} className="p-5 space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {(['expense', 'income'] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setDraft({ ...draft, type: t })}
                className={`py-2 rounded-xl border text-xs font-semibold capitalize cursor-pointer ${
                  draft.type === t
                    ? t === 'income'
                      ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-700 dark:text-emerald-300'
                      : 'bg-indigo-500/15 border-indigo-500/40 text-indigo-700 dark:text-indigo-300'
                    : 'border-slate-200 dark:border-slate-800 text-slate-500'
                }`}
              >
                {t === 'expense' ? 'Recurring Bill / Sub' : 'Recurring Income / Payday'}
              </button>
            ))}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Spotify Duo, Apartment Rent"
                required
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Amount ({currency})
              </label>
              <input
                type="number"
                step="0.01"
                min="0.01"
                value={draft.amount}
                onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                required
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Frequency
              </label>
              <select
                value={draft.frequency}
                onChange={(e) =>
                  setDraft({ ...draft, frequency: e.target.value as RecurrenceFrequency })
                }
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                {Object.entries(FREQ_LABELS).map(([k, lbl]) => (
                  <option key={k} value={k}>
                    {lbl}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Next Due Date
              </label>
              <input
                type="date"
                value={draft.nextDueDate}
                onChange={(e) => setDraft({ ...draft, nextDueDate: e.target.value })}
                required
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Category
              </label>
              <select
                value={draft.categoryId}
                onChange={(e) => setDraft({ ...draft, categoryId: e.target.value })}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Account
              </label>
              <select
                value={draft.accountId}
                onChange={(e) => setDraft({ ...draft, accountId: e.target.value })}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                {data.accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
            {draft.type === 'expense' && (
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={draft.isSubscription}
                  onChange={(e) => setDraft({ ...draft, isSubscription: e.target.checked })}
                  className="rounded border-slate-300 text-indigo-600"
                />
                <span>Track as Subscription</span>
              </label>
            )}
            <label className="inline-flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.autoPay}
                onChange={(e) => setDraft({ ...draft, autoPay: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Auto-pay enabled</span>
            </label>
          </div>

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              {draft.id ? 'Save Changes' : 'Add Recurring Item'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
