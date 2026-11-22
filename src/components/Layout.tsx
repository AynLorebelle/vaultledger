import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  CalendarClock,
  Target,
  Landmark,
  SlidersHorizontal,
  MonitorDown,
  Undo2,
  Redo2,
  Upload,
  Lock,
  Eye,
  EyeOff,
  Sun,
  Moon,
  Search,
  Plus,
  Menu,
  X,
  ShieldCheck,
  Database,
  Sparkles,
  CheckCircle2,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import type { NavSection, TimeRange } from '../types/finance';

interface LayoutProps {
  children: React.ReactNode;
}

const TIME_RANGES: Array<{ value: TimeRange; label: string }> = [
  { value: 'this_month', label: 'This Month' },
  { value: 'last_30_days', label: '30 Days' },
  { value: 'quarter', label: 'Quarter' },
  { value: 'year', label: 'Year' },
  { value: 'all', label: 'All' },
];

export const Layout: React.FC<LayoutProps> = ({ children }) => {
  const data = useFinanceStore((s) => s.data);
  const activeNav = useFinanceStore((s) => s.activeNav);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const timeRange = useFinanceStore((s) => s.timeRange);
  const setTimeRange = useFinanceStore((s) => s.setTimeRange);
  const storageMode = useFinanceStore((s) => s.storageMode);
  const canUndo = useFinanceStore((s) => s.canUndo);
  const canRedo = useFinanceStore((s) => s.canRedo);
  const undo = useFinanceStore((s) => s.undo);
  const redo = useFinanceStore((s) => s.redo);
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const setCommandPaletteOpen = useFinanceStore((s) => s.setCommandPaletteOpen);
  const openImportExport = useFinanceStore((s) => s.openImportExport);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const togglePrivacyMask = useFinanceStore((s) => s.togglePrivacyMask);
  const lockVault = useFinanceStore((s) => s.lockVault);
  const loadSampleData = useFinanceStore((s) => s.loadSampleData);
  const resetToFreshVault = useFinanceStore((s) => s.resetToFreshVault);

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const unreviewedCount = useMemo(
    () => data.transactions.filter((t) => !t.reviewed).length,
    [data.transactions]
  );

  const isDesktop = storageMode === 'desktop' || Boolean(window.vaultDesktop?.isDesktop);
  const isDark = data.settings.theme === 'dark';
  const privacyMask = data.settings.privacyMask;
  const isDemo = data.settings.isDemoData;
  const hasPasscode = Boolean(data.settings.passcodeHash);

  const navItems: Array<{
    id: NavSection;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
    badge?: number | string;
    badgeTone?: 'amber' | 'indigo' | 'emerald';
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: ArrowLeftRight,
      badge: unreviewedCount > 0 ? unreviewedCount : undefined,
      badgeTone: 'amber',
    },
    { id: 'budgets', label: 'Budgets', icon: PieChart },
    { id: 'recurring', label: 'Recurring', icon: CalendarClock },
    { id: 'goals', label: 'Goals & Debt', icon: Target },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
    {
      id: 'download',
      label: isDesktop ? 'Desktop Vault' : 'Download App',
      icon: MonitorDown,
      badge: isDesktop ? 'Local' : 'Free',
      badgeTone: isDesktop ? 'emerald' : 'indigo',
    },
  ];

  const handleNavClick = (id: NavSection) => {
    setActiveNav(id);
    setMobileMenuOpen(false);
  };

  const handleSampleToggle = () => {
    if (isDemo) {
      if (window.confirm('Switch to a clean empty vault? Your sample data will be replaced with default categories and a fresh checking account.')) {
        resetToFreshVault();
      }
    } else {
      if (window.confirm('Load rich realistic sample data to explore all charts & planners? This replaces current vault data.')) {
        loadSampleData();
      }
    }
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="px-4 h-16 flex items-center justify-between border-b border-slate-200/80 dark:border-slate-800/80 shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          className="flex items-center gap-2.5 text-left group cursor-pointer"
        >
          <div className="w-8 h-8 rounded-xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-sm shadow-indigo-500/20">
            <ShieldCheck className="w-4.5 h-4.5 text-white" />
          </div>
          <div>
            <div className="text-sm font-bold tracking-tight text-slate-900 dark:text-white leading-tight">
              VaultLedger
            </div>
            <div className="text-[10px] font-medium text-slate-400 dark:text-slate-500 leading-tight">
              Offline Finance Studio
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 cursor-pointer"
          aria-label="Close navigation"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-3 py-4 space-y-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-xl text-sm font-medium transition-all cursor-pointer ${
                active
                  ? 'bg-indigo-600/10 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 shadow-[inset_0_0_0_1px_rgba(99,102,241,0.25)]'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 hover:bg-slate-100/80 dark:hover:bg-slate-800/60'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-indigo-600 dark:text-indigo-400' : 'text-slate-400 dark:text-slate-500'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span
                  className={`px-1.5 py-0.5 rounded-md text-[10px] font-semibold tabular-nums shrink-0 ${
                    item.badgeTone === 'amber'
                      ? 'bg-amber-500/15 text-amber-700 dark:text-amber-300'
                      : item.badgeTone === 'emerald'
                      ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300'
                      : 'bg-indigo-500/15 text-indigo-700 dark:text-indigo-300'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Quick Controls */}
      <div className="p-3 border-t border-slate-200/80 dark:border-slate-800/80 space-y-2 shrink-0">
        {/* Sample Data vs Fresh Vault pill */}
        <button
          type="button"
          onClick={handleSampleToggle}
          className={`w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer ${
            isDemo
              ? 'bg-amber-500/10 border-amber-500/25 text-amber-800 dark:text-amber-300 hover:bg-amber-500/15'
              : 'bg-slate-100/80 dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200/70 dark:hover:bg-slate-800'
          }`}
          title={isDemo ? 'Click to switch to a fresh empty vault' : 'Click to load sample demo data'}
        >
          <span className="flex items-center gap-1.5 truncate">
            {isDemo ? (
              <Sparkles className="w-3.5 h-3.5 shrink-0 text-amber-500" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 shrink-0 text-emerald-500" />
            )}
            <span className="truncate">{isDemo ? 'Sample Data Active' : 'Personal Vault'}</span>
          </span>
          <span className="text-[10px] opacity-75 shrink-0">
            {isDemo ? 'Start Fresh' : 'Demo'}
          </span>
        </button>

        {/* Import/Export & Backup */}
        <button
          type="button"
          onClick={() => {
            openImportExport('import');
            setMobileMenuOpen(false);
          }}
          className="w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium text-slate-700 dark:text-slate-200 bg-slate-100/80 dark:bg-slate-800/70 hover:bg-slate-200/70 dark:hover:bg-slate-800 transition-colors cursor-pointer"
        >
          <Upload className="w-3.5 h-3.5 text-indigo-500" />
          <span>Import / Export &amp; Backup</span>
        </button>

        {/* Undo / Redo + Vault Lock row */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 disabled:opacity-35 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" />
            <span>Redo</span>
          </button>
          <button
            type="button"
            onClick={() => {
              if (hasPasscode) {
                lockVault();
              } else {
                handleNavClick('accounts');
              }
            }}
            title={hasPasscode ? 'Lock Vault' : 'Configure Vault Passcode in Accounts & Settings'}
            className={`px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer ${
              hasPasscode
                ? 'border-indigo-500/30 bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 hover:bg-indigo-500/20'
                : 'border-slate-200 dark:border-slate-800 text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
            }`}
          >
            <Lock className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 transition-colors">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex flex-col w-60 shrink-0 border-r border-slate-200 dark:border-slate-800/80 bg-white dark:bg-slate-950/90 sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="no-print fixed inset-0 z-50 lg:hidden bg-slate-950/60 backdrop-blur-sm flex"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <aside className="w-68 max-w-[82vw] h-full bg-white dark:bg-slate-950 border-r border-slate-200 dark:border-slate-800 shadow-2xl">
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 h-16 px-4 lg:px-6 flex items-center justify-between gap-3 bg-white/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden p-2 rounded-xl text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            {/* Offline Status Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/25 text-emerald-700 dark:text-emerald-300 text-[11px] font-medium shrink-0">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <Database className="w-3 h-3" />
              <span>
                {isDesktop ? '100% Offline • Desktop Local Vault' : 'Offline PWA • IndexedDB'}
              </span>
            </div>

            {/* Time Range Pills */}
            {(activeNav === 'dashboard' || activeNav === 'transactions' || activeNav === 'budgets') && (
              <div className="hidden xl:flex items-center p-1 rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200/80 dark:border-slate-800">
                {TIME_RANGES.map((tr) => {
                  const selected = timeRange === tr.value;
                  return (
                    <button
                      key={tr.value}
                      type="button"
                      onClick={() => setTimeRange(tr.value)}
                      className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all cursor-pointer ${
                        selected
                          ? 'bg-white dark:bg-slate-800 text-slate-900 dark:text-white shadow-xs'
                          : 'text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-200'
                      }`}
                    >
                      {tr.label}
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Compact time range select on smaller screens */}
            {(activeNav === 'dashboard' || activeNav === 'transactions' || activeNav === 'budgets') && (
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                aria-label="Time range"
                className="xl:hidden rounded-xl bg-slate-100 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs font-medium text-slate-700 dark:text-slate-200 outline-none"
              >
                {TIME_RANGES.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {tr.label}
                  </option>
                ))}
              </select>
            )}

            {/* Ctrl+K Search */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              className="hidden md:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100/90 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700 transition-colors cursor-pointer"
              title="Command Palette (Ctrl+K)"
            >
              <Search className="w-3.5 h-3.5" />
              <span>Search...</span>
              <kbd className="px-1.5 py-0.5 rounded bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-[10px] font-mono text-slate-500 dark:text-slate-400">
                Ctrl K
              </kbd>
            </button>

            {/* Privacy Mask Toggle */}
            <button
              type="button"
              onClick={togglePrivacyMask}
              title={privacyMask ? 'Show Amounts (Shift+P)' : 'Privacy Blur Mode (Shift+P)'}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                privacyMask
                  ? 'bg-indigo-500/15 border-indigo-500/35 text-indigo-600 dark:text-indigo-300'
                  : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
              aria-label="Toggle privacy mask"
            >
              {privacyMask ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              className="p-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100 transition-colors cursor-pointer"
              aria-label="Toggle color theme"
            >
              {isDark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>

            {/* Primary Add Expense CTA */}
            <button
              type="button"
              onClick={() => openQuickAdd()}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs sm:text-sm font-medium shadow-sm shadow-indigo-600/20 transition-all active:scale-[0.98] cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span className="hidden sm:inline">Add Expense</span>
              <kbd className="hidden sm:inline-block ml-1 px-1.5 py-0.5 rounded bg-indigo-500/60 text-[10px] font-mono text-indigo-100">
                N
              </kbd>
            </button>
          </div>
        </header>

        {/* Main Content Canvas */}
        <main className="flex-1 p-4 lg:p-6 max-w-[1440px] w-full mx-auto">
          {children}
        </main>
      </div>
    </div>
  );
};
