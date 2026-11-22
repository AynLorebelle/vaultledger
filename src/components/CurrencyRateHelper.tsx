import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Calculator,
  Clock,
  Globe,
  Lock,
  RotateCcw,
} from 'lucide-react';
import {
  CURRENCY_METADATA,
  SUPPORTED_CURRENCIES,
  convertCurrency,
} from '../core/currency';
import type { CurrencyCode, VaultSettings } from '../types/finance';
import { formatMoney } from './ui';

export interface CurrencyRateHelperProps {
  settings: VaultSettings;
  privacyMask: boolean;
  onChangeBaseCurrency: (nextCurrency: CurrencyCode) => void;
  onUpdateRate: (code: CurrencyCode, rate: number) => void;
  onResetRates: () => void;
}

const MIN_RATE = 0.000001;

function getSafeRate(
  code: CurrencyCode,
  baseCurrency: CurrencyCode,
  exchangeRates: Record<CurrencyCode, number>,
): number {
  if (code === baseCurrency) {
    return 1;
  }
  const raw = exchangeRates?.[code];
  return typeof raw === 'number' && Number.isFinite(raw) && raw > 0 ? raw : 1;
}

function formatRateDisplay(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '0.0000';
  }
  if (rate < 0.0001) {
    return rate.toFixed(6);
  }
  return rate.toFixed(4);
}

function formatRateInputValue(rate: number): string {
  if (!Number.isFinite(rate) || rate <= 0) {
    return '1';
  }
  if (rate >= 0.001) {
    return String(Number(rate.toFixed(6)));
  }
  return rate.toFixed(6).replace(/0+$/, '').replace(/\.$/, '') || '0.000001';
}

function buildRateDrafts(
  baseCurrency: CurrencyCode,
  exchangeRates: Record<CurrencyCode, number>,
): Record<CurrencyCode, string> {
  const drafts = {} as Record<CurrencyCode, string>;
  for (const code of SUPPORTED_CURRENCIES) {
    const rate = getSafeRate(code, baseCurrency, exchangeRates);
    drafts[code] = code === baseCurrency ? '1.0000' : formatRateInputValue(rate);
  }
  return drafts;
}

function formatUpdatedAt(iso?: string): string {
  if (!iso) {
    return 'Default offline rates';
  }
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return 'Default offline rates';
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  }).format(date);
}

