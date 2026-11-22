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
  Flame,
  Landmark,
  AlertTriangle,
  Info,
  CalendarClock,
  CheckCircle2,
  ChevronRight,
  Users,
  Trophy,
  Bot,
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
import { getEffectiveProfile } from '../core/aiCoach';
import { computeSquadLeaderboard, createDefaultSavingsSquads } from '../core/savingsSquad';
import type { VaultAnswerDrillAction } from '../types/finance';
import { AskVaultPanel } from './AskVaultPanel';
import { FinancialHealthCard } from './FinancialHealthCard';
import { SankeyChart } from './SankeyChart';
import { SpendingHeatmap } from './SpendingHeatmap';
import { CategoryIcon, Money, daysUntil, formatShortDate, getChartTheme } from './ui';

export const DashboardView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const timeRange = useFinanceStore((s) => s.timeRange);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const drillDownDate = useFinanceStore((s) => s.drillDownDate);
  const drillDownSearch = useFinanceStore((s) => s.drillDownSearch);
  const markBillPaidAndLog = useFinanceStore((s) => s.markBillPaidAndLog);
  const setProfileModalOpen = useFinanceStore((s) => s.setProfileModalOpen);

  const profile = getEffectiveProfile(data);

  const [trendMode, setTrendMode] = useState<'cashflow' | 'networth'>('cashflow');
  const [askQuery, setAskQuery] = useState('');

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const isDark = data.settings.theme === 'dark';
  const chartTheme = useMemo(() => getChartTheme(isDark), [isDark]);

  const kpis = useMemo(() => computeDashboardKPIs(data, timeRange), [data, timeRange]);
  const sankeyGraph = useMemo(() => buildCashflowSankey(data, timeRange), [data, timeRange]);
  const categorySpends = useMemo(() => computeCategorySpend(data, timeRange), [data, timeRange]);
  const monthlyTrends = useMemo(() => computeMonthlyTrends(data, 6), [data]);
  const heatmapDays = useMemo(() => computeSpendingHeatmap(data.transactions, 112), [data.transactions]);
  const insights = useMemo(() => computeProactiveInsights(data), [data]);
  const recurringSummary = useMemo(
    () => computeRecurringSummary(data.recurringBills),
    [data.recurringBills],
  );

  const upcomingBills = useMemo(
    () => [...recurringSummary.overdue, ...recurringSummary.upcomingSoon].slice(0, 5),
    [recurringSummary],
  );

  const topCategories = useMemo(
    () => categorySpends.filter((c) => c.spent > 0 || c.effectiveBudget > 0).slice(0, 6),
    [categorySpends],
  );

  const firstSquad = useMemo(
    () => (data.savingsSquads && data.savingsSquads[0]) ?? createDefaultSavingsSquads(currency)[0],
    [data.savingsSquads, currency],
  );
  const squadLeaderboard = useMemo(
    () => computeSquadLeaderboard(firstSquad),
    [firstSquad],
  );

  const budgetProgressPct =
    kpis.monthlyBudgetTotal > 0
      ? Math.min(100, Math.round((kpis.periodExpenses / kpis.monthlyBudgetTotal) * 100))
      : 0;

  const handleAskDrillDown = (action: VaultAnswerDrillAction) => {
    if (action.categoryId) {
      drillDownCategory(action.categoryId);
    } else if (action.searchQuery) {
      drillDownSearch(action.searchQuery);
    } else if (action.date) {
      drillDownDate(action.date);
    } else {
      setActiveNav(action.nav);
    }
  };

  const budgetBarColor =
    budgetProgressPct >= 100
      ? 'var(--accent-danger)'
      : budgetProgressPct >= 80
      ? 'var(--accent-warning)'
      : 'var(--accent-primary)';

  return (
    <div className="space-y-6">
      {/* Calm Header Bar */}
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Overview for {profile.displayName}
          </h1>
          <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">
            {profile.tagline} | Target savings rate: {profile.monthlySavingsGoalPct}%
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setProfileModalOpen(true)}
            className="tactile-btn px-3.5 py-2 text-xs font-bold cursor-pointer"
          >
            Profile &amp; Currency
          </button>
          <button
            type="button"
            onClick={() => setActiveNav('coach')}
            className="tactile-btn-primary px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Bot className="w-3.5 h-3.5 text-[#1F2937]" />
            <span>Ask Aynieee</span>
          </button>
        </div>
      </header>

      {/* Local Q&A Bar */}
      <AskVaultPanel
        vault={data}
        privacyMask={privacyMask}
        query={askQuery}
        onQueryChange={setAskQuery}
        onDrillDown={handleAskDrillDown}
      />

      {/* 4 Clean KPI Cards */}
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* 1. Safe to spend */}
        <div className="card clay-surface-peach flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1F2937]/85">
              Safe to spend
            </span>
            <ShieldCheck className="w-4 h-4 text-[#047857] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight tabular-nums text-[#1F2937]">
              <Money amount={kpis.safeToSpend} currency={currency} privacyMask={privacyMask} />
            </div>
            <p className="text-xs font-medium text-[#1F2937]/80 mt-1">
              After 30-day bills and goals
            </p>
          </div>
        </div>

        {/* 2. Net cashflow */}
        <div className="card clay-surface-mint flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1F2937]/85">
              Net cashflow
            </span>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold tabular-nums bg-white/80 text-[#065F46]">
              {kpis.savingsRate.toFixed(1)}% saved
            </span>
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight tabular-nums text-[#1F2937]">
              <Money
                amount={kpis.netCashflow}
                currency={currency}
                privacyMask={privacyMask}
                showSign
              />
            </div>
            <p className="text-xs font-medium text-[#1F2937]/80 mt-1 tabular-nums">
              In{' '}
              <Money
                amount={kpis.periodIncome}
                currency={currency}
                privacyMask={privacyMask}
                compact
                className="font-bold text-[#1F2937]"
              />{' '}
              / Out{' '}
              <Money
                amount={kpis.periodExpenses}
                currency={currency}
                privacyMask={privacyMask}
                compact
                className="font-bold text-[#1F2937]"
              />
            </p>
          </div>
        </div>

        {/* 3. Monthly expenses */}
        <div className="card clay-surface-blue flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1F2937]/85">
              Monthly expenses
            </span>
            <Flame className="w-4 h-4 text-[#92400E] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight tabular-nums text-[#1F2937]">
              <Money amount={kpis.periodExpenses} currency={currency} privacyMask={privacyMask} />
            </div>
            <div className="mt-2">
              <div className="progress" aria-hidden="true">
                <span
                  style={{
                    width: `${budgetProgressPct}%`,
                    borderColor: budgetBarColor,
                  }}
                />
              </div>
              <p className="text-xs font-medium text-[#1F2937]/80 mt-1 tabular-nums">
                Daily pace:{' '}
                <Money
                  amount={kpis.dailyBurnRate}
                  currency={currency}
                  privacyMask={privacyMask}
                  className="font-bold text-[#1F2937]"
                />
                /day
              </p>
            </div>
          </div>
        </div>

        {/* 4. Net worth */}
        <div className="card clay-surface-pink flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-bold text-[#1F2937]/85">
              Net worth
            </span>
            <Landmark className="w-4 h-4 text-[#6D28D9] shrink-0" aria-hidden="true" />
          </div>
          <div className="mt-3">
            <div className="text-2xl font-extrabold tracking-tight tabular-nums text-[#1F2937]">
              <Money amount={kpis.totalNetWorth} currency={currency} privacyMask={privacyMask} />
            </div>
            <div className="mt-1 flex items-center justify-between text-xs font-medium text-[#1F2937]/80">
              <span>
                Cash{' '}
                <Money
                  amount={kpis.liquidCash}
                  currency={currency}
                  privacyMask={privacyMask}
                  compact
                  className="font-bold text-[#065F46]"
                />
              </span>
              <button
                type="button"
                onClick={() => setActiveNav('forecast')}
                className="text-xs font-bold text-[#5B21B6] hover:underline cursor-pointer"
              >
                Forecast Lab
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Clean Friend Savings Squad Summary Card */}
      <section className="card clay-surface-sage min-w-0">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1 min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <CategoryIcon icon={firstSquad.emoji} className="w-4 h-4 text-[#1F2937]" />
              <h2 className="text-base sm:text-lg font-extrabold text-[#1F2937] tracking-tight">
                {firstSquad.name}
              </h2>
              <span className="px-2 py-0.5 rounded-lg bg-white/75 text-xs font-bold text-[#1F2937] tabular-nums">
                Room {firstSquad.roomCode}
              </span>
            </div>
            <p className="text-xs font-medium text-[#1F2937]/85">
              {squadLeaderboard.headline}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="text-sm font-extrabold text-[#1F2937] tabular-nums">
              <Money
                amount={squadLeaderboard.totalSaved}
                currency={currency}
                privacyMask={privacyMask}
              />{' '}
              <span className="text-xs font-semibold text-[#1F2937]/75">
                of <Money amount={squadLeaderboard.targetAmount} currency={currency} privacyMask={privacyMask} compact /> (
                {squadLeaderboard.progressPercent.toFixed(0)}%)
              </span>
            </div>

            <button
              type="button"
              onClick={() => setActiveNav('squad')}
              className="tactile-btn-primary px-4 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Users className="w-3.5 h-3.5 text-[#1F2937]" aria-hidden="true" />
              <span>Open Friend Squads</span>
            </button>
          </div>
        </div>

        <div className="progress mt-3" aria-label="Squad savings goal progress">
          <span style={{ width: `${squadLeaderboard.progressPercent}%` }} />
        </div>

        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          {squadLeaderboard.entries.map((entry) => (
            <div
              key={entry.member.id}
              className="flex items-center justify-between gap-2 px-3 py-2 rounded-2xl bg-white/85 border border-white text-[#1F2937]"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span
                  className="w-7 h-7 rounded-xl flex items-center justify-center text-xs font-extrabold text-[#1F2937] border border-white shrink-0"
                  style={{ backgroundColor: entry.member.clayColor }}
                >
                  {entry.rank === 1 ? <Trophy className="w-3.5 h-3.5" /> : `#${entry.rank}`}
                </span>
                <div className="min-w-0">
                  <div className="text-xs font-extrabold text-[#1F2937] truncate">
                    {entry.member.name}
                  </div>
                  <div className="text-[11px] font-medium text-[#1F2937]/75 tabular-nums">
                    {entry.sharePercent.toFixed(1)}% share
                  </div>
                </div>
              </div>
              <div className="text-xs font-extrabold text-[#1F2937] tabular-nums shrink-0">
                <Money
                  amount={entry.totalContributed}
                  currency={currency}
                  privacyMask={privacyMask}
                />
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Proactive Insights Strip */}
      {insights.length > 0 && (
        <section className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {insights.slice(0, 3).map((ins) => {
            const Icon =
              ins.severity === 'warning'
                ? AlertTriangle
                : ins.severity === 'positive'
                ? CheckCircle2
                : Info;
            const accentColor =
              ins.severity === 'warning'
                ? 'var(--accent-warning)'
                : ins.severity === 'positive'
                ? 'var(--accent-positive)'
                : 'var(--accent-info)';
            const accentSoft =
              ins.severity === 'warning'
                ? 'var(--accent-warning-soft)'
                : ins.severity === 'positive'
                ? 'var(--accent-positive-soft)'
                : 'var(--accent-info-soft)';

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
                className="tactile-card text-left p-3.5 transition-all hover:border-[var(--border-strong)] cursor-pointer"
                style={{ borderLeftWidth: '3px', borderLeftColor: accentColor }}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span
                      className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                      style={{ backgroundColor: accentSoft, color: accentColor }}
                      aria-hidden="true"
                    >
                      <Icon className="w-3.5 h-3.5" />
                    </span>
                    <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {ins.title}
                    </span>
                  </div>
                  {ins.actionLabel && (
                    <span className="text-[11px] font-semibold text-[var(--accent-primary-text)] shrink-0">
                      {ins.actionLabel}
                    </span>
                  )}
                </div>
                <p
                  className={`text-xs text-[var(--text-secondary)] mt-1.5 line-clamp-2 ${
                    privacyMask ? 'privacy-blur' : ''
                  }`}
                >
                  {ins.detail}
                </p>
              </button>
            );
          })}
        </section>
      )}

      {/* Financial Health Score Card */}
      <FinancialHealthCard
        vault={data}
        privacyMask={privacyMask}
        onNavigate={setActiveNav}
      />

      {/* Cashflow Sankey Diagram */}
      <section className="tactile-card p-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-4">
          <div>
            <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
              Cashflow Flow
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Income allocation across Needs, Wants, and Savings. Click a category to inspect transactions.
            </p>
          </div>
          <span className="tactile-well px-2.5 py-1 text-xs text-[var(--text-secondary)] self-start sm:self-auto">
            Inflow:{' '}
            <Money
              amount={sankeyGraph.totalIncome}
              currency={currency}
              privacyMask={privacyMask}
              className="font-semibold text-[var(--accent-positive)]"
            />
          </span>
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
        <div className="xl:col-span-2 min-w-0 tactile-card p-5">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                {trendMode === 'cashflow' ? '6-Month Cashflow Trend' : 'Net Worth Trajectory'}
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                {trendMode === 'cashflow'
                  ? 'Monthly income and net expenses'
                  : 'Combined assets minus liabilities'}
              </p>
            </div>
            <div
              role="tablist"
              aria-label="Trend chart mode"
              className="tactile-well inline-flex items-center p-1 gap-1"
            >
              <button
                type="button"
                role="tab"
                aria-selected={trendMode === 'cashflow'}
                onClick={() => setTrendMode('cashflow')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  trendMode === 'cashflow'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                Cashflow
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={trendMode === 'networth'}
                onClick={() => setTrendMode('networth')}
                className={`px-3 py-1 rounded-lg text-xs font-medium transition-colors cursor-pointer ${
                  trendMode === 'networth'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)] shadow-xs'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
              >
                Net Worth
              </button>
            </div>
          </div>

          <div className="h-[260px] w-full min-w-0">
            <ResponsiveContainer width="100%" height="100%">
              {trendMode === 'cashflow' ? (
                <BarChart data={monthlyTrends} barGap={6}>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: chartTheme.tick }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: chartTheme.tick }}
                    tickFormatter={(v: number) =>
                      privacyMask ? '••' : formatCurrency(v, currency, true)
                    }
                    width={58}
                  />
                  <Tooltip
                    cursor={{ fill: chartTheme.primaryFill }}
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: chartTheme.tooltipText,
                      boxShadow: 'var(--shadow-elevated)',
                    }}
                    labelStyle={{ color: chartTheme.tooltipMuted, fontWeight: 600 }}
                    itemStyle={{ color: chartTheme.tooltipText }}
                    formatter={(val: number, name: string) => [
                      privacyMask ? '••••••' : formatCurrency(val, currency),
                      name === 'income' ? 'Income' : 'Expenses',
                    ]}
                  />
                  <Bar
                    dataKey="income"
                    name="income"
                    fill={chartTheme.positive}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                  <Bar
                    dataKey="expenses"
                    name="expenses"
                    fill={chartTheme.secondary}
                    radius={[6, 6, 0, 0]}
                    maxBarSize={32}
                  />
                </BarChart>
              ) : (
                <AreaChart data={monthlyTrends}>
                  <defs>
                    <linearGradient id="nwGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor={chartTheme.primary} stopOpacity={0.3} />
                      <stop offset="95%" stopColor={chartTheme.primary} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                  <XAxis
                    dataKey="label"
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: chartTheme.tick }}
                  />
                  <YAxis
                    axisLine={false}
                    tickLine={false}
                    tick={{ fontSize: 11, fill: chartTheme.tick }}
                    tickFormatter={(v: number) =>
                      privacyMask ? '••' : formatCurrency(v, currency, true)
                    }
                    width={62}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: chartTheme.tooltipBg,
                      border: `1px solid ${chartTheme.tooltipBorder}`,
                      borderRadius: '12px',
                      fontSize: '12px',
                      color: chartTheme.tooltipText,
                      boxShadow: 'var(--shadow-elevated)',
                    }}
                    labelStyle={{ color: chartTheme.tooltipMuted, fontWeight: 600 }}
                    itemStyle={{ color: chartTheme.tooltipText }}
                    formatter={(val: number) => [
                      privacyMask ? '••••••' : formatCurrency(val, currency),
                      'Net Worth',
                    ]}
                  />
                  <Area
                    type="monotone"
                    dataKey="netWorth"
                    stroke={chartTheme.primary}
                    strokeWidth={2.5}
                    fill="url(#nwGrad)"
                  />
                </AreaChart>
              )}
            </ResponsiveContainer>
          </div>
        </div>

        {/* Top Categories Breakdown */}
        <div className="tactile-card p-5 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div>
              <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                Top Categories
              </h2>
              <p className="text-xs text-[var(--text-muted)]">
                Select a category to view transactions
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('budgets')}
              className="text-xs font-semibold text-[var(--accent-primary-text)] hover:underline inline-flex items-center gap-0.5 cursor-pointer shrink-0"
            >
              Budgets
              <ChevronRight className="w-3.5 h-3.5" aria-hidden="true" />
            </button>
          </div>

          <div className="space-y-3 flex-1">
            {topCategories.length === 0 ? (
              <div className="tactile-well py-8 px-4 text-center">
                <p className="text-xs text-[var(--text-muted)]">
                  No categorized spending recorded in this period.
                </p>
              </div>
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
                    className="w-full text-left group p-2 -mx-2 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors cursor-pointer"
                  >
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span className="flex items-center gap-2 min-w-0">
                        <span
                          className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0"
                          style={{ backgroundColor: `${cat.color}20`, color: cat.color }}
                          aria-hidden="true"
                        >
                          <CategoryIcon icon={cat.icon} className="w-3.5 h-3.5" />
                        </span>
                        <span className="font-medium text-[var(--text-primary)] truncate group-hover:text-[var(--accent-primary-text)] transition-colors">
                          {cat.categoryName}
                        </span>
                      </span>
                      <span className="shrink-0 tabular-nums">
                        <Money
                          amount={cat.spent}
                          currency={currency}
                          privacyMask={privacyMask}
                          className={`font-semibold ${
                            over ? 'text-[var(--accent-danger)]' : 'text-[var(--text-primary)]'
                          }`}
                        />
                        {cat.effectiveBudget > 0 && (
                          <span className="text-[var(--text-muted)]">
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
                    <div className="mt-1.5 h-1.5 w-full rounded-full bg-[var(--bg-subtle)] overflow-hidden">
                      <div
                        className="h-full rounded-full transition-[width] duration-300"
                        style={{
                          width: `${pct}%`,
                          backgroundColor: over ? 'var(--accent-danger)' : cat.color,
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
        <div className="xl:col-span-2 min-w-0 tactile-card p-5">
          <div className="mb-4">
            <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
              Daily Spending Heatmap
            </h2>
            <p className="text-xs text-[var(--text-muted)]">
              Last 16 weeks of daily spending activity
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
        <div className="tactile-card p-5 flex flex-col min-w-0">
          <div className="flex items-center justify-between gap-2 mb-4">
            <div className="flex items-center gap-2">
              <CalendarClock
                className="w-4 h-4 text-[var(--accent-primary-text)] shrink-0"
                aria-hidden="true"
              />
              <h2 className="text-base font-semibold text-[var(--text-primary)] tracking-tight">
                Upcoming Bills (14d)
              </h2>
            </div>
            <button
              type="button"
              onClick={() => setActiveNav('recurring')}
              className="text-xs font-semibold text-[var(--accent-primary-text)] hover:underline cursor-pointer shrink-0"
            >
              View all
            </button>
          </div>

          <div className="space-y-2.5 flex-1">
            {upcomingBills.length === 0 ? (
              <div className="tactile-well py-10 px-4 text-center">
                <CheckCircle2
                  className="w-7 h-7 mx-auto mb-2"
                  style={{ color: 'var(--accent-positive)' }}
                  aria-hidden="true"
                />
                <p className="text-xs font-semibold text-[var(--text-primary)]">
                  No bills due in the next 14 days
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

                const badgeStyle: React.CSSProperties = overdue
                  ? { backgroundColor: 'var(--accent-danger-soft)', color: 'var(--accent-danger)' }
                  : diff <= 3
                  ? {
                      backgroundColor: 'var(--accent-warning-soft)',
                      color: 'var(--accent-warning)',
                    }
                  : { backgroundColor: 'var(--bg-surface)', color: 'var(--text-muted)' };

                return (
                  <div
                    key={bill.id}
                    className="tactile-well flex items-center justify-between gap-3 p-3"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-[var(--text-primary)] truncate">
                          {bill.name}
                        </span>
                        <span
                          className="px-1.5 py-0.5 rounded-md text-[10px] font-semibold shrink-0 tabular-nums"
                          style={badgeStyle}
                        >
                          {dueLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                        {formatShortDate(bill.nextDueDate)}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <Money
                        amount={bill.amount}
                        currency={currency}
                        privacyMask={privacyMask}
                        className={`text-xs font-semibold ${
                          bill.type === 'income'
                            ? 'text-[var(--accent-positive)]'
                            : 'text-[var(--text-primary)]'
                        }`}
                      />
                      <button
                        type="button"
                        onClick={() => markBillPaidAndLog(bill.id)}
                        className="tactile-btn-primary px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer"
                        title="Log transaction and advance next due date"
                        aria-label={`Pay and log ${bill.name}`}
                      >
                        Pay
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
