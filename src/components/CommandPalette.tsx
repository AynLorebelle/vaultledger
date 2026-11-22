import React, { useEffect, useMemo, useState } from 'react';
import {
  Search,
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  CalendarClock,
  Target,
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
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { formatMoney } from './ui';

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
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const openImportExport = useFinanceStore((s) => s.openImportExport);
  const togglePrivacyMask = useFinanceStore((s) => s.togglePrivacyMask);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const canUndo = useFinanceStore((s) => s.canUndo);
  const canRedo = useFinanceStore((s) => s.canRedo);
  const undo = useFinanceStore((s) => s.undo);
  const redo = useFinanceStore((s) => s.redo);

  const [query, setQuery] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const isDark = data.settings.theme === 'dark';

  useEffect(() => {
    if (open) {
      setQuery('');
      setSelectedIndex(0);
    }
  }, [open]);

  const allItems = useMemo<PaletteItem[]>(() => {
    const closeAnd = (fn: () => void) => () => {
      setOpen(false);
      fn();
    };

    const actions: PaletteItem[] = [
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
  }, [query, allItems, data.transactions, currency, privacyMask, setOpen, openQuickAdd]);

  useEffect(() => {
    setSelectedIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        setOpen(false);
      } else if (e.key === 'ArrowDown') {
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
  }, [open, filteredItems, selectedIndex, setOpen]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh] px-4 bg-slate-950/65 backdrop-blur-sm"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) setOpen(false);
      }}
    >
      <div className="w-full max-w-xl rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-2xl overflow-hidden">
        <div className="flex items-center gap-3 px-4 py-3.5 border-b border-slate-200/80 dark:border-slate-800">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to view, run action, or search transactions..."
            autoFocus
            className="flex-1 bg-transparent text-sm text-slate-900 dark:text-slate-100 placeholder-slate-400 outline-none"
          />
          <kbd className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-400">
            ESC
          </kbd>
        </div>

        <div className="max-h-[58vh] overflow-y-auto py-2">
          {filteredItems.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-400">
              No matching commands, categories, or transactions.
            </div>
          ) : (
            filteredItems.map((item, idx) => {
              const Icon = item.icon;
              const prevGroup = idx > 0 ? filteredItems[idx - 1].group : null;
              const showHeader = item.group !== prevGroup;
              const selected = idx === selectedIndex;

              return (
                <React.Fragment key={item.id}>
                  {showHeader && (
                    <div className="px-4 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-400 dark:text-slate-500">
                      {item.group}
                    </div>
                  )}
                  <button
                    type="button"
                    onMouseEnter={() => setSelectedIndex(idx)}
                    onClick={item.onSelect}
                    className={`w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left transition-colors cursor-pointer ${
                      selected
                        ? 'bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-200'
                        : 'text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800/50'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <Icon
                        className={`w-4 h-4 shrink-0 ${
                          selected ? 'text-indigo-500' : 'text-slate-400'
                        }`}
                      />
                      <div className="min-w-0">
                        <div className="text-sm font-medium truncate">{item.title}</div>
                        {item.subtitle && (
                          <div className="text-[11px] text-slate-400 dark:text-slate-500 truncate">
                            {item.subtitle}
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {item.badge && (
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[11px] font-mono tabular-nums text-slate-500 dark:text-slate-400">
                          {item.badge}
                        </span>
                      )}
                      {selected && <CornerDownLeft className="w-3.5 h-3.5 text-indigo-500" />}
                    </div>
                  </button>
                </React.Fragment>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};
