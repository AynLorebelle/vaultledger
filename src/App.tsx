import { useEffect } from 'react';
import { ShieldCheck } from 'lucide-react';
import { Toaster } from 'sonner';
import { motion } from 'motion/react';
import { useFinanceStore } from './store/useFinanceStore';
import { Layout } from './components/Layout';
import { DashboardView } from './components/DashboardView';
import { TransactionsView } from './components/TransactionsView';
import { BudgetsView } from './components/BudgetsView';
import { RecurringView } from './components/RecurringView';
import { GoalsDebtView } from './components/GoalsDebtView';
import { SavingsSquadView } from './components/SavingsSquadView';
import { AiCoachView, FloatingAiCoachWidget } from './components/AiCoachView';
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

  const initialize = useFinanceStore((s) => s.initialize);
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

    const themeColor = isDark ? '#231E36' : '#F0E6FA';
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
            className="w-12 h-12 rounded-2xl flex items-center justify-center animate-pulse border-[3px] border-white/75"
            style={{
              backgroundColor: 'var(--clay-peach)',
              boxShadow: 'var(--shadow-btn)',
            }}
          >
            <ShieldCheck className="w-6 h-6 text-[#1F2937]" aria-hidden="true" />
          </div>
          <div className="space-y-0.5">
            <div className="text-sm font-extrabold tracking-tight text-[var(--text-primary)]">
              Opening AYNLYTICS 2.0…
            </div>
            <div className="text-xs text-[var(--text-muted)]">
              Loading your 3D Clay Finance &amp; Friend Savings Studio
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
      case 'squad':
        return <SavingsSquadView />;
      case 'coach':
        return <AiCoachView />;
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

  return (
    <>
      <Layout>
        <motion.div
          key={activeNav}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
        >
          {renderActiveView()}
        </motion.div>
      </Layout>

      {/* Global Modals */}
      <QuickAddModal />
      <CommandPalette />
      <ImportExportModal />

      {/* Floating Groq AI Financial Coach Launcher */}
      <FloatingAiCoachWidget />

      {/* Sonner Global Toaster */}
      <Toaster position="bottom-right" richColors closeButton />
    </>
  );
}
