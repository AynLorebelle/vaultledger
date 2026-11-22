import type {
  Account,
  Category,
  CurrencyCode,
  HealthMetric,
  HealthMetricStatus,
  HealthScoreResult,
  RecurringBill,
  Transaction,
  VaultData,
  VaultSettings,
} from '../types/finance';
import {
  computeAllAccountBalances,
  computeCategorySpend,
  computeMonthlyTrends,
} from './analytics';

function clamp(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) {
    return min;
  }
  return Math.min(max, Math.max(min, value));
}

function interpolate(value: number, points: Array<[number, number]>): number {
  if (!Number.isFinite(value) || points.length === 0) {
    return 0;
  }
  if (value <= points[0][0]) {
    return points[0][1];
  }
  const last = points[points.length - 1];
  if (value >= last[0]) {
    return last[1];
  }
  for (let i = 0; i < points.length - 1; i += 1) {
    const [x0, y0] = points[i];
    const [x1, y1] = points[i + 1];
    if (value >= x0 && value <= x1) {
      if (x1 === x0) {
        return y1;
      }
      const t = (value - x0) / (x1 - x0);
      return y0 + t * (y1 - y0);
    }
  }
  return last[1];
}

function convertToBaseCurrency(
  amount: number,
  fromCurrency: CurrencyCode,
  settings: VaultSettings,
): number {
  if (fromCurrency === settings.baseCurrency) {
    return amount;
  }
  const rate = settings.exchangeRates[fromCurrency];
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return amount;
  }
  return amount / rate;
}

function buildAccountCurrencyMap(accounts: Account[]): Map<string, CurrencyCode> {
  const map = new Map<string, CurrencyCode>();
  for (const acc of accounts) {
    map.set(acc.id, acc.currency);
  }
  return map;
}

function monthlyEquivalent(amount: number, frequency: RecurringBill['frequency']): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

function getMetricStatus(score: number): HealthMetricStatus {
  if (score >= 80) {
    return 'strong';
  }
  if (score >= 55) {
    return 'fair';
  }
  return 'attention';
}

function getGrade(score: number): HealthScoreResult['grade'] {
  if (score >= 93) return 'A+';
  if (score >= 85) return 'A';
  if (score >= 77) return 'B+';
  if (score >= 68) return 'B';
  if (score >= 55) return 'C';
  return 'D';
}

function getExpenseCategoryAllocations(
  tx: Transaction,
): Array<{ categoryId: string; signedAmount: number }> {
  if (tx.type !== 'expense' && tx.type !== 'refund') {
    return [];
  }
  const sign = tx.type === 'refund' ? -1 : 1;

  if (tx.splits && tx.splits.length > 0) {
    const result: Array<{ categoryId: string; signedAmount: number }> = [];
    let splitSumCents = 0;
    for (const split of tx.splits) {
      const splitCents = Math.round(split.amount * 100);
      splitSumCents += splitCents;
      result.push({
        categoryId: split.categoryId,
        signedAmount: (sign * splitCents) / 100,
      });
    }
    const txCents = Math.round(tx.amount * 100);
    const remainderCents = txCents - splitSumCents;
    if (remainderCents > 1) {
      result.push({
        categoryId: tx.categoryId,
        signedAmount: (sign * remainderCents) / 100,
      });
    }
    return result;
  }

  return [{ categoryId: tx.categoryId, signedAmount: sign * tx.amount }];
}

function computeNeedsSpendForMonths(
  vault: VaultData,
  months: Set<string>,
  accountCurrencies: Map<string, CurrencyCode>,
): number {
  if (months.size === 0) {
    return 0;
  }
  const needsCategoryIds = new Set<string>();
  for (const cat of vault.categories) {
    if (cat.group === 'needs') {
      needsCategoryIds.add(cat.id);
    }
  }

  let totalCents = 0;
  for (const tx of vault.transactions) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    if (!months.has(tx.date.slice(0, 7))) {
      continue;
    }
    const currency = accountCurrencies.get(tx.accountId) ?? vault.settings.baseCurrency;
    const allocations = getExpenseCategoryAllocations(tx);
    for (const alloc of allocations) {
      if (!needsCategoryIds.has(alloc.categoryId)) {
        continue;
      }
      const baseSigned = convertToBaseCurrency(alloc.signedAmount, currency, vault.settings);
      totalCents += Math.round(baseSigned * 100);
    }
  }

  return Math.max(0, totalCents) / 100;
}

