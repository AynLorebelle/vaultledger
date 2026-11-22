import type {
  Account,
  Category,
  CategorySpendSummary,
  CurrencyCode,
  DashboardKPIs,
  HeatmapDay,
  MonthlyTrendPoint,
  ProactiveInsight,
  RecurringBill,
  SankeyGraph,
  SankeyLink,
  SankeyNode,
  TimeRange,
  Transaction,
  VaultData,
  VaultSettings,
} from '../types/finance';

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

function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toAnchorUtc(referenceDate: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    ),
  );
}

function formatUtcIsoDate(utcDate: Date): string {
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoToUtc(iso: string): Date {
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date(Date.UTC(1970, 0, 1));
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addUtcDays(utcDate: Date, days: number): Date {
  return new Date(
    Date.UTC(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth(),
      utcDate.getUTCDate() + days,
    ),
  );
}

function diffUtcDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
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

function getTxCurrency(
  tx: Transaction,
  accountCurrencies: Map<string, CurrencyCode>,
  baseCurrency: CurrencyCode,
): CurrencyCode {
  return accountCurrencies.get(tx.accountId) ?? baseCurrency;
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

export function formatCurrency(
  amount: number,
  currency: CurrencyCode,
  compact: boolean = false,
): string {
  const safeAmount = Number.isFinite(amount) ? (Object.is(amount, -0) ? 0 : amount) : 0;
  try {
    if (compact) {
      return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        notation: 'compact',
        maximumFractionDigits: Math.abs(safeAmount) >= 1000 ? 1 : 0,
      }).format(safeAmount);
    }
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency,
      minimumFractionDigits: currency === 'JPY' ? 0 : 2,
      maximumFractionDigits: currency === 'JPY' ? 0 : 2,
    }).format(safeAmount);
  } catch {
    return `${currency} ${safeAmount.toFixed(2)}`;
  }
}

export function computeAccountBalance(
  account: Account,
  transactions: Transaction[],
): number {
  let cents = Math.round(account.openingBalance * 100);

  for (const tx of transactions) {
    const amountCents = Math.round(tx.amount * 100);
    switch (tx.type) {
      case 'expense':
        if (tx.accountId === account.id) {
          cents -= amountCents;
        }
        break;
      case 'income':
      case 'refund':
        if (tx.accountId === account.id) {
          cents += amountCents;
        }
        break;
      case 'transfer':
        if (tx.accountId === account.id) {
          cents -= amountCents;
        }
        if (tx.transferAccountId === account.id) {
          cents += amountCents;
        }
        break;
      default:
        break;
    }
  }

  const result = cents / 100;
  return Object.is(result, -0) ? 0 : result;
}

