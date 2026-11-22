import type { CurrencyCode, VaultData, VaultSettings } from '../types/finance';
import { createDefaultSavingsSquads } from './savingsSquad';

export interface CurrencyMetadata {
  code: CurrencyCode;
  name: string;
  symbol: string;
  decimals: number;
}

export const SUPPORTED_CURRENCIES: CurrencyCode[] = [
  'USD',
  'PHP',
  'EUR',
  'GBP',
  'JPY',
  'CAD',
  'AUD',
  'SGD',
];

export const CURRENCY_METADATA: Record<CurrencyCode, CurrencyMetadata> = {
  USD: { code: 'USD', name: 'US Dollar', symbol: '$', decimals: 2 },
  PHP: { code: 'PHP', name: 'Philippine Peso', symbol: '₱', decimals: 2 },
  EUR: { code: 'EUR', name: 'Euro', symbol: '€', decimals: 2 },
  GBP: { code: 'GBP', name: 'British Pound', symbol: '£', decimals: 2 },
  JPY: { code: 'JPY', name: 'Japanese Yen', symbol: '¥', decimals: 0 },
  CAD: { code: 'CAD', name: 'Canadian Dollar', symbol: 'CA$', decimals: 2 },
  AUD: { code: 'AUD', name: 'Australian Dollar', symbol: 'A$', decimals: 2 },
  SGD: { code: 'SGD', name: 'Singapore Dollar', symbol: 'S$', decimals: 2 },
};

/** Baseline offline exchange rates: units of target currency per 1 USD */
export const DEFAULT_USD_RATES: Record<CurrencyCode, number> = {
  USD: 1,
  PHP: 58.2,
  EUR: 0.92,
  GBP: 0.79,
  JPY: 154,
  CAD: 1.39,
  AUD: 1.53,
  SGD: 1.34,
};

const SUPPORTED_CURRENCY_SET = new Set<CurrencyCode>(SUPPORTED_CURRENCIES);

