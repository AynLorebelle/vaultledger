import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  ShieldCheck,
  TrendingUp,
  TrendingDown,
  Flame,
  Landmark,
  AlertTriangle,
  Sparkles,
  Info,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  buildCashflowSankey,
  computeCategorySpend,
  computeDashboardKPIs,
  computeMonthlyTrends,
  computeProactiveInsights,
  computeRecurringSummary,
  computeSpendingHeatmap,
  formatCurrency,
} from '../core/analytics';
import { SankeyChart } from './SankeyChart';
import { SpendingHeatmap } from './SpendingHeatmap';
import { CategoryIcon, Money, daysUntil, formatShortDate } from './ui';

export const DashboardView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const timeRange = useFinanceStore((s) => s.timeRange);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const drillDownDate = useFinanceStore((s) => s.drillDownDate);
  const markBillPaidAndLog = useFinanceStore((s) => s.markBillPaidAndLog);

  const [trendMode, setTrendMode] = useState<'cashflow' | 'networth'>('cashflow');

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  const kpis = useMemo(() => computeDashboardKPIs(data, timeRange), [data, timeRange]);
  const sankeyGraph = useMemo(() => buildCashflowSankey(data, timeRange), [data, timeRange]);
  const categorySpends = useMemo(() => computeCategorySpend(data, timeRange), [data, timeRange]);
  const monthlyTrends = useMemo(() => computeMonthlyTrends(data, 6), [data]);
  const heatmapDays = useMemo(() => computeSpendingHeatmap(data.transactions, 112), [data.transactions]);
  const insights = useMemo(() => computeProactiveInsights(data), [data]);
  const recurringSummary = useMemo(
    () => computeRecurringSummary(data.recurringBills),
    [data.recurringBills]
  );

  const upcomingBills = useMemo(
    () => [...recurringSummary.overdue, ...recurringSummary.upcomingSoon].slice(0, 6),
    [recurringSummary]
  );

  const topCategories = useMemo(
    () => categorySpends.filter((c) => c.spent > 0 || c.effectiveBudget > 0).slice(0, 6),
    [categorySpends]
  );

  const budgetProgressPct =
    kpis.monthlyBudgetTotal > 0
      ? Math.min(100, Math.round((kpis.periodExpenses / kpis.monthlyBudgetTotal) * 100))
      : 0;

  return (
    <div className="space-y-6">
      {/* Executive KPI Cockpit */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Safe-to-Spend */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Safe-to-Spend
            </span>
            <div className="w-8 h-8 rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div
              className={`text-2xl font-bold tracking-tight ${
                kpis.safeToSpend >= 0
                  ? 'text-slate-900 dark:text-white'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <Money amount={kpis.safeToSpend} currency={currency} privacyMask={privacyMask} />
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-1.5">
              Liquid cash{' '}
              <Money
                amount={kpis.liquidCash}
                currency={currency}
                privacyMask={privacyMask}
                compact
                className="font-medium text-slate-700 dark:text-slate-300"
              />{' '}
              minus 30d bills &amp; goals
            </p>
          </div>
        </div>

        {/* 2. Net Cashflow & Savings Rate */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Net Cashflow
            </span>
            <span
              className={`px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums ${
                kpis.savingsRate >= 20
                  ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                  : kpis.savingsRate >= 0
                  ? 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  : 'bg-rose-500/15 text-rose-700 dark:text-rose-300'
              }`}
            >
              {kpis.savingsRate.toFixed(1)}% saved
            </span>
          </div>
          <div className="mt-3">
            <div
              className={`text-2xl font-bold tracking-tight ${
                kpis.netCashflow >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              }`}
            >
              <Money
                amount={kpis.netCashflow}
                currency={currency}
                privacyMask={privacyMask}
                showSign
              />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span className="inline-flex items-center gap-1">
                <TrendingUp className="w-3 h-3 text-emerald-500" />
                <Money amount={kpis.periodIncome} currency={currency} privacyMask={privacyMask} compact />
              </span>
              <span className="inline-flex items-center gap-1">
                <TrendingDown className="w-3 h-3 text-rose-500" />
                <Money amount={kpis.periodExpenses} currency={currency} privacyMask={privacyMask} compact />
              </span>
            </div>
          </div>
        </div>

        {/* 3. Total Expenses & Burn-Rate Forecast */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Expenses
            </span>
            <div className="w-8 h-8 rounded-xl bg-amber-500/12 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <Flame className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <Money amount={kpis.periodExpenses} currency={currency} privacyMask={privacyMask} />
            </div>
            <div className="mt-2 space-y-1.5">
              <div className="w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all ${
                    budgetProgressPct >= 100
                      ? 'bg-rose-500'
                      : budgetProgressPct >= 80
                      ? 'bg-amber-500'
                      : 'bg-indigo-500'
                  }`}
                  style={{ width: `${budgetProgressPct}%` }}
                />
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-500 dark:text-slate-400">
                <span>
                  Burn:{' '}
                  <Money
                    amount={kpis.dailyBurnRate}
                    currency={currency}
                    privacyMask={privacyMask}
                    className="font-medium text-slate-700 dark:text-slate-300"
                  />
                  /d
                </span>
                <span>
                  Proj:{' '}
                  <Money
                    amount={kpis.projectedMonthEndExpense}
                    currency={currency}
                    privacyMask={privacyMask}
                    compact
                    className="font-medium text-slate-700 dark:text-slate-300"
                  />
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* 4. Total Net Worth */}
        <div className="rounded-2xl p-5 bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Total Net Worth
            </span>
            <div className="w-8 h-8 rounded-xl bg-indigo-500/12 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <Landmark className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight text-slate-900 dark:text-white">
              <Money amount={kpis.totalNetWorth} currency={currency} privacyMask={privacyMask} />
            </div>
            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate-500 dark:text-slate-400">
              <span>
                Cash:{' '}
                <Money
                  amount={kpis.liquidCash}
                  currency={currency}
                  privacyMask={privacyMask}
                  compact
                  className="font-medium text-emerald-600 dark:text-emerald-400"
                />
              </span>
              <span>•</span>
              <span>
                Debt:{' '}
                <Money
                  amount={kpis.totalDebt}
                  currency={currency}
                  privacyMask={privacyMask}
                  compact
                  className="font-medium text-rose-600 dark:text-rose-400"
                />
              </span>
            </div>
          </div>
        </div>
      </section>

      {/* Proactive Local Insights Strip */}
      {insights.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
          {insights.slice(0, 3).map((ins) => {
            const Icon =
              ins.severity === 'warning'
                ? AlertTriangle
                : ins.severity === 'positive'
                ? Sparkles
                : Info;
            const toneClass =
              ins.severity === 'warning'
                ? 'border-l-amber-500 bg-amber-500/5 dark:bg-amber-500/8 border-amber-500/20'
                : ins.severity === 'positive'
                ? 'border-l-emerald-500 bg-emerald-500/5 dark:bg-emerald-500/8 border-emerald-500/20'
                : 'border-l-indigo-500 bg-indigo-500/5 dark:bg-indigo-500/8 border-indigo-500/20';
            const iconColor =
              ins.severity === 'warning'
                ? 'text-amber-500'
                : ins.severity === 'positive'
                ? 'text-emerald-500'
                : 'text-indigo-500';

            return (
              <button
                key={ins.id}
                type="button"
                onClick={() => {
                  if (ins.filterCategoryId && ins.actionTarget === 'transactions') {
                    drillDownCategory(ins.filterCategoryId);
                  } else if (ins.actionTarget) {
                    setActiveNav(ins.actionTarget);
                  }
                }}
                className={`text-left rounded-xl border border-l-4 p-3.5 transition-all hover:translate-y-[-1px] cursor-pointer ${toneClass}`}
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <Icon className={`w-4 h-4 shrink-0 ${iconColor}`} />
                    <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {ins.title}
                    </span>
                  </div>
                  {ins.actionLabel && (
                    <span className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-indigo-600 dark:text-indigo-400 shrink-0">
                      {ins.actionLabel}
                      <ArrowRight className="w-3 h-3" />
                    </span>
                  )}
                </div>
                <p className={`text-xs text-slate-600 dark:text-slate-400 mt-1 line-clamp-2 ${privacyMask ? 'privacy-blur' : ''}`}>
                  {ins.detail}
                </p>
              </button>
            );
          })}
        </section>
      )}

      {/* Hero Cashflow Sankey Diagram */}
      <section className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-slate-900 dark:text-white tracking-tight">
              Cashflow Sankey
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Follow every dollar from income sources into Needs, Wants, and Savings · Click any category to drill down
            </p>
          </div>
          <div className="flex items-center gap-3 text-xs">
            <span className="px-2.5 py-1 rounded-lg bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300">
              Inflow:{' '}
              <Money
                amount={sankeyGraph.totalIncome}
                currency={currency}
                privacyMask={privacyMask}
                className="font-semibold text-emerald-600 dark:text-emerald-400"
              />
            </span>
          </div>
        </div>
        <SankeyChart
          graph={sankeyGraph}
          currency={currency}
          privacyMask={privacyMask}
          onSelectCategory={(catId) => drillDownCategory(catId)}
        />
      </section>

      {/* Trends + Top Categories Row */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        {/* Income vs Expenses / Net Worth Chart */}
        <div className="xl:col-span-2 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                {trendMode === 'cashflow' ? '6-Month Cashflow Trend' : 'Net Worth Trajectory'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {trendMode === 'cashflow'
                  ? 'Monthly income vs. net expenses (refunds offset automatically)'
                  : 'Historical combined assets minus liabilities'}
              </p>
            </div>
            <div className="flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-950 border border-slate-200/80 dark:border-slate-800">
              <button
                type="button"
                onClick={() => setTrendMode('cashflow')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  trendMode === 'cashflow'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Cashflow Bars
              </button>
              <button
                type="button"
                onClick={() => setTrendMode('networth')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  trendMode === 'networth'
                    ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
                }`}
              >
                Net Worth Area
              </button>
            </div>
          </div>

          <div className="h-[260px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              {trendMode === 'cashflow' ? (
                <BarChart data={monthlyTrends} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: number) =>
                      privacyMask ? '••' : formatCurrency(v, currency, true)
                    }
                    width={58}
                  />
                  <Tooltip
                    cursor={{ fill: 'rgba(99,102,241,0.06)' }}
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(51, 65, 85, 0.8)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: number, name: string) => [
                      privacyMask ? '••••••' : formatCurrency(val, currency),
                      name === 'income' ? 'Income' : 'Expenses',
                    ]}
                  />
                  <Bar dataKey="income" name="income" fill="#10b981" radius={[6, 6, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="expenses" name="expenses" fill="#6366f1" radius={[6, 6, 0, 0]} maxBarSize={32} />
                </BarChart>
              ) : (
                <AreaChart data={monthlyTrends}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#6366f1" stopOpacity={0.38} />
                      <stop offset="95%" stopColor="#6366f1" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(148,163,184,0.16)" vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: '#94a3b8' }}
                    tickFormatter={(v: number) =>
                      privacyMask ? '••' : formatCurrency(v, currency, true)
                    }
                    width={62}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: 'rgba(15, 23, 42, 0.95)',
                      border: '1px solid rgba(51, 65, 85, 0.8)',
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: '#f8fafc',
                    }}
                    formatter={(val: number) => [
                      privacyMask ? '••••••' : formatCurrency(val, currency),
                      'Net Worth',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke="#6366f1"
                    strokeWidth={2.5}
                    fill="url(#nwGrad)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Categories Breakdown */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Top Categories
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Click any category to inspect transactions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('budgets')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-0.5 cursor-pointer"
            >
              Budgets
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-3 flex-1">
            {topCategories.length === 0 ? (
              <p className="text-xs text-slate-400 py-8 text-center">
                No categorized spending recorded in this period.
              </p>
            ) : (
              topCategories.map((cat) => {
                const over = cat.effectiveBudget > 0 && cat.spent > cat.effectiveBudget;
                const pct =
                  cat.effectiveBudget > 0
                    ? Math.min(100, Math.round((cat.spent / cat.effectiveBudget) * 100))
                    : 100;
                return (
                  <button
                    key={cat.categoryId}
                    type="button"
                    onClick={() => drillDownCategory(cat.categoryId)}
                    className="w-full text-left group p-2 -mx-2 rounded-xl hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                        >
                          <CategoryIcon icon={cat.icon} className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-medium text-slate-800 dark:text-slate-200 truncate group-hover:text-indigo-600 dark:group-hover:text-indigo-400">
                          {cat.categoryName}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <Money
                          amount={cat.spent}
                          currency={currency}
                          privacyMask={privacyMask}
                          className={`font-semibold ${
                            over
                              ? 'text-rose-600 dark:text-rose-400'
                              : 'text-slate-900 dark:text-slate-100'
                          }`}
                        />
                        {cat.effectiveBudget > 0 && (
                          <span className="text-slate-400">
                            {' '}
                            /{' '}
                            <Money
                              amount={cat.effectiveBudget}
                              currency={currency}
                              privacyMask={privacyMask}
                              compact
                            />
                          </span>
                        )}
                      </span>
                    </div>
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: over ? '#f43f5e' : cat.color,
                        }}
                      />
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      </section>

      {/* Bottom Row: Spending Heatmap + Upcoming Bills */}
      <section className="grid grid-cols-1 xl:grid-cols-3 gap-5">
        <div className="xl:col-span-2 rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-slate-900 dark:text-white">
              Daily Spending Heatmap
            </h2>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Last 16 weeks of spending intensity · Spot no-spend streaks and spike days instantly
            </p>
          </div>
          <SpendingHeatmap
            days={heatmapDays}
            currency={currency}
            privacyMask={privacyMask}
            onSelectDate={(iso) => drillDownDate(iso)}
          />
        </div>

        {/* Upcoming Bills Next 14 Days */}
        <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 p-5 shadow-xs flex flex-col">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock className="w-4 h-4 text-indigo-500" />
              <h2 className="text-base font-semibold text-slate-900 dark:text-white">
                Upcoming Bills (14d)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('recurring')}
              className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline cursor-pointer"
            >
              View all
            </button>
          </div>

          <div className="space-y-2.5 flex-1">
            {upcomingBills.length === 0 ? (
              <div className="py-10 text-center">
                <CheckCircle2 className="w-7 h-7 text-emerald-500 mx-auto mb-2 opacity-80" />
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">
                  All clear for the next 14 days
                </p>
              </div>
            ) : (
              upcomingBills.map((bill) => {
                const diff = daysUntil(bill.nextDueDate);
                const overdue = diff < 0;
                const dueLabel = overdue
                  ? `${Math.abs(diff)}d overdue`
                  : diff === 0
                  ? 'Due today'
                  : `In ${diff}d`;

                return (
                  <div
                    key={bill.id}
                    className="flex items-center justify-between gap-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                          {bill.name}
                        </span>
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${
                            overdue
                              ? 'bg-rose-500/15 text-rose-600 dark:text-rose-400'
                              : diff <= 3
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                              : 'bg-slate-200/80 dark:bg-slate-800 text-slate-600 dark:text-slate-400'
                          }`}
                        >
                          {dueLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {formatShortDate(bill.nextDueDate)}
                        {bill.autoPay ? ' · Auto-pay' : ''}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Money
                        amount={bill.amount}
                        currency={currency}
                        privacyMask={privacyMask}
                        className={`text-xs font-semibold ${
                          bill.type === 'income'
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-slate-900 dark:text-slate-100'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => markBillPaidAndLog(bill.id)}
                        className="px-2.5 py-1 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-medium transition-colors cursor-pointer"
                        title="Log transaction and advance next due date"
                      >
                        Pay &amp; Log
                      </button>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </section>
    </div>
  );
};
