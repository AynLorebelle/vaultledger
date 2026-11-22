import React, { useMemo, useState } from 'react';
import {
  Plus,
  Sliders,
  Sparkles,
  RefreshCw,
  Check,
  Trash2,
  ArrowUpRight,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeCategorySpend, computeDashboardKPIs } from '../core/analytics';
import type { CategoryGroup } from '../types/finance';
import {
  AVAILABLE_CATEGORY_ICONS,
  CategoryIcon,
  Modal,
  Money,
  PALETTE_COLORS,
} from './ui';

const GROUP_SECTIONS: Array<{
  group: Exclude<CategoryGroup, 'income'>;
  title: string;
  subtitle: string;
  accent: string;
}> = [
  {
    group: 'needs',
    title: 'Essential Needs',
    subtitle: 'Housing, groceries, utilities, transit & healthcare',
    accent: 'text-sky-600 dark:text-sky-400',
  },
  {
    group: 'wants',
    title: 'Lifestyle & Wants',
    subtitle: 'Dining, coffee, shopping, entertainment & travel',
    accent: 'text-indigo-600 dark:text-indigo-400',
  },
  {
    group: 'savings',
    title: 'Savings & Investments',
    subtitle: 'Emergency fund, retirement & wealth building',
    accent: 'text-emerald-600 dark:text-emerald-400',
  },
];

