import React, { useMemo, useRef } from 'react';
import {
  ArrowRight,
  ChevronRight,
  HelpCircle,
  MessageSquareText,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  VaultAnswer,
  VaultAnswerDrillAction,
  VaultAnswerRow,
  VaultData,
} from '../types/finance';
import { askVault, SUGGESTED_VAULT_QUERIES } from '../core/askVault';
import { Money } from './ui';

export interface AskVaultPanelProps {
  vault: VaultData;
  privacyMask: boolean;
  query: string;
  onQueryChange: (q: string) => void;
  onDrillDown: (action: VaultAnswerDrillAction) => void;
  compact?: boolean;
  hideInput?: boolean; // useful when CommandPalette already provides the search input
}

const CURRENCY_TOKEN_REGEX = /([+-]?(?:CA\$|A\$|S\$|[$€£₱¥])[\d,]+(?:\.\d{1,2})?)/g;

function renderPrivacyAwareText(text: string, privacyMask: boolean): React.ReactNode {
  if (!privacyMask) {
    return text;
  }
  const parts = text.split(CURRENCY_TOKEN_REGEX);
  if (parts.length <= 1) {
    return text;
  }
  return parts.map((part, idx) =>
    idx % 2 === 1 ? (
      <span key={idx} className="privacy-blur tabular-nums inline-block">
        {part}
      </span>
    ) : (
      <React.Fragment key={idx}>{part}</React.Fragment>
    ),
  );
}

function getDeltaPillStyle(tone: VaultAnswer['deltaTone']): React.CSSProperties {
  if (tone === 'positive') {
    return {
      backgroundColor: 'var(--accent-positive-soft)',
      color: 'var(--accent-positive)',
      borderColor: 'transparent',
    };
  }
  if (tone === 'negative') {
    return {
      backgroundColor: 'var(--accent-danger-soft)',
      color: 'var(--accent-danger)',
      borderColor: 'transparent',
    };
  }
  return {
    backgroundColor: 'var(--bg-surface)',
    color: 'var(--text-muted)',
    borderColor: 'var(--border-hairline)',
  };
}