function buildSummary(score: number, metrics: HealthMetric[]): string {
  let strongest = metrics[0];
  let lowest = metrics[0];

  for (const metric of metrics) {
    if (metric.score > strongest.score) {
      strongest = metric;
    }
    if (metric.score < lowest.score) {
      lowest = metric;
    }
  }

  if (score >= 85 && lowest.score >= 80) {
    return `Strong financial health across all five pillars, anchored by ${strongest.label} (${strongest.displayValue}).`;
  }

  if (lowest.status === 'attention') {
    return `Focus on ${lowest.label} (${lowest.displayValue}) for the biggest boost to your score, while ${strongest.label} (${strongest.displayValue}) leads your strengths.`;
  }

  return `Solid financial foundation led by ${strongest.label} (${strongest.displayValue}); improving ${lowest.label} (${lowest.displayValue}) can lift your grade higher.`;
}

export function computeFinancialHealthScore(
  vault: VaultData,
  referenceDate: Date = new Date(),
): HealthScoreResult {
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  const balances = computeAllAccountBalances(vault.accounts, vault.transactions);
  const trailing3Trends = computeMonthlyTrends(vault, 3, referenceDate);
  const currentMonthTrend = trailing3Trends[trailing3Trends.length - 1] ?? {
    month: '',
    label: '',
    income: 0,
    expenses: 0,
    net: 0,
    netWorth: 0,
  };

  // Trailing 3-month averages (used for fallback income/expense and emergency runway)
  const trailing3IncomeAvg =
    trailing3Trends.length > 0
      ? trailing3Trends.reduce((sum, pt) => sum + pt.income, 0) / trailing3Trends.length
      : 0;
  const trailing3ExpenseAvgAll =
    trailing3Trends.length > 0
      ? trailing3Trends.reduce((sum, pt) => sum + pt.expenses, 0) / trailing3Trends.length
      : 0;

  const useTrailingFallback = currentMonthTrend.income <= 0;
  const effectiveMonthlyIncome = useTrailingFallback
    ? trailing3IncomeAvg
    : currentMonthTrend.income;
  const effectiveMonthlyExpense = useTrailingFallback
    ? trailing3ExpenseAvgAll
    : currentMonthTrend.expenses;

  // ---------- 1. Savings Rate (weight 0.25) ----------
  const hasIncome = effectiveMonthlyIncome > 0;
  const savingsRatePct = hasIncome
    ? ((effectiveMonthlyIncome - effectiveMonthlyExpense) / effectiveMonthlyIncome) * 100
    : 0;
  const savingsScore = Math.round(
    clamp(
      interpolate(savingsRatePct, [
        [-25, 0],
        [0, 20],
        [20, 100],
      ]),
      0,
      100,
    ),
  );
  const savingsDisplay = hasIncome ? `${savingsRatePct.toFixed(1)}%` : '0.0%';
  const savingsExplanation = !hasIncome
    ? 'No income recorded yet this month or over the last 3 months; log income to measure your savings rate.'
    : savingsRatePct >= 20
      ? `Saving ${savingsRatePct.toFixed(1)}% of ${useTrailingFallback ? 'your 3-month average ' : ''}income meets the 20% benchmark.`
      : savingsRatePct >= 0
        ? `Saving ${savingsRatePct.toFixed(1)}% of ${useTrailingFallback ? 'your 3-month average ' : ''}income; trimming discretionary spend can close the gap to 20%.`
        : `Expenses exceed income by ${Math.abs(savingsRatePct).toFixed(1)}%; review recent spending to return to positive cashflow.`;

  const savingsMetric: HealthMetric = {
    id: 'savings_rate',
    label: 'Savings Rate',
    score: savingsScore,
    weight: 0.25,
    displayValue: savingsDisplay,
    benchmarkLabel: 'Target ≥ 20%',
    status: getMetricStatus(savingsScore),
    explanation: savingsExplanation,
    actionTarget: 'dashboard',
  };

  // ---------- 2. Budget Adherence (weight 0.20) ----------
  const categorySpends = computeCategorySpend(vault, 'this_month', referenceDate);
  const budgetedCategories = categorySpends.filter(
    (c) => c.budget > 0 && c.effectiveBudget > 0,
  );

  let budgetScore: number;
  let budgetDisplay: string;
  let budgetExplanation: string;
  let budgetStatus: HealthMetricStatus;

  if (budgetedCategories.length === 0) {
    budgetScore = 70;
    budgetStatus = 'fair';
    budgetDisplay = 'No budgets set';
    budgetExplanation =
      'No monthly category budgets are configured yet. Set limits on your key spending categories to track adherence.';
  } else {
    let onTrackCount = 0;
    let severeOverCount = 0;
    let severePenalty = 0;

    for (const cat of budgetedCategories) {
      const ratio = cat.spent / cat.effectiveBudget;
      if (cat.spent <= cat.effectiveBudget) {
        onTrackCount += 1;
      } else if (ratio > 1.2) {
        severeOverCount += 1;
        severePenalty += Math.min(20, 8 + (ratio - 1.2) * 15);
      }
    }

    const onTrackPct = (onTrackCount / budgetedCategories.length) * 100;
    budgetScore = Math.round(clamp(onTrackPct - Math.min(40, severePenalty), 0, 100));
    budgetStatus = getMetricStatus(budgetScore);
    budgetDisplay = `${onTrackCount} / ${budgetedCategories.length} on track`;

    if (onTrackCount === budgetedCategories.length) {
      budgetExplanation = `All ${budgetedCategories.length} budgeted categories are within their monthly limits.`;
    } else if (severeOverCount > 0) {
      budgetExplanation = `${onTrackCount} of ${budgetedCategories.length} budgeted categories are on track, with ${severeOverCount} more than 20% over limit.`;
    } else {
      budgetExplanation = `${onTrackCount} of ${budgetedCategories.length} budgeted categories are within limit; minor overages are still easy to recover.`;
    }
  }

  const budgetMetric: HealthMetric = {
    id: 'budget_adherence',
    label: 'Budget Adherence',
    score: budgetScore,
    weight: 0.2,
    displayValue: budgetDisplay,
    benchmarkLabel: 'Target 100% on track',
    status: budgetStatus,
    explanation: budgetExplanation,
    actionTarget: 'budgets',
  };

  // ---------- 3. Emergency Runway (weight 0.25) & 4. Debt Ratio (weight 0.15) ----------
  let liquidCash = 0;
  let totalAssets = 0;
  let totalDebt = 0;

  for (const acc of vault.accounts) {
    if (acc.archived) {
      continue;
    }
    const rawBalance = balances[acc.id] ?? acc.openingBalance;
    const baseBalance = convertToBaseCurrency(rawBalance, acc.currency, vault.settings);

    if (baseBalance > 0) {
      totalAssets += baseBalance;
      if (acc.type === 'checking' || acc.type === 'savings' || acc.type === 'cash') {
        liquidCash += baseBalance;
      }
    } else if (baseBalance < 0) {
      totalDebt += Math.abs(baseBalance);
    }
  }
  liquidCash = Math.max(0, liquidCash);

  const activeExpenseMonths = trailing3Trends.filter((pt) => pt.expenses > 0);
  const avgMonthlyExpense =
    activeExpenseMonths.length > 0
      ? activeExpenseMonths.reduce((sum, pt) => sum + pt.expenses, 0) /
        activeExpenseMonths.length
      : 0;

  let runwayScore: number;
  let runwayDisplay: string;
  let runwayExplanation: string;

  if (avgMonthlyExpense <= 0) {
    if (liquidCash > 0) {
      runwayScore = 100;
      runwayDisplay = '6.0+ mo';
      runwayExplanation =
        'You hold liquid cash reserves with no recent expenses recorded; runway easily clears the 6-month target.';
    } else {
      runwayScore = 50;
      runwayDisplay = 'No spend data';
      runwayExplanation =
        'Add account balances and monthly expenses to calculate how many months your liquid reserves can cover.';
    }
  } else {
    const runwayMonths = liquidCash / avgMonthlyExpense;
    runwayScore = Math.round(
      clamp(
        interpolate(runwayMonths, [
          [0, 0],
          [1, 35],
          [3, 70],
          [6, 100],
        ]),
        0,
        100,
      ),
    );
    runwayDisplay = `${runwayMonths.toFixed(1)} mo`;
    if (runwayMonths >= 6) {
      runwayExplanation = `Liquid cash covers ${runwayMonths.toFixed(1)} months of average expenses, meeting the 6-month safety target.`;
    } else if (runwayMonths >= 3) {
      runwayExplanation = `Liquid reserves cover ${runwayMonths.toFixed(1)} months of expenses; building toward 6 months strengthens resilience.`;
    } else {
      runwayExplanation = `Liquid cash covers only ${runwayMonths.toFixed(1)} months of expenses—prioritize building an emergency buffer.`;
    }
  }

  const runwayMetric: HealthMetric = {
    id: 'emergency_runway',
    label: 'Emergency Runway',
    score: runwayScore,
    weight: 0.25,
    displayValue: runwayDisplay,
    benchmarkLabel: 'Target ≥ 6 mo',
    status: getMetricStatus(runwayScore),
    explanation: runwayExplanation,
    actionTarget: 'accounts',
  };

  let debtScore: number;
  let debtDisplay: string;
  let debtExplanation: string;

  if (totalDebt <= 0.005) {
    debtScore = 100;
    debtDisplay = 'Debt-free';
    debtExplanation = 'No active credit or loan balances detected across your accounts.';
  } else {
    const debtRatio = totalDebt / Math.max(totalAssets, 1);
    debtScore = Math.round(
      clamp(
        interpolate(debtRatio, [
          [0.15, 95],
          [0.35, 75],
          [0.6, 50],
          [1.0, 15],
        ]),
        0,
        100,
      ),
    );
    const ratioPct = Math.round(debtRatio * 100);
    debtDisplay =
      totalAssets <= 0
        ? '100%+ of assets'
        : ratioPct > 999
          ? '>999% of assets'
          : `${ratioPct}% of assets`;

    if (debtRatio < 0.25) {
      debtExplanation = `Total debt is ${debtDisplay}, staying comfortably below the 25% benchmark.`;
    } else if (debtRatio <= 0.6) {
      debtExplanation = `Debt stands at ${debtDisplay}; accelerating payoff on high-APR balances will reduce interest drag.`;
    } else {
      debtExplanation = `Debt is high relative to assets (${debtDisplay}); focus extra cashflow on debt reduction.`;
    }
  }

  const debtMetric: HealthMetric = {
    id: 'debt_ratio',
    label: 'Debt-to-Asset Ratio',
    score: debtScore,
    weight: 0.15,
    displayValue: debtDisplay,
    benchmarkLabel: 'Target < 25%',
    status: getMetricStatus(debtScore),
    explanation: debtExplanation,
    actionTarget: 'goals',
  };

  // ---------- 5. Fixed Cost Ratio (weight 0.15) ----------
  let needsMonthly = 0;
  if (useTrailingFallback) {
    const monthSet = new Set(trailing3Trends.map((pt) => pt.month));
    const totalNeeds3Mo = computeNeedsSpendForMonths(vault, monthSet, accountCurrencies);
    needsMonthly = trailing3Trends.length > 0 ? totalNeeds3Mo / trailing3Trends.length : 0;
  } else {
    const categoryGroupById = new Map<string, Category['group']>();
    for (const cat of vault.categories) {
      categoryGroupById.set(cat.id, cat.group);
    }
    for (const spend of categorySpends) {
      if (spend.group === 'needs' || categoryGroupById.get(spend.categoryId) === 'needs') {
        needsMonthly += spend.spent;
      }
    }
  }

  let recurringBillsMonthly = 0;
  for (const bill of vault.recurringBills) {
    if (!bill.active || bill.type !== 'expense') {
      continue;
    }
    const billCurrency = accountCurrencies.get(bill.accountId) ?? vault.settings.baseCurrency;
    const baseMonthly = convertToBaseCurrency(
      monthlyEquivalent(bill.amount, bill.frequency),
      billCurrency,
      vault.settings,
    );
    recurringBillsMonthly += Math.max(0, baseMonthly);
  }

  const monthlyFixedCost = Math.max(needsMonthly, recurringBillsMonthly);

  let fixedScore: number;
  let fixedDisplay: string;
  let fixedExplanation: string;

  if (effectiveMonthlyIncome <= 0) {
    fixedScore = 50;
    fixedDisplay = 'No income data';
    fixedExplanation =
      'Log monthly income to measure what share goes toward essential needs and recurring bills.';
  } else {
    const fixedRatioPct = (monthlyFixedCost / effectiveMonthlyIncome) * 100;
    fixedScore = Math.round(
      clamp(
        interpolate(fixedRatioPct, [
          [50, 100],
          [60, 75],
          [75, 45],
          [90, 10],
        ]),
        0,
        100,
      ),
    );
    fixedDisplay = `${Math.round(fixedRatioPct)}%`;
    if (fixedRatioPct <= 50) {
      fixedExplanation = `Essential needs and recurring bills take ${Math.round(fixedRatioPct)}% of income, staying within the 50% guideline.`;
    } else if (fixedRatioPct <= 70) {
      fixedExplanation = `Fixed obligations absorb ${Math.round(fixedRatioPct)}% of income; auditing recurring bills can free up room to save.`;
    } else {
      fixedExplanation = `Fixed costs consume ${Math.round(fixedRatioPct)}% of income, leaving little margin for savings or unexpected expenses.`;
    }
  }

  const fixedMetric: HealthMetric = {
    id: 'fixed_cost_ratio',
    label: 'Fixed Cost Ratio',
    score: fixedScore,
    weight: 0.15,
    displayValue: fixedDisplay,
    benchmarkLabel: 'Target ≤ 50%',
    status: getMetricStatus(fixedScore),
    explanation: fixedExplanation,
    actionTarget: 'recurring',
  };

  const metrics: HealthMetric[] = [
    savingsMetric,
    budgetMetric,
    runwayMetric,
    debtMetric,
    fixedMetric,
  ];

  const weightedTotal = metrics.reduce((sum, m) => sum + m.score * m.weight, 0);
  const overallScore = Math.round(clamp(weightedTotal, 0, 100));

  return {
    score: overallScore,
    grade: getGrade(overallScore),
    summary: buildSummary(overallScore, metrics),
    metrics,
  };
}
