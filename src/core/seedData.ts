import type {
  Account,
  BankImportPreset,
  Category,
  CategoryRule,
  CurrencyCode,
  ForecastMilestone,
  RecurringBill,
  SavingsGoal,
  Transaction,
  VaultData,
  VaultSettings,
} from '../types/finance';
import { DEFAULT_USD_RATES } from './currency';
import { createDefaultSavingsSquads } from './savingsSquad';

const DEFAULT_EXCHANGE_RATES: Record<CurrencyCode, number> = {
  ...DEFAULT_USD_RATES,
};

function createDefaultSettings(isDemoData: boolean, nowIso: string): VaultSettings {
  return {
    baseCurrency: 'USD',
    exchangeRates: { ...DEFAULT_EXCHANGE_RATES },
    exchangeRatesUpdatedAt: nowIso,
    theme: 'light',
    privacyMask: false,
    passcodeHash: null,
    passcodeSalt: null,
    autoBackupEnabled: true,
    lastBackupAt: null,
    isDemoData,
    budgetRolloverAdjustments: {},
    profile: {
      displayName: 'Ayn Lorebelle',
      tagline: 'Smart Saver & Co-Op Squad Leader',
      avatarEmoji: '🌸',
      clayAccent: '#FDBCB4',
      monthlySavingsGoalPct: 25,
      aynieeeTone: 'conyo_bestie',
    },
  };
}

function formatUtcDate(date: Date): string {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function monthDayIso(referenceDate: Date, monthsAgo: number, dayOfMonth: number): string {
  const y = referenceDate.getFullYear();
  const m = referenceDate.getMonth() - monthsAgo;
  const firstOfTarget = new Date(Date.UTC(y, m, 1));
  const lastDay = new Date(
    Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth() + 1, 0),
  ).getUTCDate();

  let clampedDay = Math.min(Math.max(1, dayOfMonth), lastDay);
  if (monthsAgo === 0) {
    clampedDay = Math.min(clampedDay, referenceDate.getDate());
  }

  return formatUtcDate(
    new Date(
      Date.UTC(firstOfTarget.getUTCFullYear(), firstOfTarget.getUTCMonth(), clampedDay),
    ),
  );
}

function offsetDaysIso(referenceDate: Date, dayOffset: number): string {
  return formatUtcDate(
    new Date(
      Date.UTC(
        referenceDate.getFullYear(),
        referenceDate.getMonth(),
        referenceDate.getDate() + dayOffset,
      ),
    ),
  );
}

