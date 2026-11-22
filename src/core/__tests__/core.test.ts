import { describe, expect, it } from 'vitest';
import type {
  Account,
  Category,
  CategoryRule,
  DebtPayoffInput,
  Transaction,
  VaultData,
} from '../../types/finance';
import {
  buildCashflowSankey,
  computeAccountBalance,
  computeCategorySpend,
  computeDashboardKPIs,
  computeMonthlyTrends,
  computeProactiveInsights,
  computeRecurringSummary,
  computeSpendingHeatmap,
} from '../analytics';
import { useFinanceStore } from '../../store/useFinanceStore';
import { decryptVault, encryptVault, hashPasscode, verifyPasscode } from '../crypto';
import { extractDebtsFromAccounts, simulateDebtPayoff } from '../debt';
import {
  computeImportHash,
  exportTransactionsToCsv,
  parseCsvRaw,
  parseOfxImport,
  previewCsvImport,
} from '../importer';
import { evaluateAmountExpression, parseQuickExpenseInput } from '../quickParse';
import { applyRulesToTransaction, suggestRulesFromTransactions } from '../rules';
import { createDefaultCategories, createEmptyVault, createSampleVault } from '../seedData';

describe('quickParse: evaluateAmountExpression & parseQuickExpenseInput', () => {
  it('evaluates arithmetic expressions safely with operator precedence and parentheses', () => {
    expect(evaluateAmountExpression('5.50')).toBe(5.5);
    expect(evaluateAmountExpression('15.5 + 4.25')).toBe(19.75);
    expect(evaluateAmountExpression('0.1 + 0.2')).toBe(0.3);
    expect(evaluateAmountExpression('2 + 3 * 4')).toBe(14);
    expect(evaluateAmountExpression('(10 + 5) * 2 / 3')).toBe(10);
    expect(evaluateAmountExpression('$1,250.50 - 50.50')).toBe(1200);
    expect(evaluateAmountExpression('-12.5 + 20')).toBe(7.5);
  });

  it('rejects invalid expressions and division by zero', () => {
    expect(evaluateAmountExpression('')).toBeNull();
    expect(evaluateAmountExpression('10 / 0')).toBeNull();
    expect(evaluateAmountExpression('5 +')).toBeNull();
    expect(evaluateAmountExpression('(5 + 2')).toBeNull();
    expect(evaluateAmountExpression('alert(1)')).toBeNull();
    expect(evaluateAmountExpression('5 5')).toBeNull();
  });

  it('parses natural quick-add expense, income, and refund strings', () => {
    const categories = createDefaultCategories();

    const coffee = parseQuickExpenseInput('Coffee 5.50 dining #work', categories);
    expect(coffee.payee).toBe('Coffee');
    expect(coffee.amount).toBe(5.5);
    expect(coffee.categoryId).toBe('cat_dining');
    expect(coffee.tags).toEqual(['work']);
    expect(coffee.type).toBe('expense');

    const salary = parseQuickExpenseInput('+2500 Salary', categories);
    expect(salary.payee).toBe('Salary');
    expect(salary.amount).toBe(2500);
    expect(salary.categoryId).toBe('cat_salary');
    expect(salary.type).toBe('income');

    const refund = parseQuickExpenseInput('refund 42.99 Amazon shopping', categories);
    expect(refund.payee).toBe('Amazon');
    expect(refund.amount).toBe(42.99);
    expect(refund.categoryId).toBe('cat_shopping');
    expect(refund.type).toBe('refund');

    const exprTx = parseQuickExpenseInput('Team Lunch 18.50+6.50 dining #team #reimburse', categories);
    expect(exprTx.payee).toBe('Team Lunch');
    expect(exprTx.amount).toBe(25);
    expect(exprTx.categoryId).toBe('cat_dining');
    expect(exprTx.tags).toEqual(['team', 'reimburse']);
  });
});

