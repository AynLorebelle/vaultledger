import React, { useMemo, useState } from 'react';
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  Target,
  Plus,
  Trash2,
  Flame,
  Snowflake,
  CheckCircle2,
  TrendingDown,
  PiggyBank,
  LineChart,
  Users,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { computeAllAccountBalances, formatCurrency } from '../core/analytics';
import { extractDebtsFromAccounts, simulateDebtPayoff } from '../core/debt';
import type { DebtPayoffInput } from '../types/finance';
import {
  CategoryIcon,
  Modal,
  Money,
  PALETTE_COLORS,
  formatShortDate,
  getChartTheme,
} from './ui';

function monthsRemaining(targetDateIso: string): number {
  const parts = targetDateIso.split('-').map(Number);
  if (parts.length !== 3) return 12;
  const now = new Date();
  const diff = (parts[0] - now.getFullYear()) * 12 + (parts[1] - 1 - now.getMonth());
  return Math.max(1, diff);
}

export const GoalsDebtView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addSavingsGoal = useFinanceStore((s) => s.addSavingsGoal);
  const contributeToGoal = useFinanceStore((s) => s.contributeToGoal);
  const deleteSavingsGoal = useFinanceStore((s) => s.deleteSavingsGoal);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const showToast = useFinanceStore((s) => s.showToast);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const isDark = data.settings.theme === 'dark';
  const chartTheme = useMemo(() => getChartTheme(isDark), [isDark]);

  // Savings Goal Contribution Popover State
  const [contributingGoalId, setContributingGoalId] = useState<string | null>(null);
  const [contribAmount, setContribAmount] = useState('250');
  const [contribFromAcc, setContribFromAcc] = useState('');

  // Add Goal Modal State
  const [goalModalOpen, setGoalModalOpen] = useState(false);
  const [goalName, setGoalName] = useState('');
  const [goalTarget, setGoalTarget] = useState('5000');
  const [goalCurrent, setGoalCurrent] = useState('0');
  const [goalMonthly, setGoalMonthly] = useState('300');
  const [goalDate, setGoalDate] = useState(() => {
    const d = new Date();
    d.setFullYear(d.getFullYear() + 1);
    return d.toISOString().slice(0, 10);
  });
  const [goalLinkedAcc, setGoalLinkedAcc] = useState('');
  const [goalColor, setGoalColor] = useState(PALETTE_COLORS[1]);

  // Debt Payoff Planner State
  const [strategy, setStrategy] = useState<'avalanche' | 'snowball'>('avalanche');
  const [extraPayment, setExtraPayment] = useState(200);
  const [customDebts, setCustomDebts] = useState<DebtPayoffInput[]>([]);
  const [addDebtOpen, setAddDebtOpen] = useState(false);
  const [debtName, setDebtName] = useState('');
  const [debtBalance, setDebtBalance] = useState('3500');
  const [debtApr, setDebtApr] = useState('21.99');
  const [debtMin, setDebtMin] = useState('100');

  const balances = useMemo(
    () => computeAllAccountBalances(data.accounts, data.transactions),
    [data.accounts, data.transactions]
  );

  const accountDebts = useMemo(
    () => extractDebtsFromAccounts(data.accounts, balances),
    [data.accounts, balances]
  );

  const allDebts = useMemo(() => [...accountDebts, ...customDebts], [accountDebts, customDebts]);

  const avalancheSim = useMemo(
    () => simulateDebtPayoff(allDebts, 'avalanche', extraPayment),
    [allDebts, extraPayment]
  );
  const snowballSim = useMemo(
    () => simulateDebtPayoff(allDebts, 'snowball', extraPayment),
    [allDebts, extraPayment]
  );
  const baselineSim = useMemo(
    () => simulateDebtPayoff(allDebts, strategy, 0),
    [allDebts, strategy]
  );

  const activeSim = strategy === 'avalanche' ? avalancheSim : snowballSim;
  const interestDiff = Math.round((snowballSim.totalInterestPaid - avalancheSim.totalInterestPaid) * 100) / 100;
  const monthsDiff = snowballSim.monthsToPayoff - avalancheSim.monthsToPayoff;
  const extraInterestSaved = Math.max(
    0,
    Math.round((baselineSim.totalInterestPaid - activeSim.totalInterestPaid) * 100) / 100
  );
  const extraMonthsSaved = Math.max(0, baselineSim.monthsToPayoff - activeSim.monthsToPayoff);

  const chartSeries = useMemo(() => {
    const maxLen = Math.max(activeSim.schedule.length, baselineSim.schedule.length);
    const step = maxLen > 36 ? Math.ceil(maxLen / 30) : 1;
    const pts: Array<{ label: string; accelerated: number; minimumOnly: number }> = [];
    for (let i = 0; i < maxLen; i += step) {
      const a = activeSim.schedule[i];
      const b = baselineSim.schedule[i];
      pts.push({
        label: a?.label ?? b?.label ?? `M${i}`,
        accelerated: a ? a.totalRemaining : 0,
        minimumOnly: b ? b.totalRemaining : 0,
      });
    }
    // Ensure final point is included
    const lastIdx = maxLen - 1;
    if (lastIdx > 0 && lastIdx % step !== 0) {
      const a = activeSim.schedule[lastIdx];
      const b = baselineSim.schedule[lastIdx];
      pts.push({
        label: a?.label ?? b?.label ?? `M${lastIdx}`,
        accelerated: a ? a.totalRemaining : 0,
        minimumOnly: b ? b.totalRemaining : 0,
      });
    }
    return pts;
  }, [activeSim.schedule, baselineSim.schedule]);

  const handleCreateGoal = (e: React.FormEvent) => {
    e.preventDefault();
    const target = Number(goalTarget);
    if (!goalName.trim() || !Number.isFinite(target) || target <= 0) return;
    addSavingsGoal({
      name: goalName.trim(),
      targetAmount: target,
      currentAmount: Math.max(0, Number(goalCurrent) || 0),
      targetDate: goalDate,
      linkedAccountId: goalLinkedAcc || undefined,
      color: goalColor,
      icon: 'piggy-bank',
      monthlyContribution: Math.max(0, Number(goalMonthly) || 0),
    });
    showToast(`Created savings goal "${goalName.trim()}"`, 'success');
    setGoalName('');
    setGoalModalOpen(false);
  };

  const handleContribute = (goalId: string) => {
    const amt = Number(contribAmount);
    if (!Number.isFinite(amt) || amt <= 0) return;
    contributeToGoal(goalId, amt, contribFromAcc || undefined);
    showToast(`Contributed ${formatCurrency(amt, currency)} to goal`, 'success');
    setContributingGoalId(null);
  };

  const handleAddCustomDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const bal = Number(debtBalance);
    const apr = Number(debtApr);
    const min = Number(debtMin);
    if (!debtName.trim() || bal <= 0) return;
    setCustomDebts((prev) => [
      ...prev,
      {
        id: `custom_debt_${Date.now()}`,
        name: debtName.trim(),
        balance: bal,
        apr: Math.max(0, apr || 0),
        minPayment: Math.max(25, min || 25),
        color: PALETTE_COLORS[(prev.length + 4) % PALETTE_COLORS.length],
      },
    ]);
    setDebtName('');
    setAddDebtOpen(false);
  };

  const totalDebtBalance = allDebts.reduce((s, d) => s + d.balance, 0);

  return (
    <div className="space-y-8">
      {/* SECTION 1: SAVINGS GOALS */}
      <section className="space-y-4">
        <div className="card clay-surface-pink p-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/75 flex items-center justify-center shrink-0 border-2 border-white">
              <Users className="w-5 h-5 text-[#9F1239]" aria-hidden="true" />
            </div>
            <div>
              <h2 className="text-base font-extrabold text-[#1F2937] tracking-tight">
                Saving with a Friend or Bestie?
              </h2>
              <p className="text-xs font-medium text-[#374151] mt-0.5">
                Team up on shared travel, concert, or emergency goals, swap offline squad codes, and climb the savings leaderboard together!
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setActiveNav('squad')}
            className="tactile-btn-primary inline-flex items-center gap-2 px-4 py-2.5 rounded-2xl text-xs font-bold shrink-0 cursor-pointer"
          >
            <Users className="w-4 h-4" aria-hidden="true" />
            <span>Open Friend Savings Squads &amp; Share Leaderboard</span>
          </button>
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
              Savings Goals
            </h1>
            <p className="text-xs text-[var(--text-muted)] mt-0.5">
              Track target milestones, monthly pace, and contribute directly from your accounts
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
            <button
              type="button"
              onClick={() => setActiveNav('forecast')}
              className="tactile-btn inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <LineChart className="w-3.5 h-3.5 text-[var(--accent-primary-text)]" />
              <span>Model in Forecast Lab</span>
            </button>
            <button
              type="button"
              onClick={() => setGoalModalOpen(true)}
              className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>Add Goal</span>
            </button>
          </div>
        </div>

        {data.savingsGoals.length === 0 ? (
          <div className="tactile-card p-10 text-center">
            <PiggyBank className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-60" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No savings goals yet
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Create an Emergency Fund, Vacation, or Home Down Payment goal to track progress.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {data.savingsGoals.map((goal) => {
              const pct =
                goal.targetAmount > 0
                  ? Math.min(100, Math.round((goal.currentAmount / goal.targetAmount) * 100))
                  : 0;
              const remaining = Math.max(0, goal.targetAmount - goal.currentAmount);
              const monthsLeft = monthsRemaining(goal.targetDate);
              const monthlyNeeded = remaining / monthsLeft;
              const isContribOpen = contributingGoalId === goal.id;
              const funded = remaining <= 0.01;

              return (
                <div
                  key={goal.id}
                  className="tactile-card p-5 flex flex-col justify-between gap-4"
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 border border-[var(--border-hairline)]"
                          style={{ backgroundColor: `${goal.color}1e`, color: goal.color }}
                        >
                          <CategoryIcon icon={goal.icon} className="w-5 h-5" />
                        </div>
                        <div className="min-w-0">
                          <h3 className="text-sm font-bold text-[var(--text-primary)] truncate">
                            {goal.name}
                          </h3>
                          <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            Target: {formatShortDate(goal.targetDate)}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => deleteSavingsGoal(goal.id)}
                        className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                        aria-label={`Delete goal ${goal.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-baseline justify-between gap-2">
                        <Money
                          amount={goal.currentAmount}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="text-xl font-bold text-[var(--text-primary)]"
                        />
                        <span className="text-xs font-semibold tabular-nums text-[var(--text-muted)]">
                          {pct}% of{' '}
                          <Money
                            amount={goal.targetAmount}
                            currency={currency}
                            privacyMask={privacyMask}
                            compact
                          />
                        </span>
                      </div>
                      <div className="tactile-well mt-2 h-2.5 w-full rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full transition-all"
                          style={{
                            width: `${pct}%`,
                            backgroundColor: funded ? 'var(--accent-positive)' : goal.color,
                          }}
                        />
                      </div>
                      <div className="mt-2 flex items-center justify-between text-[11px] text-[var(--text-muted)] tabular-nums">
                        {funded ? (
                          <span
                            className="font-semibold flex items-center gap-1"
                            style={{ color: 'var(--accent-positive)' }}
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" /> Goal Reached!
                          </span>
                        ) : (
                          <>
                            <span>
                              Need{' '}
                              <Money
                                amount={monthlyNeeded}
                                currency={currency}
                                privacyMask={privacyMask}
                                className="font-semibold text-[var(--text-secondary)]"
                              />
                              /mo
                            </span>
                            <span>
                              Planned:{' '}
                              <Money
                                amount={goal.monthlyContribution}
                                currency={currency}
                                privacyMask={privacyMask}
                              />
                              /mo
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Quick Contribute Popover / Trigger */}
                  {isContribOpen ? (
                    <div className="tactile-well p-3 space-y-2.5">
                      <div className="grid grid-cols-2 gap-2">
                        <input
                          type="number"
                          min="1"
                          step="10"
                          value={contribAmount}
                          onChange={(e) => setContribAmount(e.target.value)}
                          placeholder="Amount"
                          aria-label={`Contribution amount for ${goal.name}`}
                          className="tactile-input px-2.5 py-1.5 text-xs tabular-nums"
                          autoFocus
                        />
                        <select
                          value={contribFromAcc}
                          onChange={(e) => setContribFromAcc(e.target.value)}
                          aria-label={`Source account for ${goal.name}`}
                          className="tactile-input px-2.5 py-1.5 text-xs"
                        >
                          <option value="">Track only</option>
                          {data.accounts
                            .filter((a) => !a.archived && a.id !== goal.linkedAccountId)
                            .map((a) => (
                              <option key={a.id} value={a.id}>
                                From {a.name}
                              </option>
                            ))}
                        </select>
                      </div>
                      <div className="flex justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => setContributingGoalId(null)}
                          className="tactile-btn px-2.5 py-1 rounded-lg text-xs font-medium cursor-pointer"
                        >
                          Cancel
                        </button>
                        <button
                          type="button"
                          onClick={() => handleContribute(goal.id)}
                          className="tactile-btn-primary px-3 py-1 rounded-lg text-xs font-semibold cursor-pointer"
                        >
                          Confirm
                        </button>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => {
                        setContributingGoalId(goal.id);
                        setContribAmount(String(goal.monthlyContribution || 250));
                        setContribFromAcc('');
                      }}
                      className="tactile-btn w-full py-2 rounded-xl text-xs font-semibold cursor-pointer"
                    >
                      + Contribute to Goal
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* SECTION 2: INTERACTIVE DEBT PAYOFF PLANNER */}
      <section className="tactile-card p-6 space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
              style={{
                backgroundColor: 'var(--accent-danger-soft)',
                color: 'var(--accent-danger)',
              }}
            >
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-[var(--text-primary)] tracking-tight">
                Interactive Debt Payoff Planner
              </h2>
              <p className="text-xs text-[var(--text-muted)] mt-0.5">
                Compare Snowball vs. Avalanche strategies live using your credit card &amp; loan accounts
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div
              role="group"
              aria-label="Debt payoff strategy"
              className="tactile-well flex items-center p-1 gap-1"
            >
              <button
                type="button"
                onClick={() => setStrategy('avalanche')}
                aria-pressed={strategy === 'avalanche'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  strategy === 'avalanche'
                    ? 'tactile-btn-primary'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                Avalanche (Highest APR)
              </button>
              <button
                type="button"
                onClick={() => setStrategy('snowball')}
                aria-pressed={strategy === 'snowball'}
                className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                  strategy === 'snowball'
                    ? 'tactile-btn-primary'
                    : 'text-[var(--text-secondary)] hover:text-[var(--text-primary)]'
                }`}
              >
                <Snowflake className="w-3.5 h-3.5" />
                Snowball (Lowest Balance)
              </button>
            </div>

            <button
              type="button"
              onClick={() => setAddDebtOpen(true)}
              className="tactile-btn inline-flex items-center gap-1 px-3 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Plus className="w-3.5 h-3.5" />
              Add Scenario Debt
            </button>
          </div>
        </div>

        {allDebts.length === 0 ? (
          <div
            className="tactile-well py-10 px-4 text-center"
            style={{
              backgroundColor: 'var(--accent-positive-soft)',
              borderColor: 'var(--accent-positive)',
            }}
          >
            <CheckCircle2
              className="w-7 h-7 mx-auto mb-2"
              style={{ color: 'var(--accent-positive)' }}
            />
            <p
              className="text-sm font-semibold"
              style={{ color: 'var(--accent-positive)' }}
            >
              You have zero active debt balances!
            </p>
            <p className="text-xs text-[var(--text-secondary)] mt-1">
              Click &ldquo;Add Scenario Debt&rdquo; above if you&apos;d like to model a hypothetical payoff plan.
            </p>
          </div>
        ) : (
          <>
            {/* Strategy Comparison Banner + Extra Monthly Slider */}
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
              <div className="lg:col-span-5 tactile-well p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-semibold text-[var(--text-primary)]">
                    Extra Monthly Payment
                  </span>
                  <span
                    className="px-2.5 py-0.5 rounded-lg text-sm font-bold tabular-nums"
                    style={{
                      backgroundColor: 'var(--accent-primary-soft)',
                      color: 'var(--accent-primary-text)',
                    }}
                  >
                    +<Money amount={extraPayment} currency={currency} privacyMask={privacyMask} />/mo
                  </span>
                </div>
                <input
                  type="range"
                  min={0}
                  max={1500}
                  step={25}
                  value={extraPayment}
                  aria-label="Extra monthly debt payment"
                  onChange={(e) => setExtraPayment(Number(e.target.value))}
                  className="w-full accent-[var(--accent-primary)] cursor-pointer"
                />
                <div className="flex justify-between text-[10px] text-[var(--text-muted)] tabular-nums">
                  <span>$0 (Minimums only)</span>
                  <span>+$750</span>
                  <span>+$1,500/mo</span>
                </div>
                {extraPayment > 0 && (
                  <div
                    className="pt-2 border-t border-[var(--border-hairline)] text-xs font-medium tabular-nums"
                    style={{ color: 'var(--accent-positive)' }}
                  >
                    Extra payment saves{' '}
                    <Money
                      amount={extraInterestSaved}
                      currency={currency}
                      privacyMask={privacyMask}
                      className="font-bold"
                    />{' '}
                    in interest &amp; <strong>{extraMonthsSaved} months</strong>!
                  </div>
                )}
              </div>

              <div className="lg:col-span-7 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="tactile-well p-4">
                  <div className="text-[11px] text-[var(--text-muted)]">Debt-Free Date</div>
                  <div
                    className="text-lg font-bold mt-1 tabular-nums"
                    style={{ color: 'var(--accent-positive)' }}
                  >
                    {formatShortDate(activeSim.debtFreeDate)}
                  </div>
                  <div className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
                    {activeSim.monthsToPayoff} months ({(activeSim.monthsToPayoff / 12).toFixed(1)} yrs)
                  </div>
                </div>

                <div className="tactile-well p-4">
                  <div className="text-[11px] text-[var(--text-muted)]">
                    Total Interest ({strategy})
                  </div>
                  <div
                    className="text-lg font-bold mt-1 tabular-nums"
                    style={{ color: 'var(--accent-danger)' }}
                  >
                    <Money
                      amount={activeSim.totalInterestPaid}
                      currency={currency}
                      privacyMask={privacyMask}
                    />
                  </div>
                  <div className="text-xs text-[var(--text-muted)] tabular-nums mt-0.5">
                    Principal:{' '}
                    <Money
                      amount={totalDebtBalance}
                      currency={currency}
                      privacyMask={privacyMask}
                      compact
                    />
                  </div>
                </div>

                <div
                  className="tactile-well p-4 border-l-4"
                  style={{ borderLeftColor: 'var(--accent-primary)' }}
                >
                  <div
                    className="text-[11px] font-semibold"
                    style={{ color: 'var(--accent-primary-text)' }}
                  >
                    Avalanche vs. Snowball
                  </div>
                  <div className="text-sm font-bold text-[var(--text-primary)] mt-1 tabular-nums">
                    {interestDiff > 1 ? (
                      <>
                        Avalanche saves{' '}
                        <Money amount={interestDiff} currency={currency} privacyMask={privacyMask} />
                      </>
                    ) : (
                      'Identical Interest Cost'
                    )}
                  </div>
                  <div className="text-[11px] text-[var(--text-muted)] mt-0.5 tabular-nums">
                    {monthsDiff > 0
                      ? `And finishes ${monthsDiff} mo faster`
                      : 'Snowball gives faster early wins'}
                  </div>
                </div>
              </div>
            </div>

            {/* Chart + Payoff Order */}
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
              <div className="lg:col-span-2 h-[260px] min-w-0">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={chartSeries}>
                    <defs>
                      <linearGradient id="debtAccGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={chartTheme.positive} stopOpacity={0.28} />
                        <stop offset="95%" stopColor={chartTheme.positive} stopOpacity={0.02} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={chartTheme.grid} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11, fill: chartTheme.tick }}
                      axisLine={false}
                      tickLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 11, fill: chartTheme.tick }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(v: number) =>
                        privacyMask ? '••' : formatCurrency(v, currency, true)
                      }
                      width={58}
                    />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: chartTheme.tooltipBg,
                        border: `1px solid ${chartTheme.tooltipBorder}`,
                        borderRadius: '12px',
                        fontSize: '12px',
                        color: chartTheme.tooltipText,
                      }}
                      labelStyle={{ color: chartTheme.tooltipMuted, fontWeight: 600 }}
                      itemStyle={{ color: chartTheme.tooltipText }}
                      formatter={(val: number, name: string) => [
                        privacyMask ? '••••••' : formatCurrency(val, currency),
                        name === 'accelerated' ? `With +$${extraPayment}/mo` : 'Minimums Only',
                      ]}
                    />
                    <Area
                      type="monotone"
                      dataKey="minimumOnly"
                      stroke={chartTheme.baseline}
                      strokeDasharray="4 4"
                      fill="transparent"
                      strokeWidth={1.8}
                    />
                    <Area
                      type="monotone"
                      dataKey="accelerated"
                      stroke={chartTheme.positive}
                      fill="url(#debtAccGrad)"
                      strokeWidth={2.5}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>

              {/* Payoff Order Timeline */}
              <div className="space-y-2.5">
                <div className="text-xs font-semibold text-[var(--text-muted)]">
                  Payoff Order ({strategy})
                </div>
                {activeSim.payoffOrder.map((step, idx) => {
                  const debtObj = allDebts.find((d) => d.id === step.id);
                  const isCustom = customDebts.some((c) => c.id === step.id);
                  return (
                    <div
                      key={step.id}
                      className="tactile-well p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <span
                          className="w-6 h-6 rounded-full text-xs font-bold flex items-center justify-center shrink-0 tabular-nums"
                          style={{
                            backgroundColor: 'var(--accent-primary-soft)',
                            color: 'var(--accent-primary-text)',
                          }}
                        >
                          {idx + 1}
                        </span>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                            {step.name}
                          </div>
                          <div className="text-[11px] text-[var(--text-muted)] tabular-nums">
                            {debtObj ? `${debtObj.apr}% APR · ` : ''}Paid off in mo {step.paidOffMonth}
                          </div>
                        </div>
                      </div>
                      <div className="text-right shrink-0 flex items-center gap-1.5">
                        <div>
                          <Money
                            amount={debtObj?.balance ?? 0}
                            currency={currency}
                            privacyMask={privacyMask}
                            className="text-xs font-bold text-[var(--text-primary)] block"
                          />
                          <span
                            className="text-[10px] font-medium tabular-nums"
                            style={{ color: 'var(--accent-danger)' }}
                          >
                            +<Money amount={step.interestPaid} currency={currency} privacyMask={privacyMask} /> int.
                          </span>
                        </div>
                        {isCustom && (
                          <button
                            type="button"
                            onClick={() =>
                              setCustomDebts((prev) => prev.filter((c) => c.id !== step.id))
                            }
                            className="p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                            title="Remove scenario debt"
                            aria-label={`Remove scenario debt ${step.name}`}
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </>
        )}
      </section>

      {/* Add Goal Modal */}
      <Modal
        open={goalModalOpen}
        onClose={() => setGoalModalOpen(false)}
        title="New Savings Goal"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleCreateGoal} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Goal Name
            </label>
            <input
              type="text"
              value={goalName}
              onChange={(e) => setGoalName(e.target.value)}
              placeholder="e.g. Emergency Fund, Japan Trip"
              required
              autoFocus
              className="tactile-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Target Amount ({currency})
              </label>
              <input
                type="number"
                min="1"
                value={goalTarget}
                onChange={(e) => setGoalTarget(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Already Saved
              </label>
              <input
                type="number"
                min="0"
                value={goalCurrent}
                onChange={(e) => setGoalCurrent(e.target.value)}
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Monthly Contribution
              </label>
              <input
                type="number"
                min="0"
                value={goalMonthly}
                onChange={(e) => setGoalMonthly(e.target.value)}
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={goalDate}
                onChange={(e) => setGoalDate(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Linked Savings Account (optional)
            </label>
            <select
              value={goalLinkedAcc}
              onChange={(e) => setGoalLinkedAcc(e.target.value)}
              className="tactile-input w-full px-3 py-2 text-sm"
            >
              <option value="">None (virtual bucket)</option>
              {data.accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1.5">
              Goal Color
            </label>
            <div className="flex gap-2">
              {PALETTE_COLORS.slice(0, 7).map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setGoalColor(c)}
                  aria-label={`Select goal color ${c}`}
                  aria-pressed={goalColor === c}
                  className={`w-6 h-6 rounded-full transition-transform cursor-pointer ${
                    goalColor === c
                      ? 'ring-2 ring-offset-2 ring-[var(--focus-ring)] ring-offset-[var(--bg-surface)] scale-110'
                      : ''
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setGoalModalOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <Target className="w-3.5 h-3.5" />
              Create Goal
            </button>
          </div>
        </form>
      </Modal>

      {/* Add Custom Scenario Debt Modal */}
      <Modal
        open={addDebtOpen}
        onClose={() => setAddDebtOpen(false)}
        title="Add Scenario Debt"
        subtitle="Model an extra loan or card without altering your real accounts"
        maxWidthClass="max-w-md"
      >
        <form onSubmit={handleAddCustomDebt} className="p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
              Debt Label
            </label>
            <input
              type="text"
              value={debtName}
              onChange={(e) => setDebtName(e.target.value)}
              placeholder="e.g. Store Card, Personal Loan"
              required
              autoFocus
              className="tactile-input w-full px-3 py-2 text-sm"
            />
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Balance
              </label>
              <input
                type="number"
                min="1"
                value={debtBalance}
                onChange={(e) => setDebtBalance(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                APR (%)
              </label>
              <input
                type="number"
                step="0.01"
                min="0"
                value={debtApr}
                onChange={(e) => setDebtApr(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Min /mo
              </label>
              <input
                type="number"
                min="1"
                value={debtMin}
                onChange={(e) => setDebtMin(e.target.value)}
                required
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>
          <div className="flex justify-end gap-2 pt-3 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setAddDebtOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              Add to Planner
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