function isValidPositiveRate(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

function roundRate(value: number): number {
  if (!isValidPositiveRate(value)) {
    return 1;
  }
  const rounded =
    value >= 1 ? Number(value.toFixed(6)) : Number(value.toPrecision(6));
  return Object.is(rounded, -0) || rounded <= 0 ? 1 : rounded;
}

function resolveCurrencyCode(code: unknown, fallback: CurrencyCode = 'USD'): CurrencyCode {
  if (typeof code === 'string' && SUPPORTED_CURRENCY_SET.has(code as CurrencyCode)) {
    return code as CurrencyCode;
  }
  return fallback;
}

export function getDefaultRatesForBase(
  baseCurrency: CurrencyCode,
): Record<CurrencyCode, number> {
  const safeBase = resolveCurrencyCode(baseCurrency, 'USD');
  if (safeBase === 'USD') {
    return { ...DEFAULT_USD_RATES };
  }
  return rebaseExchangeRates(DEFAULT_USD_RATES, 'USD', safeBase);
}

export function rebaseExchangeRates(
  rates: Partial<Record<CurrencyCode, number>>,
  fromBase: CurrencyCode,
  toBase: CurrencyCode,
): Record<CurrencyCode, number> {
  const safeFromBase = resolveCurrencyCode(fromBase, 'USD');
  const safeToBase = resolveCurrencyCode(toBase, 'USD');
  const rawRates = rates ?? {};

  // Scale of existing rates relative to fromBase (usually 1, or e.g. 58.2 if un-rebased)
  const fromBaseScale = isValidPositiveRate(rawRates[safeFromBase])
    ? rawRates[safeFromBase]
    : 1;
  const defaultFromUsdRate = DEFAULT_USD_RATES[safeFromBase];

  const sanitized = {} as Record<CurrencyCode, number>;
  for (const code of SUPPORTED_CURRENCIES) {
    const rawValue = rawRates[code];
    if (isValidPositiveRate(rawValue)) {
      sanitized[code] = rawValue;
    } else {
      sanitized[code] = (DEFAULT_USD_RATES[code] / defaultFromUsdRate) * fromBaseScale;
    }
  }

  const targetDivisor = sanitized[safeToBase];
  const rebased = {} as Record<CurrencyCode, number>;
  for (const code of SUPPORTED_CURRENCIES) {
    if (code === safeToBase) {
      rebased[code] = 1;
    } else {
      rebased[code] = roundRate(sanitized[code] / targetDivisor);
    }
  }

  return rebased;
}

export function convertCurrency(
  amount: number,
  from: CurrencyCode,
  to: CurrencyCode,
  settings: Pick<VaultSettings, 'baseCurrency' | 'exchangeRates'>,
): number {
  if (!Number.isFinite(amount)) {
    return 0;
  }
  if (amount === 0) {
    return 0;
  }
  if (from === to) {
    return amount;
  }

  const rates = settings.exchangeRates ?? ({} as Record<CurrencyCode, number>);
  const fromRate =
    from === settings.baseCurrency
      ? 1
      : isValidPositiveRate(rates[from])
        ? rates[from]
        : 1;
  const toRate =
    to === settings.baseCurrency
      ? 1
      : isValidPositiveRate(rates[to])
        ? rates[to]
        : 1;

  // Matches analytics.ts convertToBaseCurrency: units of `code` per 1 baseCurrency -> amount / rate
  const amountInBase = from === settings.baseCurrency ? amount : amount / fromRate;
  if (to === settings.baseCurrency) {
    return amountInBase;
  }
  return amountInBase * toRate;
}

export function normalizeVaultData(vault: VaultData): VaultData {
  const existingSettings = vault.settings;
  const baseCurrency = resolveCurrencyCode(existingSettings?.baseCurrency, 'USD');
  const rawRates = existingSettings?.exchangeRates ?? {};

  // Detect the implicit base of rawRates (handles the v1.0.0 bug where baseCurrency switched without rebasing)
  let detectedFromBase: CurrencyCode = baseCurrency;
  if (!isValidPositiveRate(rawRates[baseCurrency]) || rawRates[baseCurrency] !== 1) {
    const unitCurrency = SUPPORTED_CURRENCIES.find((code) => rawRates[code] === 1);
    if (unitCurrency) {
      detectedFromBase = unitCurrency;
    }
  }

  const normalizedRates = rebaseExchangeRates(rawRates, detectedFromBase, baseCurrency);

  const exchangeRatesUpdatedAt =
    typeof existingSettings?.exchangeRatesUpdatedAt === 'string' &&
    existingSettings.exchangeRatesUpdatedAt.length > 0
      ? existingSettings.exchangeRatesUpdatedAt
      : typeof vault.updatedAt === 'string' && vault.updatedAt.length > 0
        ? vault.updatedAt
        : new Date().toISOString();

  const forecastMilestones = Array.isArray(vault.forecastMilestones)
    ? vault.forecastMilestones
    : [];

  const savingsSquads = Array.isArray(vault.savingsSquads)
    ? vault.savingsSquads
    : existingSettings?.isDemoData
      ? createDefaultSavingsSquads(baseCurrency)
      : [];

  const defaultProfile = {
    displayName: 'Ayn Lorebelle',
    tagline: 'Smart Saver & Co-Op Squad Leader',
    avatarEmoji: '🌸',
    clayAccent: '#FDBCB4',
    monthlySavingsGoalPct: 25,
    aynieeeTone: 'conyo_bestie' as const,
  };

  const profile = existingSettings?.profile
    ? {
        ...defaultProfile,
        ...existingSettings.profile,
      }
    : defaultProfile;

  return {
    ...vault,
    forecastMilestones,
    savingsSquads,
    settings: {
      ...existingSettings,
      baseCurrency,
      exchangeRates: normalizedRates,
      exchangeRatesUpdatedAt,
      profile,
    },
  };
}
