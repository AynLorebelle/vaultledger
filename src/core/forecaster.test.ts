import { describe, expect, it } from 'vitest';
import type { ForecastInput, ForecastMilestone, VaultData } from '../types/finance';
import { computeDashboardKPIs } from './analytics';
import { deriveForecastBaseline, runNetWorthForecast } from './forecaster';
import { createEmptyVault, createSampleVault } from './seedData';

function makeBaseInput(overrides: Partial<ForecastInput> = {}): ForecastInput {
  return {
    currentNetWorth: 20000,
    currentLiquidAssets: 25000,
    currentDebt: 5000,
    baselineMonthlyIncome: 6000,
    baselineMonthlyExpense: 4000,
    horizonMonths: 12,
    incomeChangePct: 0,
    expenseChangePct: 0,
    expectedAnnualReturnPct: 0,
    milestones: [],
    ...overrides,
  };
}

describe('forecaster: deriveForecastBaseline', () => {
  it('derives accurate net worth, assets, debt, and 3-month baseline from createSampleVault()', () => {
    const refDate = new Date(2026, 10, 22); // Nov 22, 2026
    const vault = createSampleVault(refDate);
    const baseline = deriveForecastBaseline(vault, refDate);
    const kpis = computeDashboardKPIs(vault, 'this_month', refDate);

    expect(baseline.currentNetWorth).toBeCloseTo(kpis.totalNetWorth, 2);
    expect(baseline.currentLiquidAssets).toBeGreaterThan(0);
    expect(baseline.currentDebt).toBeGreaterThan(0);
    expect(baseline.currentNetWorth).toBeCloseTo(
      baseline.currentLiquidAssets - baseline.currentDebt,
      2,
    );

    // Seed vault has ~5900 salary + occasional freelance income and ~3k expenses per completed month
    expect(baseline.baselineMonthlyIncome).toBeGreaterThan(5000);
    expect(baseline.baselineMonthlyExpense).toBeGreaterThan(2000);
    expect(baseline.baselineMonthlyIncome).toBeGreaterThan(baseline.baselineMonthlyExpense);
  });

  it('returns graceful zero baseline for createEmptyVault()', () => {
    const refDate = new Date(2026, 10, 22);
    const emptyVault = createEmptyVault();
    const baseline = deriveForecastBaseline(emptyVault, refDate);

    expect(baseline).toEqual({
      currentNetWorth: 0,
      currentLiquidAssets: 0,
      currentDebt: 0,
      baselineMonthlyIncome: 0,
      baselineMonthlyExpense: 0,
    });
  });

  it('converts multi-currency balances and transactions to base currency and ignores archived accounts and transfers', () => {
    const refDate = new Date(2026, 10, 15); // Nov 15, 2026
    const empty = createEmptyVault();
    const vault: VaultData = {
      ...empty,
      settings: {
        ...empty.settings,
        baseCurrency: 'USD',
        exchangeRates: {
          ...empty.settings.exchangeRates,
          USD: 1,
          EUR: 0.8, // 1 USD = 0.8 EUR => 800 EUR = 1000 USD
        },
      },
      accounts: [
        {
          id: 'acc_eur',
          name: 'Euro Savings',
          type: 'savings',
          currency: 'EUR',
          openingBalance: 800, // 1000 USD
          color: '#10b981',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc_inv',
          name: 'Brokerage',
          type: 'investment',
          currency: 'USD',
          openingBalance: 5000,
          color: '#3b82f6',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc_cc',
          name: 'Credit Card',
          type: 'credit',
          currency: 'USD',
          openingBalance: -1200,
          color: '#8b5cf6',
          createdAt: '2026-01-01T00:00:00.000Z',
        },
        {
          id: 'acc_archived',
          name: 'Old Account',
          type: 'checking',
          currency: 'USD',
          openingBalance: 9999,
          color: '#64748b',
          archived: true,
          createdAt: '2026-01-01T00:00:00.000Z',
        },
      ],
      transactions: [
        // Oct 2026: +800 EUR (+1000 USD) income, -400 EUR (-500 USD) expense
        {
          id: 't1',
          date: '2026-10-05',
          type: 'income',
          amount: 800,
          accountId: 'acc_eur',
          payee: 'Client',
          categoryId: 'cat_salary',
          tags: [],
          notes: '',
          reviewed: true,
          createdAt: '2026-10-05T00:00:00.000Z',
          updatedAt: '2026-10-05T00:00:00.000Z',
        },
        {
          id: 't2',
          date: '2026-10-12',
          type: 'expense',
          amount: 400,
          accountId: 'acc_eur',
          payee: 'Grocer',
          categoryId: 'cat_groceries',
          tags: [],
          notes: '',
          reviewed: true,
          createdAt: '2026-10-12T00:00:00.000Z',
          updatedAt: '2026-10-12T00:00:00.000Z',
        },
        // Transfer should not count as income or expense
        {
          id: 't3',
          date: '2026-10-15',
          type: 'transfer',
          amount: 200,
          accountId: 'acc_inv',
          transferAccountId: 'acc_cc',
          payee: 'Card Payment',
          categoryId: 'cat_uncategorized',
          tags: [],
          notes: '',
          reviewed: true,
          createdAt: '2026-10-15T00:00:00.000Z',
          updatedAt: '2026-10-15T00:00:00.000Z',
        },
      ],
    };

    const baseline = deriveForecastBaseline(vault, refDate);
    // acc_eur: 800 + 800 - 400 = 1200 EUR = 1500 USD
    // acc_inv: 5000 - 200 = 4800 USD
    // acc_cc: -1200 + 200 = -1000 USD
    // acc_archived: excluded
    expect(baseline.currentLiquidAssets).toBe(6300);
    expect(baseline.currentDebt).toBe(1000);
    expect(baseline.currentNetWorth).toBe(5300);
    // 1 active month (2026-10)
    expect(baseline.baselineMonthlyIncome).toBe(1000);
    expect(baseline.baselineMonthlyExpense).toBe(500);
  });
});

