import { describe, expect, it } from 'vitest';
import type { Transaction, VaultData } from '../types/finance';
import { computeFinancialHealthScore } from './healthScore';
import { createEmptyVault, createSampleVault } from './seedData';

const VALID_GRADES = new Set(['A+', 'A', 'B+', 'B', 'C', 'D']);
const VALID_STATUSES = new Set(['strong', 'fair', 'attention']);

function makeTx(
  overrides: Partial<Transaction> & Pick<Transaction, 'id' | 'date' | 'type' | 'amount' | 'accountId' | 'categoryId'>,
): Transaction {
  return {
    payee: 'Test Payee',
    tags: [],
    notes: '',
    reviewed: true,
    createdAt: `${overrides.date}T12:00:00.000Z`,
    updatedAt: `${overrides.date}T12:00:00.000Z`,
    ...overrides,
  };
}

describe('healthScore: computeFinancialHealthScore', () => {
  it('computes a valid 5-metric health score for the sample seed vault', () => {
    const refDate = new Date('2026-06-18T12:00:00Z');
    const sample = createSampleVault(refDate);

    const result = computeFinancialHealthScore(sample, refDate);

    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(VALID_GRADES.has(result.grade)).toBe(true);
    expect(result.summary.length).toBeGreaterThan(15);

    expect(result.metrics).toHaveLength(5);
    const weightSum = result.metrics.reduce((sum, m) => sum + m.weight, 0);
    expect(weightSum).toBeCloseTo(1, 5);

    const ids = result.metrics.map((m) => m.id);
    expect(ids).toEqual([
      'savings_rate',
      'budget_adherence',
      'emergency_runway',
      'debt_ratio',
      'fixed_cost_ratio',
    ]);

    for (const metric of result.metrics) {
      expect(Number.isFinite(metric.score)).toBe(true);
      expect(metric.score).toBeGreaterThanOrEqual(0);
      expect(metric.score).toBeLessThanOrEqual(100);
      expect(VALID_STATUSES.has(metric.status)).toBe(true);
      expect(metric.displayValue.length).toBeGreaterThan(0);
      expect(metric.benchmarkLabel.length).toBeGreaterThan(0);
      expect(metric.explanation.length).toBeGreaterThan(10);
    }
  });

  it('handles an empty vault gracefully without NaN or Infinity', () => {
    const refDate = new Date('2026-06-18T12:00:00Z');
    const empty = createEmptyVault();

    const result = computeFinancialHealthScore(empty, refDate);

    expect(Number.isFinite(result.score)).toBe(true);
    expect(Number.isInteger(result.score)).toBe(true);
    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(VALID_GRADES.has(result.grade)).toBe(true);
    expect(result.metrics).toHaveLength(5);

    for (const metric of result.metrics) {
      expect(Number.isNaN(metric.score)).toBe(false);
      expect(Number.isFinite(metric.score)).toBe(true);
      expect(metric.displayValue).not.toContain('NaN');
      expect(metric.displayValue).not.toContain('Infinity');
    }

    const savings = result.metrics.find((m) => m.id === 'savings_rate')!;
    const runway = result.metrics.find((m) => m.id === 'emergency_runway')!;
    const debt = result.metrics.find((m) => m.id === 'debt_ratio')!;
    const fixed = result.metrics.find((m) => m.id === 'fixed_cost_ratio')!;

    expect(savings.displayValue).toBe('0.0%');
    expect(runway.displayValue).toBe('No spend data');
    expect(runway.score).toBe(50);
    expect(debt.displayValue).toBe('Debt-free');
    expect(debt.score).toBe(100);
    expect(fixed.displayValue).toBe('No income data');
    expect(fixed.score).toBe(50);
  });

  it('produces a low score (< 55, grade D) and flags attention metrics for a high-stress vault', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');
    const base = createEmptyVault();

    const stressVault: VaultData = {
      ...base,
      accounts: [
        {
          id: 'acc_checking',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          openingBalance: 600,
          color: '#3b82f6',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'acc_credit',
          name: 'Maxed Credit Card',
          type: 'credit',
          currency: 'USD',
          openingBalance: -12000,
          apr: 24.99,
          minPayment: 320,
          color: '#ef4444',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'acc_loan',
          name: 'Personal Loan',
          type: 'loan',
          currency: 'USD',
          openingBalance: -18000,
          apr: 11.5,
          minPayment: 480,
          color: '#f59e0b',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      categories: base.categories.map((cat) => {
        if (cat.id === 'cat_housing') return { ...cat, monthlyBudget: 1400 };
        if (cat.id === 'cat_groceries') return { ...cat, monthlyBudget: 400 };
        if (cat.id === 'cat_dining') return { ...cat, monthlyBudget: 200 };
        if (cat.id === 'cat_shopping') return { ...cat, monthlyBudget: 200 };
        return { ...cat, monthlyBudget: 0 };
      }),
      transactions: [
        // Current month: $3,200 income vs $4,450 expenses (negative savings, severe budget overruns)
        makeTx({
          id: 'tx_inc',
          date: '2026-06-01',
          type: 'income',
          amount: 3200,
          accountId: 'acc_checking',
          categoryId: 'cat_salary',
        }),
        makeTx({
          id: 'tx_rent',
          date: '2026-06-02',
          type: 'expense',
          amount: 2100, // 150% of 1400 budget
          accountId: 'acc_checking',
          categoryId: 'cat_housing',
        }),
        makeTx({
          id: 'tx_groc',
          date: '2026-06-05',
          type: 'expense',
          amount: 850, // 212% of 400 budget
          accountId: 'acc_checking',
          categoryId: 'cat_groceries',
        }),
        makeTx({
          id: 'tx_dine',
          date: '2026-06-08',
          type: 'expense',
          amount: 750, // 375% of 200 budget
          accountId: 'acc_credit',
          categoryId: 'cat_dining',
        }),
        makeTx({
          id: 'tx_shop',
          date: '2026-06-12',
          type: 'expense',
          amount: 750, // 375% of 200 budget
          accountId: 'acc_credit',
          categoryId: 'cat_shopping',
        }),
      ],
    };

    const result = computeFinancialHealthScore(stressVault, refDate);

    expect(result.score).toBeLessThan(55);
    expect(['D', 'C']).toContain(result.grade);
    expect(result.grade).toBe('D');

    const attentionMetrics = result.metrics.filter((m) => m.status === 'attention');
    expect(attentionMetrics.length).toBeGreaterThanOrEqual(4);

    const savings = result.metrics.find((m) => m.id === 'savings_rate')!;
    const budget = result.metrics.find((m) => m.id === 'budget_adherence')!;
    const runway = result.metrics.find((m) => m.id === 'emergency_runway')!;
    const debt = result.metrics.find((m) => m.id === 'debt_ratio')!;
    const fixed = result.metrics.find((m) => m.id === 'fixed_cost_ratio')!;

    expect(savings.status).toBe('attention');
    expect(budget.status).toBe('attention');
    expect(budget.displayValue).toBe('0 / 4 on track');
    expect(runway.status).toBe('attention');
    expect(debt.status).toBe('attention');
    expect(fixed.status).toBe('attention');
  });

  it('produces an A or A+ (>= 85) for a strong healthy vault', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');
    const base = createEmptyVault();

    // Monthly income: $8,000; monthly expenses: $3,200 (needs $2,400, wants $800) => 60% savings rate, 30% fixed cost ratio
    // Liquid cash after 3 months of surplus: ~$30,000 => > 8 months runway
    // Debt: $0 => Debt-free
    // All budgets comfortably under limit
    const months = ['2026-04', '2026-05', '2026-06'];
    const transactions: Transaction[] = [];
    let counter = 1;

    for (const ym of months) {
      transactions.push(
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-01`,
          type: 'income',
          amount: 8000,
          accountId: 'acc_checking',
          categoryId: 'cat_salary',
        }),
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-02`,
          type: 'expense',
          amount: 1600,
          accountId: 'acc_checking',
          categoryId: 'cat_housing',
        }),
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-06`,
          type: 'expense',
          amount: 500,
          accountId: 'acc_checking',
          categoryId: 'cat_groceries',
        }),
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-08`,
          type: 'expense',
          amount: 300,
          accountId: 'acc_checking',
          categoryId: 'cat_utilities',
        }),
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-12`,
          type: 'expense',
          amount: 250,
          accountId: 'acc_checking',
          categoryId: 'cat_dining',
        }),
        makeTx({
          id: `h_tx_${counter++}`,
          date: `${ym}-15`,
          type: 'expense',
          amount: 200,
          accountId: 'acc_checking',
          categoryId: 'cat_shopping',
        }),
      );
    }

    const healthyVault: VaultData = {
      ...base,
      accounts: [
        {
          id: 'acc_checking',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          openingBalance: 8000,
          color: '#3b82f6',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'acc_savings',
          name: 'Emergency HYSA',
          type: 'savings',
          currency: 'USD',
          openingBalance: 16000,
          color: '#10b981',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      categories: base.categories.map((cat) => {
        if (cat.id === 'cat_utilities') return { ...cat, monthlyBudget: 350 };
        return cat;
      }),
      transactions,
    };

    const result = computeFinancialHealthScore(healthyVault, refDate);

    expect(result.score).toBeGreaterThanOrEqual(85);
    expect(['A', 'A+']).toContain(result.grade);
    expect(result.metrics.every((m) => m.status === 'strong')).toBe(true);

    const savings = result.metrics.find((m) => m.id === 'savings_rate')!;
    const runway = result.metrics.find((m) => m.id === 'emergency_runway')!;
    const debt = result.metrics.find((m) => m.id === 'debt_ratio')!;
    const fixed = result.metrics.find((m) => m.id === 'fixed_cost_ratio')!;

    expect(savings.score).toBe(100);
    expect(runway.score).toBe(100);
    expect(debt.score).toBe(100);
    expect(debt.displayValue).toBe('Debt-free');
    expect(fixed.score).toBe(100);
  });

  it('returns neutral fair budget_adherence score (70) when no budgets are configured', () => {
    const refDate = new Date('2026-06-20T12:00:00Z');
    const base = createEmptyVault();
    const noBudgetsVault: VaultData = {
      ...base,
      categories: base.categories.map((c) => ({ ...c, monthlyBudget: 0 })),
    };

    const result = computeFinancialHealthScore(noBudgetsVault, refDate);
    const budget = result.metrics.find((m) => m.id === 'budget_adherence')!;

    expect(budget.score).toBe(70);
    expect(budget.status).toBe('fair');
    expect(budget.displayValue).toBe('No budgets set');
  });

  it('falls back to trailing 3-month income & expenses when current month has zero income', () => {
    const refDate = new Date('2026-06-02T12:00:00Z');
    const base = createEmptyVault();

    const vault: VaultData = {
      ...base,
      accounts: [
        {
          id: 'acc_checking',
          name: 'Checking',
          type: 'checking',
          currency: 'USD',
          openingBalance: 10000,
          color: '#3b82f6',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      transactions: [
        makeTx({
          id: 'm1_inc',
          date: '2026-04-01',
          type: 'income',
          amount: 6000,
          accountId: 'acc_checking',
          categoryId: 'cat_salary',
        }),
        makeTx({
          id: 'm1_exp',
          date: '2026-04-05',
          type: 'expense',
          amount: 3000,
          accountId: 'acc_checking',
          categoryId: 'cat_housing',
        }),
        makeTx({
          id: 'm2_inc',
          date: '2026-05-01',
          type: 'income',
          amount: 6000,
          accountId: 'acc_checking',
          categoryId: 'cat_salary',
        }),
        makeTx({
          id: 'm2_exp',
          date: '2026-05-05',
          type: 'expense',
          amount: 3000,
          accountId: 'acc_checking',
          categoryId: 'cat_housing',
        }),
      ],
    };

    const result = computeFinancialHealthScore(vault, refDate);
    const savings = result.metrics.find((m) => m.id === 'savings_rate')!;
    const fixed = result.metrics.find((m) => m.id === 'fixed_cost_ratio')!;

    expect(savings.score).toBe(100);
    expect(savings.displayValue).toBe('50.0%');
    expect(fixed.score).toBe(100);
    expect(fixed.displayValue).toBe('50%');
  });

  it('converts foreign-currency accounts to base currency and ignores archived accounts', () => {
    const refDate = new Date('2026-06-15T12:00:00Z');
    const base = createEmptyVault();

    const multiCurrencyVault: VaultData = {
      ...base,
      accounts: [
        {
          id: 'acc_eur',
          name: 'Euro Savings',
          type: 'savings',
          currency: 'EUR', // 0.92 EUR per 1 USD => 9200 EUR = $10,000 USD
          openingBalance: 9200,
          color: '#10b981',
          createdAt: '2026-01-01T00:00:00Z',
        },
        {
          id: 'acc_archived_debt',
          name: 'Old Closed Loan',
          type: 'loan',
          currency: 'USD',
          openingBalance: -50000,
          archived: true,
          color: '#ef4444',
          createdAt: '2026-01-01T00:00:00Z',
        },
      ],
      transactions: [
        makeTx({
          id: 'mc_inc',
          date: '2026-06-01',
          type: 'income',
          amount: 4600, // 4600 EUR = $5,000 USD
          accountId: 'acc_eur',
          categoryId: 'cat_salary',
        }),
        makeTx({
          id: 'mc_exp',
          date: '2026-06-05',
          type: 'expense',
          amount: 1840, // 1840 EUR = $2,000 USD
          accountId: 'acc_eur',
          categoryId: 'cat_housing',
        }),
      ],
    };

    const result = computeFinancialHealthScore(multiCurrencyVault, refDate);
    const debt = result.metrics.find((m) => m.id === 'debt_ratio')!;
    const runway = result.metrics.find((m) => m.id === 'emergency_runway')!;

    // Archived loan is excluded
    expect(debt.displayValue).toBe('Debt-free');
    expect(debt.score).toBe(100);

    // Liquid cash = (9200 + 4600 - 1840) EUR = 11960 EUR = $13,000 USD; monthly expense = $2,000 USD => 6.5 mo
    expect(runway.displayValue).toBe('6.5 mo');
    expect(runway.score).toBe(100);
  });
});