export function createDefaultCategories(): Category[] {
  return [
    // Needs
    {
      id: 'cat_housing',
      name: 'Housing & Rent',
      group: 'needs',
      icon: 'Home',
      color: '#3b82f6',
      monthlyBudget: 1650,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_groceries',
      name: 'Groceries',
      group: 'needs',
      icon: 'ShoppingCart',
      color: '#10b981',
      monthlyBudget: 550,
      rolloverEnabled: true,
      isDefault: true,
    },
    {
      id: 'cat_utilities',
      name: 'Utilities & Internet',
      group: 'needs',
      icon: 'Zap',
      color: '#06b6d4',
      monthlyBudget: 210,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_transport',
      name: 'Transportation',
      group: 'needs',
      icon: 'Car',
      color: '#6366f1',
      monthlyBudget: 240,
      rolloverEnabled: true,
      isDefault: true,
    },
    {
      id: 'cat_health',
      name: 'Healthcare',
      group: 'needs',
      icon: 'HeartPulse',
      color: '#ef4444',
      monthlyBudget: 150,
      rolloverEnabled: true,
      isDefault: true,
    },
    {
      id: 'cat_insurance',
      name: 'Insurance',
      group: 'needs',
      icon: 'Shield',
      color: '#0ea5e9',
      monthlyBudget: 160,
      rolloverEnabled: false,
      isDefault: true,
    },

    // Wants
    {
      id: 'cat_dining',
      name: 'Dining Out',
      group: 'wants',
      icon: 'Utensils',
      color: '#f59e0b',
      monthlyBudget: 320,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_coffee',
      name: 'Coffee & Cafes',
      group: 'wants',
      icon: 'Coffee',
      color: '#d97706',
      monthlyBudget: 85,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_shopping',
      name: 'Shopping',
      group: 'wants',
      icon: 'ShoppingBag',
      color: '#ec4899',
      monthlyBudget: 260,
      rolloverEnabled: true,
      isDefault: true,
    },
    {
      id: 'cat_entertainment',
      name: 'Entertainment',
      group: 'wants',
      icon: 'Film',
      color: '#a855f7',
      monthlyBudget: 120,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_subscriptions',
      name: 'Subscriptions',
      group: 'wants',
      icon: 'Repeat',
      color: '#8b5cf6',
      monthlyBudget: 110,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_travel',
      name: 'Travel',
      group: 'wants',
      icon: 'Plane',
      color: '#14b8a6',
      monthlyBudget: 200,
      rolloverEnabled: true,
      isDefault: true,
    },

    // Savings
    {
      id: 'cat_emergency',
      name: 'Emergency Reserve',
      group: 'savings',
      icon: 'PiggyBank',
      color: '#22c55e',
      monthlyBudget: 500,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_investments',
      name: 'Investments',
      group: 'savings',
      icon: 'TrendingUp',
      color: '#16a34a',
      monthlyBudget: 400,
      rolloverEnabled: false,
      isDefault: true,
    },

    // Income
    {
      id: 'cat_salary',
      name: 'Salary',
      group: 'income',
      icon: 'Briefcase',
      color: '#10b981',
      monthlyBudget: 0,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_freelance',
      name: 'Freelance',
      group: 'income',
      icon: 'Laptop',
      color: '#06b6d4',
      monthlyBudget: 0,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_other_income',
      name: 'Other Income',
      group: 'income',
      icon: 'Gift',
      color: '#34d399',
      monthlyBudget: 0,
      rolloverEnabled: false,
      isDefault: true,
    },
    {
      id: 'cat_uncategorized',
      name: 'Uncategorized',
      group: 'wants',
      icon: 'Tag',
      color: '#64748b',
      monthlyBudget: 0,
      rolloverEnabled: false,
      isDefault: true,
    },
  ];
}

export function createEmptyVault(): VaultData {
  const now = new Date().toISOString();
  return {
    schemaVersion: 1,
    updatedAt: now,
    accounts: [
      {
        id: 'acc_checking',
        name: 'Primary Checking',
        type: 'checking',
        currency: 'USD',
        openingBalance: 0,
        institution: 'My Bank',
        color: '#3b82f6',
        createdAt: now,
      },
      {
        id: 'acc_cash',
        name: 'Cash Wallet',
        type: 'cash',
        currency: 'USD',
        openingBalance: 0,
        color: '#10b981',
        createdAt: now,
      },
    ],
    categories: createDefaultCategories(),
    transactions: [],
    recurringBills: [],
    savingsGoals: [],
    rules: [],
    importPresets: [],
    forecastMilestones: [],
    settings: createDefaultSettings(false, now),
  };
}

