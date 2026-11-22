import { describe, expect, it } from 'vitest';
import { computeDashboardKPIs, computeRecurringSummary } from './analytics';
import {
  SUGGESTED_VAULT_QUERIES,
  askVault,
  isLikelyVaultQuestion,
} from './askVault';
import { createEmptyVault, createSampleVault } from './seedData';

// Fixed local reference date (June 22, 2026) so seedData & analytics align deterministically
const REF_DATE = new Date(2026, 5, 22, 12, 0, 0);

describe('askVault: Offline Natural-Language Q&A Engine', () => {
  it('exports 6 suggested queries that all detect as questions and produce matched answers', () => {
    const vault = createSampleVault(REF_DATE);
    expect(SUGGESTED_VAULT_QUERIES).toHaveLength(6);

    for (const q of SUGGESTED_VAULT_QUERIES) {
      expect(isLikelyVaultQuestion(q)).toBe(true);
      const ans = askVault(q, vault, REF_DATE);
      expect(ans.matched).toBe(true);
      expect(ans.headline.length).toBeGreaterThan(0);
      expect(ans.summary.length).toBeGreaterThan(0);
    }
  });

  it('answers category spend accurately including synonyms, splits, and refund offsets', () => {
    const vault = createSampleVault(REF_DATE);

    // Dining this month: Nopa Bistro ($64.50) + Marufuku Ramen ($48.20) + Tartine Bakery ($84.50) = $197.20
    const dining = askVault('How much did I spend on dining this month?', vault, REF_DATE);
    expect(dining.matched).toBe(true);
    expect(dining.intent).toBe('category_spend');
    expect(dining.periodLabel).toBe('This month');
    expect(dining.primaryAmount).toBe(197.2);
    expect(dining.drillAction?.nav).toBe('transactions');
    expect(dining.drillAction?.categoryId).toBe('cat_dining');
    expect(dining.rows.length).toBeGreaterThan(0);
    expect(dining.rows[0].filterCategoryId).toBe('cat_dining');
    expect(dining.rows[0].filterSearch).toBeTruthy();

    // Synonym ("eating out" / "food") maps to Dining Out
    const food = askVault('Total spent on food this month', vault, REF_DATE);
    expect(food.intent).toBe('category_spend');
    expect(food.primaryAmount).toBe(197.2);
    expect(food.drillAction?.categoryId).toBe('cat_dining');

    // Shopping this month: Amazon ($92.30) + Target split ($52.20) + Uniqlo ($158.00) - Uniqlo Refund ($69.90) + AMZN ($41.20) = $273.80
    const shopping = askVault('How much did I spend on shopping this month?', vault, REF_DATE);
    expect(shopping.matched).toBe(true);
    expect(shopping.intent).toBe('category_spend');
    expect(shopping.primaryAmount).toBe(273.8);

    // Groceries this month includes $96.40 split from Target Superstore
    const groceries = askVault('How much did I spend on groceries this month?', vault, REF_DATE);
    expect(groceries.intent).toBe('category_spend');
    expect(groceries.primaryAmount).toBe(559.3);
  });

  it('compares category and overall spending against last month with delta text and tone', () => {
    const vault = createSampleVault(REF_DATE);

    // This month groceries ($559.30) vs May groceries ($442.30) => +26.5% (negative tone because spend went up)
    const cmp = askVault('Compare groceries vs last month', vault, REF_DATE);
    expect(cmp.matched).toBe(true);
    expect(cmp.intent).toBe('compare_period');
    expect(cmp.primaryAmount).toBe(559.3);
    expect(cmp.deltaText).toContain('+26.5% vs last month');
    expect(cmp.deltaTone).toBe('negative');
    expect(cmp.rows).toHaveLength(2);
    expect(cmp.rows[0].amount).toBe(559.3);
    expect(cmp.rows[1].amount).toBe(442.3);
    expect(cmp.drillAction?.categoryId).toBe('cat_groceries');

    // Overall comparison without category
    const overall = askVault('Compare spending vs last month', vault, REF_DATE);
    expect(overall.matched).toBe(true);
    expect(overall.intent).toBe('compare_period');
    expect(overall.rows).toHaveLength(2);
    expect(overall.deltaText).toContain('vs last month');
  });

  it('ranks top N merchants with filterSearch drill-downs', () => {
    const vault = createSampleVault(REF_DATE);

    const top3 = askVault('Top 3 merchants this month', vault, REF_DATE);
    expect(top3.matched).toBe(true);
    expect(top3.intent).toBe('top_merchants');
    expect(top3.periodLabel).toBe('This month');
    expect(top3.rows).toHaveLength(3);
    // Avalon Apartments ($1,620) should be #1
    expect(top3.rows[0].label).toBe('Avalon Apartments');
    expect(top3.rows[0].amount).toBe(1620);
    expect(top3.rows[0].filterSearch).toBe('Avalon Apartments');
    // Amounts strictly non-increasing
    expect(top3.rows[0].amount).toBeGreaterThanOrEqual(top3.rows[1].amount);
    expect(top3.rows[1].amount).toBeGreaterThanOrEqual(top3.rows[2].amount);
    expect(top3.rows.every((r) => Boolean(r.filterSearch))).toBe(true);
  });

  it('computes top categories with filterCategoryId drill-downs', () => {
    const vault = createSampleVault(REF_DATE);

    const topCats = askVault('Top 4 categories this month', vault, REF_DATE);
    expect(topCats.matched).toBe(true);
    expect(topCats.intent).toBe('top_categories');
    expect(topCats.rows).toHaveLength(4);
    expect(topCats.rows[0].label).toBe('Housing & Rent');
    expect(topCats.rows[0].filterCategoryId).toBe('cat_housing');
    expect(topCats.rows.every((r) => Boolean(r.filterCategoryId))).toBe(true);
  });

  it('summarizes subscriptions and recurring bills with monthly and annual totals', () => {
    const vault = createSampleVault(REF_DATE);
    const recSummary = computeRecurringSummary(vault.recurringBills, REF_DATE);

    const subs = askVault('Total subscriptions', vault, REF_DATE);
    expect(subs.matched).toBe(true);
    expect(subs.intent).toBe('subscriptions');
    expect(subs.primaryAmount).toBe(recSummary.subscriptionMonthly);
    expect(subs.deltaText).toContain('/ year');
    expect(subs.rows.length).toBeGreaterThan(0);
    expect(subs.drillAction).toEqual({ label: 'Open Recurring', nav: 'recurring' });

    const allBills = askVault('Upcoming bills', vault, REF_DATE);
    expect(allBills.matched).toBe(true);
    expect(allBills.intent).toBe('subscriptions');
    expect(allBills.primaryAmount).toBe(recSummary.monthlyTotal);
    expect(allBills.drillAction?.nav).toBe('recurring');
  });

  it('computes average daily spend and projected month-end spend', () => {
    const vault = createSampleVault(REF_DATE);
    const kpis = computeDashboardKPIs(vault, 'this_month', REF_DATE);

    const daily = askVault('Average daily spend this month', vault, REF_DATE);
    expect(daily.matched).toBe(true);
    expect(daily.intent).toBe('daily_spend');
    expect(daily.primaryAmount).toBe(kpis.dailyBurnRate);
    expect(daily.deltaText).toContain('Projected');
    expect(daily.rows.length).toBeGreaterThanOrEqual(2);
    expect(daily.rows.find((r) => r.id === 'daily_projected')?.amount).toBe(
      kpis.projectedMonthEndExpense,
    );
  });

  it('reports net worth, debt, and liquid cash consistent with dashboard KPIs', () => {
    const vault = createSampleVault(REF_DATE);
    const kpis = computeDashboardKPIs(vault, 'this_month', REF_DATE);

    const nw = askVault('What is my net worth?', vault, REF_DATE);
    expect(nw.matched).toBe(true);
    expect(nw.intent).toBe('net_worth');
    expect(nw.primaryAmount).toBe(kpis.totalNetWorth);
    expect(nw.rows).toHaveLength(vault.accounts.length);
    expect(nw.drillAction).toEqual({ label: 'Open Accounts', nav: 'accounts' });

    const debt = askVault('How much debt do I have?', vault, REF_DATE);
    expect(debt.matched).toBe(true);
    expect(debt.intent).toBe('net_worth');
    expect(debt.primaryAmount).toBe(kpis.totalDebt);

    const liquid = askVault('What is my liquid cash?', vault, REF_DATE);
    expect(liquid.matched).toBe(true);
    expect(liquid.intent).toBe('net_worth');
    expect(liquid.primaryAmount).toBe(kpis.liquidCash);
  });

  it('computes safe to spend using dashboard KPIs and shows breakdown rows', () => {
    const vault = createSampleVault(REF_DATE);
    const kpis = computeDashboardKPIs(vault, 'this_month', REF_DATE);

    const sts = askVault('What is my safe to spend?', vault, REF_DATE);
    expect(sts.matched).toBe(true);
    expect(sts.intent).toBe('safe_to_spend');
    expect(sts.primaryAmount).toBe(kpis.safeToSpend);
    expect(sts.rows).toHaveLength(3);
    expect(sts.drillAction).toEqual({ label: 'View Dashboard', nav: 'dashboard' });
  });

  it('computes savings rate with income, expenses, and net saved breakdown', () => {
    const vault = createSampleVault(REF_DATE);
    const kpis = computeDashboardKPIs(vault, 'this_month', REF_DATE);

    const sr = askVault('What is my savings rate this month?', vault, REF_DATE);
    expect(sr.matched).toBe(true);
    expect(sr.intent).toBe('savings_rate');
    expect(sr.primaryAmount).toBe(kpis.netCashflow);
    expect(sr.primaryText).toBe(`${kpis.savingsRate.toFixed(1)}%`);
    expect(sr.rows).toHaveLength(3);
    expect(sr.drillAction).toEqual({ label: 'View Budgets', nav: 'budgets' });
  });

  it('finds largest individual expenses across custom time windows', () => {
    const vault = createSampleVault(REF_DATE);

    const biggest = askVault('Biggest expenses last 90 days', vault, REF_DATE);
    expect(biggest.matched).toBe(true);
    expect(biggest.intent).toBe('largest_transactions');
    expect(biggest.periodLabel).toBe('Last 90 days');
    expect(biggest.rows).toHaveLength(5);
    expect(biggest.primaryAmount).toBe(1620);
    expect(biggest.rows[0].label).toBe('Avalon Apartments');
    expect(biggest.rows[0].filterSearch).toBe('Avalon Apartments');
    expect(biggest.rows[0].sublabel).toMatch(/^\d{4}-\d{2}-\d{2}/);
  });

  it('supports merchant lookup with refund offsets and keyword fallback search', () => {
    const vault = createSampleVault(REF_DATE);

    // Merchant lookup: Uniqlo Online ($158.00) + Uniqlo Online Refund (-$69.90) = $88.10
    const uniqlo = askVault('How much did I spend at Uniqlo this month?', vault, REF_DATE);
    expect(uniqlo.matched).toBe(true);
    expect(uniqlo.intent).toBe('merchant_spend');
    expect(uniqlo.primaryAmount).toBe(88.1);
    expect(uniqlo.rows).toHaveLength(2);
    expect(uniqlo.drillAction?.nav).toBe('transactions');
    expect(uniqlo.drillAction?.searchQuery).toBeTruthy();

    // Direct merchant mention (even when payee contains category word "Coffee")
    const blueBottle = askVault(
      'How much did I spend at Blue Bottle Coffee this month?',
      vault,
      REF_DATE,
    );
    expect(blueBottle.matched).toBe(true);
    expect(blueBottle.intent).toBe('merchant_spend');
    expect(blueBottle.primaryAmount).toBe(14.5);

    // Keyword search across notes/tags ("sourdough" is in Ferry Plaza Farmers Market notes)
    const keyword = askVault('sourdough', vault, REF_DATE);
    expect(keyword.matched).toBe(true);
    expect(keyword.intent).toBe('keyword_search');
    expect(keyword.primaryAmount).toBe(26.8);
    expect(keyword.rows[0].label).toBe('Ferry Plaza Farmers Market');
    expect(keyword.drillAction?.searchQuery).toBe('sourdough');
  });

  it('extracts explicit month names, last month, YTD, and all time windows accurately', () => {
    const vault = createSampleVault(REF_DATE);

    // Explicit month "May" (May 2026): Nopa Bistro ($78.50) + Marufuku Ramen ($66.70) = $145.20
    const mayDining = askVault('How much did I spend on dining in May?', vault, REF_DATE);
    expect(mayDining.matched).toBe(true);
    expect(mayDining.intent).toBe('category_spend');
    expect(mayDining.periodLabel).toBe('May 2026');
    expect(mayDining.primaryAmount).toBe(145.2);

    // Explicit month after referenceDate month wraps to previous year (Oct 2025)
    const octDining = askVault('dining in oct', vault, REF_DATE);
    expect(octDining.periodLabel).toBe('Oct 2025');

    // All time dining > single month dining
    const allTimeDining = askVault('How much did I spend on dining all time?', vault, REF_DATE);
    expect(allTimeDining.periodLabel).toBe('All time');
    expect(allTimeDining.primaryAmount!).toBeGreaterThan(mayDining.primaryAmount!);

    // YTD window
    const ytdDining = askVault('dining ytd', vault, REF_DATE);
    expect(ytdDining.periodLabel).toBe('This year (2026)');
    expect(ytdDining.primaryAmount!).toBeGreaterThan(mayDining.primaryAmount!);
  });

  it('converts foreign-currency accounts into vault base currency', () => {
    const vault = createEmptyVault();
    vault.settings.baseCurrency = 'USD';
    vault.settings.exchangeRates.EUR = 0.8; // 1 USD = 0.8 EUR => 80 EUR = 100 USD
    vault.accounts.push({
      id: 'acc_eur',
      name: 'Euro Travel Card',
      type: 'checking',
      currency: 'EUR',
      openingBalance: 400,
      color: '#3b82f6',
      createdAt: '2026-06-01T00:00:00Z',
    });
    vault.transactions.push({
      id: 'tx_eur_1',
      date: '2026-06-10',
      type: 'expense',
      amount: 80,
      accountId: 'acc_eur',
      payee: 'Paris Cafe',
      categoryId: 'cat_dining',
      tags: ['travel'],
      notes: 'Lunch in Paris',
      reviewed: true,
      createdAt: '2026-06-10T12:00:00Z',
      updatedAt: '2026-06-10T12:00:00Z',
    });

    const ans = askVault('How much did I spend on dining this month?', vault, REF_DATE);
    expect(ans.matched).toBe(true);
    expect(ans.primaryAmount).toBe(100);
  });

  it('handles empty queries, unrecognized queries, and isLikelyVaultQuestion classification', () => {
    const vault = createSampleVault(REF_DATE);

    const empty = askVault('   ', vault, REF_DATE);
    expect(empty.matched).toBe(false);
    expect(empty.intent).toBe('empty');
    expect(empty.rows).toEqual([]);
    expect(empty.summary.length).toBeGreaterThan(10);

    const unknown = askVault('xyzzy nonexistent blorp', vault, REF_DATE);
    expect(unknown.matched).toBe(false);
    expect(unknown.intent).toBe('keyword_search');
    expect(unknown.rows).toEqual([]);

    // Positive question detection
    expect(isLikelyVaultQuestion('How much did I spend on dining?')).toBe(true);
    expect(isLikelyVaultQuestion('Compare groceries vs last month')).toBe(true);
    expect(isLikelyVaultQuestion('Top 5 merchants')).toBe(true);
    expect(isLikelyVaultQuestion('Total subscriptions')).toBe(true);
    expect(isLikelyVaultQuestion('Average daily spend')).toBe(true);
    expect(isLikelyVaultQuestion('Net worth')).toBe(true);
    expect(isLikelyVaultQuestion('Safe to spend')).toBe(true);
    expect(isLikelyVaultQuestion('Savings rate')).toBe(true);
    expect(isLikelyVaultQuestion('Biggest expenses')).toBe(true);
    expect(isLikelyVaultQuestion('Upcoming bills')).toBe(true);
    expect(isLikelyVaultQuestion('Trader Joes?')).toBe(true);

    // Negative command-palette actions (not questions)
    expect(isLikelyVaultQuestion('')).toBe(false);
    expect(isLikelyVaultQuestion('   ')).toBe(false);
    expect(isLikelyVaultQuestion('Dashboard')).toBe(false);
    expect(isLikelyVaultQuestion('Transactions')).toBe(false);
    expect(isLikelyVaultQuestion('Budgets')).toBe(false);
    expect(isLikelyVaultQuestion('Add transaction')).toBe(false);
    expect(isLikelyVaultQuestion('Export CSV')).toBe(false);
    expect(isLikelyVaultQuestion('Toggle dark mode')).toBe(false);
  });
});
