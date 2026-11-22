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
  0: 'bg-slate-100 dark:bg-slate-800/70 border-slate-200/60 dark:border-slate-800',
  1: 'bg-indigo-200 dark:bg-indigo-950 border-indigo-300/60 dark:border-indigo-900',
  2: 'bg-indigo-400 dark:bg-indigo-700 border-indigo-500/40 dark:border-indigo-600',
  3: 'bg-indigo-600 dark:bg-indigo-500 border-indigo-700/40 dark:border-indigo-400',
  4: 'bg-rose-500 dark:bg-rose-500 border-rose-600/40 dark:border-rose-400',
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
      <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 dark:text-slate-400">
        <div className="flex items-center gap-3">
          <span>
            <strong className="text-slate-700 dark:text-slate-200 font-semibold tabular-nums">
              {activeSpendDays}
            </strong>{' '}
            spend days
          </span>
          <span className="text-slate-300 dark:text-slate-700">•</span>
          <span>
            Total:{' '}
            <strong
              className={`text-slate-700 dark:text-slate-200 font-semibold tabular-nums ${
                privacyMask ? 'privacy-blur' : ''
              }`}
            >
              {formatMoney(totalSpend, currency)}
            </strong>
          </span>
        </div>

        <div className="flex items-center gap-1.5">
          <span className="text-[11px]">Less</span>
          {([0, 1, 2, 3, 4] as const).map((lvl) => (
            <span
              key={lvl}
              className={`w-3 h-3 rounded-[3px] border ${LEVEL_CLASSES[lvl]}`}
            />
          ))}
          <span className="text-[11px]">Spike</span>
        </div>
      </div>

      {/* Heatmap Matrix */}
      <div className="overflow-x-auto pb-1">
        <div className="inline-flex flex-col gap-1 min-w-max">
          {/* Month labels */}
          <div className="flex items-center pl-8 h-4 relative text-[10px] font-medium text-slate-400 dark:text-slate-500">
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
            <div className="grid grid-rows-7 gap-[3px] pr-1 text-[10px] text-slate-400 dark:text-slate-500 select-none">
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
                        className={`w-[14px] h-[14px] rounded-[3px] border transition-transform hover:scale-125 cursor-pointer ${
                          LEVEL_CLASSES[day.level]
                        } ${
                          isSelected
                            ? 'ring-2 ring-indigo-500 ring-offset-1 dark:ring-offset-slate-900'
                            : ''
                        }`}
                        aria-label={`${day.date}: ${formatMoney(day.amount, currency)} (${day.count} transactions)`}
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
      <div className="h-7 flex items-center justify-between px-3 rounded-lg bg-slate-50 dark:bg-slate-950/60 border border-slate-200/70 dark:border-slate-800/80 text-xs">
        {hovered ? (
          <>
            <span className="font-medium text-slate-700 dark:text-slate-200">
              {formatShortDate(hovered.date)}
            </span>
            <div className="flex items-center gap-3">
              <span className="text-slate-500 dark:text-slate-400 tabular-nums">
                {hovered.count} {hovered.count === 1 ? 'txn' : 'txns'}
              </span>
              <span
                className={`font-semibold text-slate-900 dark:text-slate-100 tabular-nums ${
                  privacyMask ? 'privacy-blur' : ''
                }`}
              >
                {formatMoney(hovered.amount, currency)}
              </span>
            </div>
          </>
        ) : (
          <span className="text-slate-400 dark:text-slate-500">
            Hover a day for details · Click any square to drill into that day&apos;s transactions
          </span>
        )}
      </div>
    </div>
  );
};
