import React, { useMemo, useState } from 'react';
import {
  Activity,
  ArrowUpRight,
  ChevronDown,
  Target,
} from 'lucide-react';
import type {
  HealthMetric,
  HealthMetricStatus,
  HealthScoreResult,
  NavSection,
  VaultData,
} from '../types/finance';
import { computeFinancialHealthScore } from '../core/healthScore';

export interface FinancialHealthCardProps {
  vault: VaultData;
  privacyMask: boolean;
  onNavigate: (nav: NavSection) => void;
}

interface SemanticTone {
  fg: string;
  bg: string;
  label: string;
}

const STATUS_TONES: Record<HealthMetricStatus, SemanticTone> = {
  strong: {
    fg: 'var(--accent-positive)',
    bg: 'var(--accent-positive-soft)',
    label: 'Strong',
  },
  fair: {
    fg: 'var(--accent-warning)',
    bg: 'var(--accent-warning-soft)',
    label: 'Fair',
  },
  attention: {
    fg: 'var(--accent-danger)',
    bg: 'var(--accent-danger-soft)',
    label: 'Needs focus',
  },
};

function getGradeTone(grade: HealthScoreResult['grade']): SemanticTone {
  if (grade === 'A+' || grade === 'A' || grade === 'B+') {
    return {
      fg: 'var(--accent-positive)',
      bg: 'var(--accent-positive-soft)',
      label: grade === 'A+' || grade === 'A' ? 'Healthy' : 'Solid',
    };
  }
  if (grade === 'B' || grade === 'C') {
    return {
      fg: 'var(--accent-warning)',
      bg: 'var(--accent-warning-soft)',
      label: 'Fair',
    };
  }
  return {
    fg: 'var(--accent-danger)',
    bg: 'var(--accent-danger-soft)',
    label: 'Needs focus',
  };
}

const NAV_CTA_LABELS: Record<NavSection, string> = {
  dashboard: 'Review Cashflow',
  transactions: 'Open Transactions',
  budgets: 'Open Budgets',
  recurring: 'Review Recurring',
  goals: 'Open Goals & Debt',
  forecast: 'Open Forecast',
  accounts: 'Inspect Accounts',
  rules: 'Open Rules',
  download: 'Open Desktop App',
};

const GAUGE_SIZE = 156;
const GAUGE_CENTER = GAUGE_SIZE / 2;
const GAUGE_RADIUS = 62;
const GAUGE_STROKE = 11;
const GAUGE_CIRCUMFERENCE = 2 * Math.PI * GAUGE_RADIUS;