export const AskVaultPanel: React.FC<AskVaultPanelProps> = ({
  vault,
  privacyMask,
  query,
  onQueryChange,
  onDrillDown,
  compact = false,
  hideInput = false,
}) => {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const answer = useMemo(() => askVault(query, vault), [query, vault]);

  const trimmedQuery = query.trim();
  const hasQuery = trimmedQuery.length > 0;
  const currency = vault.settings.baseCurrency;
  const normalizedQuery = trimmedQuery.toLowerCase();

  const handleClear = () => {
    onQueryChange('');
    inputRef.current?.focus();
  };

  const handleRowDrillDown = (row: VaultAnswerRow) => {
    onDrillDown({
      label: row.label,
      nav: 'transactions',
      categoryId: row.filterCategoryId,
      searchQuery: row.filterSearch,
    });
  };

  const primaryTextHasDigits = Boolean(answer.primaryText && /\d/.test(answer.primaryText));
  const hasPrimaryStat =
    answer.primaryAmount !== undefined || Boolean(answer.primaryText);

  return (
    <section
      aria-label="Ask your vault"
      className={
        compact
          ? 'space-y-2.5'
          : 'tactile-card p-4 sm:p-5 space-y-3.5'
      }
    >
      {!hideInput && (
        <div className="space-y-2">
          <div className="tactile-input flex items-center gap-2.5 px-3 py-2 transition-colors focus-within:border-[var(--focus-ring)] focus-within:outline-2 focus-within:outline-[var(--focus-ring)] focus-within:outline-offset-2">
            <MessageSquareText
              className="w-4 h-4 shrink-0 text-[var(--accent-primary-text)]"
              aria-hidden="true"
            />
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => onQueryChange(e.target.value)}
              placeholder="Ask your vault (e.g. Dining spend this month?)"
              aria-label="Ask your vault a question"
              className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
            />
            {query.length > 0 && (
              <button
                type="button"
                onClick={handleClear}
                aria-label="Clear question"
                className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
              >
                <X className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            )}
            <span
              className="hidden sm:inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium whitespace-nowrap shrink-0 border border-[var(--border-hairline)] bg-[var(--bg-subtle)] text-[var(--text-muted)]"
              title="All questions are answered offline on your device"
            >
              <ShieldCheck
                className="w-3 h-3 text-[var(--accent-positive)]"
                aria-hidden="true"
              />
              100% Local
            </span>
          </div>
        </div>
      )}

      {/* Suggested prompt chips */}
      <div
        role="group"
        aria-label="Suggested vault questions"
        className={
          compact
            ? 'flex flex-wrap items-center gap-1.5'
            : 'flex flex-wrap items-center gap-1.5'
        }
      >
        {SUGGESTED_VAULT_QUERIES.map((prompt) => {
          const isActive = normalizedQuery === prompt.toLowerCase();
          return (
            <button
              key={prompt}
              type="button"
              onClick={() => onQueryChange(prompt)}
              aria-pressed={isActive}
              className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                isActive
                  ? 'border-[var(--accent-primary)] bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]'
                  : 'border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]'
              }`}
            >
              {prompt}
            </button>
          );
        })}
      </div>

      {/* Structured answer card */}
      {hasQuery && (
        <div
          aria-live="polite"
          className={`tactile-well vl-fade-up ${
            compact ? 'p-3 space-y-2.5' : 'p-4 space-y-3.5'
          }`}
        >
          {/* Answer header */}
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="flex flex-wrap items-center gap-2 min-w-0">
              {!answer.matched && (
                <HelpCircle
                  className="w-4 h-4 shrink-0 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
              )}
              <h3
                className={`font-semibold tracking-tight text-[var(--text-primary)] ${
                  compact ? 'text-sm' : 'text-sm sm:text-base'
                }`}
              >
                {answer.headline}
              </h3>
              <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border border-[var(--border-hairline)] bg-[var(--bg-surface)] text-[var(--text-secondary)] whitespace-nowrap">
                {answer.periodLabel}
              </span>
            </div>

            {answer.deltaText && (
              <span
                style={getDeltaPillStyle(answer.deltaTone)}
                className="inline-flex items-center px-2.5 py-0.5 rounded-full text-[11px] font-semibold tabular-nums border whitespace-nowrap"
              >
                {renderPrivacyAwareText(answer.deltaText, privacyMask)}
              </span>
            )}
          </div>

          {/* Primary stat & summary */}
          <div className="space-y-1.5">
            {hasPrimaryStat && (
              <div className="space-y-0.5">
                {answer.primaryLabel && (
                  <div className="text-[11px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                    {answer.primaryLabel}
                  </div>
                )}
                <div className="flex flex-wrap items-baseline gap-2.5">
                  {answer.primaryAmount !== undefined && (
                    <Money
                      amount={answer.primaryAmount}
                      currency={currency}
                      privacyMask={privacyMask}
                      className={
                        compact
                          ? 'text-xl font-bold tracking-tight text-[var(--text-primary)]'
                          : 'text-2xl sm:text-3xl font-bold tracking-tight text-[var(--text-primary)]'
                      }
                    />
                  )}
                  {answer.primaryText && (
                    <span
                      className={`tabular-nums font-bold ${
                        answer.primaryAmount !== undefined
                          ? 'text-sm sm:text-base px-2 py-0.5 rounded-md bg-[var(--accent-primary-soft)] text-[var(--accent-primary-text)]'
                          : compact
                            ? 'text-xl tracking-tight text-[var(--text-primary)]'
                            : 'text-2xl sm:text-3xl tracking-tight text-[var(--text-primary)]'
                      } ${privacyMask && primaryTextHasDigits ? 'privacy-blur' : ''}`}
                    >
                      {answer.primaryText}
                    </span>
                  )}
                </div>
              </div>
            )}

            <p className="text-xs sm:text-sm text-[var(--text-secondary)] leading-relaxed">
              {renderPrivacyAwareText(answer.summary, privacyMask)}
            </p>
          </div>

          {/* Breakdown rows */}
          {answer.rows.length > 0 && (
            <div className="space-y-1.5 pt-0.5">
              {answer.rows.map((row) => {
                const isClickable = Boolean(row.filterCategoryId || row.filterSearch);
                const hasPercent =
                  row.percent !== undefined && Number.isFinite(row.percent);
                const clampedPct = hasPercent
                  ? Math.max(0, Math.min(100, row.percent as number))
                  : 0;
                const barColor =
                  row.amount < 0 ? 'var(--accent-danger)' : 'var(--accent-primary)';

                const rowContent = (
                  <div className="w-full space-y-1.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="text-xs sm:text-sm font-medium text-[var(--text-primary)] truncate">
                          {row.label}
                        </div>
                        {row.sublabel && (
                          <div className="text-[11px] text-[var(--text-muted)] truncate">
                            {renderPrivacyAwareText(row.sublabel, privacyMask)}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {hasPercent && (
                          <span className="text-[11px] font-medium tabular-nums text-[var(--text-muted)]">
                            {(row.percent as number).toFixed(0)}%
                          </span>
                        )}
                        <Money
                          amount={row.amount}
                          currency={currency}
                          privacyMask={privacyMask}
                          className="text-xs sm:text-sm font-semibold text-[var(--text-primary)]"
                        />
                        {isClickable && (
                          <ChevronRight
                            className="w-3.5 h-3.5 text-[var(--text-muted)] group-hover:text-[var(--accent-primary-text)] group-hover:translate-x-0.5 transition-all shrink-0"
                            aria-hidden="true"
                          />
                        )}
                      </div>
                    </div>

                    {hasPercent && (
                      <div
                        className="h-1.5 w-full rounded-full overflow-hidden bg-[var(--bg-inset)]"
                        aria-hidden="true"
                      >
                        <div
                          className="h-full rounded-full transition-all duration-200"
                          style={{
                            width: `${clampedPct}%`,
                            backgroundColor: barColor,
                          }}
                        />
                      </div>
                    )}
                  </div>
                );

                if (isClickable) {
                  return (
                    <button
                      key={row.id}
                      type="button"
                      onClick={() => handleRowDrillDown(row)}
                      className={`group w-full text-left rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] hover:bg-[var(--bg-surface-hover)] hover:border-[var(--border-strong)] transition-colors cursor-pointer ${
                        compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
                      }`}
                    >
                      {rowContent}
                    </button>
                  );
                }

                return (
                  <div
                    key={row.id}
                    className={`w-full rounded-xl border border-[var(--border-hairline)] bg-[var(--bg-surface)] ${
                      compact ? 'px-2.5 py-2' : 'px-3 py-2.5'
                    }`}
                  >
                    {rowContent}
                  </div>
                );
              })}
            </div>
          )}

          {/* Footer CTA */}
          {answer.drillAction && (
            <div className="flex items-center justify-between gap-2 pt-2 border-t border-[var(--border-hairline)]">
              <span className="text-[11px] text-[var(--text-muted)]">
                Computed locally from your vault
              </span>
              <button
                type="button"
                onClick={() => onDrillDown(answer.drillAction!)}
                className="tactile-btn inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold cursor-pointer"
              >
                <span>{answer.drillAction.label}</span>
                <ArrowRight className="w-3.5 h-3.5" aria-hidden="true" />
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  );
};