describe('forecaster: runNetWorthForecast', () => {
  it('returns 13 points (0..12) for 12-month horizon and 61 points (0..60) for 60-month horizon with formatted keys and labels', () => {
    const refDate = new Date(2026, 10, 22); // Nov 2026

    const res12 = runNetWorthForecast(makeBaseInput({ horizonMonths: 12 }), refDate);
    expect(res12.points).toHaveLength(13);
    expect(res12.points[0].monthIndex).toBe(0);
    expect(res12.points[0].monthKey).toBe('2026-11');
    expect(res12.points[0].label).toBe('Nov 26');
    expect(res12.points[1].monthKey).toBe('2026-12');
    expect(res12.points[1].label).toBe('Dec 26');
    expect(res12.points[2].monthKey).toBe('2027-01');
    expect(res12.points[2].label).toBe('Jan 27');
    expect(res12.points[12].monthIndex).toBe(12);
    expect(res12.points[12].monthKey).toBe('2027-11');
    expect(res12.points[12].label).toBe('Nov 27');

    const res60 = runNetWorthForecast(makeBaseInput({ horizonMonths: 60 }), refDate);
    expect(res60.points).toHaveLength(61);
    expect(res60.points[0].monthIndex).toBe(0);
    expect(res60.points[60].monthIndex).toBe(60);
    expect(res60.points[60].monthKey).toBe('2031-11');
    expect(res60.points[60].label).toBe('Nov 31');
  });

  it('produces identical baseline and scenario curves (netWorthDelta === 0) when sliders, return, and milestones are zero', () => {
    const refDate = new Date(2026, 10, 22);
    const result = runNetWorthForecast(
      makeBaseInput({
        currentNetWorth: 15000,
        baselineMonthlyIncome: 5500,
        baselineMonthlyExpense: 3200,
        horizonMonths: 12,
        incomeChangePct: 0,
        expenseChangePct: 0,
        expectedAnnualReturnPct: 0,
        milestones: [],
      }),
      refDate,
    );

    expect(result.netWorthDelta).toBe(0);
    expect(result.endingBaselineNetWorth).toBe(15000 + 2300 * 12);
    expect(result.endingScenarioNetWorth).toBe(result.endingBaselineNetWorth);
    expect(result.projectedMonthlyIncome).toBe(5500);
    expect(result.projectedMonthlyExpense).toBe(3200);
    expect(result.projectedMonthlySavings).toBe(2300);
    expect(result.totalMilestoneImpact).toBe(0);

    for (const pt of result.points) {
      expect(pt.scenarioNetWorth).toBe(pt.baselineNetWorth);
    }
  });

  it('compounds positive net worth accurately and does NOT multiply negative net worth into worse debt', () => {
    const refDate = new Date(2026, 10, 22);

    // Positive net worth with 12% annual return (1% monthly) and 0 monthly cashflow
    const positiveRes = runNetWorthForecast(
      makeBaseInput({
        currentNetWorth: 10000,
        baselineMonthlyIncome: 3000,
        baselineMonthlyExpense: 3000,
        horizonMonths: 12,
        expectedAnnualReturnPct: 12,
      }),
      refDate,
    );

    const expectedCompounded = Math.round(10000 * Math.pow(1.01, 12) * 100) / 100;
    expect(positiveRes.endingBaselineNetWorth).toBe(10000);
    expect(positiveRes.endingScenarioNetWorth).toBeCloseTo(expectedCompounded, 2);
    expect(positiveRes.netWorthDelta).toBeCloseTo(expectedCompounded - 10000, 2);

    // Negative net worth with 12% annual return and 0 monthly cashflow must NOT worsen debt
    const negativeRes = runNetWorthForecast(
      makeBaseInput({
        currentNetWorth: -10000,
        currentLiquidAssets: 0,
        currentDebt: 10000,
        baselineMonthlyIncome: 3000,
        baselineMonthlyExpense: 3000,
        horizonMonths: 12,
        expectedAnnualReturnPct: 12,
      }),
      refDate,
    );

    expect(negativeRes.endingBaselineNetWorth).toBe(-10000);
    expect(negativeRes.endingScenarioNetWorth).toBe(-10000);
    expect(negativeRes.netWorthDelta).toBe(0);
    for (const pt of negativeRes.points) {
      expect(pt.scenarioNetWorth).toBe(-10000);
    }
  });

  it('applies one-time and recurring milestones at exact monthOffset and ignores disabled milestones', () => {
    const refDate = new Date(2026, 10, 22);
    const milestones: ForecastMilestone[] = [
      {
        id: 'ms_bonus',
        label: 'Annual Bonus',
        monthOffset: 3,
        amount: 5000,
        recurring: false,
        enabled: true,
      },
      {
        id: 'ms_side_hustle',
        label: 'Side Retainer',
        monthOffset: 6,
        amount: 400,
        recurring: true,
        enabled: true,
      },
      {
        id: 'ms_disabled',
        label: 'Ignored Yacht',
        monthOffset: 2,
        amount: -25000,
        recurring: false,
        enabled: false,
      },
    ];

    const result = runNetWorthForecast(
      makeBaseInput({
        currentNetWorth: 10000,
        baselineMonthlyIncome: 4000,
        baselineMonthlyExpense: 3000, // +1000/mo baseline savings
        horizonMonths: 12,
        expectedAnnualReturnPct: 0,
        milestones,
      }),
      refDate,
    );

    // Month 2: disabled milestone must not apply
    expect(result.points[2].milestoneLabels).toEqual([]);
    expect(result.points[2].scenarioNetWorth).toBe(12000);

    // Month 3: one-time +5000 bonus applies only in month 3
    expect(result.points[3].milestoneLabels).toEqual(['Annual Bonus']);
    expect(result.points[3].scenarioCashflow).toBe(6000);
    expect(result.points[3].scenarioNetWorth).toBe(18000);
    expect(result.points[4].milestoneLabels).toEqual([]);
    expect(result.points[4].scenarioCashflow).toBe(1000);
    expect(result.points[4].scenarioNetWorth).toBe(19000);

    // Month 6..12 (7 months inclusive): recurring +400/mo starts at month 6, label recorded on month 6
    expect(result.points[6].milestoneLabels).toEqual(['Side Retainer']);
    expect(result.points[6].scenarioCashflow).toBe(1400);
    expect(result.points[7].milestoneLabels).toEqual([]);
    expect(result.points[7].scenarioCashflow).toBe(1400);

    // Total milestone impact: 5000 + (400 * 7) = 7800
    expect(result.totalMilestoneImpact).toBe(7800);
    expect(result.endingBaselineNetWorth).toBe(10000 + 1000 * 12);
    expect(result.endingScenarioNetWorth).toBe(10000 + 1000 * 12 + 7800);
    expect(result.netWorthDelta).toBe(7800);
  });

  it('handles negative monthly cashflow smoothly without NaN even across positive-to-negative net worth transition', () => {
    const refDate = new Date(2026, 10, 22);
    const result = runNetWorthForecast(
      makeBaseInput({
        currentNetWorth: 3000,
        baselineMonthlyIncome: 2500,
        baselineMonthlyExpense: 3500, // -1000/mo burn
        horizonMonths: 12,
        incomeChangePct: -10, // 2250
        expenseChangePct: 10, // 3850 => -1600/mo scenario burn
        expectedAnnualReturnPct: 6,
      }),
      refDate,
    );

    expect(result.projectedMonthlyIncome).toBe(2250);
    expect(result.projectedMonthlyExpense).toBe(3850);
    expect(result.projectedMonthlySavings).toBe(-1600);

    for (let i = 1; i < result.points.length; i += 1) {
      const prev = result.points[i - 1];
      const cur = result.points[i];
      expect(Number.isFinite(cur.baselineNetWorth)).toBe(true);
      expect(Number.isFinite(cur.scenarioNetWorth)).toBe(true);
      expect(Number.isNaN(cur.scenarioNetWorth)).toBe(false);
      expect(cur.baselineNetWorth).toBeLessThan(prev.baselineNetWorth);
      expect(cur.scenarioNetWorth).toBeLessThan(prev.scenarioNetWorth);
    }

    expect(result.endingBaselineNetWorth).toBe(3000 - 1000 * 12);
    expect(result.endingScenarioNetWorth).toBeLessThan(0);
    // Once scenario NW crosses below 0 (after month 2), monthly step is pure -1600 with no compounding on negative balance
    const m5 = result.points[5].scenarioNetWorth;
    const m6 = result.points[6].scenarioNetWorth;
    expect(m6 - m5).toBeCloseTo(-1600, 2);
  });
});
