import { useEffect } from 'react';
import { CheckCircle2, Info, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { useFinanceStore } from './store/useFinanceStore';
import { Layout } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetsView } from './components/BudgetsView';
import { RecurringView } from './components/RecurringView';
import { GoalsDebtView } from './components/GoalsDebtView';
import { NetWorthForecaster } from './components/NetWorthForecaster';
import { AccountsView } from './components/AccountsView';
import { RulesView } from './components/RulesView';
import { DownloadDesktopView } from './components/DownloadDesktopView';
import { QuickAddModal } from './components/QuickAddModal';
import { CommandPalette } from './components/CommandPalette';
import { ImportExportModal } from './components/ImportExportModal';
import { VaultLockScreen } from './components/VaultLockScreen';

function isTypingElement(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  const tag = target.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    tag === 'SELECT' ||
    target.isContentEditable
  );
}

export default function App() {
  const initialized = useFinanceStore((s) => s.initialized);
  const locked = useFinanceStore((s) => s.locked);
  const data = useFinanceStore((s) => s.data);
  const theme = data.settings.theme;
  const activeNav = useFinanceStore((s) => s.activeNav);
  const toast = useFinanceStore((s) => s.toast);

  const initialize = useFinanceStore((s) => s.initialize);
  const clearToast = useFinanceStore((s) => s.clearToast);
  const addForecastMilestone = useFinanceStore((s) => s.addForecastMilestone);
  const toggleForecastMilestone = useFinanceStore((s) => s.toggleForecastMilestone);
  const deleteForecastMilestone = useFinanceStore((s) => s.deleteForecastMilestone);

  // Initialize local vault on mount
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Sync Tailwind dark class on <html> and <meta name="theme-color"> in <head>
  useEffect(() => {
    const root = document.documentElement;
    const isDark = theme === 'dark';
    if (isDark) {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }

    const themeColor = isDark ? '#111315' : '#F6F5F1';
    let metaTheme = document.head.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!metaTheme) {
      metaTheme = document.createElement('meta');
      metaTheme.name = 'theme-color';
      document.head.appendChild(metaTheme);
    }
    metaTheme.content = themeColor;
  }, [theme]);

  // Global keyboard shortcuts
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const state = useFinanceStore.getState();
      if (state.locked) return;

      const metaOrCtrl = e.ctrlKey || e.metaKey;
      const key = e.key.toLowerCase();

      // Ctrl+K / Cmd+K -> toggle Command Palette
      if (metaOrCtrl && key === 'k') {
        e.preventDefault();
        state.setCommandPaletteOpen(!state.commandPaletteOpen);
        return;
      }

      // Escape -> close open modals
      if (e.key === 'Escape') {
        if (state.commandPaletteOpen) {
          state.setCommandPaletteOpen(false);
        } else if (state.quickAddOpen) {
          state.closeQuickAdd();
        } else if (state.importExportOpen) {
          state.closeImportExport();
        }
        return;
      }

      // Ignore single-key / history shortcuts while typing in form inputs
      if (isTypingElement(e.target)) return;

      // Ctrl+Z / Ctrl+Shift+Z -> Undo / Redo
      if (metaOrCtrl && key === 'z') {
        e.preventDefault();
        if (e.shiftKey) {
          state.redo();
        } else {
          state.undo();
        }
        return;
      }

      // Shift+P -> toggle Privacy Mask
      if (e.shiftKey && !metaOrCtrl && !e.altKey && key === 'p') {
        e.preventDefault();
        state.togglePrivacyMask();
        return;
      }

      // N -> open Quick Add Expense modal (when no modal is already open)
      if (!metaOrCtrl && !e.shiftKey && !e.altKey && key === 'n') {
        if (!state.quickAddOpen && !state.commandPaletteOpen && !state.importExportOpen) {
          e.preventDefault();
          state.openQuickAdd();
        }
      }
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  if (!initialized) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-[var(--bg-canvas)] text-[var(--text-primary)]">
        <div
          role="status"
          aria-live="polite"
          className="tactile-card-elevated vl-fade-up px-7 py-6 flex flex-col items-center gap-3 text-center max-w-xs w-full"
        >
          <div
            className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse"
            style={{
              backgroundColor: 'var(--accent-primary)',
              boxShadow: 'var(--shadow-btn)',
            }}
          >
            <ShieldCheck className="w-6 h-6 text-white" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <div className="text-sm font-semibold tracking-tight text-[var(--text-primary)]">
              Opening local VaultLedger…
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Loading encrypted offline ledger
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (locked) {
    return <VaultLockScreen />;
  }

  const renderActiveView = () => {
    switch (activeNav) {
      case 'dashboard':
        return <DashboardView />;
      case 'transactions':
        return <TransactionsView />;
      case 'budgets':
        return <BudgetsView />;
      case 'recurring':
        return <RecurringView />;
      case 'goals':
        return <GoalsDebtView />;
      case 'forecast':
        return (
          <NetWorthForecaster
            vault={data}
            isDark={theme === 'dark'}
            privacyMask={data.settings.privacyMask}
            onAddMilestone={addForecastMilestone}
            onToggleMilestone={toggleForecastMilestone}
            onDeleteMilestone={deleteForecastMilestone}
          />
        );
      case 'accounts':
        return <AccountsView />;
      case 'rules':
        return <RulesView />;
      case 'download':
        return <DownloadDesktopView />;
      default:
        return <DashboardView />;
    }
  };

  const toastAccentColor =
    toast?.type === 'success'
      ? 'var(--accent-positive)'
      : toast?.type === 'error'
      ? 'var(--accent-danger)'
      : 'var(--accent-info)';

  const toastAccentSoft =
    toast?.type === 'success'
      ? 'var(--accent-positive-soft)'
      : toast?.type === 'error'
      ? 'var(--accent-danger-soft)'
      : 'var(--accent-info-soft)';

  return (
    <>
      <Layout>{renderActiveView()}</Layout>

      {/* Global Modals */}
      <QuickAddModal />
      <CommandPalette />
      <ImportExportModal />

      {/* Tactile Toast Notification */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          aria-live="polite"
          className="no-print fixed bottom-5 right-5 z-50 max-w-md tactile-card-elevated vl-fade-up px-3.5 py-2.5 flex items-center gap-3"
          style={{
            borderLeftWidth: '3px',
            borderLeftColor: toastAccentColor,
          }}
        >
          <span
            className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
            style={{
              backgroundColor: toastAccentSoft,
              color: toastAccentColor,
            }}
            aria-hidden="true"
          >
            {toast.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4" />
            ) : toast.type === 'error' ? (
              <AlertCircle className="w-4 h-4" />
            ) : (
              <Info className="w-4 h-4" />
            )}
          </span>

          <span className="text-xs sm:text-[13px] font-medium leading-snug text-[var(--text-primary)]">
            {toast.message}
          </span>

          {toast.action && (
            <button
              type="button"
              onClick={() => {
                const actionFn = toast.action?.onClick;
                clearToast();
                actionFn?.();
              }}
              className="tactile-btn ml-1 px-2.5 py-1 rounded-lg text-xs font-semibold shrink-0 cursor-pointer"
              style={{ color: 'var(--accent-primary-text)' }}
            >
              {toast.action.label}
            </button>
          )}

          <button
            type="button"
            onClick={clearToast}
            className="ml-auto p-1 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" aria-hidden="true" />
          </button>
        </div>
      )}
    </>
  );
}
