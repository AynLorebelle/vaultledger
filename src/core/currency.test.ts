import { describe, expect, it } from 'vitest';
import type { CurrencyCode, VaultData } from '../types/finance';
import { computeDashboardKPIs } from './analytics';
import {
  CURRENCY_METADATA,
  DEFAULT_USD_RATES,
  SUPPORTED_CURRENCIES,
  convertCurrency,
  getDefaultRatesForBase,
  normalizeVaultData,
  rebaseExchangeRates,
} from './currency';
import { createEmptyVault, createSampleVault } from './seedData';

describe('currency constants & getDefaultRatesForBase', () => {
  it('defines all 8 supported currencies with metadata and baseline USD rates', () => {
    expect(SUPPORTED_CURRENCIES).toEqual([
      'USD',
      'PHP',
      'EUR',
      'GBP',
      'JPY',
      'CAD',
      'AUD',
      'SGD',
    ]);

    for (const code of SUPPORTED_CURRENCIES) {
      expect(CURRENCY_METADATA[code].code).toBe(code);
      expect(CURRENCY_METADATA[code].symbol.length).toBeGreaterThan(0);
      expect(CURRENCY_METADATA[code].decimals).toBe(code === 'JPY' ? 0 : 2);
      expect(DEFAULT_USD_RATES[code]).toBeGreaterThan(0);
    }

    expect(DEFAULT_USD_RATES).toEqual({
      USD: 1,
      PHP: 58.2,
      EUR: 0.92,
      GBP: 0.79,
      JPY: 154,
      CAD: 1.39,
      AUD: 1.53,
      SGD: 1.34,
    });
  });

  it('rebases default rates cleanly for every supported base currency', () => {
    const usdRates = getDefaultRatesForBase('USD');
    expect(usdRates).toEqual(DEFAULT_USD_RATES);
    expect(usdRates).not.toBe(DEFAULT_USD_RATES);

    for (const base of SUPPORTED_CURRENCIES) {
      const rates = getDefaultRatesForBase(base);
      expect(rates[base]).toBe(1);
      for (const code of SUPPORTED_CURRENCIES) {
        expect(Number.isFinite(rates[code])).toBe(true);
        expect(rates[code]).toBeGreaterThan(0);
        const expectedRatio = DEFAULT_USD_RATES[code] / DEFAULT_USD_RATES[base];
        expect(rates[code]).toBeCloseTo(expectedRatio, 4);
      }
    }
  });
});

