import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceLine,
} from 'recharts';
import {
  RotateCcw,
  Landmark,
  TrendingUp,
  TrendingDown,
  SlidersHorizontal,
  Flag,
  Plus,
  Trash2,
  Repeat,
  Calendar,
  Sparkles,
} from 'lucide-react';
import type {
  CurrencyCode,
  ForecastMilestone,
  ForecastPoint,
  VaultData,
} from '../types/finance';
import { deriveForecastBaseline, runNetWorthForecast } from '../core/forecaster';
import { formatMoney, getChartTheme, Money, type ChartTheme } from './ui';

export interface NetWorthForecasterProps {
  vault: VaultData;
  isDark: boolean;
  privacyMask: boolean;
  onAddMilestone: (milestone: Omit<ForecastMilestone, 'id'>) => void;
  onToggleMilestone: (id: string) => void;
  onDeleteMilestone: (id: string) => void;
}

interface ForecastTooltipProps {
  active?: boolean;
  payload?: Array<{ payload?: ForecastPoint }>;
  currency: CurrencyCode;
  privacyMask: boolean;
  chartTheme: ChartTheme;
}

const MASKED_VALUE = '••••••';

function formatSignedPercent(value: number, decimals = 0): string {
  const fixed = Math.abs(value).toFixed(decimals);
  if (value > 0) return `+${fixed}%`;
  if (value < 0) return `-${fixed}%`;
  return `${fixed}%`;
}

