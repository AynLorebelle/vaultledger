import React, { useMemo, useState } from 'react';
import type { CurrencyCode, HeatmapDay } from '../types/finance';
import { formatMoney, formatShortDate } from './ui';

interface SpendingHeatmapProps {
  days: HeatmapDay[];
  currency: CurrencyCode;
  privacyMask: boolean;
  selectedDate?: string | null;
  onSelectDate?: (date: string) => void;
}

const LEVEL_CLASSES: Record<0 | 1 | 2 | 3 | 4, string> = {
  0: 'bg-[var(--bg-subtle)] border-[var(--border-hairline)]',
  1: 'bg-[#D6EAE3] dark:bg-[#163631] border-[#BCD8CE] dark:border-[#1E4B45]',
  2: 'bg-[#7BB4A1] dark:bg-[#135D55] border-[#619D89] dark:border-[#1B7B70]',
  3: 'bg-[#1B4D3E] dark:bg-[#2DD4BF] border-[#143B2F] dark:border-[#5EEAD4]',
  4: 'bg-[var(--accent-danger)] border-[var(--accent-danger)]',
};

const WEEKDAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const SpendingHeatmap: React.FC<SpendingHeatmapProps> = ({
  days,
  currency,
  privacyMask,
  selectedDate,
  onSelectDate,
}) => {
  const [hovered, setHovered] = useState<HeatmapDay | null>(null);

  const { weeks, monthLabels, activeSpendDays, totalSpend } = useMemo(() => {
    if (days.length === 0) {
      return {
        weeks: [] as Array<Array<HeatmapDay | null>>,
        monthLabels: [] as Array<{ weekIdx: number; label: string }>,
        activeSpendDays: 0,
        totalSpend: 0,
      };
    }

    const sorted = [...days].sort((a, b) => a.date.localeCompare(b.date));
    const firstParts = sorted[0].date.split('-').map(Number);
    const firstDow = new Date(firstParts[0], firstParts[1] - 1, firstParts[2]).getDay();

    const grid: Array<Array<HeatmapDay | null>> = [];
    let currentWeek: Array<HeatmapDay | null> = Array(firstDow).fill(null);
    let spendDays = 0;
    let total = 0;

    for (const day of sorted) {
      if (day.amount > 0) {
        spendDays += 1;
        total += day.amount;
      }
      currentWeek.push(day);
      if (currentWeek.length === 7) {
        grid.push(currentWeek);
        currentWeek = [];
      }
    }
    if (currentWeek.length > 0) {
      while (currentWeek.length < 7) currentWeek.push(null);
      grid.push(currentWeek);
    }

    const labels: Array<{ weekIdx: number; label: string }> = [];
    let lastMonth = -1;
    grid.forEach((week, weekIdx) => {
      const firstValid = week.find((d) => d !== null);
      if (!firstValid) return;
      const parts = firstValid.date.split('-').map(Number);
      const m = parts[1] - 1;
      if (m !== lastMonth) {
        lastMonth = m;
        const label = new Date(parts[0], m, 1).toLocaleDateString('en-US', { month: 'short' });
        labels.push({ weekIdx, label });
      }
    });

    return {
      weeks: grid,
      monthLabels: labels,
      activeSpendDays: spendDays,
      totalSpend: total,
    };
  }, [days]);

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--text-muted)]">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-[var(--text-primary)] font-semibold tabular-nums">
              {activeSpendDays}
            </strong>{' '}
            spend days
          </span>
          <span className="text-[var(--border-strong)]" aria-hidden="true">
            •
          </span>
          <span>
            Total:{' '}
            <strong
              className={`text-[var(--text-primary)] font-semibold tabular-nums ${
                privacyMask ? 'privacy-blur' : ''
              }`}
            >
              {formatMoney(totalSpend, currency)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5" aria-label="Spending intensity legend">
          <span className="text-[11px]">Less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              className={`w-3 h-3 rounded-[3px] border ${LEVEL_CLASSES[lvl]}`}
              aria-hidden="true"
            />
          ))}
          <span className="text-[11px]">Spike</span>
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1 min-w-max">
          {/* Month labels */}
          <div className="flex items-center pl-8 h-4 relative text-[10px] font-medium text-[var(--text-muted)]">
            {monthLabels.map((ml) => (
              <span
                key={`${ml.weekIdx}-${ml.label}`}
                style={{ left: `${32 + ml.weekIdx * 17}px` }}
                className="absolute"
              >
                {ml.label}
              </span>
            ))}
          </div>

          <div className="flex gap-1.5">
            {/* Weekday column */}
            <div className="grid grid-rows-7 gap-[3px] pr-1 text-[10px] text-[var(--text-muted)] select-none">
              {WEEKDAY_LABELS.map((wd, idx) => (
                <div key={wd} className="h-[14px] leading-[14px] text-right">
                  {idx % 2 === 1 ? wd : ''}
                </div>
              ))}
            </div>

            {/* Weeks columns */}
            <div className="flex gap-[3px]">
              {weeks.map((week, wIdx) => (
                <div key={wIdx} className="grid grid-rows-7 gap-[3px]">
                  {week.map((day, dIdx) => {
                    if (!day) {
                      return <div key={`empty-${wIdx}-${dIdx}`} className="w-[14px] h-[14px]" />;
                    }
                    const isSelected = selectedDate === day.date;
                    return (
                      <button
                        key={day.date}
                        type="button"
                        onClick={() => onSelectDate?.(day.date)}
                        onMouseEnter={() => setHovered(day)}
                        onMouseLeave={() => setHovered((cur) => (cur?.date === day.date ? null : cur))}
                        onFocus={() => setHovered(day)}
                        onBlur={() => setHovered((cur) => (cur?.date === day.date ? null : cur))}
                        className={`w-[14px] h-[14px] rounded-[3px] border transition-transform hover:scale-125 focus-visible:scale-125 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-[var(--focus-ring)] cursor-pointer ${
                          LEVEL_CLASSES[day.level]
                        } ${
                          isSelected
                            ? 'ring-2 ring-[var(--focus-ring)] ring-offset-1 ring-offset-[var(--bg-surface)]'
                            : ''
                        }`}
                        aria-label={`${day.date}: ${formatMoney(day.amount, currency)} (${day.count} transactions)`}
                        aria-pressed={isSelected}
                      />
                    );
                  })}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Hover detail footer bar */}
      <div className="tactile-well min-h-8 flex items-center justify-between px-3 py-1.5 text-xs">
        {hovered ? (
          <>
            <span className="font-semibold text-[var(--text-primary)]">
              {formatShortDate(hovered.date)}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-[var(--text-muted)] tabular-nums">
                {hovered.count} {hovered.count === 1 ? 'txn' : 'txns'}
              </span>
              <span
                className={`font-semibold text-[var(--text-primary)] tabular-nums ${
                  privacyMask ? 'privacy-blur' : ''
                }`}
              >
                {formatMoney(hovered.amount, currency)}
              </span>
            </div>
          </>
        ) : (
          <span className="text-[var(--text-muted)]">
            Hover a day for details · Click any square to drill into that day&apos;s transactions
          </span>
        )}
      </div>
    </div>
  );
};