export function computeAllAccountBalances(
  accounts: Account[],
  transactions: Transaction[],
): Record<string, number> {
  const centsByAccount = new Map<string, number>();
  for (const account of accounts) {
    centsByAccount.set(account.id, Math.round(account.openingBalance * 100));
  }

  for (const tx of transactions) {
    const amountCents = Math.round(tx.amount * 100);
    switch (tx.type) {
      case 'expense': {
        const cur = centsByAccount.get(tx.accountId);
        if (cur !== undefined) {
          centsByAccount.set(tx.accountId, cur - amountCents);
        }
        break;
      }
      case 'income':
      case 'refund': {
        const cur = centsByAccount.get(tx.accountId);
        if (cur !== undefined) {
          centsByAccount.set(tx.accountId, cur + amountCents);
        }
        break;
      }
      case 'transfer': {
        const src = centsByAccount.get(tx.accountId);
        if (src !== undefined) {
          centsByAccount.set(tx.accountId, src - amountCents);
        }
        if (tx.transferAccountId) {
          const dst = centsByAccount.get(tx.transferAccountId);
          if (dst !== undefined) {
            centsByAccount.set(tx.transferAccountId, dst + amountCents);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  const balances: Record<string, number> = {};
  for (const [id, cents] of centsByAccount) {
    const val = cents / 100;
    balances[id] = Object.is(val, -0) ? 0 : val;
  }
  return balances;
}

export function filterTransactionsByRange(
  transactions: Transaction[],
  range: TimeRange,
  referenceDate: Date = new Date(),
): Transaction[] {
  if (range === 'all') {
    return [...transactions];
  }

  const anchor = toAnchorUtc(referenceDate);
  const anchorIso = formatUtcIsoDate(anchor);

  if (range === 'this_month') {
    const monthPrefix = anchorIso.slice(0, 7);
    return transactions.filter((tx) => tx.date.slice(0, 7) === monthPrefix);
  }

  let lookbackDays = 30;
  if (range === 'last_30_days') {
    lookbackDays = 30;
  } else if (range === 'quarter') {
    lookbackDays = 90;
  } else if (range === 'year') {
    lookbackDays = 365;
  }

  const startIso = formatUtcIsoDate(addUtcDays(anchor, -lookbackDays));
  return transactions.filter((tx) => tx.date >= startIso && tx.date <= anchorIso);
}

export function computeDashboardKPIs(
  vault: VaultData,
  range: TimeRange,
  referenceDate: Date = new Date(),
): DashboardKPIs {
  const balances = computeAllAccountBalances(vault.accounts, vault.transactions);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  const anchor = toAnchorUtc(referenceDate);
  const anchorIso = formatUtcIsoDate(anchor);
  const plus30Iso = formatUtcIsoDate(addUtcDays(anchor, 30));

  let totalNetWorth = 0;
  let liquidCash = 0;
  let totalDebt = 0;

  for (const acc of vault.accounts) {
    if (acc.archived) {
      continue;
    }
    const rawBalance = balances[acc.id] ?? acc.openingBalance;
    const baseBalance = convertToBaseCurrency(rawBalance, acc.currency, vault.settings);
    totalNetWorth += baseBalance;

    if (
      (acc.type === 'checking' || acc.type === 'savings' || acc.type === 'cash') &&
      baseBalance > 0
    ) {
      liquidCash += baseBalance;
    }

    if (baseBalance < 0) {
      totalDebt += Math.abs(baseBalance);
    }
  }

  const rangedTxs = filterTransactionsByRange(vault.transactions, range, referenceDate);

  let incomeCents = 0;
  let expenseNetCents = 0;

  for (const tx of rangedTxs) {
    if (tx.type === 'transfer') {
      continue;
    }
    const currency = getTxCurrency(tx, accountCurrencies, vault.settings.baseCurrency);

    if (tx.type === 'income') {
      const baseAmount = convertToBaseCurrency(tx.amount, currency, vault.settings);
      incomeCents += Math.round(baseAmount * 100);
    } else if (tx.type === 'expense' || tx.type === 'refund') {
      const allocations = getExpenseCategoryAllocations(tx);
      for (const alloc of allocations) {
        const baseSigned = convertToBaseCurrency(
          alloc.signedAmount,
          currency,
          vault.settings,
        );
        expenseNetCents += Math.round(baseSigned * 100);
      }
    }
  }

  const periodIncome = roundMoney(incomeCents / 100);
  const periodExpenses = roundMoney(Math.max(0, expenseNetCents) / 100);
  const netCashflow = roundMoney(periodIncome - periodExpenses);
  const savingsRate =
    periodIncome > 0 ? roundMoney((netCashflow / periodIncome) * 100) : 0;

  // Upcoming 30-day bills (active expense bills due within next 30 days, including overdue)
  let upcoming30DayBills = 0;
  for (const bill of vault.recurringBills) {
    if (!bill.active || bill.type !== 'expense') {
      continue;
    }
    if (bill.nextDueDate <= plus30Iso) {
      const accCurrency =
        accountCurrencies.get(bill.accountId) ?? vault.settings.baseCurrency;
      upcoming30DayBills += convertToBaseCurrency(
        bill.amount,
        accCurrency,
        vault.settings,
      );
    }
  }

  // Earmarked goal reserves: monthly contributions committed for active goals that aren't already fully funded
  let earmarkedGoalReserves = 0;
  for (const goal of vault.savingsGoals) {
    if (goal.currentAmount < goal.targetAmount && goal.monthlyContribution > 0) {
      earmarkedGoalReserves += goal.monthlyContribution;
    }
  }

  const safeToSpend = roundMoney(liquidCash - upcoming30DayBills - earmarkedGoalReserves);

  // Daily burn rate & month-end projection
  const daysInMonth = new Date(
    Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0),
  ).getUTCDate();

  let elapsedDays = 1;
  if (range === 'this_month') {
    elapsedDays = Math.max(1, anchor.getUTCDate());
  } else if (range === 'last_30_days') {
    elapsedDays = 30;
  } else if (range === 'quarter') {
    elapsedDays = 90;
  } else if (range === 'year') {
    elapsedDays = 365;
  } else {
    const dated = rangedTxs
      .map((t) => t.date)
      .filter((d) => d.length >= 10)
      .sort();
    if (dated.length >= 2) {
      const span = diffUtcDays(parseIsoToUtc(dated[dated.length - 1]), parseIsoToUtc(dated[0])) + 1;
      elapsedDays = Math.max(1, span);
    } else {
      elapsedDays = Math.max(1, anchor.getUTCDate());
    }
  }

  const dailyBurnRate = roundMoney(periodExpenses / elapsedDays);
  const projectedMonthEndExpense =
    range === 'this_month'
      ? roundMoney(dailyBurnRate * daysInMonth)
      : (() => {
          const monthPrefix = anchorIso.slice(0, 7);
          let thisMonthExpCents = 0;
          for (const tx of vault.transactions) {
            if (tx.date.slice(0, 7) !== monthPrefix) {
              continue;
            }
            if (tx.type !== 'expense' && tx.type !== 'refund') {
              continue;
            }
            const cur = getTxCurrency(tx, accountCurrencies, vault.settings.baseCurrency);
            const sign = tx.type === 'refund' ? -1 : 1;
            const base = convertToBaseCurrency(tx.amount, cur, vault.settings);
            thisMonthExpCents += Math.round(sign * base * 100);
          }
          const thisMonthSpent = Math.max(0, thisMonthExpCents) / 100;
          return roundMoney((thisMonthSpent / Math.max(1, anchor.getUTCDate())) * daysInMonth);
        })();

  const monthlyBudgetTotal = roundMoney(
    vault.categories
      .filter((c) => c.group !== 'income' && c.monthlyBudget > 0)
      .reduce((sum, c) => sum + c.monthlyBudget, 0),
  );

  const unreviewedCount = vault.transactions.reduce(
    (count, tx) => (tx.reviewed ? count : count + 1),
    0,
  );

  return {
    totalNetWorth: roundMoney(totalNetWorth),
    liquidCash: roundMoney(liquidCash),
    totalDebt: roundMoney(totalDebt),
    periodIncome,
    periodExpenses,
    netCashflow,
    savingsRate,
    safeToSpend,
    dailyBurnRate,
    projectedMonthEndExpense,
    monthlyBudgetTotal,
    unreviewedCount,
  };
}

export function computeCategorySpend(
  vault: VaultData,
  range: TimeRange,
  referenceDate: Date = new Date(),
): CategorySpendSummary[] {
  const rangedTxs = filterTransactionsByRange(vault.transactions, range, referenceDate);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);

  const spentCentsByCategory = new Map<string, number>();
  const txCountByCategory = new Map<string, number>();

  for (const tx of rangedTxs) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    const currency = getTxCurrency(tx, accountCurrencies, vault.settings.baseCurrency);
    const allocations = getExpenseCategoryAllocations(tx);
    const touchedCategories = new Set<string>();

    for (const alloc of allocations) {
      const baseSigned = convertToBaseCurrency(
        alloc.signedAmount,
        currency,
        vault.settings,
      );
      const cents = Math.round(baseSigned * 100);
      spentCentsByCategory.set(
        alloc.categoryId,
        (spentCentsByCategory.get(alloc.categoryId) ?? 0) + cents,
      );
      touchedCategories.add(alloc.categoryId);
    }

    for (const catId of touchedCategories) {
      txCountByCategory.set(catId, (txCountByCategory.get(catId) ?? 0) + 1);
    }
  }

  const budgetMultiplier = range === 'quarter' ? 3 : range === 'year' ? 12 : 1;

  const summaries: CategorySpendSummary[] = [];
  for (const category of vault.categories) {
    if (category.group === 'income') {
      continue;
    }
    const rawSpentCents = spentCentsByCategory.get(category.id) ?? 0;
    const spent = roundMoney(Math.max(0, rawSpentCents) / 100);
    const budget = roundMoney(category.monthlyBudget * budgetMultiplier);
    const rollover = category.rolloverEnabled
      ? roundMoney(vault.settings.budgetRolloverAdjustments[category.id] ?? 0)
      : 0;
    const effectiveBudget = roundMoney(Math.max(0, budget + rollover));
    const percentUsed =
      effectiveBudget > 0 ? roundMoney((spent / effectiveBudget) * 100) : 0;

    summaries.push({
      categoryId: category.id,
      categoryName: category.name,
      group: category.group,
      color: category.color,
      icon: category.icon,
      spent,
      budget,
      rollover,
      effectiveBudget,
      percentUsed,
      transactionCount: txCountByCategory.get(category.id) ?? 0,
    });
  }

  summaries.sort((a, b) => {
    if (b.spent !== a.spent) {
      return b.spent - a.spent;
    }
    return b.effectiveBudget - a.effectiveBudget;
  });

  return summaries;
}

export function buildCashflowSankey(
  vault: VaultData,
  range: TimeRange,
  referenceDate: Date = new Date(),
): SankeyGraph {
  const rangedTxs = filterTransactionsByRange(vault.transactions, range, referenceDate);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  const categoryById = new Map<string, Category>();
  for (const cat of vault.categories) {
    categoryById.set(cat.id, cat);
  }

  const incomeByCategory = new Map<string, number>();
  const expenseByCategory = new Map<string, number>();

  for (const tx of rangedTxs) {
    if (tx.type === 'transfer') {
      continue;
    }
    const currency = getTxCurrency(tx, accountCurrencies, vault.settings.baseCurrency);

    if (tx.type === 'income') {
      const base = convertToBaseCurrency(tx.amount, currency, vault.settings);
      const cents = Math.round(base * 100);
      incomeByCategory.set(
        tx.categoryId,
        (incomeByCategory.get(tx.categoryId) ?? 0) + cents,
      );
    } else if (tx.type === 'expense' || tx.type === 'refund') {
      const allocations = getExpenseCategoryAllocations(tx);
      for (const alloc of allocations) {
        const base = convertToBaseCurrency(alloc.signedAmount, currency, vault.settings);
        const cents = Math.round(base * 100);
        expenseByCategory.set(
          alloc.categoryId,
          (expenseByCategory.get(alloc.categoryId) ?? 0) + cents,
        );
      }
    }
  }

  let totalIncomeCents = 0;
  for (const cents of incomeByCategory.values()) {
    totalIncomeCents += cents;
  }

  const positiveExpenses: Array<{ category: Category; cents: number }> = [];
  let totalExpenseCents = 0;
  for (const [catId, cents] of expenseByCategory) {
    if (cents <= 0) {
      continue;
    }
    totalExpenseCents += cents;
    const cat = categoryById.get(catId) ?? {
      id: catId,
      name: 'Other',
      group: 'wants' as const,
      icon: 'Tag',
      color: '#64748b',
      monthlyBudget: 0,
      rolloverEnabled: false,
    };
    positiveExpenses.push({ category: cat, cents });
  }

  if (totalIncomeCents === 0 && totalExpenseCents === 0) {
    return {
      nodes: [],
      links: [],
      totalIncome: 0,
      totalAllocated: 0,
    };
  }

  const nodes: SankeyNode[] = [];
  const links: SankeyLink[] = [];

  const poolCents = Math.max(totalIncomeCents, totalExpenseCents);
  const netSavingsCents = Math.max(0, totalIncomeCents - totalExpenseCents);
  const deficitCents = Math.max(0, totalExpenseCents - totalIncomeCents);

  // Column 0: Income sources
  const incomeEntries = Array.from(incomeByCategory.entries())
    .filter(([, cents]) => cents > 0)
    .sort((a, b) => b[1] - a[1]);

  for (const [catId, cents] of incomeEntries) {
    const cat = categoryById.get(catId);
    const nodeId = `inc_${catId}`;
    const value = roundMoney(cents / 100);
    const color = cat?.color ?? '#10b981';
    nodes.push({
      id: nodeId,
      label: cat?.name ?? 'Income',
      column: 0,
      value,
      color,
      filterType: 'income',
      filterId: catId,
    });
    links.push({
      source: nodeId,
      target: 'net_pool',
      value,
      color,
    });
  }

  if (deficitCents > 0) {
    const deficitVal = roundMoney(deficitCents / 100);
    nodes.push({
      id: 'inc_reserves',
      label: 'From Reserves',
      column: 0,
      value: deficitVal,
      color: '#f59e0b',
      filterType: 'income',
    });
    links.push({
      source: 'inc_reserves',
      target: 'net_pool',
      value: deficitVal,
      color: '#f59e0b',
    });
  }

  // Column 1: Net Pool
  nodes.push({
    id: 'net_pool',
    label: 'Cashflow Pool',
    column: 1,
    value: roundMoney(poolCents / 100),
    color: '#0ea5e9',
  });

  // Group totals for Column 2: Needs / Wants / Savings
  let needsCents = 0;
  let wantsCents = 0;
  let savingsGroupCents = netSavingsCents;

  for (const item of positiveExpenses) {
    if (item.category.group === 'needs') {
      needsCents += item.cents;
    } else if (item.category.group === 'savings') {
      savingsGroupCents += item.cents;
    } else {
      wantsCents += item.cents;
    }
  }

  const groupMeta: Array<{
    id: string;
    group: 'needs' | 'wants' | 'savings';
    label: string;
    cents: number;
    color: string;
  }> = [
    { id: 'grp_needs', group: 'needs', label: 'Needs', cents: needsCents, color: '#3b82f6' },
    { id: 'grp_wants', group: 'wants', label: 'Wants', cents: wantsCents, color: '#8b5cf6' },
    {
      id: 'grp_savings',
      group: 'savings',
      label: 'Savings',
      cents: savingsGroupCents,
      color: '#10b981',
    },
  ];

  for (const g of groupMeta) {
    if (g.cents <= 0) {
      continue;
    }
    const val = roundMoney(g.cents / 100);
    nodes.push({
      id: g.id,
      label: g.label,
      column: 2,
      value: val,
      color: g.color,
      filterType: 'group',
      filterId: g.group,
    });
    links.push({
      source: 'net_pool',
      target: g.id,
      value: val,
      color: g.color,
    });
  }

  // Column 3: Top 8 expense categories + Other (grouped by source group) + Net Savings
  positiveExpenses.sort((a, b) => b.cents - a.cents);
  const topExpenses = positiveExpenses.slice(0, 8);
  const remainderExpenses = positiveExpenses.slice(8);

  const getGroupNodeId = (group: Category['group']): string => {
    if (group === 'needs') return 'grp_needs';
    if (group === 'savings') return 'grp_savings';
    return 'grp_wants';
  };

  for (const item of topExpenses) {
    const val = roundMoney(item.cents / 100);
    const nodeId = `cat_${item.category.id}`;
    nodes.push({
      id: nodeId,
      label: item.category.name,
      column: 3,
      value: val,
      color: item.category.color,
      filterType: 'category',
      filterId: item.category.id,
    });
    links.push({
      source: getGroupNodeId(item.category.group),
      target: nodeId,
      value: val,
      color: item.category.color,
    });
  }

  if (remainderExpenses.length > 0) {
    const otherByGroup = new Map<string, number>();
    let otherTotalCents = 0;
    for (const item of remainderExpenses) {
      const grpId = getGroupNodeId(item.category.group);
      otherByGroup.set(grpId, (otherByGroup.get(grpId) ?? 0) + item.cents);
      otherTotalCents += item.cents;
    }
    if (otherTotalCents > 0) {
      nodes.push({
        id: 'cat_other_expenses',
        label: 'Other Expenses',
        column: 3,
        value: roundMoney(otherTotalCents / 100),
        color: '#64748b',
      });
      for (const [grpId, cents] of otherByGroup) {
        if (cents > 0) {
          links.push({
            source: grpId,
            target: 'cat_other_expenses',
            value: roundMoney(cents / 100),
            color: '#64748b',
          });
        }
      }
    }
  }

  if (netSavingsCents > 0) {
    const savingsVal = roundMoney(netSavingsCents / 100);
    nodes.push({
      id: 'cat_net_savings',
      label: 'Net Savings',
      column: 3,
      value: savingsVal,
      color: '#10b981',
      filterType: 'group',
      filterId: 'savings',
    });
    links.push({
      source: 'grp_savings',
      target: 'cat_net_savings',
      value: savingsVal,
      color: '#10b981',
    });
  }

  return {
    nodes,
    links,
    totalIncome: roundMoney(totalIncomeCents / 100),
    totalAllocated: roundMoney(poolCents / 100),
  };
}

export function computeMonthlyTrends(
  vault: VaultData,
  months: number = 6,
  referenceDate: Date = new Date(),
): MonthlyTrendPoint[] {
  const safeMonths = Math.max(1, Math.min(36, Math.floor(months)));
  const anchor = toAnchorUtc(referenceDate);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  const activeAccounts = vault.accounts.filter((a) => !a.archived);

  const points: MonthlyTrendPoint[] = [];

  for (let offset = safeMonths - 1; offset >= 0; offset -= 1) {
    const monthStart = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1),
    );
    const monthEnd = new Date(
      Date.UTC(monthStart.getUTCFullYear(), monthStart.getUTCMonth() + 1, 0),
    );
    const yearMonth = `${monthStart.getUTCFullYear()}-${String(
      monthStart.getUTCMonth() + 1,
    ).padStart(2, '0')}`;
    const monthEndIso = formatUtcIsoDate(monthEnd);
    const label = SHORT_MONTHS[monthStart.getUTCMonth()];

    let incomeCents = 0;
    let expenseCents = 0;

    for (const tx of vault.transactions) {
      if (tx.date.slice(0, 7) !== yearMonth || tx.type === 'transfer') {
        continue;
      }
      const cur = getTxCurrency(tx, accountCurrencies, vault.settings.baseCurrency);
      const base = convertToBaseCurrency(tx.amount, cur, vault.settings);
      const cents = Math.round(base * 100);
      if (tx.type === 'income') {
        incomeCents += cents;
      } else if (tx.type === 'expense') {
        expenseCents += cents;
      } else if (tx.type === 'refund') {
        expenseCents -= cents;
      }
    }

    // Historical net worth as of monthEndIso
    const txsUpToMonthEnd = vault.transactions.filter((tx) => tx.date <= monthEndIso);
    const balancesAtMonthEnd = computeAllAccountBalances(activeAccounts, txsUpToMonthEnd);
    let netWorth = 0;
    for (const acc of activeAccounts) {
      const bal = balancesAtMonthEnd[acc.id] ?? acc.openingBalance;
      netWorth += convertToBaseCurrency(bal, acc.currency, vault.settings);
    }

    const income = roundMoney(incomeCents / 100);
    const expenses = roundMoney(Math.max(0, expenseCents) / 100);

    points.push({
      month: yearMonth,
      label,
      income,
      expenses,
      net: roundMoney(income - expenses),
      netWorth: roundMoney(netWorth),
    });
  }

  return points;
}