describe('crypto: AES-256-GCM vault encryption & PBKDF2 passcodes', () => {
  it('encrypts and decrypts a VaultData snapshot with correct passphrase', async () => {
    const vault = createSampleVault(new Date('2026-06-15T12:00:00Z'));
    const envelope = await encryptVault(vault, 'correct-horse-battery-staple');

    expect(envelope.format).toBe('vaultledger-encrypted-v1');
    expect(envelope.kdf).toBe('PBKDF2-SHA256');
    expect(envelope.iterations).toBe(120000);
    expect(envelope.cipher).toBe('AES-256-GCM');
    expect(envelope.ciphertextB64.length).toBeGreaterThan(20);

    const restored = await decryptVault(envelope, 'correct-horse-battery-staple');
    expect(restored.accounts.length).toBe(vault.accounts.length);
    expect(restored.transactions.length).toBe(vault.transactions.length);
    expect(restored.settings.baseCurrency).toBe(vault.settings.baseCurrency);
  });

  it('throws a clear error on wrong passphrase or invalid envelope', async () => {
    const vault = createEmptyVault();
    const envelope = await encryptVault(vault, 'secret-passphrase-1');

    await expect(decryptVault(envelope, 'wrong-passphrase')).rejects.toThrow(
      /incorrect passphrase/i,
    );

    const invalidEnvelope = {
      ...envelope,
      format: 'wrong-format' as 'vaultledger-encrypted-v1',
    };
    await expect(decryptVault(invalidEnvelope, 'secret-passphrase-1')).rejects.toThrow(
      /invalid encrypted vault/i,
    );
  });

  it('hashes and verifies vault screen lock passcodes', async () => {
    const { hash, salt } = await hashPasscode('8426');
    expect(hash.length).toBeGreaterThan(10);
    expect(salt.length).toBeGreaterThan(10);

    expect(await verifyPasscode('8426', hash, salt)).toBe(true);
    expect(await verifyPasscode('0000', hash, salt)).toBe(false);
    expect(await verifyPasscode('', hash, salt)).toBe(false);
  });
});

