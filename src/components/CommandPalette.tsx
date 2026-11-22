import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Search,
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  CalendarClock,
  Target,
  LineChart,
  Landmark,
  SlidersHorizontal,
  MonitorDown,
  Plus,
  Upload,
  ShieldCheck,
  Eye,
  Sun,
  Moon,
  Undo2,
  Redo2,
  CornerDownLeft,
  Tag,
  MessageSquareText,
  X,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { isLikelyVaultQuestion } from '../core/askVault';
import type { VaultAnswerDrillAction } from '../types/finance';
import { AskVaultPanel } from './AskVaultPanel';
import { formatMoney } from './ui';

type PaletteMode = 'all' | 'ask';

interface PaletteItem {
  id: string;
  group: 'Actions' | 'Navigation' | 'Categories' | 'Accounts' | 'Transactions';
  title: string;
  subtitle?: string;
  keywords: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: string;
  onSelect: () => void;
}

export const CommandPalette: React.FC = () => {
  const open = useFinanceStore((s) => s.commandPaletteOpen);
  const setOpen = useFinanceStore((s) => s.setCommandPaletteOpen);
  const data = useFinanceStore((s) => s.data);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const drillDownCategory = useFinanceStore((s) => s.drillDownCategory);
  const drillDownDate = useFinanceStore((s) => s.drillDownDate);
  const drillDownSearch = useFinanceStore((s) => s.drillDownSearch);
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const openImportExport = useFinanceStore((s) => s.openImportExport);
  const togglePrivacyMask = useFinanceStore((s) => s.togglePrivacyMask);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const canUndo = useFinanceStore((s) => s.canUndo);
  const canRedo = useFinanceStore((s) => s.canRedo);
  const undo = useFinanceStore((s) => s.undo);
  const redo = useFinanceStore((s) => s.redo);

  const [mode, setMode] = useState<PaletteMode>('all');
  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const isDark = data.settings.theme === 'dark';

  const likelyQuestion = useMemo(() => isLikelyVaultQuestion(query), [query]);
  const showAskVault = mode === 'ask' || likelyQuestion;

  useEffect(() => {
    if (open) {
      setMode('all');
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const handleDrillDown = useCallback(
    (action: VaultAnswerDrillAction) => {
      if (action.categoryId) {
        drillDownCategory(action.categoryId);
      } else if (action.searchQuery) {
        drillDownSearch(action.searchQuery);
      } else if (action.date) {
        drillDownDate(action.date);
      } else {
        setActiveNav(action.nav);
      }
      setOpen(false);
    },
    [drillDownCategory, drillDownSearch, drillDownDate, setActiveNav, setOpen]
  );

  const handleModeChange = (nextMode: PaletteMode) => {
    setMode(nextMode);
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  const handleClearQuery = () => {
    setQuery('');
    setSelectedIndex(0);
    inputRef.current?.focus();
  };

  const allItems = useMemo<PaletteItem[]>(() => {
    const closeAnd = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };

    const actions: PaletteItem[] = [
      {
        id: 'act-ask-vault',
        group: 'Actions',
        title: 'Ask Your Vault (Offline Q&A)',
        subtitle: 'Instant local answers on spending, merchants, subscriptions & safe-to-spend',
        keywords: 'ask vault question query nlp ai chat spending compare',
        icon: MessageSquareText,
        badge: 'Local',
        onSelect: () => {
          setMode('ask');
          inputRef.current?.focus();
        },
      },
      {
        id: 'act-add',
        group: 'Actions',
        title: 'Add New Expense / Transaction',
        subtitle: 'Open Quick Add modal with natural language input',
        keywords: 'add expense income transfer refund new transaction',
        icon: Plus,
        badge: 'N',
        onSelect: closeAnd(() => openQuickAdd()),
      },
      {
        id: 'act-import',
        group: 'Actions',
        title: 'Import Bank CSV / OFX / QFX',
        subtitle: 'Map columns, auto-categorize, and skip duplicates',
        keywords: 'import csv ofx qfx bank upload statement',
        icon: Upload,
        onSelect: closeAnd(() => openImportExport('import')),
      },
      {
        id: 'act-backup',
        group: 'Actions',
        title: 'Encrypted Vault Backup (.vledger)',
        subtitle: 'AES-256-GCM encrypted export or restore',
        keywords: 'backup encrypt vledger export restore security',
        icon: ShieldCheck,
        onSelect: closeAnd(() => openImportExport('backup')),
      },
      {
        id: 'act-privacy',
        group: 'Actions',
        title: privacyMask ? 'Disable Privacy Blur Mode' : 'Enable Privacy Blur Mode',
        subtitle: 'Blur all dollar amounts on screen',
        keywords: 'privacy mask blur hide amounts',
        icon: Eye,
        badge: 'Shift+P',
        onSelect: closeAnd(() => togglePrivacyMask()),
      },
      {
        id: 'act-theme',
        group: 'Actions',
        title: isDark ? 'Switch to Paper Light Mode' : 'Switch to Obsidian Dark Mode',
        subtitle: 'Toggle application appearance',
        keywords: 'theme dark light mode appearance color',
        icon: isDark ? Sun : Moon,
        onSelect: closeAnd(() => toggleTheme()),
      },
    ];

    if (canUndo) {
      actions.push({
        id: 'act-undo',
        group: 'Actions',
        title: 'Undo Last Change',
        keywords: 'undo revert',
        icon: Undo2,
        badge: 'Ctrl+Z',
        onSelect: closeAnd(() => undo()),
      });
    }
    if (canRedo) {
      actions.push({
        id: 'act-redo',
        group: 'Actions',
        title: 'Redo Change',
        keywords: 'redo',
        icon: Redo2,
        badge: 'Ctrl+Shift+Z',
        onSelect: closeAnd(() => redo()),
      });
    }

    const nav: PaletteItem[] = [
      {
        id: 'nav-dashboard',
        group: 'Navigation',
        title: 'Dashboard',
        subtitle: 'Cashflow Sankey, KPIs, Heatmap & Trends',
        keywords: 'dashboard home overview sankey kpi',
        icon: LayoutDashboard,
        onSelect: closeAnd(() => setActiveNav('dashboard')),
      },
      {
        id: 'nav-transactions',
        group: 'Navigation',
        title: 'Transactions & Inbox',
        subtitle: 'Search, review, bulk edit, and filter ledger',
        keywords: 'transactions ledger inbox review history',
        icon: ArrowLeftRight,
        onSelect: closeAnd(() => setActiveNav('transactions')),
      },
      {
        id: 'nav-budgets',
        group: 'Navigation',
        title: 'Budgets & What-If Simulator',
        subtitle: 'Monthly limits, envelope rollover, and savings simulator',
        keywords: 'budgets envelopes rollover simulator limits',
        icon: PieChart,
        onSelect: closeAnd(() => setActiveNav('budgets')),
      },
      {
        id: 'nav-recurring',
        group: 'Navigation',
        title: 'Recurring Bills & Calendar',
        subtitle: 'Subscriptions, upcoming due dates & bill calendar',
        keywords: 'recurring bills subscriptions calendar paydays',
        icon: CalendarClock,
        onSelect: closeAnd(() => setActiveNav('recurring')),
      },
      {
        id: 'nav-goals',
        group: 'Navigation',
        title: 'Goals & Debt Payoff Planner',
        subtitle: 'Savings goals + Snowball vs. Avalanche debt simulator',
        keywords: 'goals savings debt payoff snowball avalanche',
        icon: Target,
        onSelect: closeAnd(() => setActiveNav('goals')),
      },
      {
        id: 'nav-forecast',
        group: 'Navigation',
        title: 'Go to Forecast Lab',
        subtitle: '12-month & 5-year net worth trajectory & what-if milestones',
        keywords: 'forecast lab net worth projection trajectory what-if milestones future',
        icon: LineChart,
        onSelect: closeAnd(() => setActiveNav('forecast')),
      },
      {
        id: 'nav-accounts',
        group: 'Navigation',
        title: 'Accounts & Vault Settings',
        subtitle: 'Balances, credit utilization, currency & passcode lock',
        keywords: 'accounts checking credit cards settings currency lock',
        icon: Landmark,
        onSelect: closeAnd(() => setActiveNav('accounts')),
      },
      {
        id: 'nav-rules',
        group: 'Navigation',
        title: 'Auto-Categorization Rules',
        subtitle: 'Automate payees, categories, and tags',
        keywords: 'rules automation auto categorize',
        icon: SlidersHorizontal,
        onSelect: closeAnd(() => setActiveNav('rules')),
      },
      {
        id: 'nav-download',
        group: 'Navigation',
        title: 'Download Desktop App',
        subtitle: 'Windows (.exe), macOS (.dmg), Linux (.AppImage)',
        keywords: 'download desktop electron offline app windows mac linux',
        icon: MonitorDown,
        onSelect: closeAnd(() => setActiveNav('download')),
      },
    ];

    const categories: PaletteItem[] = data.categories.map((c) => ({
      id: `cat-${c.id}`,
      group: 'Categories',
      title: c.name,
      subtitle: `Filter transactions in ${c.group} category`,
      keywords: `${c.name} ${c.group} category`,
      icon: Tag,
      onSelect: closeAnd(() => drillDownCategory(c.id)),
    }));

    const accounts: PaletteItem[] = data.accounts.map((a) => ({
      id: `acc-${a.id}`,
      group: 'Accounts',
      title: a.name,
      subtitle: `${a.type} · ${a.institution ?? a.currency}`,
      keywords: `${a.name} ${a.type} ${a.institution ?? ''} account`,
      icon: Landmark,
      onSelect: closeAnd(() => setActiveNav('accounts')),
    }));

    return [...actions, ...nav, ...categories, ...accounts];
  }, [
    data.categories,
    data.accounts,
    privacyMask,
    isDark,
    canUndo,
    canRedo,
    setOpen,
    openQuickAdd,
    openImportExport,
    togglePrivacyMask,
    toggleTheme,
    undo,
    redo,
    setActiveNav,
    drillDownCategory,
  ]);

  const filteredItems = useMemo(() => {
    if (mode === 'ask') {
      return [];
    }
    const q = query.trim().toLowerCase();
    if (!q) {
      return allItems.filter((item) => item.group === 'Actions' || item.group === 'Navigation');
    }

    const matches = allItems.filter(
      (item) =>
        item.title.toLowerCase().includes(q) ||
        item.subtitle?.toLowerCase().includes(q) ||
        item.keywords.toLowerCase().includes(q)
    );

    const txMatches: PaletteItem[] = data.transactions
      .filter(
        (tx) =>
          tx.payee.toLowerCase().includes(q) ||
          tx.notes.toLowerCase().includes(q) ||
          tx.tags.some((t) => t.toLowerCase().includes(q)) ||
          String(tx.amount).includes(q)
      )
      .slice(0, 6)
      .map((tx) => ({
        id: `tx-${tx.id}`,
        group: 'Transactions',
        title: tx.payee,
        subtitle: `${tx.date} · ${tx.type}${tx.notes ? ` · ${tx.notes}` : ''}`,
        keywords: tx.payee,
        icon: ArrowLeftRight,
        badge: privacyMask ? '••••' : formatMoney(tx.amount, currency),
        onSelect: () => {
          setOpen(false);
          openQuickAdd(tx.id);
        },
      }));

    return [...matches.slice(0, 10), ...txMatches];
  }, [mode, query, allItems, data.transactions, currency, privacyMask, setOpen, openQuickAdd]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query, mode]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
        return;
      }

      if (mode !== 'all' || filteredItems.length === 0) {
        return;
      }

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => Math.min(filteredItems.length - 1, i + 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => Math.max(0, i - 1));
      } else if (e.key === 'Enter' && filteredItems[selectedIndex]) {
        e.preventDefault();
        filteredItems[selectedIndex].onSelect();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, mode, filteredItems, selectedIndex, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[8vh] sm:pt-[10vh] px-4 bg-black/50 backdrop-blur-[2px]"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Command Palette and Ask Vault"
        className="tactile-card-elevated vl-fade-up w-full max-w-2xl overflow-hidden flex flex-col max-h-[82vh]"
      >
        {/* Top Search & Mode Header */}
        <div className="p-3.5 sm:p-4 border-b border-[var(--border-hairline)] space-y-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="tactile-input flex-1 flex items-center gap-2.5 px-3 py-2 transition-colors focus-within:border-[var(--focus-ring)] focus-within:outline-2 focus-within:outline-[var(--focus-ring)] focus-within:outline-offset-2">
              {mode === 'ask' || likelyQuestion ? (
                <MessageSquareText
                  className="w-4 h-4 shrink-0"
                  style={{ color: 'var(--accent-primary-text)' }}
                  aria-hidden="true"
                />
              ) : (
                <Search
                  className="w-4 h-4 shrink-0 text-[var(--text-muted)]"
                  aria-hidden="true"
                />
              )}
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  mode === 'ask'
                    ? 'Ask your vault: e.g. How much did I spend on dining this month?'
                    : 'Jump to view, search transactions, or ask your vault...'
                }
                aria-label={
                  mode === 'ask'
                    ? 'Ask your vault a question'
                    : 'Search commands, transactions, or ask your vault'
                }
                autoFocus
                className="flex-1 min-w-0 bg-transparent text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:outline-none"
              />
              {query.length > 0 && (
                <button
                  type="button"
                  onClick={handleClearQuery}
                  aria-label="Clear search query"
                  className="p-1 rounded-md text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
                >
                  <X className="w-3.5 h-3.5" aria-hidden="true" />
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close command palette"
              className="tactile-btn p-2 rounded-xl text-[var(--text-muted)] hover:text-[var(--text-primary)] cursor-pointer shrink-0"
            >
              <X className="w-4 h-4" aria-hidden="true" />
            </button>
          </div>

          {/* Compact Tactile Mode Switch */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div
              role="group"
              aria-label="Palette mode"
              className="tactile-well p-0.5 inline-flex items-center gap-0.5"
            >
              <button
                type="button"
                onClick={() => handleModeChange('all')}
                aria-pressed={mode === 'all'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'all'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
                style={mode === 'all' ? { boxShadow: 'var(--shadow-btn)' } : undefined}
              >
                <Search className="w-3 h-3" aria-hidden="true" />
                <span>All &amp; Commands</span>
              </button>
              <button
                type="button"
                onClick={() => handleModeChange('ask')}
                aria-pressed={mode === 'ask'}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                  mode === 'ask'
                    ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                    : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                }`}
                style={mode === 'ask' ? { boxShadow: 'var(--shadow-btn)' } : undefined}
              >
                <MessageSquareText
                  className="w-3 h-3"
                  style={
                    mode === 'ask'
                      ? { color: 'var(--accent-primary-text)' }
                      : undefined
                  }
                  aria-hidden="true"
                />
                <span>Ask Vault</span>
              </button>
            </div>

            <span className="text-[11px] text-[var(--text-muted)] hidden sm:inline">
              {mode === 'ask'
                ? '100% local Q&A — tap a prompt or type any spending question'
                : 'Tip: type a question directly to query your vault'}
            </span>
          </div>
        </div>

        {/* Scrollable Results & Ask Vault Area */}
        <div className="overflow-y-auto flex-1">
          {showAskVault && (
            <div
              className={`p-3.5 sm:p-4 ${
                mode === 'all' && filteredItems.length > 0
                  ? 'border-b border-[var(--border-hairline)]'
                  : ''
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                  Ask Vault · Instant Offline Answer
                </span>
                {mode === 'all' && (
                  <button
                    type="button"
                    onClick={() => handleModeChange('ask')}
                    className="text-[11px] font-semibold cursor-pointer hover:underline"
                    style={{ color: 'var(--accent-primary-text)' }}
                  >
                    Open Ask Vault view
                  </button>
                )}
              </div>
              <AskVaultPanel
                vault={data}
                privacyMask={privacyMask}
                query={query}
                onQueryChange={setQuery}
                onDrillDown={handleDrillDown}
                compact
                hideInput
              />
            </div>
          )}

          {mode === 'all' && (
            <div className="py-2">
              {filteredItems.length === 0 ? (
                !showAskVault && (
                  <div className="py-10 px-4 text-center space-y-2">
                    <div className="text-xs font-medium text-[var(--text-muted)]">
                      No matching commands, categories, or transactions.
                    </div>
                    <button
                      type="button"
                      onClick={() => handleModeChange('ask')}
                      className="tactile-btn inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold cursor-pointer"
                      style={{ color: 'var(--accent-primary-text)' }}
                    >
                      <MessageSquareText className="w-3.5 h-3.5" aria-hidden="true" />
                      <span>Ask Vault about &ldquo;{query.trim()}&rdquo;</span>
                    </button>
                  </div>
                )
              ) : (
                filteredItems.map((item, idx) => {
                  const Icon = item.icon;
                  const prevGroup = idx > 0 ? filteredItems[idx - 1].group : null;
                  const showHeader = item.group !== prevGroup;
                  const selected = idx === selectedIndex;

                  return (
                    <React.Fragment key={item.id}>
                      {showHeader && (
                        <div className="px-4 pt-2.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)]">
                          {item.group}
                        </div>
                      )}
                      <button
                        type="button"
                        onMouseEnter={() => setSelectedIndex(idx)}
                        onClick={item.onSelect}
                        className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                          selected
                            ? ''
                            : 'text-[var(--text-primary)] hover:bg-[var(--bg-surface-hover)]'
                        }`}
                        style={
                          selected
                            ? {
                                backgroundColor: 'var(--accent-primary-soft)',
                                color: 'var(--accent-primary-text)',
                              }
                            : undefined
                        }
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <Icon
                            className={`w-4 h-4 shrink-0 ${
                              selected ? '' : 'text-[var(--text-muted)]'
                            }`}
                          />
                          <div className="min-w-0">
                            <div
                              className={`text-sm font-medium truncate ${
                                selected ? '' : 'text-[var(--text-primary)]'
                              }`}
                            >
                              {item.title}
                            </div>
                            {item.subtitle && (
                              <div className="text-[11px] text-[var(--text-muted)] truncate">
                                {item.subtitle}
                              </div>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-2 shrink-0">
                          {item.badge && (
                            <span className="px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[11px] font-mono tabular-nums text-[var(--text-secondary)]">
                              {item.badge}
                            </span>
                          )}
                          {selected && (
                            <CornerDownLeft
                              className="w-3.5 h-3.5 shrink-0"
                              aria-hidden="true"
                            />
                          )}
                        </div>
                      </button>
                    </React.Fragment>
                  );
                })
              )}
            </div>
          )}
        </div>

        {/* Keyboard Navigation Footer */}
        <div className="px-4 py-2 border-t border-[var(--border-hairline)] bg-[var(--bg-subtle)]/60 flex items-center justify-between gap-3 text-[11px] text-[var(--text-muted)] shrink-0">
          <div className="flex items-center gap-3">
            {mode === 'all' && (
              <>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-secondary)]">
                    ↑↓
                  </kbd>
                  <span>Navigate</span>
                </span>
                <span className="inline-flex items-center gap-1">
                  <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-secondary)]">
                    ↵
                  </kbd>
                  <span>Select</span>
                </span>
              </>
            )}
            <span className="inline-flex items-center gap-1">
              <kbd className="px-1 py-0.5 rounded bg-[var(--bg-surface)] border border-[var(--border-hairline)] font-mono text-[10px] text-[var(--text-secondary)]">
                ESC
              </kbd>
              <span>Close</span>
            </span>
          </div>
          <span className="font-medium text-[var(--text-secondary)]">VaultLedger</span>
        </div>
      </div>
    </div>
  );
};