export function computeSpendingHeatmap(
  transactions: Transaction[],
  days: number = 90,
  referenceDate: Date = new Date(),
): HeatmapDay[] {
  const safeDays = Math.max(1, Math.min(366, Math.floor(days)));
  const anchor = toAnchorUtc(referenceDate);
  const startUtc = addUtcDays(anchor, -(safeDays - 1));
  const startIso = formatUtcIsoDate(startUtc);
  const endIso = formatUtcIsoDate(anchor);

  const dayTotals = new Map<string, { cents: number; count: number }>();

  for (const tx of transactions) {
    if (tx.date < startIso || tx.date > endIso) {
      continue;
    }
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    const existing = dayTotals.get(tx.date) ?? { cents: 0, count: 0 };
    const sign = tx.type === 'refund' ? -1 : 1;
    existing.cents += Math.round(sign * tx.amount * 100);
    existing.count += 1;
    dayTotals.set(tx.date, existing);
  }

  const rawDays: Array<{ date: string; amount: number; count: number }> = [];
  const positiveAmounts: number[] = [];

  for (let i = 0; i < safeDays; i += 1) {
    const dateIso = formatUtcIsoDate(addUtcDays(startUtc, i));
    const entry = dayTotals.get(dateIso);
    const amount = entry ? roundMoney(Math.max(0, entry.cents) / 100) : 0;
    const count = entry ? entry.count : 0;
    rawDays.push({ date: dateIso, amount, count });
    if (amount > 0) {
      positiveAmounts.push(amount);
    }
  }

  positiveAmounts.sort((a, b) => a - b);
  const p25 = positiveAmounts[Math.floor(positiveAmounts.length * 0.25)] ?? 0;
  const p50 = positiveAmounts[Math.floor(positiveAmounts.length * 0.5)] ?? 0;
  const p75 = positiveAmounts[Math.floor(positiveAmounts.length * 0.75)] ?? 0;

  return rawDays.map((day) => {
    let level: 0 | 1 | 2 | 3 | 4 = 0;
    if (day.amount > 0) {
      if (day.amount <= p25) {
        level = 1;
      } else if (day.amount <= p50) {
        level = 2;
      } else if (day.amount <= p75) {
        level = 3;
      } else {
        level = 4;
      }
    }
    return {
      date: day.date,
      amount: day.amount,
      count: day.count,
      level,
    };
  });
}