describe('analytics: account balances, KPIs with splits & refunds, and Sankey flow', () => {
  const checking: Account = {
    id: 'acc_chk',
    name: 'Checking',
    type: 'checking',
    currency: 'USD',
    openingBalance: 1000,
    color: '#3b82f6',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const credit: Account = {
    id: 'acc_cc',
    name: 'Credit Card',
    type: 'credit',
    currency: 'USD',
    openingBalance: -200,
    apr: 20,
    minPayment: 50,
    color: '#8b5cf6',
    createdAt: '2026-01-01T00:00:00Z',
  };

  const txs: Transaction[] = [
    {
      id: 't1',
      date: '2026-05-01',
      type: 'income',
      amount: 3000,
      accountId: 'acc_chk',
      payee: 'Employer',
      categoryId: 'cat_salary',
      tags: [],
      notes: '',
      reviewed: true,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    },
    {
      id: 't2',
      date: '2026-05-03',
      type: 'expense',
      amount: 150,
      accountId: 'acc_cc',
      payee: 'Target',
      categoryId: 'cat_groceries',
      splits: [
        { id: 's1', categoryId: 'cat_groceries', amount: 100 },
        { id: 's2', categoryId: 'cat_shopping', amount: 50 },
      ],
      tags: [],
      notes: '',
      reviewed: true,
      createdAt: '2026-05-03T00:00:00Z',
      updatedAt: '2026-05-03T00:00:00Z',
    },
    {
      id: 't3',
      date: '2026-05-05',
      type: 'refund',
      amount: 20,
      accountId: 'acc_cc',
      payee: 'Target Return',
      categoryId: 'cat_shopping',
      tags: [],
      notes: '',
      reviewed: true,
      createdAt: '2026-05-05T00:00:00Z',
      updatedAt: '2026-05-05T00:00:00Z',
    },
    {
      id: 't4',
      date: '2026-05-08',
      type: 'transfer',
      amount: 250,
      accountId: 'acc_chk',
      transferAccountId: 'acc_cc',
      payee: 'Card Payment',
      categoryId: 'cat_uncategorized',
      tags: [],
      notes: '',
      reviewed: false,
      createdAt: '2026-05-08T00:00:00Z',
      updatedAt: '2026-05-08T00:00:00Z',
    },
  ];

  it('computes account balances accurately across income, expense, refund, and transfer', () => {
    // Checking: 1000 + 3000 - 250 = 3750
    expect(computeAccountBalance(checking, txs)).toBe(3750);
    // Credit: -200 - 150 + 20 + 250 = -80
    expect(computeAccountBalance(credit, txs)).toBe(-80);
  });

  it('handles split transactions, refund offsets, and excludes transfers in KPIs & category spend', () => {
    const base = createEmptyVault();
    const vault: VaultData = {
      ...base,
      accounts: [checking, credit],
      transactions: txs,
    };
    const refDate = new Date('2026-05-15T12:00:00Z');

    const kpis = computeDashboardKPIs(vault, 'this_month', refDate);
    expect(kpis.periodIncome).toBe(3000); // refund did NOT inflate income; transfer excluded
    expect(kpis.periodExpenses).toBe(130); // 150 expense - 20 refund = 130
    expect(kpis.netCashflow).toBe(2870);
    expect(kpis.totalNetWorth).toBe(3670); // 3750 + (-80)
    expect(kpis.totalDebt).toBe(80);
    expect(kpis.unreviewedCount).toBe(1);

    const catSpend = computeCategorySpend(vault, 'this_month', refDate);
    const groceries = catSpend.find((c) => c.categoryId === 'cat_groceries');
    const shopping = catSpend.find((c) => c.categoryId === 'cat_shopping');
    expect(groceries?.spent).toBe(100);
    expect(shopping?.spent).toBe(30); // 50 split - 20 refund = 30
  });

  it('builds a 4-column Cashflow Sankey graph conserving flow totals', () => {
    const base = createEmptyVault();
    const vault: VaultData = {
      ...base,
      accounts: [checking, credit],
      transactions: txs,
    };
    const refDate = new Date('2026-05-15T12:00:00Z');

    const sankey = buildCashflowSankey(vault, 'this_month', refDate);
    expect(sankey.totalIncome).toBe(3000);
    expect(sankey.totalAllocated).toBe(3000);

    const columns = new Set(sankey.nodes.map((n) => n.column));
    expect(columns.has(0)).toBe(true);
    expect(columns.has(1)).toBe(true);
    expect(columns.has(2)).toBe(true);
    expect(columns.has(3)).toBe(true);

    const col2Total = sankey.nodes
      .filter((n) => n.column === 2)
      .reduce((sum, n) => sum + n.value, 0);
    expect(col2Total).toBe(3000);

    const netSavingsNode = sankey.nodes.find((n) => n.id === 'cat_net_savings');
    expect(netSavingsNode?.value).toBe(2870);
  });
});

describe('rules: applyRulesToTransaction & suggestRulesFromTransactions', () => {
  const rules: CategoryRule[] = [
    {
      id: 'r1',
      name: 'Coffee Rule',
      enabled: true,
      matchField: 'payee',
      matchType: 'contains',
      pattern: 'starbucks',
      renamePayeeTo: 'Starbucks',
      assignCategoryId: 'cat_coffee',
      addTags: ['caffeine'],
      markReviewed: true,
      priority: 1,
    },
    {
      id: 'r2',
      name: 'Large Purchase Tag',
      enabled: true,
      matchField: 'any',
      matchType: 'regex',
      pattern: 'best buy|apple',
      minAmount: 100,
      assignCategoryId: 'cat_shopping',
      addTags: ['electronics'],
      priority: 2,
    },
    {
      id: 'r_disabled',
      name: 'Disabled Rule',
      enabled: false,
      matchField: 'payee',
      matchType: 'contains',
      pattern: 'starbucks',
      assignCategoryId: 'cat_dining',
      priority: 0,
    },
  ];

  it('applies enabled rules by priority, renames payee, assigns category, merges tags, and marks reviewed', () => {
    const res = applyRulesToTransaction(
      {
        payee: 'STARBUCKS STORE #4412',
        amount: 6.75,
        tags: ['morning'],
        reviewed: false,
      },
      rules,
    );
    expect(res.matchedRuleId).toBe('r1');
    expect(res.payee).toBe('Starbucks');
    expect(res.categoryId).toBe('cat_coffee');
    expect(res.tags).toEqual(['morning', 'caffeine']);
    expect(res.reviewed).toBe(true);

    // Amount threshold check
    const smallApple = applyRulesToTransaction({ payee: 'Apple Store', amount: 15 }, rules);
    expect(smallApple.matchedRuleId).toBeUndefined();

    const bigApple = applyRulesToTransaction({ payee: 'Apple Store', amount: 499 }, rules);
    expect(bigApple.matchedRuleId).toBe('r2');
    expect(bigApple.categoryId).toBe('cat_shopping');
  });

  it('suggests rules for payees categorized identically >= 2 times without an existing rule', () => {
    const mkTx = (id: string, payee: string, categoryId: string): Transaction => ({
      id,
      date: '2026-05-01',
      type: 'expense',
      amount: 25,
      accountId: 'acc_checking',
      payee,
      categoryId,
      tags: [],
      notes: '',
      reviewed: true,
      createdAt: '2026-05-01T00:00:00Z',
      updatedAt: '2026-05-01T00:00:00Z',
    });

    const txs: Transaction[] = [
      mkTx('1', 'Blue Bottle', 'cat_coffee'),
      mkTx('2', 'Blue Bottle', 'cat_coffee'),
      mkTx('3', 'Blue Bottle', 'cat_coffee'),
      mkTx('4', 'Starbucks', 'cat_coffee'), // already covered by rule r1
      mkTx('5', 'Starbucks', 'cat_coffee'),
      mkTx('6', 'One-Off Store', 'cat_shopping'), // only 1 time
    ];

    const suggestions = suggestRulesFromTransactions(txs, rules);
    expect(suggestions).toEqual([
      { payee: 'Blue Bottle', categoryId: 'cat_coffee', count: 3 },
    ]);
  });
});

describe('importer: CSV, OFX, duplicate detection, and CSV export', () => {
  const existingTx: Transaction = {
    id: 'tx_existing',
    date: '2026-05-10',
    type: 'expense',
    amount: 45.5,
    accountId: 'acc_checking',
    payee: "Trader Joe's",
    categoryId: 'cat_groceries',
    tags: [],
    notes: '',
    reviewed: true,
    importHash: computeImportHash('2026-05-10', 45.5, "Trader Joe's"),
    createdAt: '2026-05-10T00:00:00Z',
    updatedAt: '2026-05-10T00:00:00Z',
  };

  const rules: CategoryRule[] = [
    {
      id: 'rule_tj',
      name: 'TJ Groceries',
      enabled: true,
      matchField: 'payee',
      matchType: 'contains',
      pattern: 'trader joe',
      renamePayeeTo: "Trader Joe's",
      assignCategoryId: 'cat_groceries',
      addTags: ['market'],
      priority: 1,
    },
  ];

  it('parses RFC 4180 CSV with quoted commas, escaped quotes, and auto-detected delimiter', () => {
    const csv = [
      'Date,Payee,Amount,Notes',
      '05/10/2026,"Trader Joe\'s #102",-45.50,"Fresh, ""organic"" food"',
      '2026-05-12,Spotify,-16.99,Music',
    ].join('\n');

    const rows = parseCsvRaw(csv);
    expect(rows.length).toBe(3);
    expect(rows[1][1]).toBe("Trader Joe's #102");
    expect(rows[1][3]).toBe('Fresh, "organic" food');

    const semiRows = parseCsvRaw('Date;Payee;Amount\n22/05/2026;Bakery;-12,50');
    expect(semiRows[1]).toEqual(['22/05/2026', 'Bakery', '-12,50']);
  });

  it('previews CSV import with duplicate detection (+/-2 days) and rule application', () => {
    const csv = [
      'Date,Payee,Amount,Notes',
      '05/11/2026,TRADER JOES #102,-45.50,Groceries',
      '05/14/2026,Acme Payroll,2500.00,Direct deposit',
    ].join('\n');

    const rows = parseCsvRaw(csv);
    const preview = previewCsvImport(
      rows,
      {
        delimiter: ',',
        skipRows: 1,
        dateColumn: 0,
        payeeColumn: 1,
        amountColumn: 2,
        notesColumn: 3,
        invertAmount: false,
      },
      [existingTx],
      rules,
      'cat_uncategorized',
    );

    expect(preview.length).toBe(2);
    // Row 0 is within +/-2 days of 2026-05-10 with same amount & matching payee after rule/fuzzy
    expect(preview[0].isDuplicate).toBe(true);
    expect(preview[0].selected).toBe(false);
    expect(preview[0].categoryId).toBe('cat_groceries');
    expect(preview[0].tags).toContain('market');

    expect(preview[1].isDuplicate).toBe(false);
    expect(preview[1].selected).toBe(true);
    expect(preview[1].type).toBe('income');
    expect(preview[1].amount).toBe(2500);
  });

  it('parses SGML/XML OFX statements accurately', () => {
    const ofx = `
      <OFX>
        <BANKMSGSRSV1>
          <STMTTRNRS>
            <STMTRS>
              <BANKTRANLIST>
                <STMTTRN>
                  <TRNTYPE>DEBIT
                  <DTPOSTED>20260510120000
                  <TRNAMT>-45.50
                  <NAME>TRADER JOE'S
                  <MEMO>Weekly groceries
                </STMTTRN>
                <STMTTRN>
                  <TRNTYPE>CREDIT</TRNTYPE>
                  <DTPOSTED>20260518</DTPOSTED>
                  <TRNAMT>120.00</TRNAMT>
                  <NAME>Client Payment</NAME>
                  <MEMO>Design review</MEMO>
                </STMTTRN>
              </BANKTRANLIST>
            </STMTRS>
          </STMTTRNRS>
        </BANKMSGSRSV1>
      </OFX>
    `;

    const parsed = parseOfxImport(ofx, [existingTx], rules, 'cat_uncategorized');
    expect(parsed.length).toBe(2);
    expect(parsed[0].date).toBe('2026-05-10');
    expect(parsed[0].isDuplicate).toBe(true);
    expect(parsed[0].categoryId).toBe('cat_groceries');

    expect(parsed[1].date).toBe('2026-05-18');
    expect(parsed[1].type).toBe('income');
    expect(parsed[1].amount).toBe(120);
    expect(parsed[1].isDuplicate).toBe(false);
  });

  it('exports transactions to valid CSV with proper escaping', () => {
    const accounts: Account[] = [
      {
        id: 'acc_checking',
        name: 'Premier Checking',
        type: 'checking',
        currency: 'USD',
        openingBalance: 1000,
        color: '#3b82f6',
        createdAt: '2026-01-01T00:00:00Z',
      },
    ];
    const categories: Category[] = createDefaultCategories();
    const csv = exportTransactionsToCsv(
      [{ ...existingTx, notes: 'Apples, "Bananas"' }],
      accounts,
      categories,
    );

    const parsedBack = parseCsvRaw(csv);
    expect(parsedBack[0][0]).toBe('Date');
    expect(parsedBack[1][2]).toBe("Trader Joe's");
    expect(parsedBack[1][3]).toBe('-45.50');
    expect(parsedBack[1][8]).toBe('Apples, "Bananas"');
  });
});

describe('debt: extractDebtsFromAccounts & simulateDebtPayoff', () => {
  const debts: DebtPayoffInput[] = [
    {
      id: 'd_small_low_apr',
      name: 'Personal Loan',
      balance: 2000,
      apr: 5.5,
      minPayment: 80,
      color: '#3b82f6',
    },
    {
      id: 'd_large_high_apr',
      name: 'Credit Card',
      balance: 6000,
      apr: 24.0,
      minPayment: 160,
      color: '#ef4444',
    },
  ];

  it('extracts negative-balance credit and loan accounts as positive debt obligations', () => {
    const vault = createSampleVault(new Date('2026-05-15T12:00:00Z'));
    const extracted = extractDebtsFromAccounts(vault.accounts, {
      acc_checking: 5000,
      acc_credit: -1500,
      acc_loan: -8000,
    });
    expect(extracted.length).toBe(2);
    expect(extracted.find((d) => d.id === 'acc_credit')?.balance).toBe(1500);
    expect(extracted.find((d) => d.id === 'acc_loan')?.balance).toBe(8000);
  });

  it('shows Avalanche saves more total interest than Snowball on mixed APR/balance debts', () => {
    const ref = new Date('2026-05-01T00:00:00Z');
    const snowball = simulateDebtPayoff(debts, 'snowball', 200, ref);
    const avalanche = simulateDebtPayoff(debts, 'avalanche', 200, ref);

    expect(snowball.monthsToPayoff).toBeGreaterThan(0);
    expect(avalanche.monthsToPayoff).toBeGreaterThan(0);
    expect(avalanche.totalInterestPaid).toBeLessThan(snowball.totalInterestPaid);

    // Snowball pays smallest balance first; Avalanche pays highest APR first
    expect(snowball.payoffOrder[0].id).toBe('d_small_low_apr');
    expect(avalanche.payoffOrder[0].id).toBe('d_large_high_apr');

    // Final schedule point reaches 0 remaining
    expect(avalanche.schedule[avalanche.schedule.length - 1].totalRemaining).toBe(0);
  });

  it('shortens payoff timeline and reduces interest when extra monthly payment increases', () => {
    const ref = new Date('2026-05-01T00:00:00Z');
    const baseline = simulateDebtPayoff(debts, 'avalanche', 50, ref);
    const accelerated = simulateDebtPayoff(debts, 'avalanche', 350, ref);

    expect(accelerated.monthsToPayoff).toBeLessThan(baseline.monthsToPayoff);
    expect(accelerated.totalInterestPaid).toBeLessThan(baseline.totalInterestPaid);
  });

  it('handles zero debts gracefully', () => {
    const empty = simulateDebtPayoff([], 'avalanche', 100, new Date('2026-05-01T00:00:00Z'));
    expect(empty.monthsToPayoff).toBe(0);
    expect(empty.totalInterestPaid).toBe(0);
    expect(empty.totalPaid).toBe(0);
    expect(empty.schedule).toEqual([]);
  });
});

describe('seedData, extended analytics, and Zustand store', () => {
  it('generates a rich 6-month sample vault with trends, heatmap, insights, and recurring summary', () => {
    const ref = new Date('2026-06-18T12:00:00Z');
    const sample = createSampleVault(ref);

    expect(sample.accounts.length).toBe(5);
    expect(sample.transactions.length).toBeGreaterThanOrEqual(90);
    expect(sample.transactions.filter((t) => !t.reviewed).length).toBe(5);
    expect(sample.transactions.some((t) => t.splits && t.splits.length > 1)).toBe(true);
    expect(sample.transactions.some((t) => t.type === 'refund')).toBe(true);
    expect(sample.recurringBills.length).toBe(8);
    expect(sample.savingsGoals.length).toBe(3);
    expect(sample.rules.length).toBe(5);
    expect(sample.importPresets.length).toBe(2);

    const trends = computeMonthlyTrends(sample, 6, ref);
    expect(trends.length).toBe(6);
    expect(trends[5].income).toBeGreaterThan(0);

    const heatmap = computeSpendingHeatmap(sample.transactions, 90, ref);
    expect(heatmap.length).toBe(90);
    expect(heatmap.some((d) => d.level > 0)).toBe(true);

    const insights = computeProactiveInsights(sample, ref);
    expect(insights.length).toBeGreaterThanOrEqual(3);
    expect(insights.length).toBeLessThanOrEqual(5);

    const recurring = computeRecurringSummary(sample.recurringBills, ref);
    expect(recurring.monthlyTotal).toBeGreaterThan(0);
    expect(recurring.yearlyTotal).toBeCloseTo(recurring.monthlyTotal * 12, 1);
    expect(recurring.subscriptionMonthly).toBeGreaterThan(0);
    expect(recurring.upcomingSoon.length).toBeGreaterThan(0);
  });

  it('supports store mutations, auto-rule application, undo/redo, and bill logging', () => {
    const store = useFinanceStore.getState();
    store.loadSampleData();

    const initialCount = useFinanceStore.getState().data.transactions.length;
    const added = useFinanceStore.getState().addTransaction({
      date: '2026-06-18',
      type: 'expense',
      amount: 6.25,
      accountId: 'acc_credit',
      payee: 'Starbucks Reserve',
      categoryId: 'cat_uncategorized',
      tags: [],
      notes: '',
      reviewed: false,
    });

    // Auto-applied Starbucks rule on uncategorized manual tx
    expect(added.categoryId).toBe('cat_coffee');
    expect(added.payee).toBe('Coffee Shop');
    expect(useFinanceStore.getState().data.transactions.length).toBe(initialCount + 1);
    expect(useFinanceStore.getState().canUndo).toBe(true);

    // Undo & Redo
    useFinanceStore.getState().undo();
    expect(useFinanceStore.getState().data.transactions.length).toBe(initialCount);
    expect(useFinanceStore.getState().canRedo).toBe(true);

    useFinanceStore.getState().redo();
    expect(useFinanceStore.getState().data.transactions.length).toBe(initialCount + 1);

    // Mark recurring bill paid & advance nextDueDate
    const billBefore = useFinanceStore.getState().data.recurringBills.find(
      (b) => b.id === 'bill_spotify',
    )!;
    const logged = useFinanceStore.getState().markBillPaidAndLog('bill_spotify', '2026-06-18');
    expect(logged).not.toBeNull();
    const billAfter = useFinanceStore.getState().data.recurringBills.find(
      (b) => b.id === 'bill_spotify',
    )!;
    expect(billAfter.lastPaidDate).toBe('2026-06-18');
    expect(billAfter.nextDueDate).not.toBe(billBefore.nextDueDate);
  });
});