const ForecastTooltip: React.FC<ForecastTooltipProps> = ({
  active,
  payload,
  currency,
  privacyMask,
  chartTheme,
}) => {
  if (!active || !payload || payload.length === 0) {
    return null;
  }

  const point = payload[0]?.payload;
  if (!point) {
    return null;
  }

  const diff = point.scenarioNetWorth - point.baselineNetWorth;
  const displayMoney = (value: number, showSign = false) =>
    privacyMask ? MASKED_VALUE : formatMoney(value, currency, { showSign });

  return (
    <div
      className="rounded-xl px-3.5 py-3 text-xs min-w-[228px] max-w-[280px]"
      style={{
        backgroundColor: chartTheme.tooltipBg,
        border: `1px solid ${chartTheme.tooltipBorder}`,
        color: chartTheme.tooltipText,
        boxShadow: 'var(--shadow-elevated)',
      }}
    >
      <div
        className="flex items-center justify-between gap-3 pb-2 mb-2"
        style={{ borderBottom: `1px solid ${chartTheme.tooltipBorder}` }}
      >
        <span className="font-semibold tracking-tight">{point.label}</span>
        <span
          className="text-[11px] font-medium tabular-nums"
          style={{ color: chartTheme.tooltipMuted }}
        >
          {point.monthIndex === 0 ? 'Current' : `Month ${point.monthIndex}`}
        </span>
      </div>

      <div className="space-y-1.5 tabular-nums">
        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5" style={{ color: chartTheme.tooltipMuted }}>
            <span
              className="w-2.5 h-0.5 rounded-full inline-block"
              style={{
                borderTop: `2px dashed ${chartTheme.baseline}`,
              }}
            />
            Current Trajectory
          </span>
          <span className="font-medium">{displayMoney(point.baselineNetWorth)}</span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span className="inline-flex items-center gap-1.5" style={{ color: chartTheme.tooltipMuted }}>
            <span
              className="w-2.5 h-2.5 rounded-full inline-block"
              style={{ backgroundColor: chartTheme.primary }}
            />
            What-If Scenario
          </span>
          <span className="font-semibold">{displayMoney(point.scenarioNetWorth)}</span>
        </div>

        <div
          className="flex items-center justify-between gap-4 pt-1.5 mt-1"
          style={{ borderTop: `1px solid ${chartTheme.tooltipBorder}` }}
        >
          <span style={{ color: chartTheme.tooltipMuted }}>Difference</span>
          <span
            className="font-semibold"
            style={{
              color: diff >= 0 ? chartTheme.positive : chartTheme.danger,
            }}
          >
            {displayMoney(diff, true)}
          </span>
        </div>

        <div className="flex items-center justify-between gap-4">
          <span style={{ color: chartTheme.tooltipMuted }}>Monthly Cashflow</span>
          <span
            className="font-medium"
            style={{
              color:
                point.monthIndex === 0
                  ? chartTheme.tooltipMuted
                  : point.scenarioCashflow >= 0
                  ? chartTheme.positive
                  : chartTheme.danger,
            }}
          >
            {point.monthIndex === 0 ? '—' : displayMoney(point.scenarioCashflow, true)}
          </span>
        </div>
      </div>

      {point.milestoneLabels.length > 0 && (
        <div
          className="mt-2.5 pt-2 space-y-1"
          style={{ borderTop: `1px solid ${chartTheme.tooltipBorder}` }}
        >
          <div
            className="text-[10px] font-semibold uppercase tracking-wider"
            style={{ color: chartTheme.tooltipMuted }}
          >
            Milestones
          </div>
          <div className="flex flex-wrap gap-1">
            {point.milestoneLabels.map((msLabel, idx) => (
              <span
                key={`${msLabel}-${idx}`}
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-medium"
                style={{
                  backgroundColor: chartTheme.primaryFill,
                  color: chartTheme.primary,
                }}
              >
                <Flag className="w-2.5 h-2.5 shrink-0" />
                <span className="truncate max-w-[180px]">{msLabel}</span>
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export const NetWorthForecaster: React.FC<NetWorthForecasterProps> = ({
  vault,
  isDark,
  privacyMask,
  onAddMilestone,
  onToggleMilestone,
  onDeleteMilestone,
}) => {
  const [horizonMonths, setHorizonMonths] = useState<12 | 60>(12);
  const [incomeChangePct, setIncomeChangePct] = useState<number>(0);
  const [expenseChangePct, setExpenseChangePct] = useState<number>(0);
  const [expectedAnnualReturnPct, setExpectedAnnualReturnPct] = useState<number>(5);

  // Add-milestone form state
  const [msLabel, setMsLabel] = useState<string>('');
  const [msMonthOffset, setMsMonthOffset] = useState<string>('6');
  const [msDirection, setMsDirection] = useState<'inflow' | 'outflow'>('outflow');
  const [msRecurring, setMsRecurring] = useState<boolean>(false);
  const [msAmount, setMsAmount] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  const currency = vault.settings.baseCurrency;
  const milestones = vault.forecastMilestones ?? [];

  const baseline = useMemo(() => deriveForecastBaseline(vault), [vault]);

  const forecast = useMemo(
    () =>
      runNetWorthForecast({
        currentNetWorth: baseline.currentNetWorth,
        currentLiquidAssets: baseline.currentLiquidAssets,
        currentDebt: baseline.currentDebt,
        baselineMonthlyIncome: baseline.baselineMonthlyIncome,
        baselineMonthlyExpense: baseline.baselineMonthlyExpense,
        horizonMonths,
        incomeChangePct,
        expenseChangePct,
        expectedAnnualReturnPct,
        milestones,
      }),
    [
      baseline,
      horizonMonths,
      incomeChangePct,
      expenseChangePct,
      expectedAnnualReturnPct,
      milestones,
    ]
  );

  const chartTheme = useMemo(() => getChartTheme(isDark), [isDark]);

  const scenarioSavingsRate = useMemo(() => {
    if (forecast.projectedMonthlyIncome <= 0) {
      return 0;
    }
    return (forecast.projectedMonthlySavings / forecast.projectedMonthlyIncome) * 100;
  }, [forecast.projectedMonthlyIncome, forecast.projectedMonthlySavings]);

  const activeMilestonesInHorizon = useMemo(
    () =>
      milestones.filter(
        (ms) => ms.enabled && ms.monthOffset >= 1 && ms.monthOffset <= horizonMonths
      ),
    [milestones, horizonMonths]
  );

  const isDefaultSliders =
    incomeChangePct === 0 && expenseChangePct === 0 && expectedAnnualReturnPct === 5;

  const hasNegativePoints = useMemo(
    () =>
      forecast.points.some(
        (pt) => pt.baselineNetWorth < 0 || pt.scenarioNetWorth < 0
      ),
    [forecast.points]
  );

  const handleHorizonChange = (nextHorizon: 12 | 60) => {
    setHorizonMonths(nextHorizon);
    const parsedMonth = Number(msMonthOffset);
    if (Number.isFinite(parsedMonth) && parsedMonth > nextHorizon) {
      setMsMonthOffset(String(nextHorizon));
    }
  };

  const handleResetSliders = () => {
    setIncomeChangePct(0);
    setExpenseChangePct(0);
    setExpectedAnnualReturnPct(5);
  };

  const handleSubmitMilestone = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedLabel = msLabel.trim();
    const parsedAmount = Math.abs(Number(msAmount));
    const parsedMonth = Math.round(Number(msMonthOffset));

    if (!trimmedLabel) {
      setFormError('Enter a milestone label.');
      return;
    }
    if (!Number.isFinite(parsedAmount) || parsedAmount <= 0) {
      setFormError('Enter an amount greater than 0.');
      return;
    }
    if (!Number.isFinite(parsedMonth) || parsedMonth < 1 || parsedMonth > horizonMonths) {
      setFormError(`Choose a month between 1 and ${horizonMonths}.`);
      return;
    }

    onAddMilestone({
      label: trimmedLabel,
      monthOffset: parsedMonth,
      amount: msDirection === 'inflow' ? parsedAmount : -parsedAmount,
      recurring: msRecurring,
      enabled: true,
    });

    setMsLabel('');
    setMsAmount('');
    setFormError(null);
  };

  const firstPointLabel = forecast.points[0]?.label ?? '';
  const lastPointLabel = forecast.points[forecast.points.length - 1]?.label ?? '';

  return (
    <div className="space-y-6 vl-fade-up">
      {/* Header Bar */}
      <header className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--text-primary)]">
            Net Worth &amp; Cashflow Forecaster
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-muted)] mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <span>Trailing 3-mo baseline:</span>
            <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)]">
              <Money
                amount={baseline.baselineMonthlyIncome}
                currency={currency}
                privacyMask={privacyMask}
              />
              <span>/mo income</span>
            </span>
            <span aria-hidden="true">·</span>
            <span className="inline-flex items-center gap-1 font-medium text-[var(--text-secondary)]">
              <Money
                amount={baseline.baselineMonthlyExpense}
                currency={currency}
                privacyMask={privacyMask}
              />
              <span>/mo expense</span>
            </span>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {/* Horizon Segmented Toggle */}
          <div
            role="group"
            aria-label="Forecast horizon"
            className="tactile-well p-1 inline-flex items-center gap-1"
          >
            <button
              type="button"
              onClick={() => handleHorizonChange(12)}
              aria-pressed={horizonMonths === 12}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                horizonMonths === 12
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              style={horizonMonths === 12 ? { boxShadow: 'var(--shadow-btn)' } : undefined}
            >
              12 Months
            </button>
            <button
              type="button"
              onClick={() => handleHorizonChange(60)}
              aria-pressed={horizonMonths === 60}
              className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                horizonMonths === 60
                  ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                  : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
              }`}
              style={horizonMonths === 60 ? { boxShadow: 'var(--shadow-btn)' } : undefined}
            >
              5 Years
            </button>
          </div>

          <button
            type="button"
            onClick={handleResetSliders}
            disabled={isDefaultSliders}
            className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset Sliders</span>
          </button>
        </div>
      </header>

      {/* 3 Live Summary KPI Cards */}
      <section className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {/* KPI 1: Projected Net Worth */}
        <div className="tactile-card p-5 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Projected Net Worth
            </span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <Landmark className="w-4 h-4" />
            </div>
          </div>

          <div className="mt-3">
            <div className="text-2xl font-bold tracking-tight tabular-nums text-[var(--text-primary)]">
              <Money
                amount={forecast.endingScenarioNetWorth}
                currency={currency}
                privacyMask={privacyMask}
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 tabular-nums">
              Current net worth:{' '}
              <Money
                amount={baseline.currentNetWorth}
                currency={currency}
                privacyMask={privacyMask}
                className="font-semibold text-[var(--text-secondary)]"
              />{' '}
              · {horizonMonths === 12 ? '12-mo' : '5-yr'} end
            </p>
          </div>
        </div>

        {/* KPI 2: What-If Delta vs Baseline */}
        <div className="tactile-card p-5 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              What-If Delta vs Baseline
            </span>
            <div
              className="w-8 h-8 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor:
                  forecast.netWorthDelta >= 0
                    ? 'var(--accent-positive-soft)'
                    : 'var(--accent-danger-soft)',
                color:
                  forecast.netWorthDelta >= 0
                    ? 'var(--accent-positive)'
                    : 'var(--accent-danger)',
              }}
            >
              {forecast.netWorthDelta >= 0 ? (
                <TrendingUp className="w-4 h-4" />
              ) : (
                <TrendingDown className="w-4 h-4" />
              )}
            </div>
          </div>

          <div className="mt-3">
            <div
              className="text-2xl font-bold tracking-tight tabular-nums"
              style={{
                color:
                  forecast.netWorthDelta >= 0
                    ? 'var(--accent-positive)'
                    : 'var(--accent-danger)',
              }}
            >
              <Money
                amount={forecast.netWorthDelta}
                currency={currency}
                privacyMask={privacyMask}
                showSign
              />
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 tabular-nums">
              {activeMilestonesInHorizon.length > 0 ? (
                <>
                  Milestones:{' '}
                  <Money
                    amount={forecast.totalMilestoneImpact}
                    currency={currency}
                    privacyMask={privacyMask}
                    showSign
                    className="font-semibold"
                  />{' '}
                  ({activeMilestonesInHorizon.length} active)
                </>
              ) : (
                <>
                  Baseline end:{' '}
                  <Money
                    amount={forecast.endingBaselineNetWorth}
                    currency={currency}
                    privacyMask={privacyMask}
                    compact
                    className="font-semibold text-[var(--text-secondary)]"
                  />{' '}
                  · No active milestones
                </>
              )}
            </p>
          </div>
        </div>

        {/* KPI 3: Projected Monthly Cashflow */}
        <div className="tactile-card p-5 flex flex-col justify-between min-w-0">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Projected Monthly Cashflow
            </span>
            <span
              className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums shrink-0"
              style={{
                backgroundColor:
                  scenarioSavingsRate >= 20
                    ? 'var(--accent-positive-soft)'
                    : scenarioSavingsRate >= 0
                    ? 'var(--accent-warning-soft)'
                    : 'var(--accent-danger-soft)',
                color:
                  scenarioSavingsRate >= 20
                    ? 'var(--accent-positive)'
                    : scenarioSavingsRate >= 0
                    ? 'var(--accent-warning)'
                    : 'var(--accent-danger)',
              }}
            >
              {scenarioSavingsRate.toFixed(1)}% rate
            </span>
          </div>

          <div className="mt-3">
            <div
              className="text-2xl font-bold tracking-tight tabular-nums flex items-baseline gap-1"
              style={{
                color:
                  forecast.projectedMonthlySavings >= 0
                    ? 'var(--accent-positive)'
                    : 'var(--accent-danger)',
              }}
            >
              <Money
                amount={forecast.projectedMonthlySavings}
                currency={currency}
                privacyMask={privacyMask}
                showSign
              />
              <span className="text-xs font-medium text-[var(--text-muted)]">/mo</span>
            </div>
            <p className="text-xs text-[var(--text-muted)] mt-1.5 tabular-nums">
              {forecast.projectedMonthlySavings >= 0 ? 'Savings' : 'Deficit'} · In{' '}
              <Money
                amount={forecast.projectedMonthlyIncome}
                currency={currency}
                privacyMask={privacyMask}
                compact
                className="font-semibold text-[var(--text-secondary)]"
              />{' '}
              / Out{' '}
              <Money
                amount={forecast.projectedMonthlyExpense}
                currency={currency}
                privacyMask={privacyMask}
                compact
                className="font-semibold text-[var(--text-secondary)]"
              />
            </p>
          </div>
        </div>
      </section>

      {/* Interactive Recharts AreaChart */}
      <section className="tactile-card p-5 min-w-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="min-w-0">
            <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight">
              Net Worth Trajectory
            </h2>
            <p className="text-xs text-[var(--text-muted)] mt-0.5 tabular-nums">
              {firstPointLabel} — {lastPointLabel} · Comparing baseline cashflow vs. What-If scenario
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-4 text-xs text-[var(--text-secondary)] shrink-0">
            <span className="inline-flex items-center gap-2">
              <span
                className="w-5 inline-block"
                style={{ borderTop: `2px dashed ${chartTheme.baseline}` }}
              />
              <span>Current Trajectory</span>
            </span>
            <span className="inline-flex items-center gap-2 font-medium text-[var(--text-primary)]">
              <span
                className="w-5 h-0.5 rounded-full inline-block"
                style={{ backgroundColor: chartTheme.primary }}
              />
              <span>What-If Scenario</span>
            </span>
          </div>
        </div>

        <div className="w-full min-w-0 h-[290px] sm:h-[340px]">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart
              data={forecast.points}
              margin={{ top: 10, right: 16, left: 4, bottom: 4 }}
            >
              <defs>
                <linearGradient id="vlForecastScenarioFill" x1="0" y1="0" x2="0" y2="1">
                  <stop
                    offset="0%"
                    stopColor={chartTheme.primary}
                    stopOpacity={isDark ? 0.24 : 0.16}
                  />
                  <stop offset="100%" stopColor={chartTheme.primary} stopOpacity={0.01} />
                </linearGradient>
              </defs>

              <CartesianGrid
                strokeDasharray="3 3"
                stroke={chartTheme.grid}
                vertical={false}
              />

              <XAxis
                dataKey="label"
                stroke={chartTheme.tick}
                tick={{ fill: chartTheme.tick, fontSize: 11 }}
                tickLine={false}
                axisLine={{ stroke: chartTheme.grid }}
                interval={horizonMonths === 60 ? 5 : 0}
                minTickGap={20}
              />

              <YAxis
                stroke={chartTheme.tick}
                tick={{ fill: chartTheme.tick, fontSize: 11 }}
                tickLine={false}
                axisLine={false}
                width={72}
                tickFormatter={(val: number) =>
                  privacyMask ? '••••' : formatMoney(val, currency, { compact: true })
                }
              />

              {hasNegativePoints && (
                <ReferenceLine
                  y={0}
                  stroke={chartTheme.grid}
                  strokeWidth={1.25}
                />
              )}

              <Tooltip
                content={
                  <ForecastTooltip
                    currency={currency}
                    privacyMask={privacyMask}
                    chartTheme={chartTheme}
                  />
                }
              />

              <Area
                type="monotone"
                dataKey="baselineNetWorth"
                name="Current Trajectory"
                stroke={chartTheme.baseline}
                strokeWidth={2}
                strokeDasharray="5 4"
                fill="none"
                fillOpacity={0}
                dot={false}
                activeDot={{
                  r: 4,
                  fill: chartTheme.baseline,
                  stroke: chartTheme.tooltipBg,
                  strokeWidth: 2,
                }}
              />

              <Area
                type="monotone"
                dataKey="scenarioNetWorth"
                name="What-If Scenario"
                stroke={chartTheme.primary}
                strokeWidth={2.5}
                fill="url(#vlForecastScenarioFill)"
                dot={(dotProps: {
                  cx?: number;
                  cy?: number;
                  index?: number;
                  payload?: ForecastPoint;
                }) => {
                  const hasMs = (dotProps.payload?.milestoneLabels?.length ?? 0) > 0;
                  if (!hasMs || dotProps.cx === undefined || dotProps.cy === undefined) {
                    return <g key={`ms-empty-${dotProps.index ?? 0}`} />;
                  }
                  return (
                    <circle
                      key={`ms-dot-${dotProps.index ?? 0}`}
                      cx={dotProps.cx}
                      cy={dotProps.cy}
                      r={4}
                      fill={chartTheme.primary}
                      stroke={chartTheme.tooltipBg}
                      strokeWidth={2}
                    />
                  );
                }}
                activeDot={{
                  r: 5,
                  fill: chartTheme.primary,
                  stroke: chartTheme.tooltipBg,
                  strokeWidth: 2,
                }}
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </section>

      {/* Scenario Sliders + Financial Milestones (2-column responsive) */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-5 items-start">
        {/* Left: Scenario Levers */}
        <div className="tactile-card p-5 space-y-5 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                <SlidersHorizontal
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent-primary-text)' }}
                />
                <span>Scenario Levers</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Simulate raises, spending trims, and compound investment growth
              </p>
            </div>
            {!isDefaultSliders && (
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold shrink-0"
                style={{
                  backgroundColor: 'var(--accent-primary-soft)',
                  color: 'var(--accent-primary-text)',
                }}
              >
                Modified
              </span>
            )}
          </div>

          <div className="space-y-5">
            {/* Slider 1: Income Change */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="forecast-income-slider"
                  className="text-xs font-semibold text-[var(--text-primary)]"
                >
                  Income Change
                </label>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-xs text-[var(--text-muted)]">
                    <Money
                      amount={forecast.projectedMonthlyIncome}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                    /mo
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-semibold min-w-[52px] text-center"
                    style={{
                      backgroundColor:
                        incomeChangePct > 0
                          ? 'var(--accent-positive-soft)'
                          : incomeChangePct < 0
                          ? 'var(--accent-danger-soft)'
                          : 'var(--bg-subtle)',
                      color:
                        incomeChangePct > 0
                          ? 'var(--accent-positive)'
                          : incomeChangePct < 0
                          ? 'var(--accent-danger)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {formatSignedPercent(incomeChangePct)}
                  </span>
                </div>
              </div>
              <input
                id="forecast-income-slider"
                type="range"
                min={-30}
                max={50}
                step={1}
                value={incomeChangePct}
                onChange={(e) => setIncomeChangePct(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none bg-[var(--bg-inset)] cursor-pointer accent-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              />
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>-30%</span>
                <span>0% baseline</span>
                <span>+50%</span>
              </div>
            </div>

            {/* Slider 2: Expense Change */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="forecast-expense-slider"
                  className="text-xs font-semibold text-[var(--text-primary)]"
                >
                  Expense Change
                </label>
                <div className="flex items-center gap-2 tabular-nums">
                  <span className="text-xs text-[var(--text-muted)]">
                    <Money
                      amount={forecast.projectedMonthlyExpense}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                    /mo
                  </span>
                  <span
                    className="px-2 py-0.5 rounded-md text-xs font-semibold min-w-[52px] text-center"
                    style={{
                      backgroundColor:
                        expenseChangePct < 0
                          ? 'var(--accent-positive-soft)'
                          : expenseChangePct > 0
                          ? 'var(--accent-danger-soft)'
                          : 'var(--bg-subtle)',
                      color:
                        expenseChangePct < 0
                          ? 'var(--accent-positive)'
                          : expenseChangePct > 0
                          ? 'var(--accent-danger)'
                          : 'var(--text-secondary)',
                    }}
                  >
                    {formatSignedPercent(expenseChangePct)}
                  </span>
                </div>
              </div>
              <input
                id="forecast-expense-slider"
                type="range"
                min={-40}
                max={25}
                step={1}
                value={expenseChangePct}
                onChange={(e) => setExpenseChangePct(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none bg-[var(--bg-inset)] cursor-pointer accent-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              />
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>-40%</span>
                <span>0% baseline</span>
                <span>+25%</span>
              </div>
            </div>

            {/* Slider 3: Expected Annual Return */}
            <div className="space-y-2">
              <div className="flex items-center justify-between gap-2">
                <label
                  htmlFor="forecast-return-slider"
                  className="text-xs font-semibold text-[var(--text-primary)]"
                >
                  Expected Annual Return
                </label>
                <span
                  className="px-2 py-0.5 rounded-md text-xs font-semibold tabular-nums min-w-[60px] text-center"
                  style={{
                    backgroundColor: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary-text)',
                  }}
                >
                  {expectedAnnualReturnPct.toFixed(1)}% / yr
                </span>
              </div>
              <input
                id="forecast-return-slider"
                type="range"
                min={0}
                max={12}
                step={0.5}
                value={expectedAnnualReturnPct}
                onChange={(e) => setExpectedAnnualReturnPct(Number(e.target.value))}
                className="w-full h-2 rounded-lg appearance-none bg-[var(--bg-inset)] cursor-pointer accent-[var(--accent-primary)] focus-visible:outline-2 focus-visible:outline-[var(--focus-ring)] focus-visible:outline-offset-2"
              />
              <div className="flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
                <span>0%</span>
                <span>Applied monthly to positive net worth</span>
                <span>12%</span>
              </div>
            </div>
          </div>

          {/* Starting Position Summary */}
          <div className="tactile-well px-3.5 py-3 grid grid-cols-2 gap-3 text-xs">
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">Liquid Assets</div>
              <div className="font-semibold text-[var(--text-primary)] mt-0.5 tabular-nums">
                <Money
                  amount={baseline.currentLiquidAssets}
                  currency={currency}
                  privacyMask={privacyMask}
                />
              </div>
            </div>
            <div>
              <div className="text-[11px] text-[var(--text-muted)]">Current Debt</div>
              <div
                className="font-semibold mt-0.5 tabular-nums"
                style={{
                  color:
                    baseline.currentDebt > 0
                      ? 'var(--accent-danger)'
                      : 'var(--text-primary)',
                }}
              >
                <Money
                  amount={baseline.currentDebt}
                  currency={currency}
                  privacyMask={privacyMask}
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right: Financial Milestones */}
        <div className="tactile-card p-5 space-y-4 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-sm font-bold text-[var(--text-primary)] tracking-tight flex items-center gap-2">
                <Flag
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent-primary-text)' }}
                />
                <span>Financial Milestones</span>
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Layer one-time purchases, windfalls, or recurring life changes
              </p>
            </div>
            <span className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] shrink-0">
              {milestones.filter((m) => m.enabled).length} / {milestones.length} active
            </span>
          </div>

          {/* Compact Add-Milestone Form */}
          <form onSubmit={handleSubmitMilestone} className="tactile-well p-3.5 space-y-3">
            <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5">
              <div className="sm:col-span-8">
                <label
                  htmlFor="milestone-label-input"
                  className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Milestone Label
                </label>
                <input
                  id="milestone-label-input"
                  type="text"
                  value={msLabel}
                  onChange={(e) => {
                    setMsLabel(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder="e.g. Emergency Goal, New Laptop"
                  className="tactile-input w-full px-3 py-1.5 text-xs placeholder:text-[var(--text-muted)]"
                />
              </div>

              <div className="sm:col-span-4">
                <label
                  htmlFor="milestone-month-input"
                  className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Month # (1–{horizonMonths})
                </label>
                <input
                  id="milestone-month-input"
                  type="number"
                  min={1}
                  max={horizonMonths}
                  step={1}
                  value={msMonthOffset}
                  onChange={(e) => {
                    setMsMonthOffset(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  className="tactile-input w-full px-3 py-1.5 text-xs tabular-nums"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              <div>
                <label
                  htmlFor="milestone-type-select"
                  className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Type
                </label>
                <select
                  id="milestone-type-select"
                  value={msDirection}
                  onChange={(e) =>
                    setMsDirection(e.target.value === 'inflow' ? 'inflow' : 'outflow')
                  }
                  className="tactile-input w-full px-2.5 py-1.5 text-xs cursor-pointer"
                >
                  <option value="inflow">Inflow (+)</option>
                  <option value="outflow">Outflow (-)</option>
                </select>
              </div>

              <div>
                <label
                  htmlFor="milestone-frequency-select"
                  className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Frequency
                </label>
                <select
                  id="milestone-frequency-select"
                  value={msRecurring ? 'recurring' : 'onetime'}
                  onChange={(e) => setMsRecurring(e.target.value === 'recurring')}
                  className="tactile-input w-full px-2.5 py-1.5 text-xs cursor-pointer"
                >
                  <option value="onetime">One-time</option>
                  <option value="recurring">Monthly recurring</option>
                </select>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-end gap-2.5">
              <div className="flex-1">
                <label
                  htmlFor="milestone-amount-input"
                  className="block text-[11px] font-semibold text-[var(--text-secondary)] mb-1"
                >
                  Amount ({currency})
                </label>
                <input
                  id="milestone-amount-input"
                  type="number"
                  min="0"
                  step="any"
                  value={msAmount}
                  onChange={(e) => {
                    setMsAmount(e.target.value);
                    if (formError) setFormError(null);
                  }}
                  placeholder={msRecurring ? 'e.g. 250 / mo' : 'e.g. 1500'}
                  className="tactile-input w-full px-3 py-1.5 text-xs tabular-nums placeholder:text-[var(--text-muted)]"
                />
              </div>

              <button
                type="submit"
                className="tactile-btn-primary inline-flex items-center justify-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold cursor-pointer shrink-0 h-[32px]"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Add</span>
              </button>
            </div>

            {formError && (
              <p
                role="alert"
                className="text-[11px] font-medium"
                style={{ color: 'var(--accent-danger)' }}
              >
                {formError}
              </p>
            )}
          </form>

          {/* Milestones List */}
          {milestones.length === 0 ? (
            <div className="rounded-xl border border-dashed border-[var(--border-strong)] px-4 py-7 text-center">
              <Sparkles className="w-5 h-5 mx-auto mb-2 text-[var(--text-muted)]" />
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                No financial milestones yet
              </p>
              <p className="text-[11px] text-[var(--text-muted)] mt-1 max-w-xs mx-auto">
                Add a one-time purchase, bonus, or recurring monthly shift to see how it changes your trajectory.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 max-h-[300px] overflow-y-auto pr-0.5">
              {milestones.map((ms) => {
                const isInflow = ms.amount >= 0;
                const outsideHorizon = ms.monthOffset > horizonMonths;
                const timingLabel = ms.recurring
                  ? `From Month ${ms.monthOffset} · Monthly`
                  : `Month ${ms.monthOffset} · One-time`;

                return (
                  <li
                    key={ms.id}
                    className={`rounded-xl border px-3 py-2.5 flex items-center justify-between gap-3 transition-opacity ${
                      ms.enabled
                        ? 'bg-[var(--bg-surface)] border-[var(--border-hairline)]'
                        : 'bg-[var(--bg-subtle)] border-[var(--border-hairline)] opacity-65'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={ms.enabled}
                        onChange={() => onToggleMilestone(ms.id)}
                        aria-label={`Toggle milestone ${ms.label}`}
                        className="mt-0.5 w-4 h-4 rounded accent-[var(--accent-primary)] cursor-pointer shrink-0"
                      />
                      <div className="min-w-0">
                        <div
                          className={`text-xs font-semibold truncate ${
                            ms.enabled
                              ? 'text-[var(--text-primary)]'
                              : 'text-[var(--text-muted)] line-through'
                          }`}
                        >
                          {ms.label}
                        </div>
                        <div className="mt-1 flex flex-wrap items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-medium bg-[var(--bg-subtle)] text-[var(--text-secondary)] border border-[var(--border-hairline)] tabular-nums">
                            {ms.recurring ? (
                              <Repeat className="w-2.5 h-2.5 shrink-0" />
                            ) : (
                              <Calendar className="w-2.5 h-2.5 shrink-0" />
                            )}
                            <span>{timingLabel}</span>
                          </span>
                          {outsideHorizon && (
                            <span
                              className="px-1.5 py-0.5 rounded-md text-[10px] font-medium"
                              style={{
                                backgroundColor: 'var(--accent-warning-soft)',
                                color: 'var(--accent-warning)',
                              }}
                            >
                              Outside {horizonMonths}-mo view
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <div
                        className="text-xs font-bold tabular-nums text-right"
                        style={{
                          color: isInflow
                            ? 'var(--accent-positive)'
                            : 'var(--accent-danger)',
                        }}
                      >
                        <Money
                          amount={ms.amount}
                          currency={currency}
                          privacyMask={privacyMask}
                          showSign
                        />
                        {ms.recurring && (
                          <span className="text-[10px] font-medium text-[var(--text-muted)]">
                            /mo
                          </span>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => onDeleteMilestone(ms.id)}
                        aria-label={`Delete milestone ${ms.label}`}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
};