export const FinancialHealthCard: React.FC<FinancialHealthCardProps> = ({
  vault,
  privacyMask,
  onNavigate,
}) => {
  const health = useMemo(() => computeFinancialHealthScore(vault), [vault]);
  const [expandedId, setExpandedId] = useState<HealthMetric['id'] | null>(null);

  const clampedScore = Math.max(0, Math.min(100, health.score));
  const strokeDashoffset = GAUGE_CIRCUMFERENCE * (1 - clampedScore / 100);
  const gradeTone = getGradeTone(health.grade);

  const handleToggleMetric = (id: HealthMetric['id']) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  return (
    <section
      className="tactile-card p-5 sm:p-6"
      aria-labelledby="financial-health-heading"
    >
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Column: Radial Gauge, Grade Pill & Summary */}
        <div className="lg:col-span-4 flex flex-col items-center lg:items-start text-center lg:text-left">
          <div className="flex items-center gap-2">
            <span
              className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
              style={{
                backgroundColor: gradeTone.bg,
                color: gradeTone.fg,
              }}
              aria-hidden="true"
            >
              <Activity className="w-4 h-4" />
            </span>
            <div>
              <h2
                id="financial-health-heading"
                className="text-sm font-semibold tracking-tight text-[var(--text-primary)]"
              >
                Financial Health Score
              </h2>
              <p className="text-[11px] text-[var(--text-muted)]">
                5 weighted pillars · 0–100 scale
              </p>
            </div>
          </div>

          <div className="mt-5 w-full flex flex-col items-center">
            {/* Crisp SVG Radial Gauge */}
            <div className="relative flex items-center justify-center">
              <svg
                width={GAUGE_SIZE}
                height={GAUGE_SIZE}
                viewBox={`0 0 ${GAUGE_SIZE} ${GAUGE_SIZE}`}
                role="img"
                aria-label={`Financial health score ${clampedScore} out of 100, grade ${health.grade}`}
                className="overflow-visible"
              >
                {/* Subtle inner hairline ring */}
                <circle
                  cx={GAUGE_CENTER}
                  cy={GAUGE_CENTER}
                  r={GAUGE_RADIUS - GAUGE_STROKE / 2 - 5}
                  fill="none"
                  stroke="var(--border-hairline)"
                  strokeWidth={1}
                  opacity={0.75}
                />
                {/* Recessed track */}
                <circle
                  cx={GAUGE_CENTER}
                  cy={GAUGE_CENTER}
                  r={GAUGE_RADIUS}
                  fill="none"
                  stroke="var(--bg-subtle)"
                  strokeWidth={GAUGE_STROKE}
                />
                {/* Progress arc */}
                <circle
                  cx={GAUGE_CENTER}
                  cy={GAUGE_CENTER}
                  r={GAUGE_RADIUS}
                  fill="none"
                  stroke={gradeTone.fg}
                  strokeWidth={GAUGE_STROKE}
                  strokeLinecap="round"
                  strokeDasharray={GAUGE_CIRCUMFERENCE}
                  strokeDashoffset={strokeDashoffset}
                  opacity={clampedScore > 0 ? 1 : 0}
                  transform={`rotate(-90 ${GAUGE_CENTER} ${GAUGE_CENTER})`}
                  className="transition-[stroke-dashoffset,opacity] duration-500 ease-out motion-reduce:transition-none"
                />
              </svg>

              {/* Center numeric readout */}
              <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                <span
                  className={`text-4xl font-bold tracking-tight leading-none tabular-nums text-[var(--text-primary)] ${
                    privacyMask ? 'privacy-blur' : ''
                  }`}
                >
                  {clampedScore}
                </span>
                <span className="mt-1 text-xs font-medium tabular-nums text-[var(--text-muted)]">
                  / 100
                </span>
              </div>
            </div>

            {/* Grade Pill */}
            <div className="mt-3.5 flex items-center justify-center gap-2">
              <span
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold tracking-tight tabular-nums"
                style={{
                  backgroundColor: gradeTone.bg,
                  color: gradeTone.fg,
                }}
              >
                <span
                  className="w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: gradeTone.fg }}
                  aria-hidden="true"
                />
                Grade {health.grade}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)]">
                {gradeTone.label}
              </span>
            </div>

            {/* 1-sentence actionable summary */}
            <p className="mt-3.5 text-xs leading-relaxed text-[var(--text-secondary)] max-w-xs lg:max-w-none">
              {health.summary}
            </p>
          </div>
        </div>

        {/* Right Column: 5 Interactive Metric Rows */}
        <div className="lg:col-span-8 flex flex-col gap-2.5">
          <div className="flex items-center justify-between px-1">
            <span className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
              Score Breakdown
            </span>
            <span className="text-[11px] text-[var(--text-muted)]">
              Select a pillar for guidance
            </span>
          </div>

          <div className="space-y-2">
            {health.metrics.map((metric) => {
              const isExpanded = expandedId === metric.id;
              const tone = STATUS_TONES[metric.status];
              const weightPct = Math.round(metric.weight * 100);
              const clampedMetricScore = Math.max(0, Math.min(100, metric.score));
              const buttonId = `health-metric-btn-${metric.id}`;
              const panelId = `health-metric-panel-${metric.id}`;
              const ctaLabel = NAV_CTA_LABELS[metric.actionTarget];

              return (
                <div
                  key={metric.id}
                  className="rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] transition-colors duration-150 motion-reduce:transition-none"
                  style={
                    isExpanded
                      ? { borderColor: 'var(--border-strong)' }
                      : undefined
                  }
                >
                  <button
                    id={buttonId}
                    type="button"
                    aria-expanded={isExpanded}
                    aria-controls={panelId}
                    onClick={() => handleToggleMetric(metric.id)}
                    className="w-full text-left px-3.5 py-3 rounded-xl hover:bg-[var(--bg-surface-hover)] transition-colors duration-150 motion-reduce:transition-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)] cursor-pointer"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      {/* Label + weight tag */}
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="text-sm font-semibold text-[var(--text-primary)] truncate">
                          {metric.label}
                        </span>
                        <span className="px-1.5 py-0.5 rounded-md text-[11px] font-medium tabular-nums bg-[var(--bg-subtle)] text-[var(--text-muted)] shrink-0">
                          {weightPct}%
                        </span>
                      </div>

                      {/* Display value + status pill + chevron */}
                      <div className="flex items-center gap-2.5 shrink-0">
                        <span
                          className={`text-sm font-semibold tabular-nums text-[var(--text-primary)] ${
                            privacyMask ? 'privacy-blur' : ''
                          }`}
                        >
                          {metric.displayValue}
                        </span>

                        <span
                          className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                          style={{
                            backgroundColor: tone.bg,
                            color: tone.fg,
                          }}
                        >
                          <span
                            className="w-1.5 h-1.5 rounded-full"
                            style={{ backgroundColor: tone.fg }}
                            aria-hidden="true"
                          />
                          {tone.label}
                        </span>

                        <ChevronDown
                          className={`w-4 h-4 text-[var(--text-muted)] transition-transform duration-150 motion-reduce:transition-none ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                          aria-hidden="true"
                        />
                      </div>
                    </div>

                    {/* Sleek tactile progress track */}
                    <div
                      className="mt-2.5 h-2 w-full rounded-full overflow-hidden bg-[var(--bg-subtle)]"
                      aria-hidden="true"
                    >
                      <div
                        className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
                        style={{
                          width: `${clampedMetricScore}%`,
                          backgroundColor: tone.fg,
                        }}
                      />
                    </div>
                  </button>

                  {/* Inline Detail Drawer */}
                  {isExpanded && (
                    <div
                      id={panelId}
                      role="region"
                      aria-labelledby={buttonId}
                      className="px-3.5 pb-3.5 pt-0.5"
                    >
                      <div className="tactile-well p-3.5 vl-fade-up flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div className="space-y-1.5 min-w-0">
                          <div className="flex flex-wrap items-center gap-2 text-xs">
                            <span className="inline-flex items-center gap-1 font-semibold text-[var(--text-primary)]">
                              <Target
                                className="w-3.5 h-3.5 shrink-0"
                                style={{ color: tone.fg }}
                                aria-hidden="true"
                              />
                              {metric.benchmarkLabel}
                            </span>
                            <span
                              className="text-[var(--border-strong)]"
                              aria-hidden="true"
                            >
                              ·
                            </span>
                            <span className="tabular-nums text-[var(--text-muted)]">
                              Pillar score:{' '}
                              <strong className="font-semibold text-[var(--text-primary)]">
                                {clampedMetricScore}
                              </strong>
                              /100
                            </span>
                          </div>
                          <p className="text-xs leading-relaxed text-[var(--text-secondary)]">
                            {metric.explanation}
                          </p>
                        </div>

                        <button
                          type="button"
                          onClick={() => onNavigate(metric.actionTarget)}
                          className="tactile-btn inline-flex items-center justify-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--focus-ring)]"
                        >
                          <span>{ctaLabel}</span>
                          <ArrowUpRight
                            className="w-3.5 h-3.5"
                            aria-hidden="true"
                          />
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
};
