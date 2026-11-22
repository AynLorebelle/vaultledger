import React, { useMemo, useState } from 'react';
import {
  Plus,
  Sliders,
  RefreshCw,
  Check,
  Trash2,
  ArrowUpRight,
  LineChart,
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
  accentStyle: React.CSSProperties;
}> = [
    {
      group: 'needs',
      title: 'Essential Needs',
      subtitle: 'Housing, groceries, utilities, transit & healthcare',
      accentStyle: { color: 'var(--accent-info)' },
    },
    {
      group: 'wants',
      title: 'Lifestyle & Wants',
      subtitle: 'Dining, coffee, shopping, entertainment & travel',
      accentStyle: { color: 'var(--accent-primary-text)' },
    },
    {
      group: 'savings',
      title: 'Savings & Investments',
      subtitle: 'Emergency fund, retirement & wealth building',
      accentStyle: { color: 'var(--accent-positive)' },
    },
  ];

export const BudgetsView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addCategory = useFinanceStore((s) => s.addCategory);
  const updateCategory = useFinanceStore((s) => s.updateCategory);
  const deleteCategory = useFinanceStore((s) => s.deleteCategory);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
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

  // Top 6 categories for the What-If simulator
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

  const overallBarColor =
    remaining < 0
      ? 'var(--accent-danger)'
      : overallPct >= 80
        ? 'var(--accent-warning)'
        : 'var(--accent-positive)';

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Monthly Budgets &amp; Envelopes
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
            Click any budget limit to edit inline · Toggle envelope rollover to carry unused balances forward
          </p>
        </div>
        <button
          type="button"
          onClick={() => setAddModalOpen(true)}
          className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-3.5 h-3.5" />
          <span>Add Category</span>
        </button>
      </div>

      {/* Top Budget Overview Bar */}
      <div className="tactile-card p-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-4">
          <div>
            <div className="text-xs text-[var(--text-muted)]">Monthly Effective Budget</div>
            <div className="text-2xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
              <Money amount={totalBudget} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">Spent This Month</div>
            <div className="text-2xl font-bold text-[var(--text-primary)] mt-0.5 tabular-nums">
              <Money amount={totalSpent} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
          <div>
            <div className="text-xs text-[var(--text-muted)]">
              {remaining >= 0 ? 'Remaining Headroom' : 'Over Budget'}
            </div>
            <div
              className="text-2xl font-bold mt-0.5 tabular-nums"
              style={{
                color: remaining >= 0 ? 'var(--accent-positive)' : 'var(--accent-danger)',
              }}
            >
              <Money amount={Math.abs(remaining)} currency={currency} privacyMask={privacyMask} />
            </div>
          </div>
        </div>
        <div className="tactile-well h-2.5 w-full rounded-full overflow-hidden">
          <div
            className="h-full rounded-full transition-all"
            style={{ width: `${overallPct}%`, backgroundColor: overallBarColor }}
          />
        </div>
        <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
          <span>{overallPct}% of monthly envelopes allocated</span>
          <span>{categorySpends.length} active categories</span>
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
                <h2
                  className="text-sm font-bold"
                  style={sec.accentStyle}
                >
                  {sec.title}
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">{sec.subtitle}</p>
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

                const barFill = over
                  ? 'var(--accent-danger)'
                  : caution
                    ? 'var(--accent-warning)'
                    : 'var(--accent-positive)';

                return (
                  <div
                    key={cat.id}
                    className="tactile-card p-4 transition-colors"
                    style={
                      over
                        ? { borderColor: 'var(--accent-danger)' }
                        : caution
                          ? { borderColor: 'var(--accent-warning)' }
                          : undefined
                    }
                  >
                    <div className="flex items-start justify-between gap-2">
                      <button
                        type="button"
                        onClick={() => drillDownCategory(cat.id)}
                        className="flex items-center gap-2.5 text-left group min-w-0 cursor-pointer"
                      >
                        <div
                          className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0 border border-[var(--border-hairline)]"
                          style={{ backgroundColor: `${cat.color}1e`, color: cat.color }}
                        >
                          <CategoryIcon icon={cat.icon} className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-sm font-semibold text-[var(--text-primary)] group-hover:text-[var(--accent-primary-text)] flex items-center gap-1 truncate transition-colors">
                            <span className="truncate">{cat.name}</span>
                            <ArrowUpRight className="w-3 h-3 opacity-0 group-hover:opacity-100 shrink-0 transition-opacity" />
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
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
                              aria-label={`Monthly budget limit for ${cat.name}`}
                              autoFocus
                              className="tactile-input w-20 px-2 py-1 text-xs font-semibold tabular-nums text-right"
                            />
                            <button
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                commitInlineBudget(cat.id);
                              }}
                              aria-label={`Save monthly budget for ${cat.name}`}
                              className="tactile-btn-primary p-1.5 rounded-lg cursor-pointer"
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
                            className="tactile-btn text-xs font-semibold px-2.5 py-1 rounded-lg tabular-nums cursor-pointer"
                            title="Click to edit monthly budget"
                          >
                            {cat.monthlyBudget > 0 ? (
                              <Money
                                amount={cat.monthlyBudget}
                                currency={currency}
                                privacyMask={privacyMask}
                              />
                            ) : (
                              <span className="text-[var(--text-muted)]">Set limit</span>
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
                          className={`font-semibold ${over ? 'text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'
                            }`}
                        />
                        <span
                          className="text-[11px] font-semibold tabular-nums"
                          style={{
                            color: over
                              ? 'var(--accent-danger)'
                              : caution
                                ? 'var(--accent-warning)'
                                : 'var(--text-muted)',
                          }}
                        >
                          {effective > 0
                            ? over
                              ? `Over by ${Math.round(spent - effective)} (${pct}%)`
                              : `${pct}% used`
                            : 'No limit'}
                        </span>
                      </div>
                      <div className="tactile-well h-2 w-full rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${Math.min(100, pct)}%`,
                            backgroundColor: barFill,
                          }}
                        />
                      </div>
                    </div>

                    {/* Footer: Rollover toggle + delete custom */}
                    <div className="mt-3 pt-2.5 border-t border-[var(--border-hairline)] flex items-center justify-between text-[11px]">
                      <label className="inline-flex items-center gap-1.5 text-[var(--text-secondary)] cursor-pointer select-none">
                        <input
                          type="checkbox"
                          checked={cat.rolloverEnabled}
                          onChange={() =>
                            updateCategory(cat.id, { rolloverEnabled: !cat.rolloverEnabled })
                          }
                          className="rounded border-[var(--border-strong)] accent-[var(--accent-primary)]"
                        />
                        <span>Envelope Rollover</span>
                        {cat.rolloverEnabled && rollover !== 0 && (
                          <span
                            className="px-1.5 py-0.5 rounded font-semibold tabular-nums"
                            style={{
                              backgroundColor: 'var(--accent-positive-soft)',
                              color: 'var(--accent-positive)',
                            }}
                          >
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
                          className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                          title="Delete custom category"
                          aria-label={`Delete category ${cat.name}`}
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
        <section className="tactile-card border-l-4 border-l-[var(--accent-primary)] p-6">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-5">
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{
                  backgroundColor: 'var(--accent-primary-soft)',
                  color: 'var(--accent-primary-text)',
                }}
              >
                <Sliders className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-base font-bold text-[var(--text-primary)] tracking-tight">
                  Interactive &ldquo;What-If&rdquo; Budget Simulator
                </h2>
                <p className="text-xs text-[var(--text-muted)] mt-0.5">
                  Drag sliders below to see how trimming top categories accelerates your annual savings
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => setActiveNav('forecast')}
                className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
              >
                <LineChart className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
                <span>Open 5-Year Forecast Lab</span>
              </button>
              {simMetrics.hasChanges && (
                <button
                  type="button"
                  onClick={() => setSimOverrides({})}
                  className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-medium text-[var(--text-secondary)] cursor-pointer"
                >
                  <RefreshCw className="w-3.5 h-3.5" />
                  Reset
                </button>
              )}
              <button
                type="button"
                disabled={!simMetrics.hasChanges}
                onClick={applySimulatedBudgets}
                className="tactile-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl disabled:opacity-40 text-xs font-semibold cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
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
                    className="tactile-well p-3.5 space-y-2"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="font-semibold text-[var(--text-primary)] truncate">
                        {cat.name}
                      </span>
                      <div className="flex items-center gap-1.5 shrink-0">
                        <Money
                          amount={current}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="font-bold text-[var(--text-primary)]"
                        />
                        {diff !== 0 && (
                          <span
                            className="text-[10px] font-semibold tabular-nums"
                            style={{
                              color: diff > 0 ? 'var(--accent-positive)' : 'var(--accent-danger)',
                            }}
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
                      aria-label={`Simulated monthly budget for ${cat.name}`}
                      onChange={(e) =>
                        setSimOverrides((prev) => ({
                          ...prev,
                          [cat.id]: Number(e.target.value),
                        }))
                      }
                      className="w-full accent-[var(--accent-primary)] cursor-pointer"
                    />
                    <div className="flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums">
                      <span>0</span>
                      <span>Current: {Math.round(baseline)}</span>
                      <span>{maxVal}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Live Impact Summary */}
            <div className="tactile-well p-5 flex flex-col justify-between gap-4">
              <div>
                <div
                  className="text-xs font-semibold"
                  style={{ color: 'var(--accent-primary-text)' }}
                >
                  Projected Impact
                </div>
                <div className="mt-3 space-y-3">
                  <div>
                    <div className="text-xs text-[var(--text-muted)]">Monthly Savings Change</div>
                    <div
                      className="text-2xl font-bold mt-0.5 tabular-nums"
                      style={{
                        color:
                          simMetrics.monthlyDelta >= 0
                            ? 'var(--accent-positive)'
                            : 'var(--accent-danger)',
                      }}
                    >
                      <Money
                        amount={simMetrics.monthlyDelta}
                        currency={currency}
                        privacyMask={privacyMask}
                        showSign
                      />
                      <span className="text-xs font-normal text-[var(--text-muted)]"> /mo</span>
                    </div>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-hairline)] flex items-center justify-between">
                    <span className="text-xs text-[var(--text-secondary)]">New Savings Rate</span>
                    <span className="text-sm font-bold tabular-nums text-[var(--text-primary)]">
                      {simMetrics.projectedSavingsRate.toFixed(1)}%
                    </span>
                  </div>

                  <div className="pt-3 border-t border-[var(--border-hairline)]">
                    <div className="text-xs text-[var(--text-muted)]">
                      12-Month Compounded Gain (4.5% APY)
                    </div>
                    <div
                      className="text-xl font-bold mt-0.5 tabular-nums"
                      style={{ color: 'var(--accent-primary-text)' }}
                    >
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
              <p className="text-[11px] text-[var(--text-muted)] leading-relaxed">
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
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Category Name
            </label>
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Pets, Side Hustle, Hobbies"
              required
              autoFocus
              className="tactile-input w-full px-3.5 py-2.5 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Budget Group
              </label>
              <select
                value={newGroup}
                onChange={(e) => setNewGroup(e.target.value as CategoryGroup)}
                className="tactile-input w-full px-3 py-2.5 text-sm"
              >
                <option value="needs">Needs</option>
                <option value="wants">Wants</option>
                <option value="savings">Savings</option>
                <option value="income">Income</option>
              </select>
            </div>

            {newGroup !== 'income' && (
              <div>
                <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                  Monthly Limit ({currency})
                </label>
                <input
                  type="number"
                  min="0"
                  step="10"
                  value={newBudget}
                  onChange={(e) => setNewBudget(e.target.value)}
                  className="tactile-input w-full px-3 py-2.5 text-sm tabular-nums"
                />
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Accent Color
            </label>
            <div className="flex flex-wrap gap-2">
              {PALETTE_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setNewColor(c)}
                  aria-label={`Select color ${c}`}
                  aria-pressed={newColor === c}
                  className={`w-7 h-7 rounded-full transition-transform cursor-pointer ${newColor === c ? 'ring-2 ring-offset-2 ring-[var(--focus-ring)] ring-offset-[var(--bg-surface)] scale-110' : ''
                    }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Icon
            </label>
            <div className="grid grid-cols-5 gap-1.5">
              {AVAILABLE_CATEGORY_ICONS.slice(0, 15).map((ic) => {
                const selected = newIcon === ic.id;
                return (
                  <button
                    key={ic.id}
                    type="button"
                    onClick={() => setNewIcon(ic.id)}
                    className={`p-2 rounded-xl border flex items-center justify-center transition-colors cursor-pointer ${selected
                        ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]'
                        : 'border-[var(--border-hairline)] text-[var(--text-muted)] hover:bg-[var(--bg-subtle)] hover:text-[var(--text-primary)]'
                      }`}
                    title={ic.label}
                    aria-label={`Select ${ic.label} icon`}
                    aria-pressed={selected}
                  >
                    <CategoryIcon icon={ic.id} className="w-4 h-4" />
                  </button>
                );
              })}
            </div>
          </div>

          {newGroup !== 'income' && (
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] cursor-pointer">
              <input
                type="checkbox"
                checked={newRollover}
                onChange={(e) => setNewRollover(e.target.checked)}
                className="rounded border-[var(--border-strong)] accent-[var(--accent-primary)]"
              />
              <span>Enable envelope rollover for unused budget</span>
            </label>
          )}

          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Create Category
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