export const CurrencyRateHelper: React.FC<CurrencyRateHelperProps> = ({
  settings,
  privacyMask,
  onChangeBaseCurrency,
  onUpdateRate,
  onResetRates,
}) => {
  const baseCurrency = settings.baseCurrency;

  // Quick Offline Currency Converter state
  const [amountInput, setAmountInput] = useState<string>('100');
  const [fromCurrency, setFromCurrency] = useState<CurrencyCode>(baseCurrency);
  const [toCurrency, setToCurrency] = useState<CurrencyCode>(
    baseCurrency === 'USD' ? 'PHP' : 'USD',
  );

  // Offline Exchange Rate Table editable draft state
  const [rateDrafts, setRateDrafts] = useState<Record<CurrencyCode, string>>(() =>
    buildRateDrafts(baseCurrency, settings.exchangeRates),
  );

  // Guard against duplicate commits when Enter commits and immediately blurs
  const lastCommittedRef = useRef<Partial<Record<CurrencyCode, number>>>({});

  useEffect(() => {
    setRateDrafts(buildRateDrafts(baseCurrency, settings.exchangeRates));
    lastCommittedRef.current = {};
  }, [baseCurrency, settings.exchangeRates]);

  const parsedAmount = useMemo(() => {
    const trimmed = amountInput.trim();
    if (!trimmed) return 0;
    const numeric = Number(trimmed);
    return Number.isFinite(numeric) && numeric >= 0 ? numeric : 0;
  }, [amountInput]);

  const convertedAmount = useMemo(
    () => convertCurrency(parsedAmount, fromCurrency, toCurrency, settings),
    [parsedAmount, fromCurrency, toCurrency, settings],
  );

  const unitRate = useMemo(
    () => convertCurrency(1, fromCurrency, toCurrency, settings),
    [fromCurrency, toCurrency, settings],
  );

  const formattedUpdatedAt = useMemo(
    () => formatUpdatedAt(settings.exchangeRatesUpdatedAt),
    [settings.exchangeRatesUpdatedAt],
  );

  const handleSwapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  const handleDraftChange = (code: CurrencyCode, value: string) => {
    setRateDrafts((prev) => ({ ...prev, [code]: value }));
  };

  const commitRate = (code: CurrencyCode) => {
    if (code === baseCurrency) return;

    const currentRate = getSafeRate(code, baseCurrency, settings.exchangeRates);
    const rawDraft = (rateDrafts[code] ?? '').trim();
    const parsed = Number(rawDraft);

    if (!rawDraft || !Number.isFinite(parsed) || parsed < MIN_RATE) {
      setRateDrafts((prev) => ({
        ...prev,
        [code]: formatRateInputValue(currentRate),
      }));
      return;
    }

    const lastCommitted = lastCommittedRef.current[code];
    if (
      Math.abs(parsed - currentRate) <= 1e-12 ||
      (lastCommitted !== undefined && Math.abs(parsed - lastCommitted) <= 1e-12)
    ) {
      setRateDrafts((prev) => ({
        ...prev,
        [code]: formatRateInputValue(parsed),
      }));
      return;
    }

    lastCommittedRef.current[code] = parsed;
    setRateDrafts((prev) => ({
      ...prev,
      [code]: formatRateInputValue(parsed),
    }));
    onUpdateRate(code, parsed);
  };

  const handleRateKeyDown = (
    e: React.KeyboardEvent<HTMLInputElement>,
    code: CurrencyCode,
  ) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      commitRate(code);
      e.currentTarget.blur();
    } else if (e.key === 'Escape') {
      e.preventDefault();
      const currentRate = getSafeRate(code, baseCurrency, settings.exchangeRates);
      setRateDrafts((prev) => ({
        ...prev,
        [code]: formatRateInputValue(currentRate),
      }));
      e.currentTarget.blur();
    }
  };

  const fromMeta = CURRENCY_METADATA[fromCurrency];
  const baseMeta = CURRENCY_METADATA[baseCurrency];

  return (
    <div className="space-y-5">
      {/* Panel 1: Quick Offline Currency Converter */}
      <section
        aria-label="Quick Offline Currency Converter"
        className="tactile-card p-5 space-y-4"
      >
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <Calculator className="w-4 h-4" aria-hidden="true" />
            </div>
            <div>
              <h3 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
                Quick Offline Currency Converter
              </h3>
              <p className="text-xs text-[var(--text-muted)]">
                Instant conversion using your local vault exchange rates
              </p>
            </div>
          </div>

          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-medium bg-[var(--bg-subtle)] text-[var(--text-muted)] border border-[var(--border-hairline)] tabular-nums">
            1 {fromCurrency} = {formatRateDisplay(unitRate)} {toCurrency}
          </span>
        </div>

        {/* Converter Inputs */}
        <div className="grid grid-cols-1 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_minmax(0,1fr)] gap-3 items-end">
          <div>
            <label
              htmlFor="vault-converter-amount"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              Amount
            </label>
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs font-semibold text-[var(--text-muted)] tabular-nums"
                aria-hidden="true"
              >
                {fromMeta.symbol}
              </span>
              <input
                id="vault-converter-amount"
                type="number"
                inputMode="decimal"
                step="any"
                min="0"
                value={amountInput}
                onChange={(e) => setAmountInput(e.target.value)}
                placeholder="0.00"
                className={`tactile-input w-full ${
                  fromMeta.symbol.length > 1 ? 'pl-11' : 'pl-8'
                } pr-3 py-2 text-sm font-medium tabular-nums focus:border-[var(--accent-primary)]`}
              />
            </div>
          </div>

          <div>
            <label
              htmlFor="vault-converter-from"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              From
            </label>
            <select
              id="vault-converter-from"
              value={fromCurrency}
              onChange={(e) => setFromCurrency(e.target.value as CurrencyCode)}
              className="tactile-input w-full px-3 py-2 text-sm font-medium cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {SUPPORTED_CURRENCIES.map((code) => {
                const meta = CURRENCY_METADATA[code];
                return (
                  <option key={code} value={code}>
                    {code} ({meta.symbol}) — {meta.name}
                  </option>
                );
              })}
            </select>
          </div>

          <div className="flex justify-center md:pb-0.5">
            <button
              type="button"
              onClick={handleSwapCurrencies}
              aria-label="Swap currencies"
              title="Swap currencies"
              className="tactile-btn inline-flex items-center justify-center w-9 h-9 rounded-xl text-[var(--text-primary)] cursor-pointer"
            >
              <ArrowLeftRight className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          <div>
            <label
              htmlFor="vault-converter-to"
              className="block text-xs font-medium text-[var(--text-muted)] mb-1.5"
            >
              To
            </label>
            <select
              id="vault-converter-to"
              value={toCurrency}
              onChange={(e) => setToCurrency(e.target.value as CurrencyCode)}
              className="tactile-input w-full px-3 py-2 text-sm font-medium cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {SUPPORTED_CURRENCIES.map((code) => {
                const meta = CURRENCY_METADATA[code];
                return (
                  <option key={code} value={code}>
                    {code} ({meta.symbol}) — {meta.name}
                  </option>
                );
              })}
            </select>
          </div>
        </div>

        {/* Converted Output Well */}
        <div className="tactile-well px-4 py-3.5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
          <div>
            <p className="text-xs font-medium text-[var(--text-muted)]">
              Converted Amount
            </p>
            <div className="mt-0.5 flex flex-wrap items-baseline gap-2">
              <span
                className={`text-2xl font-bold text-[var(--text-primary)] tracking-tight tabular-nums ${
                  privacyMask ? 'privacy-blur' : ''
                }`}
              >
                {formatMoney(convertedAmount, toCurrency)}
              </span>
              <span className="text-xs font-medium text-[var(--text-muted)] tabular-nums">
                from{' '}
                <span className={privacyMask ? 'privacy-blur' : ''}>
                  {formatMoney(parsedAmount, fromCurrency)}
                </span>
              </span>
            </div>
          </div>

          <div className="sm:text-right">
            <p className="text-xs font-medium text-[var(--text-secondary)] tabular-nums">
              1 {fromCurrency} = {formatRateDisplay(unitRate)} {toCurrency}
            </p>
            <p className="text-[11px] text-[var(--text-muted)] tabular-nums">
              1 {toCurrency} = {formatRateDisplay(unitRate > 0 ? 1 / unitRate : 0)}{' '}
              {fromCurrency}
            </p>
          </div>
        </div>
      </section>

      {/* Panel 2: Offline Exchange Rate Table */}
      <section
        aria-label="Offline Exchange Rate Table"
        className="tactile-card p-5 space-y-4"
      >
        <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 pb-3 border-b border-[var(--border-hairline)]">
          <div className="flex items-start gap-2.5">
            <div
              className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
              style={{
                background: 'var(--accent-primary-soft)',
                color: 'var(--accent-primary-text)',
              }}
            >
              <Globe className="w-4 h-4" aria-hidden="true" />
            </div>
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-sm font-semibold text-[var(--text-primary)] tracking-tight">
                  Offline Exchange Rates
                </h3>
                <span
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-semibold"
                  style={{
                    background: 'var(--accent-primary-soft)',
                    color: 'var(--accent-primary-text)',
                  }}
                >
                  Base: {baseCurrency} ({baseMeta.symbol})
                </span>
              </div>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--text-muted)]">
                <span className="tabular-nums font-medium text-[var(--text-secondary)]">
                  1 {baseCurrency} = X Target
                </span>
                <span className="inline-flex items-center gap-1">
                  <Clock className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
                  <span>Last updated: {formattedUpdatedAt}</span>
                </span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <label
              htmlFor="vault-base-currency-select"
              className="text-xs font-medium text-[var(--text-muted)]"
            >
              Base Currency
            </label>
            <select
              id="vault-base-currency-select"
              aria-label="Base currency"
              value={baseCurrency}
              onChange={(e) => onChangeBaseCurrency(e.target.value as CurrencyCode)}
              className="tactile-input px-2.5 py-1.5 text-xs font-semibold cursor-pointer focus:border-[var(--accent-primary)]"
            >
              {SUPPORTED_CURRENCIES.map((code) => (
                <option key={code} value={code}>
                  {code} ({CURRENCY_METADATA[code].symbol})
                </option>
              ))}
            </select>

            <button
              type="button"
              onClick={onResetRates}
              className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-xs font-semibold cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" aria-hidden="true" />
              <span>Reset Defaults</span>
            </button>
          </div>
        </div>

        {/* 8 Currencies Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {SUPPORTED_CURRENCIES.map((code) => {
            const meta = CURRENCY_METADATA[code];
            const isBase = code === baseCurrency;
            const storedRate = getSafeRate(code, baseCurrency, settings.exchangeRates);
            const draftValue = rateDrafts[code] ?? formatRateInputValue(storedRate);
            const parsedDraft = Number(draftValue);
            const previewRate =
              !isBase && Number.isFinite(parsedDraft) && parsedDraft >= MIN_RATE
                ? parsedDraft
                : storedRate;
            const inverseRate = previewRate > 0 ? 1 / previewRate : 0;

            return (
              <div
                key={code}
                className={`rounded-xl border px-3.5 py-3 transition-colors ${
                  isBase
                    ? 'tactile-well border-[var(--border-strong)]'
                    : 'bg-[var(--bg-surface)] border-[var(--border-hairline)] hover:border-[var(--border-strong)]'
                }`}
              >
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-9 h-9 rounded-lg bg-[var(--bg-subtle)] border border-[var(--border-hairline)] flex items-center justify-center text-xs font-bold text-[var(--text-primary)] shrink-0 tabular-nums">
                      {meta.symbol}
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {meta.code}
                        </span>
                        {isBase && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold"
                            style={{
                              background: 'var(--accent-primary-soft)',
                              color: 'var(--accent-primary-text)',
                            }}
                          >
                            Base
                          </span>
                        )}
                      </div>
                      <p className="text-xs text-[var(--text-muted)] truncate">
                        {meta.name}
                      </p>
                    </div>
                  </div>

                  <div className="flex flex-col items-end shrink-0">
                    {isBase ? (
                      <div className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)] text-sm font-semibold text-[var(--text-primary)] tabular-nums">
                        <Lock
                          className="w-3.5 h-3.5 text-[var(--text-muted)]"
                          aria-hidden="true"
                        />
                        <span>1.0000</span>
                      </div>
                    ) : (
                      <div className="flex items-center gap-1.5">
                        <span className="text-[11px] font-medium text-[var(--text-muted)] tabular-nums hidden sm:inline">
                          1 {baseCurrency} =
                        </span>
                        <input
                          type="number"
                          inputMode="decimal"
                          step="any"
                          min="0.000001"
                          aria-label={`Exchange rate for ${code}`}
                          value={draftValue}
                          onChange={(e) => handleDraftChange(code, e.target.value)}
                          onBlur={() => commitRate(code)}
                          onKeyDown={(e) => handleRateKeyDown(e, code)}
                          className="tactile-input w-28 sm:w-32 px-2.5 py-1.5 text-right text-sm font-semibold tabular-nums focus:border-[var(--accent-primary)]"
                        />
                      </div>
                    )}

                    <p className="mt-1 text-[11px] text-[var(--text-muted)] tabular-nums">
                      {isBase
                        ? `1 ${baseCurrency} = 1.0000 ${baseCurrency}`
                        : `1 ${code} = ${formatRateDisplay(inverseRate)} ${baseCurrency}`}
                    </p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer Note */}
        <p className="text-xs text-[var(--text-muted)] pt-1">
          100% offline rates — stored locally in your vault. Switching Base Currency automatically
          rebases all rates.
        </p>
      </section>
    </div>
  );
};

export default CurrencyRateHelper;
