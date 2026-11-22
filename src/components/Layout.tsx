import React, { useMemo, useState } from 'react';
import {
  LayoutDashboard,
  ArrowLeftRight,
  PieChart,
  CalendarClock,
  Target,
  Users,
  LineChart,
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
  MessageSquareText,
  Plus,
  Menu,
  X,
  ShieldCheck,
  Database,
  Sparkles,
  CheckCircle2,
  Bot,
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
    badgeTone?: 'warning' | 'primary' | 'positive';
  }> = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    {
      id: 'squad',
      label: 'Friend Squads',
      icon: Users,
      badge: 'Co-Op',
      badgeTone: 'positive',
    },
    {
      id: 'coach',
      label: 'Groq AI Coach',
      icon: Bot,
      badge: 'Groq',
      badgeTone: 'primary',
    },
    {
      id: 'transactions',
      label: 'Transactions',
      icon: ArrowLeftRight,
      badge: unreviewedCount > 0 ? unreviewedCount : undefined,
      badgeTone: 'warning',
    },
    { id: 'budgets', label: 'Budgets', icon: PieChart },
    { id: 'recurring', label: 'Recurring', icon: CalendarClock },
    { id: 'goals', label: 'Goals & Debt', icon: Target },
    { id: 'forecast', label: 'Forecast Lab', icon: LineChart },
    { id: 'accounts', label: 'Accounts', icon: Landmark },
    { id: 'rules', label: 'Rules', icon: SlidersHorizontal },
    {
      id: 'download',
      label: isDesktop ? 'Desktop Vault' : 'Download App',
      icon: MonitorDown,
      badge: isDesktop ? 'Local' : 'Free',
      badgeTone: isDesktop ? 'positive' : 'primary',
    },
  ];

  const handleNavClick = (id: NavSection) => {
    setActiveNav(id);
    setMobileMenuOpen(false);
  };

  const handleSampleToggle = () => {
    if (isDemo) {
      if (
        window.confirm(
          'Switch to a clean empty vault? Your sample data will be replaced with default categories and a fresh checking account.'
        )
      ) {
        resetToFreshVault();
      }
    } else {
      if (
        window.confirm(
          'Load rich realistic sample data to explore all charts & planners? This replaces current vault data.'
        )
      ) {
        loadSampleData();
      }
    }
  };

  const getBadgeStyle = (
    tone: 'warning' | 'primary' | 'positive' | undefined,
    active: boolean
  ): React.CSSProperties => {
    if (active) {
      return {
        backgroundColor: '#FFFFFF',
        color: '#1F2937',
        border: '1px solid rgba(31, 41, 55, 0.12)',
      };
    }
    if (tone === 'warning') {
      return isDark
        ? {
            backgroundColor: '#78350F',
            color: '#FEF3C7',
            border: '1px solid #B45309',
          }
        : {
            backgroundColor: '#FEF3C7',
            color: '#92400E',
            border: '1px solid #F59E0B',
          };
    }
    if (tone === 'positive') {
      return {
        backgroundColor: 'var(--accent-positive-soft)',
        color: 'var(--accent-positive)',
      };
    }
    return {
      backgroundColor: 'var(--accent-primary-soft)',
      color: 'var(--accent-primary-text)',
    };
  };

  const renderSidebarContent = () => (
    <div className="flex flex-col h-full">
      {/* Brand Header */}
      <div className="px-4 h-16 flex items-center justify-between border-b-2 border-white/65 dark:border-white/15 shrink-0">
        <button
          type="button"
          onClick={() => handleNavClick('dashboard')}
          aria-label="Go to AYNLYTICS Dashboard"
          className="flex items-center gap-2.5 text-left group cursor-pointer rounded-xl"
        >
          <div
            className="w-9 h-9 rounded-2xl flex items-center justify-center shrink-0 border-[3px] border-white/75"
            style={{
              backgroundColor: 'var(--clay-peach)',
              boxShadow: 'var(--clay-shadow-sm)',
            }}
          >
            <ShieldCheck className="w-4.5 h-4.5 text-[#1F2937]" aria-hidden="true" />
          </div>
          <div>
            <div className="text-sm font-extrabold tracking-tight text-[var(--text-primary)] leading-tight">
              AYNLYTICS
            </div>
            <div className="text-[10px] font-bold text-[var(--text-muted)] leading-tight">
              Clay Finance &amp; Friend Squads
            </div>
          </div>
        </button>

        <button
          type="button"
          onClick={() => setMobileMenuOpen(false)}
          className="lg:hidden p-1.5 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
          aria-label="Close navigation menu"
        >
          <X className="w-4 h-4" aria-hidden="true" />
        </button>
      </div>

      {/* Navigation */}
      <nav aria-label="Primary navigation" className="flex-1 overflow-y-auto px-3 py-4 space-y-1.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = activeNav === item.id;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNavClick(item.id)}
              aria-current={active ? 'page' : undefined}
              className={`w-full flex items-center justify-between gap-2.5 px-3 py-2 rounded-2xl text-sm transition-all cursor-pointer ${
                active
                  ? 'bg-[var(--clay-peach)] text-[#1F2937] font-extrabold border-[3px] border-white/75 shadow-[var(--clay-shadow-sm)]'
                  : 'bg-transparent font-semibold text-[var(--text-secondary)] border-[3px] border-transparent hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)]'
              }`}
            >
              <span className="flex items-center gap-2.5 truncate">
                <Icon
                  className={`w-4 h-4 shrink-0 ${
                    active ? 'text-[#1F2937]' : 'text-[var(--text-muted)]'
                  }`}
                />
                <span className="truncate">{item.label}</span>
              </span>
              {item.badge !== undefined && (
                <span
                  style={getBadgeStyle(item.badgeTone, active)}
                  className="px-1.5 py-0.5 rounded-lg text-[10px] font-extrabold tabular-nums shrink-0"
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Bottom Quick Controls */}
      <div className="p-3 border-t border-[var(--border-hairline)] space-y-2 shrink-0">
        {/* Sample Data vs Personal Vault pill */}
        <button
          type="button"
          onClick={handleSampleToggle}
          className="w-full flex items-center justify-between gap-2 px-3 py-2 rounded-xl text-xs font-medium border transition-colors cursor-pointer"
          style={
            isDemo
              ? {
                  backgroundColor: 'var(--accent-warning-soft)',
                  borderColor: 'transparent',
                  color: 'var(--accent-warning)',
                }
              : {
                  backgroundColor: 'var(--bg-subtle)',
                  borderColor: 'var(--border-hairline)',
                  color: 'var(--text-secondary)',
                }
          }
          title={
            isDemo
              ? 'Click to switch to a fresh empty vault'
              : 'Click to load sample demo data'
          }
          aria-label={
            isDemo
              ? 'Sample data active. Switch to a fresh empty vault'
              : 'Personal vault active. Load sample demo data'
          }
        >
          <span className="flex items-center gap-1.5 truncate">
            {isDemo ? (
              <Sparkles className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
            ) : (
              <CheckCircle2
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--accent-positive)' }}
                aria-hidden="true"
              />
            )}
            <span className="truncate">
              {isDemo ? 'Sample Data Active' : 'Personal Vault'}
            </span>
          </span>
          <span className="text-[10px] font-semibold opacity-80 shrink-0">
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
          aria-label="Open Import, Export and Encrypted Backup"
          className="tactile-btn w-full flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-medium cursor-pointer"
        >
          <Upload
            className="w-3.5 h-3.5 shrink-0"
            style={{ color: 'var(--accent-primary-text)' }}
            aria-hidden="true"
          />
          <span className="truncate">Import / Export &amp; Backup</span>
        </button>

        {/* Undo / Redo + Vault Lock row */}
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={undo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo last change"
            className="tactile-btn flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Undo2 className="w-3.5 h-3.5" aria-hidden="true" />
            <span>Undo</span>
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={!canRedo}
            title="Redo (Ctrl+Shift+Z)"
            aria-label="Redo last change"
            className="tactile-btn flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-xs font-medium disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
          >
            <Redo2 className="w-3.5 h-3.5" aria-hidden="true" />
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
            title={
              hasPasscode
                ? 'Lock Vault'
                : 'Configure Vault Passcode in Accounts & Settings'
            }
            aria-label={
              hasPasscode
                ? 'Lock Vault'
                : 'Configure Vault Passcode in Accounts and Settings'
            }
            className="px-2.5 py-1.5 rounded-lg border transition-colors cursor-pointer"
            style={
              hasPasscode
                ? {
                    backgroundColor: 'var(--accent-primary-soft)',
                    borderColor: 'var(--accent-primary)',
                    color: 'var(--accent-primary-text)',
                  }
                : {
                    backgroundColor: 'var(--bg-surface)',
                    borderColor: 'var(--border-hairline)',
                    color: 'var(--text-secondary)',
                    boxShadow: 'var(--shadow-btn)',
                  }
            }
          >
            <Lock className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen flex bg-[var(--bg-canvas)] text-[var(--text-primary)] transition-colors">
      {/* Desktop Left Sidebar */}
      <aside className="no-print hidden lg:flex flex-col w-60 shrink-0 border-r-4 border-white/65 dark:border-white/15 bg-[var(--bg-surface)] shadow-[var(--clay-shadow-sm)] sticky top-0 h-screen">
        {renderSidebarContent()}
      </aside>

      {/* Mobile Drawer Overlay */}
      {mobileMenuOpen && (
        <div
          className="no-print fixed inset-0 z-50 lg:hidden bg-black/50 backdrop-blur-[2px] flex"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setMobileMenuOpen(false);
          }}
        >
          <aside
            aria-label="Mobile navigation"
            className="w-68 max-w-[82vw] h-full bg-[var(--bg-surface)] border-r-4 border-white/65 dark:border-white/20"
            style={{ boxShadow: 'var(--shadow-elevated)' }}
          >
            {renderSidebarContent()}
          </aside>
        </div>
      )}

      {/* Main Column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Top Bar */}
        <header className="no-print sticky top-0 z-30 h-16 px-4 lg:px-6 flex items-center justify-between gap-3 bg-[var(--bg-surface)] border-b-4 border-white/65 dark:border-white/15 shadow-[var(--clay-shadow-sm)]">
          <div className="flex items-center gap-2.5 min-w-0">
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="lg:hidden tactile-btn p-2 rounded-xl cursor-pointer"
              aria-label="Open navigation menu"
            >
              <Menu className="w-4.5 h-4.5" aria-hidden="true" />
            </button>

            {/* Offline Status Badge */}
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-[11px] font-medium shrink-0">
              <span
                className="w-1.5 h-1.5 rounded-full shrink-0"
                style={{ backgroundColor: 'var(--accent-positive)' }}
                aria-hidden="true"
              />
              <Database
                className="w-3 h-3 shrink-0"
                style={{ color: 'var(--accent-positive)' }}
                aria-hidden="true"
              />
              <span>
                {isDesktop
                  ? '100% Offline • Desktop Local Vault'
                  : 'Offline PWA • IndexedDB'}
              </span>
            </div>

            {/* Tactile Segmented Time Range Control */}
            {(activeNav === 'dashboard' ||
              activeNav === 'transactions' ||
              activeNav === 'budgets') && (
              <div
                role="group"
                aria-label="Time range"
                className="hidden xl:inline-flex items-center p-1 tactile-well gap-0.5"
              >
                {TIME_RANGES.map((tr) => {
                  const selected = timeRange === tr.value;
                  return (
                    <button
                      key={tr.value}
                      type="button"
                      onClick={() => setTimeRange(tr.value)}
                      aria-pressed={selected}
                      className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                        selected
                          ? 'bg-[var(--bg-surface)] text-[var(--text-primary)] border border-[var(--border-hairline)]'
                          : 'text-[var(--text-muted)] hover:text-[var(--text-primary)] border border-transparent'
                      }`}
                      style={selected ? { boxShadow: 'var(--shadow-btn)' } : undefined}
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
            {(activeNav === 'dashboard' ||
              activeNav === 'transactions' ||
              activeNav === 'budgets') && (
              <select
                value={timeRange}
                onChange={(e) => setTimeRange(e.target.value as TimeRange)}
                aria-label="Time range"
                className="xl:hidden tactile-input px-2.5 py-1.5 text-xs font-medium cursor-pointer"
              >
                {TIME_RANGES.map((tr) => (
                  <option key={tr.value} value={tr.value}>
                    {tr.label}
                  </option>
                ))}
              </select>
            )}

            {/* Tactile Ask Vault / Command Palette Pill */}
            <button
              type="button"
              onClick={() => setCommandPaletteOpen(true)}
              aria-label="Ask Vault or search commands (Ctrl+K)"
              title="Ask Vault & Command Palette (Ctrl+K)"
              className="tactile-btn inline-flex items-center gap-2 px-2.5 sm:px-3 py-1.5 rounded-xl text-xs font-medium cursor-pointer"
            >
              <MessageSquareText
                className="w-3.5 h-3.5 shrink-0"
                style={{ color: 'var(--accent-primary-text)' }}
                aria-hidden="true"
              />
              <span className="hidden sm:inline text-[var(--text-secondary)]">
                Ask Vault
              </span>
              <kbd className="hidden md:inline-block px-1.5 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[10px] font-mono text-[var(--text-muted)]">
                Ctrl K
              </kbd>
            </button>

            {/* Privacy Mask Toggle */}
            <button
              type="button"
              onClick={togglePrivacyMask}
              title={
                privacyMask
                  ? 'Show Amounts (Shift+P)'
                  : 'Privacy Blur Mode (Shift+P)'
              }
              aria-label={
                privacyMask ? 'Disable privacy mask' : 'Enable privacy mask'
              }
              aria-pressed={privacyMask}
              className={`p-2 rounded-xl border transition-colors cursor-pointer ${
                privacyMask ? '' : 'tactile-btn'
              }`}
              style={
                privacyMask
                  ? {
                      backgroundColor: 'var(--accent-primary-soft)',
                      borderColor: 'var(--accent-primary)',
                      color: 'var(--accent-primary-text)',
                    }
                  : undefined
              }
            >
              {privacyMask ? (
                <EyeOff className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Eye className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {/* Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
              aria-label={
                isDark ? 'Switch to light mode' : 'Switch to dark mode'
              }
              className="tactile-btn p-2 rounded-xl cursor-pointer"
            >
              {isDark ? (
                <Sun className="w-4 h-4" aria-hidden="true" />
              ) : (
                <Moon className="w-4 h-4" aria-hidden="true" />
              )}
            </button>

            {/* Primary Add Expense CTA */}
            <button
              type="button"
              onClick={() => openQuickAdd()}
              aria-label="Add Expense (Shortcut N)"
              className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-extrabold text-[#1F2937] border-[3px] border-white/75 cursor-pointer"
            >
              <Plus className="w-4 h-4 text-[#1F2937]" aria-hidden="true" />
              <span className="hidden sm:inline text-[#1F2937]">Add Expense</span>
              <kbd className="hidden sm:inline-block ml-0.5 px-1.5 py-0.5 rounded bg-white/70 text-[10px] font-mono font-bold text-[#1F2937]">
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
