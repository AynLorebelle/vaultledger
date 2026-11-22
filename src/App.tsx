import { useEffect } from 'react';
import { CheckCircle2, Info, AlertCircle, X, ShieldCheck } from 'lucide-react';
import { useFinanceStore } from './store/useFinanceStore';
import { Layout } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetsView } from './components/BudgetsView';
import { RecurringView } from './components/RecurringView';
import { GoalsDebtView } from './components/GoalsDebtView';
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
  const theme = useFinanceStore((s) => s.data.settings.theme);
  const activeNav = useFinanceStore((s) => s.activeNav);
  const toast = useFinanceStore((s) => s.toast);

  const initialize = useFinanceStore((s) => s.initialize);
  const clearToast = useFinanceStore((s) => s.clearToast);

  // Initialize local vault on mount
  useEffect(() => {
    void initialize();
  }, [initialize]);

  // Sync Tailwind dark class on <html>
  useEffect(() => {
    const root = document.documentElement;
    if (theme === 'dark') {
      root.classList.add('dark');
    } else {
      root.classList.remove('dark');
    }
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
      <div className="min-h-screen flex flex-col items-center justify-center bg-slate-950 text-slate-200 gap-3">
        <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-emerald-500 flex items-center justify-center shadow-lg shadow-indigo-500/20 animate-pulse">
          <ShieldCheck className="w-6 h-6 text-white" />
        </div>
        <div className="text-sm font-medium tracking-tight text-slate-300">
          Opening local VaultLedger...
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

  return (
    <>
      <Layout>{renderActiveView()}</Layout>

      {/* Global Modals */}
      <QuickAddModal />
      <CommandPalette />
      <ImportExportModal />

      {/* Animated Toast Notification */}
      {toast && (
        <div
          key={toast.id}
          role="status"
          className="no-print fixed bottom-5 right-5 z-50 max-w-sm rounded-xl bg-slate-900 dark:bg-slate-950 text-white border border-slate-700/90 shadow-2xl px-4 py-3 flex items-center gap-3 animate-in fade-in slide-in-from-bottom-2 duration-150"
        >
          {toast.type === 'success' ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <Info className="w-4 h-4 text-indigo-400 shrink-0" />
          )}
          <span className="text-xs font-medium leading-snug">{toast.message}</span>
          <button
            type="button"
            onClick={clearToast}
            className="ml-auto p-0.5 text-slate-400 hover:text-white cursor-pointer shrink-0"
            aria-label="Dismiss notification"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </>
  );
}