export function computeProactiveInsights(
  vault: VaultData,
  referenceDate: Date = new Date(),
): ProactiveInsight[] {
  const insights: ProactiveInsight[] = [];
  const anchor = toAnchorUtc(referenceDate);
  const anchorIso = formatUtcIsoDate(anchor);
  const plus7Iso = formatUtcIsoDate(addUtcDays(anchor, 7));
  const currency = vault.settings.baseCurrency;

  // 1. Over-budget categories this month
  const categorySpends = computeCategorySpend(vault, 'this_month', referenceDate);
  const overBudget = categorySpends
    .filter((c) => c.effectiveBudget > 0 && c.spent > c.effectiveBudget)
    .sort((a, b) => b.spent - b.effectiveBudget - (a.spent - a.effectiveBudget));

  if (overBudget.length > 0) {
    const top = overBudget[0];
    const overBy = roundMoney(top.spent - top.effectiveBudget);
    insights.push({
      id: `insight_overbudget_${top.categoryId}`,
      severity: 'warning',
      title: `${top.categoryName} is over budget`,
      detail: `Spent ${formatCurrency(top.spent, currency)} vs ${formatCurrency(
        top.effectiveBudget,
        currency,
      )} budget (+${formatCurrency(overBy, currency)}).`,
      actionLabel: 'View Budgets',
      actionTarget: 'budgets',
      filterCategoryId: top.categoryId,
    });
  }

  // 2. Category spending spike vs 3-month average
  const prev3Months = new Set<string>();
  for (let offset = 1; offset <= 3; offset += 1) {
    const d = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - offset, 1));
    prev3Months.add(
      `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`,
    );
  }

  const prevSpendByCategory = new Map<string, number>();
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  for (const tx of vault.transactions) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    if (!prev3Months.has(tx.date.slice(0, 7))) {
      continue;
    }
    const cur = getTxCurrency(tx, accountCurrencies, currency);
    for (const alloc of getExpenseCategoryAllocations(tx)) {
      const base = convertToBaseCurrency(alloc.signedAmount, cur, vault.settings);
      prevSpendByCategory.set(
        alloc.categoryId,
        (prevSpendByCategory.get(alloc.categoryId) ?? 0) + base,
      );
    }
  }

  let biggestSpike: { cat: CategorySpendSummary; pct: number; avg: number } | null = null;
  for (const cat of categorySpends) {
    const avg3Mo = roundMoney(Math.max(0, (prevSpendByCategory.get(cat.categoryId) ?? 0) / 3));
    if (avg3Mo >= 25 && cat.spent - avg3Mo >= 30) {
      const pct = Math.round(((cat.spent - avg3Mo) / avg3Mo) * 100);
      if (pct >= 25 && (!biggestSpike || pct > biggestSpike.pct)) {
        biggestSpike = { cat, pct, avg: avg3Mo };
      }
    }
  }

  if (biggestSpike) {
    insights.push({
      id: `insight_spike_${biggestSpike.cat.categoryId}`,
      severity: 'warning',
      title: `${biggestSpike.cat.categoryName} up ${biggestSpike.pct}% vs 3-mo avg`,
      detail: `This month is ${formatCurrency(
        biggestSpike.cat.spent,
        currency,
      )} compared to a ${formatCurrency(biggestSpike.avg, currency)} monthly average.`,
      actionLabel: 'Inspect Spend',
      actionTarget: 'transactions',
      filterCategoryId: biggestSpike.cat.categoryId,
    });
  }

  // 3. Upcoming bills / subscriptions within 7 days (or overdue)
  const dueSoonBills = vault.recurringBills.filter(
    (b) => b.active && b.type === 'expense' && b.nextDueDate <= plus7Iso,
  );
  if (dueSoonBills.length > 0) {
    const overdueCount = dueSoonBills.filter((b) => b.nextDueDate < anchorIso).length;
    const totalDue = roundMoney(dueSoonBills.reduce((s, b) => s + b.amount, 0));
    insights.push({
      id: 'insight_upcoming_bills',
      severity: overdueCount > 0 ? 'warning' : 'info',
      title:
        overdueCount > 0
          ? `${overdueCount} overdue & ${dueSoonBills.length - overdueCount} bills due soon`
          : `${dueSoonBills.length} bill${dueSoonBills.length > 1 ? 's' : ''} due in the next 7 days`,
      detail: `Total upcoming commitments: ${formatCurrency(totalDue, currency)} (${dueSoonBills
        .slice(0, 2)
        .map((b) => b.name)
        .join(', ')}${dueSoonBills.length > 2 ? '…' : ''}).`,
      actionLabel: 'Review Bills',
      actionTarget: 'recurring',
    });
  }

  // 4. Unreviewed inbox transactions
  const unreviewedCount = vault.transactions.filter((tx) => !tx.reviewed).length;
  if (unreviewedCount > 0) {
    insights.push({
      id: 'insight_unreviewed_inbox',
      severity: 'info',
      title: `${unreviewedCount} transaction${unreviewedCount > 1 ? 's' : ''} waiting in Inbox`,
      detail: 'Review and confirm categories to keep your budget and cashflow reports accurate.',
      actionLabel: 'Open Inbox',
      actionTarget: 'transactions',
    });
  }

  // 5. Savings rate milestone
  const kpis = computeDashboardKPIs(vault, 'this_month', referenceDate);
  if (kpis.periodIncome > 0) {
    if (kpis.savingsRate >= 20) {
      insights.push({
        id: 'insight_savings_milestone',
        severity: 'positive',
        title: `Strong ${kpis.savingsRate.toFixed(1)}% savings rate this month`,
        detail: `You have saved ${formatCurrency(
          kpis.netCashflow,
          currency,
        )} so far this month—above the 20% target benchmark.`,
        actionLabel: 'View Goals',
        actionTarget: 'goals',
      });
    } else if (kpis.savingsRate < 10) {
      insights.push({
        id: 'insight_savings_low',
        severity: 'warning',
        title: `Savings rate is ${kpis.savingsRate.toFixed(1)}% this month`,
        detail: `Net cashflow is ${formatCurrency(
          kpis.netCashflow,
          currency,
        )}. Trimming top discretionary categories could boost your buffer.`,
        actionLabel: 'Review Budgets',
        actionTarget: 'budgets',
      });
    }
  }

  return insights.slice(0, 5);
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