describe('convertCurrency', () => {
  const usdSettings = {
    baseCurrency: 'USD' as CurrencyCode,
    exchangeRates: { ...DEFAULT_USD_RATES },
  };

  it('converts USD <-> PHP accurately in both directions', () => {
    expect(convertCurrency(100, 'USD', 'PHP', usdSettings)).toBeCloseTo(5820, 6);
    expect(convertCurrency(5820, 'PHP', 'USD', usdSettings)).toBeCloseTo(100, 6);
  });

  it('converts EUR <-> JPY via baseCurrency accurately', () => {
    // 92 EUR = 100 USD = 15,400 JPY
    expect(convertCurrency(92, 'EUR', 'JPY', usdSettings)).toBeCloseTo(15400, 6);
    expect(convertCurrency(15400, 'JPY', 'EUR', usdSettings)).toBeCloseTo(92, 6);
  });

  it('returns identical amount when source and target currencies match', () => {
    expect(convertCurrency(1234.56, 'PHP', 'PHP', usdSettings)).toBe(1234.56);
    expect(convertCurrency(-42.5, 'EUR', 'EUR', usdSettings)).toBe(-42.5);
  });

  it('handles NaN, non-finite values, and zero safely', () => {
    expect(convertCurrency(Number.NaN, 'USD', 'PHP', usdSettings)).toBe(0);
    expect(convertCurrency(Number.POSITIVE_INFINITY, 'USD', 'PHP', usdSettings)).toBe(0);
    expect(convertCurrency(Number.NEGATIVE_INFINITY, 'EUR', 'JPY', usdSettings)).toBe(0);
    expect(convertCurrency(0, 'USD', 'PHP', usdSettings)).toBe(0);
    expect(Object.is(convertCurrency(-0, 'USD', 'PHP', usdSettings), 0)).toBe(true);
  });

  it('falls back safely to rate 1 when a currency rate is missing or non-positive', () => {
    const brokenSettings = {
      baseCurrency: 'USD' as CurrencyCode,
      exchangeRates: {
        ...DEFAULT_USD_RATES,
        PHP: 0,
        EUR: -2,
        JPY: Number.NaN,
      },
    };
    expect(convertCurrency(250, 'PHP', 'USD', brokenSettings)).toBe(250);
    expect(convertCurrency(100, 'USD', 'EUR', brokenSettings)).toBe(100);
    expect(convertCurrency(500, 'JPY', 'USD', brokenSettings)).toBe(500);
  });

  it('matches analytics.ts convertToBaseCurrency semantics exactly', () => {
    const vault = createEmptyVault();
    vault.settings.baseCurrency = 'USD';
    vault.settings.exchangeRates = { ...DEFAULT_USD_RATES };
    vault.accounts = [
      {
        id: 'acc_php',
        name: 'BPI Checking',
        type: 'checking',
        currency: 'PHP',
        openingBalance: 58200,
        color: '#3b82f6',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        id: 'acc_eur',
        name: 'Euro Savings',
        type: 'savings',
        currency: 'EUR',
        openingBalance: 920,
        color: '#10b981',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ];
    vault.transactions = [
      {
        id: 'tx_php_exp',
        date: '2026-03-10',
        type: 'expense',
        amount: 2910,
        accountId: 'acc_php',
        payee: 'Manila Groceries',
        categoryId: 'cat_groceries',
        tags: [],
        notes: '',
        reviewed: true,
        createdAt: '2026-03-10T00:00:00.000Z',
        updatedAt: '2026-03-10T00:00:00.000Z',
      },
    ];

    const kpis = computeDashboardKPIs(vault, 'this_month', new Date('2026-03-15T12:00:00Z'));

    const expectedPhpBalanceInUsd = convertCurrency(
      58200 - 2910,
      'PHP',
      'USD',
      vault.settings,
    );
    const expectedEurBalanceInUsd = convertCurrency(920, 'EUR', 'USD', vault.settings);
    const expectedExpenseInUsd = convertCurrency(2910, 'PHP', 'USD', vault.settings);

    expect(kpis.totalNetWorth).toBeCloseTo(
      expectedPhpBalanceInUsd + expectedEurBalanceInUsd,
      2,
    );
    expect(kpis.periodExpenses).toBeCloseTo(expectedExpenseInUsd, 2);
  });
});

describe('rebaseExchangeRates', () => {
  it('preserves cross-currency ratios across USD -> PHP -> EUR -> USD round-trip', () => {
    const startRates = { ...DEFAULT_USD_RATES };

    const phpRates = rebaseExchangeRates(startRates, 'USD', 'PHP');
    expect(phpRates.PHP).toBe(1);

    const eurRates = rebaseExchangeRates(phpRates, 'PHP', 'EUR');
    expect(eurRates.EUR).toBe(1);

    const backToUsdRates = rebaseExchangeRates(eurRates, 'EUR', 'USD');
    expect(backToUsdRates.USD).toBe(1);

    for (const code of SUPPORTED_CURRENCIES) {
      expect(backToUsdRates[code]).toBeCloseTo(startRates[code], 2);
    }

    // Check pairwise cross-rate invariance at every intermediate step
    for (const stepRates of [phpRates, eurRates, backToUsdRates]) {
      for (const a of SUPPORTED_CURRENCIES) {
        for (const b of SUPPORTED_CURRENCIES) {
          const originalCross = startRates[a] / startRates[b];
          const stepCross = stepRates[a] / stepRates[b];
          expect(stepCross / originalCross).toBeCloseTo(1, 3);
        }
      }
    }

    // Conversion amount stays invariant across rebased settings
    const origEurToJpy = convertCurrency(250, 'EUR', 'JPY', {
      baseCurrency: 'USD',
      exchangeRates: startRates,
    });
    const phpBaseEurToJpy = convertCurrency(250, 'EUR', 'JPY', {
      baseCurrency: 'PHP',
      exchangeRates: phpRates,
    });
    expect(phpBaseEurToJpy).toBeCloseTo(origEurToJpy, 0);
  });

  it('normalizes missing and invalid rates before rebasing', () => {
    const partialRates: Partial<Record<CurrencyCode, number>> = {
      USD: 1,
      PHP: 60,
      EUR: -0.5,
      JPY: Number.NaN,
      GBP: 0,
    };

    const rebased = rebaseExchangeRates(partialRates, 'USD', 'PHP');
    expect(rebased.PHP).toBe(1);
    expect(rebased.USD).toBeCloseTo(1 / 60, 5);
    expect(rebased.EUR).toBeCloseTo(DEFAULT_USD_RATES.EUR / 60, 5);
    expect(rebased.JPY).toBeCloseTo(DEFAULT_USD_RATES.JPY / 60, 5);
    expect(rebased.GBP).toBeCloseTo(DEFAULT_USD_RATES.GBP / 60, 5);
    expect(rebased.SGD).toBeCloseTo(DEFAULT_USD_RATES.SGD / 60, 5);
  });
});

describe('normalizeVaultData', () => {
  it('fixes a buggy v1.0.0 vault where baseCurrency switched to PHP without rebasing rates', () => {
    const sample = createSampleVault(new Date('2026-03-15T12:00:00.000Z'));
    const buggyVault: VaultData = {
      ...sample,
      updatedAt: '2026-03-15T10:00:00.000Z',
      forecastMilestones: undefined,
      settings: {
        ...sample.settings,
        baseCurrency: 'PHP',
        // Simulated v1.0.0 bug: still USD-based rates even though baseCurrency is PHP
        exchangeRates: {
          USD: 1,
          PHP: 58.2,
          EUR: 0.92,
          GBP: 0.79,
          JPY: 154,
          CAD: 1.39,
          AUD: 1.53,
          SGD: 1.34,
        },
        exchangeRatesUpdatedAt: undefined,
        theme: 'dark',
        privacyMask: true,
        passcodeHash: 'pbkdf2_test_hash',
        passcodeSalt: 'pbkdf2_test_salt',
      },
    };

    const normalized = normalizeVaultData(buggyVault);

    // Rates are cleanly rebased so PHP === 1 and USD === 1 / 58.2
    expect(normalized.settings.baseCurrency).toBe('PHP');
    expect(normalized.settings.exchangeRates.PHP).toBe(1);
    expect(normalized.settings.exchangeRates.USD).toBeCloseTo(1 / 58.2, 5);
    expect(normalized.settings.exchangeRates.EUR).toBeCloseTo(0.92 / 58.2, 5);
    expect(normalized.settings.exchangeRates.JPY).toBeCloseTo(154 / 58.2, 4);

    // Converting 100 USD to PHP using the repaired vault gives ~5820 PHP
    expect(convertCurrency(100, 'USD', 'PHP', normalized.settings)).toBeCloseTo(5820, 0);

    // Backfills missing fields
    expect(normalized.forecastMilestones).toEqual([]);
    expect(normalized.settings.exchangeRatesUpdatedAt).toBe('2026-03-15T10:00:00.000Z');

    // Preserves saved theme, privacy/lock settings, and all user data untouched
    expect(normalized.settings.theme).toBe('dark');
    expect(normalized.settings.privacyMask).toBe(true);
    expect(normalized.settings.passcodeHash).toBe('pbkdf2_test_hash');
    expect(normalized.settings.passcodeSalt).toBe('pbkdf2_test_salt');
    expect(normalized.accounts).toEqual(buggyVault.accounts);
    expect(normalized.categories).toEqual(buggyVault.categories);
    expect(normalized.transactions).toEqual(buggyVault.transactions);
    expect(normalized.recurringBills).toEqual(buggyVault.recurringBills);
    expect(normalized.savingsGoals).toEqual(buggyVault.savingsGoals);
    expect(normalized.rules).toEqual(buggyVault.rules);
    expect(normalized.importPresets).toEqual(buggyVault.importPresets);

    // Pure (does not mutate original input)
    expect(buggyVault.settings.exchangeRates.PHP).toBe(58.2);
    expect(buggyVault.forecastMilestones).toBeUndefined();

    // Idempotent
    const normalizedTwice = normalizeVaultData(normalized);
    expect(normalizedTwice).toEqual(normalized);
  });

  it('backfills missing currencies and falls back to ISO timestamp when updatedAt is empty', () => {
    const base = createEmptyVault();
    const sparseVault: VaultData = {
      ...base,
      updatedAt: '',
      settings: {
        ...base.settings,
        baseCurrency: 'EUR',
        exchangeRates: {
          EUR: 1,
          USD: 1.09,
        } as Record<CurrencyCode, number>,
        theme: 'light',
      },
    };

    const normalized = normalizeVaultData(sparseVault);
    expect(normalized.settings.baseCurrency).toBe('EUR');
    expect(normalized.settings.theme).toBe('light');
    expect(normalized.settings.exchangeRates.EUR).toBe(1);
    expect(normalized.settings.exchangeRates.USD).toBe(1.09);

    for (const code of SUPPORTED_CURRENCIES) {
      expect(Number.isFinite(normalized.settings.exchangeRates[code])).toBe(true);
      expect(normalized.settings.exchangeRates[code]).toBeGreaterThan(0);
    }

    expect(normalized.settings.exchangeRatesUpdatedAt).toMatch(
      /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/,
    );
    expect(normalizeVaultData(normalized)).toEqual(normalized);
  });
});