export const BudgetsView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const updateCategory = useFinanceStore((s) => s.updateCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteCategory);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const showToast = useFinanceStore((s) => s.showToast);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  // Always evaluate monthly budgets on this_month
  const categorySpends = useMemo(() => computeCategorySpend(data, 'this_month'), [data]);
  const monthKpis = useMemo(() => computeDashboardKPIs(data, 'this_month'), [data]);

  const spendByCatId = useMemo(
    () => new Map(categorySpends.map((s) => [s.categoryId, s])),
    [categorySpends]
  );

  // Inline budget edit state
  const [editingBudgetId, setEditingBudgetId] = useState<string | null>(null);
  const [editingBudgetVal, setEditingBudgetVal] = useState('');

  // What-If Simulator overrides
  const [simOverrides, setSimOverrides] = useState<Record<string, number>>({});

  // Add category modal state
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [newGroup, setNewGroup] = useState<CategoryGroup>('wants');
  const [newIcon, setNewIcon] = useState('shopping-bag');
  const [newColor, setNewColor] = useState(PALETTE_COLORS[0]);
  const [newBudget, setNewBudget] = useState('250');
  const [newRollover, setNewRollover] = useState(false);

  const totalBudget = useMemo(
    () => categorySpends.reduce((sum, c) => sum + c.effectiveBudget, 0),
    [categorySpends]
  );
  const totalSpent = useMemo(
    () => categorySpends.reduce((sum, c) => sum + c.spent, 0),
    [categorySpends]
  );
  const remaining = totalBudget - totalSpent;
  const overallPct = totalBudget > 0 ? Math.min(100, Math.round((totalSpent / totalBudget) * 100)) : 0;

  // Top 5 categories for the What-If simulator
  const simCategories = useMemo(() => {
    return data.categories
      .filter((c) => c.group !== 'income' && (c.monthlyBudget > 0 || (spendByCatId.get(c.id)?.spent ?? 0) > 0))
      .sort((a, b) => {
        const sa = Math.max(a.monthlyBudget, spendByCatId.get(a.id)?.spent ?? 0);
        const sb = Math.max(b.monthlyBudget, spendByCatId.get(b.id)?.spent ?? 0);
        return sb - sa;
      })
      .slice(0, 6);
  }, [data.categories, spendByCatId]);

  const simMetrics = useMemo(() => {
    let monthlyDelta = 0;
    for (const cat of simCategories) {
      const baseline = cat.monthlyBudget > 0 ? cat.monthlyBudget : spendByCatId.get(cat.id)?.spent ?? 0;
      const simulated = simOverrides[cat.id] ?? baseline;
      monthlyDelta += baseline - simulated; // positive = savings increase
    }
    const baseIncome = Math.max(monthKpis.periodIncome, totalBudget, 1);
    const projectedNet = monthKpis.netCashflow + monthlyDelta;
    const projectedSavingsRate = (projectedNet / baseIncome) * 100;
    // 12-month compounded at 4.5% APY HYSA monthly compounding
    const r = 0.045 / 12;
    const compounded12Mo =
      monthlyDelta > 0
        ? monthlyDelta * ((Math.pow(1 + r, 12) - 1) / r)
        : monthlyDelta * 12;
    return {
      monthlyDelta,
      projectedSavingsRate,
      compounded12Mo,
      hasChanges: Object.keys(simOverrides).length > 0,
    };
  }, [simCategories, simOverrides, spendByCatId, monthKpis, totalBudget]);

  const applySimulatedBudgets = () => {
    const entries = Object.entries(simOverrides);
    if (entries.length === 0) return;
    entries.forEach(([catId, val]) => {
      updateCategory(catId, { monthlyBudget: Math.max(0, Math.round(val)) });
    });
    setSimOverrides({});
    showToast(`Applied simulated limits to ${entries.length} categories`, 'success');
  };

  const commitInlineBudget = (catId: string) => {
    const parsed = Number(editingBudgetVal);
    if (Number.isFinite(parsed) && parsed >= 0) {
      updateCategory(catId, { monthlyBudget: Math.round(parsed * 100) / 100 });
    }
    setEditingBudgetId(null);
  };

  const handleAddCategory = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    addCategory({
      name: newName.trim(),
      group: newGroup,
      icon: newIcon,
      color: newColor,
      monthlyBudget: newGroup === 'income' ? 0 : Math.max(0, Number(newBudget) || 0),
      rolloverEnabled: newGroup === 'income' ? false : newRollover,
    });
    setNewName('');
    setNewBudget('250');
    setAddModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Monthly Budgets &amp; Envelopes
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Click any budget limit to edit inline · Toggle envelope rollover to carry unused balances forward
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Category</span>
        </button>
      </div>

      {/* Top Budget Overview Bar */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Monthly Effective Budget</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              <Money amount={totalBudget} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">Spent This Month</div>
            <div className="text-2xl font-bold text-slate-900 dark:text-white mt-0.5">
              <Money amount={totalSpent} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500 dark:text-slate-400">
              {remaining >= 0 ? 'Remaining Headroom' : 'Over Budget'}
            </div>
            <div
              className={`text-2xl font-bold mt-0.5 ${
                remaining >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <Money amount={Math.abs(remaining)} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
        </div>
        <div className="h-2.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              remaining < 0
                ? 'bg-rose-500'
                : overallPct >= 80
                ? 'bg-amber-500'
                : 'bg-emerald-500'
            }`}
            style={{ width: `${overallPct}%` }}
          />
        </div>
      </div>

      {/* Grouped Budget Cards */}
      {GROUP_SECTIONS.map((sec) => {
        const cats = data.categories.filter((c) => c.group === sec.group);
        if (cats.length === 0) return null;

        return (
          <section key={sec.group} className="space-y-3">
            <div className="flex items-baseline justify-between">
              <div>
                <h2 className={`text-sm font-bold uppercase tracking-wider ${sec.accent}`}>
                  {sec.title}
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400">{sec.subtitle}</p>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {cats.map((cat) => {
                const summary = spendByCatId.get(cat.id);
                const spent = summary?.spent ?? 0;
                const rollover = summary?.rollover ?? 0;
                const effective = summary?.effectiveBudget ?? cat.monthlyBudget;
                const pct = effective > 0 ? Math.round((spent / effective) * 100) : 0;
                const over = effective > 0 && spent > effective;
                const caution = !over && pct >= 80;
                const isEditing = editingBudgetId === cat.id;

                return (
                  <div
                    key={cat.id}
                    className={`rounded-2xl p-4 bg-white dark:bg-slate-900/70 border transition-all ${
                      over
                        ? 'border-rose-500/40 bg-rose-500/[0.02]'
                        : caution
                        ? 'border-amber-500/35'
                        : 'border-slate-200 dark:border-slate-800/80'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => drillDownCategory(cat.id)}
                        className="flex items-center gap-2.5 text-left group min-w-0 cursor-pointer"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cat.color}1e`, color: cat.color }}
                        >
                          <CategoryIcon icon={cat.icon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-slate-900 dark:text-slate-100 group-hover:text-indigo-500 flex items-center gap-1 truncate">
                            <span className="truncate">{cat.name}</span>
                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0" />
                          </div>
                          <div className="text-[11px] text-slate-400 tabular-nums">
                            {summary?.transactionCount ?? 0} txns this month
                          </div>
                        </div>
                      </button>

                      {/* Inline Editable Limit */}
                      <div className="text-right shrink-0">
                        {isEditing ? (
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min="0"
                              step="10"
                              value={editingBudgetVal}
                              onChange={(e) => setEditingBudgetVal(e.target.value)}
                              onBlur={() => commitInlineBudget(cat.id)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') commitInlineBudget(cat.id);
                                if (e.key === 'Escape') setEditingBudgetId(null);
                              }}
                              autoFocus
                              className="w-20 rounded-lg bg-slate-100 dark:bg-slate-950 border border-indigo-500 px-2 py-1 text-xs font-semibold tabular-nums text-right outline-none"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitInlineBudget(cat.id);
                              }}
                              className="p-1 rounded bg-indigo-600 text-white cursor-pointer"
                            >
                              <Check className="w-3 h-3" />
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => {
                              setEditingBudgetId(cat.id);
                              setEditingBudgetVal(String(cat.monthlyBudget));
                            }}
                            className="text-xs font-semibold px-2 py-1 rounded-lg bg-slate-100/90 dark:bg-slate-800/80 hover:bg-indigo-500/15 hover:text-indigo-600 dark:hover:text-indigo-300 transition-colors cursor-pointer"
                            title="Click to edit monthly budget"
                          >
                            {cat.monthlyBudget > 0 ? (
                              <Money
                                amount={cat.monthlyBudget}
                                currency={currency}
                                privacyMask={privacyMask}
                              />
                            ) : (
                              <span className="text-slate-400">Set limit</span>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Progress */}
                    <div className="mt-3.5 space-y-1.5">
                      <div className="flex items-baseline justify-between text-xs">
                        <Money
                          amount={spent}
                          currency={currency}
                          privacyMask={privacyMask}
                          className={`font-semibold ${
                            over
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        />
                        <span
                          className={`text-[11px] font-medium tabular-nums ${
                            over
                              ? 'text-rose-600 dark:text-rose-400'
                              : caution
                              ? 'text-amber-600 dark:text-amber-400'
                              : 'text-slate-400'
                          }`}
                        >
                          {effective > 0
                            ? over
                              ? `Over by ${Math.round(spent - effective)} (${pct}%)`
                              : `${pct}% used`
                            : 'No limit'}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            backgroundColor: over
                              ? '#f43f5e'
                              : caution
                              ? '#f59e0b'
                              : cat.color,
                          }}
                        />
                      </div>
                    </div>

                    {/* Footer: Rollover toggle + delete custom */}
                    <div className="mt-3 pt-2.5 border-t border-slate-100 dark:border-slate-800/80 flex items-center justify-between text-[11px]">
                      <label className="inline-flex items-center gap-1.5 text-slate-500 dark:text-slate-400 cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={cat.rolloverEnabled}
                          onChange={() =>
                            updateCategory(cat.id, { rolloverEnabled: !cat.rolloverEnabled })
                          }
                          className="rounded border-slate-300 dark:border-slate-700 text-indigo-600"
                        />
                        <span>Envelope Rollover</span>
                        {cat.rolloverEnabled && rollover !== 0 && (
                          <span className="px-1.5 py-0.2 rounded bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 font-semibold">
                            <Money
                              amount={rollover}
                              currency={currency}
                              privacyMask={privacyMask}
                              showSign
                            />
                          </span>
                        )}
                      </label>

                      {!cat.isDefault && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`Delete category "${cat.name}"?`)) {
                              deleteCategory(cat.id);
                            }
                          }}
                          className="p-1 text-slate-400 hover:text-rose-500 cursor-pointer"
                          title="Delete custom category"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        );
      })}

      {/* Interactive "What-If" Budget Simulator */}
      {simCategories.length > 0 && (
        <section className="rounded-2xl bg-gradient-to-br from-indigo-600/8 via-white to-emerald-500/8 dark:from-indigo-500/12 dark:via-slate-900/90 dark:to-emerald-500/10 border border-indigo-500/25 p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-indigo-500/15 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-slate-900 dark:text-white">
                  Interactive &ldquo;What-If&rdquo; Budget Simulator
                </h2>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  Drag sliders below to see how trimming top categories accelerates your annual savings
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              {simMetrics.hasChanges && (
                <button
                  type="button"
                  onClick={() => setSimOverrides({})}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-xs font-medium text-slate-600 dark:text-slate-300 cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
              <button
                type="button"
                disabled={!simMetrics.hasChanges}
                onClick={applySimulatedBudgets}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5" />
                Apply Simulated Budgets
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Sliders */}
            <div className="lg:col-span-2 grid grid-cols-1 sm:grid-cols-2 gap-4">
              {simCategories.map((cat) => {
                const baseline =
                  cat.monthlyBudget > 0 ? cat.monthlyBudget : Math.round(spendByCatId.get(cat.id)?.spent ?? 100);
                const maxVal = Math.max(Math.round(baseline * 1.5), 200);
                const current = simOverrides[cat.id] ?? baseline;
                const diff = baseline - current;

                return (
                  <div
                    key={cat.id}
                    className="rounded-xl bg-white/85 dark:bg-slate-950/60 border border-slate-200/80 dark:border-slate-800 p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-slate-800 dark:text-slate-200 truncate">
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Money
                          amount={current}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="font-bold text-slate-900 dark:text-white"
                        />
                        {diff !== 0 && (
                          <span
                            className={`text-[10px] font-semibold tabular-nums ${
                              diff > 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-500'
                            }`}
                          >
                            ({diff > 0 ? '-' : '+'}
                            {Math.abs(Math.round(diff))})
                          </span>
                        )}
                      </div>
                    </div>
                    <input
                      type="range"
                      min={0}
                      max={maxVal}
                      step={10}
                      value={current}
                      onChange={(e) =>
                        setSimOverrides((prev) => ({
                          ...prev,
                          [cat.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-indigo-600 cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-slate-400 tabular-nums">
                      <span>0</span>
                      <span>Current: {Math.round(baseline)}</span>
                      <span>{maxVal}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Impact Summary */}
            <div className="rounded-2xl bg-slate-900 dark:bg-slate-950 text-white p-5 flex flex-col justify-between gap-4 border border-slate-800">
              <div>
                <div className="text-[11px] font-semibold uppercase tracking-wider text-indigo-400">
                  Projected Impact
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs text-slate-400">Monthly Savings Change</div>
                    <div
                      className={`text-2xl font-bold mt-0.5 ${
                        simMetrics.monthlyDelta >= 0 ? 'text-emerald-400' : 'text-rose-400'
                      }`}
                    >
                      <Money
                        amount={simMetrics.monthlyDelta}
                        currency={currency}
                        privacyMask={privacyMask}
                        showSign
                      />
                      <span className="text-xs font-normal text-slate-400"> /mo</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-slate-800 flex items-center justify-between">
                    <span className="text-xs text-slate-400">New Savings Rate</span>
                    <span className="text-sm font-bold tabular-nums text-white">
                      {simMetrics.projectedSavingsRate.toFixed(1)}%
                    </span>
                  </div>

                  <div className="pt-3 border-t border-slate-800">
                    <div className="text-xs text-slate-400">
                      12-Month Compounded Gain (4.5% APY)
                    </div>
                    <div className="text-xl font-bold text-indigo-300 mt-0.5">
                      <Money
                        amount={simMetrics.compounded12Mo}
                        currency={currency}
                        privacyMask={privacyMask}
                        showSign
                      />
                    </div>
                  </div>
                </div>
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Small adjustments across discretionary categories compound quietly all year without feeling restrictive.
              </p>
            </div>
          </div>
        </section>
      )}

      {/* Add Category Modal */}
      <Modal
        open={addModalOpen}
        onClose={() => setAddModalOpen(false)}
        title="Add Custom Category"
        subtitle="Create a new budget envelope or income source"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddCategory} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
              Category Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pets, Side Hustle, Hobbies"
              required
              autoFocus
              className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Budget Group
              </label>
              <select
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as CategoryGroup)}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm outline-none"
              >
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
                <option value="savings">Savings</option>
                <option value="income">Income</option>
              </select>
            </div>

            {newGroup !== 'income' && (
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                  Monthly Limit ({currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2.5 text-sm tabular-nums outline-none"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${
                    newColor === c ? 'ring-2 ring-offset-2 ring-indigo-500 scale-110 dark:ring-offset-slate-900' : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
              Icon
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {AVAILABLE_CATEGORY_ICONS.slice(0, 15).map((ic) => (
                <button
                  key={ic.id}
                  type="button"
                  onClick={() => setNewIcon(ic.id)}
                  className={`p-2 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${
                    newIcon === ic.id
                      ? 'border-indigo-500 bg-indigo-500/15 text-indigo-600 dark:text-indigo-300'
                      : 'border-slate-200 dark:border-slate-800 text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800'
                  }`}
                  title={ic.label}
                >
                  <CategoryIcon icon={ic.id} className="w-4 h-4" />
                </button>
              ))}
            </div>
          </div>

          {newGroup !== 'income' && (
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 cursor-pointer">
              <input
                type="checkbox"
                checked={newRollover}
                onChange={(e) => setNewRollover(e.target.checked)}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Enable envelope rollover for unused budget</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              Create Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
