import type {
  Account,
  DebtPayoffInput,
  DebtPayoffMonthPoint,
  DebtPayoffResult,
} from '../types/finance';

const MAX_SIMULATION_MONTHS = 600;
const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

function centsToDollars(cents: number): number {
  const value = Math.round(cents) / 100;
  return Object.is(value, -0) ? 0 : value;
}

function addMonthsIso(referenceDate: Date, monthsToAdd: number): string {
  const year = referenceDate.getFullYear();
  const month = referenceDate.getMonth();
  const day = referenceDate.getDate();

  const target = new Date(Date.UTC(year, month + monthsToAdd, 1));
  const lastDayOfTargetMonth = new Date(
    Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0),
  ).getUTCDate();
  const clampedDay = Math.min(day, lastDayOfTargetMonth);

  const y = target.getUTCFullYear();
  const m = String(target.getUTCMonth() + 1).padStart(2, '0');
  const d = String(clampedDay).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function formatMonthLabel(referenceDate: Date, monthsOffset: number): string {
  const d = new Date(
    Date.UTC(referenceDate.getFullYear(), referenceDate.getMonth() + monthsOffset, 1),
  );
  return `${MONTH_NAMES[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function extractDebtsFromAccounts(
  accounts: Account[],
  balances: Record<string, number>,
): DebtPayoffInput[] {
  const debts: DebtPayoffInput[] = [];

  for (const account of accounts) {
    if (account.archived) {
      continue;
    }
    if (account.type !== 'credit' && account.type !== 'loan') {
      continue;
    }

    const balance = balances[account.id] ?? account.openingBalance;
    if (balance >= -0.005) {
      continue;
    }

    const owed = Math.round(Math.abs(balance) * 100) / 100;
    const apr = Math.max(0, account.apr ?? 0);
    const defaultMin = Math.max(25, Math.round(owed * 0.02 * 100) / 100);
    const minPayment =
      account.minPayment && account.minPayment > 0 ? account.minPayment : defaultMin;

    debts.push({
      id: account.id,
      name: account.name,
      balance: owed,
      apr,
      minPayment,
      color: account.color,
    });
  }

  return debts;
}

export function simulateDebtPayoff(
  debts: DebtPayoffInput[],
  strategy: 'snowball' | 'avalanche',
  extraMonthlyPayment: number,
  referenceDate: Date = new Date(),
): DebtPayoffResult {
  const activeInputs = debts.filter((d) => d.balance > 0.005);

  if (activeInputs.length === 0) {
    return {
      strategy,
      monthsToPayoff: 0,
      debtFreeDate: addMonthsIso(referenceDate, 0),
      totalInterestPaid: 0,
      totalPaid: 0,
      payoffOrder: [],
      schedule: [],
    };
  }

  interface SimDebt {
    id: string;
    name: string;
    balanceCents: number;
    apr: number;
    minPaymentCents: number;
    interestPaidCents: number;
    paidOffMonth: number;
  }

  const states: SimDebt[] = activeInputs.map((d) => {
    const balanceCents = Math.round(d.balance * 100);
    const fallbackMinCents = Math.max(2500, Math.round(balanceCents * 0.02));
    const minPaymentCents =
      d.minPayment > 0 ? Math.round(d.minPayment * 100) : fallbackMinCents;
    return {
      id: d.id,
      name: d.name,
      balanceCents,
      apr: Math.max(0, d.apr),
      minPaymentCents,
      interestPaidCents: 0,
      paidOffMonth: 0,
    };
  });

  const extraCents = Math.max(0, Math.round(extraMonthlyPayment * 100));
  const totalMonthlyBudgetCents =
    states.reduce((sum, s) => sum + s.minPaymentCents, 0) + extraCents;

  const schedule: DebtPayoffMonthPoint[] = [];
  const payoffOrder: Array<{
    id: string;
    name: string;
    paidOffMonth: number;
    interestPaid: number;
  }> = [];

  // Record Month 0 starting snapshot
  const initialBalancesById: Record<string, number> = {};
  let initialTotalCents = 0;
  for (const s of states) {
    initialBalancesById[s.id] = centsToDollars(s.balanceCents);
    initialTotalCents += s.balanceCents;
  }
  schedule.push({
    month: 0,
    label: formatMonthLabel(referenceDate, 0),
    totalRemaining: centsToDollars(initialTotalCents),
    cumulativeInterest: 0,
    balancesById: initialBalancesById,
  });

  let cumulativeInterestCents = 0;
  let totalPaidCents = 0;
  let monthsElapsed = 0;

  const sortPriority = (a: SimDebt, b: SimDebt): number => {
    if (strategy === 'avalanche') {
      if (b.apr !== a.apr) {
        return b.apr - a.apr;
      }
      if (a.balanceCents !== b.balanceCents) {
        return a.balanceCents - b.balanceCents;
      }
      return a.id.localeCompare(b.id);
    }
    // snowball: lowest balance first
    if (a.balanceCents !== b.balanceCents) {
      return a.balanceCents - b.balanceCents;
    }
    if (b.apr !== a.apr) {
      return b.apr - a.apr;
    }
    return a.id.localeCompare(b.id);
  };

  for (let month = 1; month <= MAX_SIMULATION_MONTHS; month += 1) {
    monthsElapsed = month;

    // 1. Compound monthly interest on active debts
    for (const debt of states) {
      if (debt.balanceCents <= 0) {
        continue;
      }
      const monthlyRate = debt.apr / 100 / 12;
      const interestCents = Math.round(debt.balanceCents * monthlyRate);
      debt.balanceCents += interestCents;
      debt.interestPaidCents += interestCents;
      cumulativeInterestCents += interestCents;
    }

    let remainingBudgetCents = totalMonthlyBudgetCents;

    // 2. Pay minimum payments on every active debt
    for (const debt of states) {
      if (debt.balanceCents <= 0 || remainingBudgetCents <= 0) {
        continue;
      }
      const payment = Math.min(debt.balanceCents, debt.minPaymentCents, remainingBudgetCents);
      debt.balanceCents -= payment;
      remainingBudgetCents -= payment;
      totalPaidCents += payment;
    }

    // 3. Apply remaining budget (extra + rolled-over minimums) to priority targets
    if (remainingBudgetCents > 0) {
      const targets = states.filter((d) => d.balanceCents > 0).sort(sortPriority);
      for (const target of targets) {
        if (remainingBudgetCents <= 0) {
          break;
        }
        const extraPay = Math.min(target.balanceCents, remainingBudgetCents);
        target.balanceCents -= extraPay;
        remainingBudgetCents -= extraPay;
        totalPaidCents += extraPay;
      }
    }

    // 4. Record any newly paid-off debts & build schedule point
    let totalRemainingCents = 0;
    const balancesById: Record<string, number> = {};

    for (const debt of states) {
      if (debt.balanceCents === 0 && debt.paidOffMonth === 0) {
        debt.paidOffMonth = month;
        payoffOrder.push({
          id: debt.id,
          name: debt.name,
          paidOffMonth: month,
          interestPaid: centsToDollars(debt.interestPaidCents),
        });
      }
      balancesById[debt.id] = centsToDollars(debt.balanceCents);
      totalRemainingCents += debt.balanceCents;
    }

    schedule.push({
      month,
      label: formatMonthLabel(referenceDate, month),
      totalRemaining: centsToDollars(totalRemainingCents),
      cumulativeInterest: centsToDollars(cumulativeInterestCents),
      balancesById,
    });

    if (totalRemainingCents === 0) {
      break;
    }
  }

  return {
    strategy,
    monthsToPayoff: monthsElapsed,
    debtFreeDate: addMonthsIso(referenceDate, monthsElapsed),
    totalInterestPaid: centsToDollars(cumulativeInterestCents),
    totalPaid: centsToDollars(totalPaidCents),
    payoffOrder,
    schedule,
  };
}
