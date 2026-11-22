import type {
  Account,
  CurrencyCode,
  ForecastInput,
  ForecastPoint,
  ForecastResult,
  VaultData,
  VaultSettings,
} from '../types/finance';
import { computeAllAccountBalances } from './analytics';

const SHORT_MONTHS = [
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

export interface ForecastBaseline {
  currentNetWorth: number;
  currentLiquidAssets: number;
  currentDebt: number;
  baselineMonthlyIncome: number;
  baselineMonthlyExpense: number;
}

function round2(value: number): number {
  if (!Number.isFinite(value)) {
    return 0;
  }
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function safeNumber(value: number): number {
  return Number.isFinite(value) ? value : 0;
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

function formatMonthKey(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
}

function formatShortMonthLabel(year: number, monthIndex0: number): string {
  const d = new Date(Date.UTC(year, monthIndex0, 1));
  const shortYear = String(d.getUTCFullYear()).slice(-2);
  return `${SHORT_MONTHS[d.getUTCMonth()]} ${shortYear}`;
}

/**
 * Derive current net worth, liquid assets, debt, and trailing 3-month baseline
 * monthly income/expense from the vault in its base currency.
 */
export function deriveForecastBaseline(
  vault: VaultData,
  referenceDate: Date = new Date(),
): ForecastBaseline {
  const balances = computeAllAccountBalances(vault.accounts, vault.transactions);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);

  let totalAssets = 0;
  let currentLiquidAssets = 0;
  let currentDebt = 0;

  for (const acc of vault.accounts) {
    if (acc.archived) {
      continue;
    }
    const rawBalance = balances[acc.id] ?? acc.openingBalance;
    const baseBalance = convertToBaseCurrency(rawBalance, acc.currency, vault.settings);

    if (baseBalance < 0) {
      currentDebt += Math.abs(baseBalance);
    } else if (baseBalance > 0) {
      totalAssets += baseBalance;
      if (
        acc.type === 'checking' ||
        acc.type === 'savings' ||
        acc.type === 'cash' ||
        acc.type === 'investment'
      ) {
        currentLiquidAssets += baseBalance;
      }
    }
  }

  const currentNetWorth = round2(totalAssets - currentDebt);

  // Aggregate non-transfer transactions by YYYY-MM in base currency
  const baseYear = referenceDate.getFullYear();
  const baseMonth = referenceDate.getMonth();
  const anchorMonthKey = formatMonthKey(baseYear, baseMonth);

  const monthTotals = new Map<string, { incomeCents: number; expenseCents: number }>();

  for (const tx of vault.transactions) {
    if (tx.type === 'transfer' || !tx.date || tx.date.length < 7) {
      continue;
    }
    const monthKey = tx.date.slice(0, 7);
    if (monthKey > anchorMonthKey) {
      continue;
    }

    const currency = accountCurrencies.get(tx.accountId) ?? vault.settings.baseCurrency;
    const baseAmount = convertToBaseCurrency(tx.amount, currency, vault.settings);
    const cents = Math.round(baseAmount * 100);

    const bucket = monthTotals.get(monthKey) ?? { incomeCents: 0, expenseCents: 0 };
    if (tx.type === 'income') {
      bucket.incomeCents += cents;
    } else if (tx.type === 'expense') {
      bucket.expenseCents += cents;
    } else if (tx.type === 'refund') {
      bucket.expenseCents -= cents;
    }
    monthTotals.set(monthKey, bucket);
  }

  // Prefer the trailing 3 completed months (m-1, m-2, m-3) to avoid partial-month distortion.
  // If fewer than 3 completed months have activity, include the active current month (m-0).
  // If none of those 4 months have activity, fall back to the most recent up to 3 active months.
  const selectedKeys: string[] = [];
  for (let offset = 1; offset <= 3; offset += 1) {
    const key = formatMonthKey(baseYear, baseMonth - offset);
    if (monthTotals.has(key)) {
      selectedKeys.push(key);
    }
  }

  if (selectedKeys.length < 3 && monthTotals.has(anchorMonthKey)) {
    selectedKeys.push(anchorMonthKey);
  }

  if (selectedKeys.length === 0 && monthTotals.size > 0) {
    const recentActive = Array.from(monthTotals.keys())
      .sort((a, b) => b.localeCompare(a))
      .slice(0, 3);
    selectedKeys.push(...recentActive);
  }

  let baselineMonthlyIncome = 0;
  let baselineMonthlyExpense = 0;

  if (selectedKeys.length > 0) {
    let totalIncomeCents = 0;
    let totalExpenseCents = 0;
    for (const key of selectedKeys) {
      const bucket = monthTotals.get(key);
      if (!bucket) {
        continue;
      }
      totalIncomeCents += Math.max(0, bucket.incomeCents);
      totalExpenseCents += Math.max(0, bucket.expenseCents);
    }
    baselineMonthlyIncome = round2(totalIncomeCents / selectedKeys.length / 100);
    baselineMonthlyExpense = round2(totalExpenseCents / selectedKeys.length / 100);
  }

  return {
    currentNetWorth,
    currentLiquidAssets: round2(currentLiquidAssets),
    currentDebt: round2(currentDebt),
    baselineMonthlyIncome,
    baselineMonthlyExpense,
  };
}

/**
 * Project baseline vs. What-If scenario net worth over 12 or 60 months.
 *
 * Baseline: current monthly savings trajectory with 0% market return, no slider tweaks,
 * and no custom milestones—isolating the exact delta of scenario adjustments.
 * Scenario: applies income/expense sliders, monthly investment compounding on positive
 * net worth only, and enabled one-time or recurring milestones.
 */
export function runNetWorthForecast(
  input: ForecastInput,
  referenceDate: Date = new Date(),
): ForecastResult {
  const horizonMonths = Math.max(1, Math.floor(safeNumber(input.horizonMonths)));
  const startNetWorth = round2(safeNumber(input.currentNetWorth));
  const safeBaseIncome = Math.max(0, safeNumber(input.baselineMonthlyIncome));
  const safeBaseExpense = Math.max(0, safeNumber(input.baselineMonthlyExpense));

  const baselineCashflow = safeBaseIncome - safeBaseExpense;
  const rawScenarioIncome = Math.max(
    0,
    safeBaseIncome * (1 + safeNumber(input.incomeChangePct) / 100),
  );
  const rawScenarioExpense = Math.max(
    0,
    safeBaseExpense * (1 + safeNumber(input.expenseChangePct) / 100),
  );
  const rawScenarioSavings = rawScenarioIncome - rawScenarioExpense;

  const projectedMonthlyIncome = round2(rawScenarioIncome);
  const projectedMonthlyExpense = round2(rawScenarioExpense);
  const projectedMonthlySavings = round2(rawScenarioSavings);

  const monthlyRate = Math.max(0, safeNumber(input.expectedAnnualReturnPct)) / 100 / 12;
  const enabledMilestones = (input.milestones ?? []).filter((ms) => ms.enabled);

  const baseYear = referenceDate.getFullYear();
  const baseMonth = referenceDate.getMonth();

  const points: ForecastPoint[] = [
    {
      monthIndex: 0,
      monthKey: formatMonthKey(baseYear, baseMonth),
      label: formatShortMonthLabel(baseYear, baseMonth),
      baselineNetWorth: startNetWorth,
      scenarioNetWorth: startNetWorth,
      scenarioCashflow: 0,
      milestoneLabels: [],
    },
  ];

  let baselineNW = startNetWorth;
  let scenarioNW = startNetWorth;
  let totalMilestoneImpact = 0;

  for (let m = 1; m <= horizonMonths; m += 1) {
    baselineNW += baselineCashflow;

    const investmentGain = scenarioNW > 0 ? scenarioNW * monthlyRate : 0;

    let milestoneDelta = 0;
    const milestoneLabels: string[] = [];

    for (const ms of enabledMilestones) {
      const offset = Math.round(safeNumber(ms.monthOffset));
      if (offset < 1 || offset > horizonMonths) {
        continue;
      }
      const amount = safeNumber(ms.amount);
      if (!ms.recurring && offset === m) {
        milestoneDelta += amount;
        milestoneLabels.push(ms.label);
        totalMilestoneImpact += amount;
      } else if (ms.recurring && m >= offset) {
        milestoneDelta += amount;
        if (m === offset) {
          milestoneLabels.push(ms.label);
        }
        totalMilestoneImpact += amount;
      }
    }

    const monthScenarioCashflow = rawScenarioSavings + milestoneDelta;
    scenarioNW = scenarioNW + investmentGain + monthScenarioCashflow;

    points.push({
      monthIndex: m,
      monthKey: formatMonthKey(baseYear, baseMonth + m),
      label: formatShortMonthLabel(baseYear, baseMonth + m),
      baselineNetWorth: round2(baselineNW),
      scenarioNetWorth: round2(scenarioNW),
      scenarioCashflow: round2(monthScenarioCashflow),
      milestoneLabels,
    });
  }

  const endingPoint = points[points.length - 1];
  const endingBaselineNetWorth = endingPoint.baselineNetWorth;
  const endingScenarioNetWorth = endingPoint.scenarioNetWorth;
  const netWorthDelta = round2(endingScenarioNetWorth - endingBaselineNetWorth);

  return {
    points,
    endingBaselineNetWorth,
    endingScenarioNetWorth,
    netWorthDelta,
    projectedMonthlyIncome,
    projectedMonthlyExpense,
    projectedMonthlySavings,
    totalMilestoneImpact: round2(totalMilestoneImpact),
  };
}