export function computeRecurringSummary(
  bills: RecurringBill[],
  referenceDate: Date = new Date(),
): {
  monthlyTotal: number;
  yearlyTotal: number;
  subscriptionMonthly: number;
  upcomingSoon: RecurringBill[];
  overdue: RecurringBill[];
} {
  const anchor = toAnchorUtc(referenceDate);
  const anchorIso = formatUtcIsoDate(anchor);
  const soonIso = formatUtcIsoDate(addUtcDays(anchor, 14));

  let monthlyTotal = 0;
  let subscriptionMonthly = 0;
  const upcomingSoon: RecurringBill[] = [];
  const overdue: RecurringBill[] = [];

  for (const bill of bills) {
    if (!bill.active) {
      continue;
    }

    if (bill.type === 'expense') {
      const monthly = monthlyEquivalent(bill.amount, bill.frequency);
      monthlyTotal += monthly;
      if (bill.isSubscription) {
        subscriptionMonthly += monthly;
      }
    }

    if (bill.nextDueDate < anchorIso) {
      overdue.push(bill);
    } else if (bill.nextDueDate <= soonIso) {
      upcomingSoon.push(bill);
    }
  }

  upcomingSoon.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));
  overdue.sort((a, b) => a.nextDueDate.localeCompare(b.nextDueDate));

  const roundedMonthly = roundMoney(monthlyTotal);
  return {
    monthlyTotal: roundedMonthly,
    yearlyTotal: roundMoney(monthlyTotal * 12),
    subscriptionMonthly: roundMoney(subscriptionMonthly),
    upcomingSoon,
    overdue,
  };
}