export function createSampleVault(referenceDate: Date = new Date()): VaultData {
  const nowIso = referenceDate.toISOString();
  const categories = createDefaultCategories();

  const accounts: Account[] = [
    {
      id: 'acc_checking',
      name: 'Premier Checking',
      type: 'checking',
      currency: 'USD',
      openingBalance: 3850,
      institution: 'Chase Bank',
      color: '#3b82f6',
      createdAt: nowIso,
    },
    {
      id: 'acc_savings',
      name: 'High-Yield Savings',
      type: 'savings',
      currency: 'USD',
      openingBalance: 11200,
      institution: 'Ally Bank',
      color: '#10b981',
      createdAt: nowIso,
    },
    {
      id: 'acc_cash',
      name: 'Cash Wallet',
      type: 'cash',
      currency: 'USD',
      openingBalance: 320,
      color: '#14b8a6',
      createdAt: nowIso,
    },
    {
      id: 'acc_credit',
      name: 'Sapphire Reserve',
      type: 'credit',
      currency: 'USD',
      openingBalance: -1450,
      creditLimit: 12000,
      apr: 21.49,
      minPayment: 85,
      institution: 'Chase',
      color: '#8b5cf6',
      createdAt: nowIso,
    },
    {
      id: 'acc_loan',
      name: 'Auto Loan',
      type: 'loan',
      currency: 'USD',
      openingBalance: -9850,
      apr: 5.99,
      minPayment: 295,
      institution: 'Credit Union',
      color: '#f59e0b',
      createdAt: nowIso,
    },
  ];

  const transactions: Transaction[] = [];
  let txCounter = 1;

  const pushTx = (
    tx: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>,
  ): void => {
    const id = `tx_seed_${String(txCounter).padStart(3, '0')}`;
    txCounter += 1;
    transactions.push({
      ...tx,
      id,
      createdAt: `${tx.date}T12:00:00.000Z`,
      updatedAt: `${tx.date}T12:00:00.000Z`,
    });
  };

  // Generate 6 realistic months of transactions (monthsAgo = 5 down to 0)
  for (let m = 5; m >= 0; m -= 1) {
    const isCurrentMonth = m === 0;
    const todayDay = referenceDate.getDate();

    // Semi-monthly Salary (1st & 15th)
    pushTx({
      date: monthDayIso(referenceDate, m, 1),
      type: 'income',
      amount: 2950,
      accountId: 'acc_checking',
      payee: 'Acme Corp Payroll',
      categoryId: 'cat_salary',
      tags: ['payroll'],
      notes: 'Direct deposit — first half',
      reviewed: true,
    });

    if (!isCurrentMonth || todayDay >= 15) {
      pushTx({
        date: monthDayIso(referenceDate, m, 15),
        type: 'income',
        amount: 2950,
        accountId: 'acc_checking',
        payee: 'Acme Corp Payroll',
        categoryId: 'cat_salary',
        tags: ['payroll'],
        notes: 'Direct deposit — second half',
        reviewed: true,
      });
    }

    // Occasional freelance income (every other month)
    if (m % 2 === 1) {
      pushTx({
        date: monthDayIso(referenceDate, m, 19),
        type: 'income',
        amount: 650 + m * 40,
        accountId: 'acc_checking',
        payee: 'Northstar Design Studio',
        categoryId: 'cat_freelance',
        tags: ['consulting', 'client'],
        notes: 'UI architecture advisory invoice',
        reviewed: true,
      });
    }

    // Rent (1st)
    pushTx({
      date: monthDayIso(referenceDate, m, 1),
      type: 'expense',
      amount: 1620,
      accountId: 'acc_checking',
      payee: 'Avalon Apartments',
      categoryId: 'cat_housing',
      tags: ['fixed'],
      notes: 'Monthly rent payment',
      reviewed: true,
      recurringId: 'bill_rent',
    });

    // Utilities & Fiber Internet
    pushTx({
      date: monthDayIso(referenceDate, m, 4),
      type: 'expense',
      amount: 118 + (m % 3) * 12,
      accountId: 'acc_checking',
      payee: 'Pacific Gas & Electric',
      categoryId: 'cat_utilities',
      tags: ['home'],
      notes: 'Electricity & gas bill',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 7),
      type: 'expense',
      amount: 70,
      accountId: 'acc_credit',
      payee: 'Sonic Fiber Internet',
      categoryId: 'cat_utilities',
      tags: ['fixed'],
      notes: 'Gigabit home fiber',
      reviewed: true,
      recurringId: 'bill_internet',
    });

    // Insurance
    pushTx({
      date: monthDayIso(referenceDate, m, 9),
      type: 'expense',
      amount: 142,
      accountId: 'acc_checking',
      payee: 'Geico Auto & Renters',
      categoryId: 'cat_insurance',
      tags: ['fixed'],
      notes: 'Bundled monthly policy',
      reviewed: true,
      recurringId: 'bill_insurance',
    });

    // Subscriptions
    pushTx({
      date: monthDayIso(referenceDate, m, 6),
      type: 'expense',
      amount: 16.99,
      accountId: 'acc_credit',
      payee: 'Spotify Family',
      categoryId: 'cat_subscriptions',
      tags: ['subscription'],
      notes: 'Music streaming',
      reviewed: true,
      recurringId: 'bill_spotify',
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 11),
      type: 'expense',
      amount: 22.99,
      accountId: 'acc_credit',
      payee: 'Netflix Standard',
      categoryId: 'cat_subscriptions',
      tags: ['subscription'],
      notes: 'Video streaming',
      reviewed: true,
      recurringId: 'bill_netflix',
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 12),
      type: 'expense',
      amount: 54,
      accountId: 'acc_credit',
      payee: 'Equinox Local Fitness',
      categoryId: 'cat_subscriptions',
      tags: ['fitness', 'subscription'],
      notes: 'Monthly gym membership',
      reviewed: true,
      recurringId: 'bill_gym',
    });

    // Groceries (3 trips/month)
    pushTx({
      date: monthDayIso(referenceDate, m, 3),
      type: 'expense',
      amount: 142.4 + (m % 3) * 11.2,
      accountId: 'acc_credit',
      payee: "Trader Joe's",
      categoryId: 'cat_groceries',
      tags: ['weekly'],
      notes: 'Weekly pantry & fresh produce',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 13),
      type: 'expense',
      amount: 164.8 - (m % 2) * 14.5,
      accountId: 'acc_credit',
      payee: 'Whole Foods Market',
      categoryId: 'cat_groceries',
      tags: ['organic'],
      notes: 'Mid-month grocery run',
      reviewed: true,
    });

    if (!isCurrentMonth || todayDay >= 20) {
      pushTx({
        date: monthDayIso(referenceDate, m, 22),
        type: 'expense',
        amount: 128.9 + (m % 4) * 9.5,
        accountId: 'acc_credit',
        payee: "Trader Joe's",
        categoryId: 'cat_groceries',
        tags: ['weekly'],
        notes: 'Produce and household staples',
        reviewed: true,
      });
    }

    // Dining out (2-3 outings/month)
    pushTx({
      date: monthDayIso(referenceDate, m, 5),
      type: 'expense',
      amount: 64.5 + (m % 3) * 14,
      accountId: 'acc_credit',
      payee: 'Nopa Bistro',
      categoryId: 'cat_dining',
      tags: ['weekend'],
      notes: 'Dinner with friends',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 16),
      type: 'expense',
      amount: 48.2 + (m % 2) * 18.5,
      accountId: 'acc_credit',
      payee: 'Marufuku Ramen',
      categoryId: 'cat_dining',
      tags: ['dinner'],
      notes: 'Friday ramen night',
      reviewed: true,
    });

    // Coffee & Cash
    pushTx({
      date: monthDayIso(referenceDate, m, 8),
      type: 'expense',
      amount: 14.5,
      accountId: 'acc_cash',
      payee: 'Blue Bottle Coffee',
      categoryId: 'cat_coffee',
      tags: ['work'],
      notes: 'Latte and almond croissant',
      reviewed: true,
    });

    // Transportation
    pushTx({
      date: monthDayIso(referenceDate, m, 10),
      type: 'expense',
      amount: 58.4 + (m % 3) * 6.2,
      accountId: 'acc_credit',
      payee: 'Shell Service Station',
      categoryId: 'cat_transport',
      tags: ['fuel'],
      notes: 'Full tank fill-up',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 18),
      type: 'expense',
      amount: 34.75,
      accountId: 'acc_credit',
      payee: 'Uber Trip',
      categoryId: 'cat_transport',
      tags: ['commute'],
      notes: 'Airport & downtown rides',
      reviewed: true,
    });

    // Shopping & Entertainment
    pushTx({
      date: monthDayIso(referenceDate, m, 14),
      type: 'expense',
      amount: 92.3 + (m % 3) * 28,
      accountId: 'acc_credit',
      payee: 'Amazon Marketplace',
      categoryId: 'cat_shopping',
      tags: ['home'],
      notes: 'Desk lamp & home organization',
      reviewed: true,
    });

    if (m % 2 === 0) {
      pushTx({
        date: monthDayIso(referenceDate, m, 17),
        type: 'expense',
        amount: 46,
        accountId: 'acc_credit',
        payee: 'Alamo Drafthouse Cinema',
        categoryId: 'cat_entertainment',
        tags: ['movies'],
        notes: 'Movie tickets & snacks',
        reviewed: true,
      });
    }

    // Transfers: High-Yield Savings contribution + Credit Card payment + Auto Loan payment
    pushTx({
      date: monthDayIso(referenceDate, m, 2),
      type: 'transfer',
      amount: 600,
      accountId: 'acc_checking',
      transferAccountId: 'acc_savings',
      payee: 'Transfer to High-Yield Savings',
      categoryId: 'cat_emergency',
      tags: ['savings'],
      notes: 'Automated monthly savings transfer',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 24),
      type: 'transfer',
      amount: 950,
      accountId: 'acc_checking',
      transferAccountId: 'acc_credit',
      payee: 'Sapphire Reserve Payment',
      categoryId: 'cat_uncategorized',
      tags: ['cc-payment'],
      notes: 'Monthly credit card autopay',
      reviewed: true,
    });

    pushTx({
      date: monthDayIso(referenceDate, m, 20),
      type: 'transfer',
      amount: 295,
      accountId: 'acc_checking',
      transferAccountId: 'acc_loan',
      payee: 'Auto Loan Monthly Payment',
      categoryId: 'cat_transport',
      tags: ['loan'],
      notes: 'Scheduled principal + interest payment',
      reviewed: true,
      recurringId: 'bill_autoloan',
    });
  }

  // Featured Split Transaction (Target grocery + shopping trip in current month)
  pushTx({
    date: offsetDaysIso(referenceDate, -5),
    type: 'expense',
    amount: 148.6,
    accountId: 'acc_credit',
    payee: 'Target Superstore',
    categoryId: 'cat_groceries',
    splits: [
      { id: 'split_1', categoryId: 'cat_groceries', amount: 96.4, note: 'Groceries & pantry' },
      { id: 'split_2', categoryId: 'cat_shopping', amount: 52.2, note: 'Kitchen storage bins' },
    ],
    tags: ['split', 'household'],
    notes: 'Combined grocery and home goods run',
    reviewed: true,
  });

  // Featured Clothing Purchase + Partial Refund in current month (tests refund offset!)
  pushTx({
    date: offsetDaysIso(referenceDate, -8),
    type: 'expense',
    amount: 158.0,
    accountId: 'acc_credit',
    payee: 'Uniqlo Online',
    categoryId: 'cat_shopping',
    tags: ['apparel'],
    notes: 'Autumn jacket & merino sweater',
    reviewed: true,
  });

  pushTx({
    date: offsetDaysIso(referenceDate, -3),
    type: 'refund',
    amount: 69.9,
    accountId: 'acc_credit',
    payee: 'Uniqlo Online Refund',
    categoryId: 'cat_shopping',
    tags: ['apparel', 'refund'],
    notes: 'Returned jacket (wrong size)',
    reviewed: true,
  });

  // Healthcare expense (recent)
  pushTx({
    date: offsetDaysIso(referenceDate, -11),
    type: 'expense',
    amount: 45.0,
    accountId: 'acc_credit',
    payee: 'CVS Pharmacy',
    categoryId: 'cat_health',
    tags: ['wellness'],
    notes: 'Prescription copay & vitamins',
    reviewed: true,
  });

  // 5 Unreviewed "Inbox Zero" transactions in the current month
  pushTx({
    date: offsetDaysIso(referenceDate, -4),
    type: 'expense',
    amount: 7.25,
    accountId: 'acc_credit',
    payee: 'Starbucks #4821',
    categoryId: 'cat_coffee',
    tags: ['morning'],
    notes: 'Cold brew & oat milk',
    reviewed: false,
  });

  pushTx({
    date: offsetDaysIso(referenceDate, -3),
    type: 'expense',
    amount: 84.5,
    accountId: 'acc_credit',
    payee: 'Tartine Bakery & Cafe',
    categoryId: 'cat_dining',
    tags: ['brunch'],
    notes: 'Sunday brunch with family',
    reviewed: false,
  });

  pushTx({
    date: offsetDaysIso(referenceDate, -2),
    type: 'expense',
    amount: 41.2,
    accountId: 'acc_credit',
    payee: 'AMZN Mktp US*2K91A',
    categoryId: 'cat_shopping',
    tags: [],
    notes: 'USB-C dock cable',
    reviewed: false,
  });

  pushTx({
    date: offsetDaysIso(referenceDate, -1),
    type: 'expense',
    amount: 26.8,
    accountId: 'acc_cash',
    payee: 'Ferry Plaza Farmers Market',
    categoryId: 'cat_groceries',
    tags: ['local'],
    notes: 'Fresh strawberries, greens, sourdough',
    reviewed: false,
  });

  pushTx({
    date: offsetDaysIso(referenceDate, 0),
    type: 'expense',
    amount: 19.95,
    accountId: 'acc_credit',
    payee: 'Shell Oil #1092',
    categoryId: 'cat_transport',
    tags: [],
    notes: 'Quick fuel top-up',
    reviewed: false,
  });

  const recurringBills: RecurringBill[] = [
    {
      id: 'bill_rent',
      name: 'Apartment Rent',
      payee: 'Avalon Apartments',
      amount: 1620,
      type: 'expense',
      categoryId: 'cat_housing',
      accountId: 'acc_checking',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 9),
      isSubscription: false,
      autoPay: true,
      notes: 'Due on the 1st of every month',
      lastPaidDate: monthDayIso(referenceDate, 0, 1),
      active: true,
    },
    {
      id: 'bill_internet',
      name: 'Sonic Fiber Internet',
      payee: 'Sonic Fiber Internet',
      amount: 70,
      type: 'expense',
      categoryId: 'cat_utilities',
      accountId: 'acc_credit',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 3),
      isSubscription: true,
      autoPay: true,
      lastPaidDate: monthDayIso(referenceDate, 1, 7),
      active: true,
    },
    {
      id: 'bill_spotify',
      name: 'Spotify Family',
      payee: 'Spotify Family',
      amount: 16.99,
      type: 'expense',
      categoryId: 'cat_subscriptions',
      accountId: 'acc_credit',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 5),
      isSubscription: true,
      autoPay: true,
      lastPaidDate: monthDayIso(referenceDate, 1, 6),
      active: true,
    },
    {
      id: 'bill_netflix',
      name: 'Netflix Standard',
      payee: 'Netflix Standard',
      amount: 22.99,
      type: 'expense',
      categoryId: 'cat_subscriptions',
      accountId: 'acc_credit',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 12),
      isSubscription: true,
      autoPay: true,
      lastPaidDate: monthDayIso(referenceDate, 1, 11),
      active: true,
    },
    {
      id: 'bill_icloud',
      name: 'iCloud+ 2TB Storage',
      payee: 'Apple Services',
      amount: 9.99,
      type: 'expense',
      categoryId: 'cat_subscriptions',
      accountId: 'acc_credit',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 2),
      isSubscription: true,
      autoPay: true,
      active: true,
    },
    {
      id: 'bill_gym',
      name: 'Fitness Membership',
      payee: 'Equinox Local Fitness',
      amount: 54,
      type: 'expense',
      categoryId: 'cat_subscriptions',
      accountId: 'acc_credit',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 15),
      isSubscription: true,
      autoPay: true,
      active: true,
    },
    {
      id: 'bill_insurance',
      name: 'Auto & Renters Insurance',
      payee: 'Geico Auto & Renters',
      amount: 142,
      type: 'expense',
      categoryId: 'cat_insurance',
      accountId: 'acc_checking',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 18),
      isSubscription: false,
      autoPay: true,
      active: true,
    },
    {
      id: 'bill_autoloan',
      name: 'Auto Loan Payment',
      payee: 'Auto Loan Monthly Payment',
      amount: 295,
      type: 'expense',
      categoryId: 'cat_transport',
      accountId: 'acc_checking',
      frequency: 'monthly',
      nextDueDate: offsetDaysIso(referenceDate, 20),
      isSubscription: false,
      autoPay: true,
      active: true,
    },
  ];

  const savingsGoals: SavingsGoal[] = [
    {
      id: 'goal_emergency',
      name: '6-Month Emergency Fund',
      targetAmount: 18000,
      currentAmount: 12400,
      targetDate: offsetDaysIso(referenceDate, 300),
      linkedAccountId: 'acc_savings',
      color: '#10b981',
      icon: 'Shield',
      monthlyContribution: 450,
      createdAt: nowIso,
    },
    {
      id: 'goal_japan',
      name: 'Japan Autumn Trip',
      targetAmount: 4200,
      currentAmount: 2350,
      targetDate: offsetDaysIso(referenceDate, 210),
      linkedAccountId: 'acc_savings',
      color: '#06b6d4',
      icon: 'Plane',
      monthlyContribution: 250,
      createdAt: nowIso,
    },
    {
      id: 'goal_workstation',
      name: 'Workstation Upgrade',
      targetAmount: 2400,
      currentAmount: 1150,
      targetDate: offsetDaysIso(referenceDate, 180),
      linkedAccountId: 'acc_savings',
      color: '#8b5cf6',
      icon: 'Laptop',
      monthlyContribution: 150,
      createdAt: nowIso,
    },
  ];

  const rules: CategoryRule[] = [
    {
      id: 'rule_groceries',
      name: 'Supermarket Auto-Tag',
      enabled: true,
      matchField: 'payee',
      matchType: 'regex',
      pattern: "trader joe|whole foods|farmers market",
      assignCategoryId: 'cat_groceries',
      addTags: ['groceries'],
      priority: 1,
    },
    {
      id: 'rule_coffee',
      name: 'Coffee Shops',
      enabled: true,
      matchField: 'payee',
      matchType: 'regex',
      pattern: 'starbucks|blue bottle|philz',
      renamePayeeTo: 'Coffee Shop',
      assignCategoryId: 'cat_coffee',
      addTags: ['caffeine'],
      priority: 2,
    },
    {
      id: 'rule_amazon',
      name: 'Normalize Amazon',
      enabled: true,
      matchField: 'payee',
      matchType: 'regex',
      pattern: 'amzn|amazon',
      renamePayeeTo: 'Amazon',
      assignCategoryId: 'cat_shopping',
      addTags: ['online'],
      priority: 3,
    },
    {
      id: 'rule_streaming',
      name: 'Streaming Subscriptions',
      enabled: true,
      matchField: 'payee',
      matchType: 'regex',
      pattern: 'spotify|netflix|apple services',
      assignCategoryId: 'cat_subscriptions',
      addTags: ['subscription'],
      markReviewed: true,
      priority: 4,
    },
    {
      id: 'rule_payroll',
      name: 'Acme Payroll Deposit',
      enabled: true,
      matchField: 'payee',
      matchType: 'contains',
      pattern: 'acme corp',
      assignCategoryId: 'cat_salary',
      addTags: ['payroll'],
      markReviewed: true,
      priority: 5,
    },
  ];

  const importPresets: BankImportPreset[] = [
    {
      id: 'preset_chase',
      name: 'Chase Checking / Card CSV',
      delimiter: ',',
      skipRows: 1,
      dateColumn: 0,
      payeeColumn: 2,
      amountColumn: 5,
      notesColumn: 3,
      invertAmount: false,
    },
    {
      id: 'preset_eu_bank',
      name: 'European Bank Semicolon CSV',
      delimiter: ';',
      skipRows: 1,
      dateColumn: 0,
      payeeColumn: 1,
      amountColumn: 2,
      notesColumn: 3,
      invertAmount: false,
    },
  ];

  const forecastMilestones: ForecastMilestone[] = [
    {
      id: 'ms-bonus',
      label: 'Year-End Bonus',
      monthOffset: 6,
      amount: 3500,
      recurring: false,
      enabled: true,
    },
    {
      id: 'ms-trip',
      label: 'Autumn Travel Fund',
      monthOffset: 10,
      amount: -2400,
      recurring: false,
      enabled: true,
    },
  ];

  const settings = createDefaultSettings(true, nowIso);
  settings.budgetRolloverAdjustments = {
    cat_groceries: 45,
    cat_travel: 120,
  };

  return {
    schemaVersion: 2,
    updatedAt: nowIso,
    accounts,
    categories,
    transactions,
    recurringBills,
    savingsGoals,
    savingsSquads: createDefaultSavingsSquads('USD'),
    rules,
    importPresets,
    forecastMilestones,
    settings,
  };
}
