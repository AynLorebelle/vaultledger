import { create } from 'zustand';
import type {
  Account,
  BankImportPreset,
  Category,
  CategoryRule,
  NavSection,
  ParsedImportRow,
  RecurrenceFrequency,
  RecurringBill,
  SavingsGoal,
  TimeRange,
  Transaction,
  VaultData,
  VaultSettings,
} from '../types/finance';
import { hashPasscode, verifyPasscode } from '../core/crypto';
import { applyRulesToTransaction } from '../core/rules';
import { createEmptyVault, createSampleVault } from '../core/seedData';
import { loadStoredVault, saveStoredVault } from '../core/storage';

export type ImportExportTab = 'import' | 'export' | 'backup';

export interface ToastMessage {
  id: string;
  message: string;
  type: 'success' | 'info' | 'error';
}

export type NewTransactionInput = Omit<
  Transaction,
  'id' | 'createdAt' | 'updatedAt' | 'tags' | 'notes' | 'reviewed'
> & {
  tags?: string[];
  notes?: string;
  reviewed?: boolean;
};

export interface FinanceStoreState {
  initialized: boolean;
  locked: boolean;
  storageMode: 'desktop' | 'web';
  lastSavedAt: string | null;
  data: VaultData;
  activeNav: NavSection;
  timeRange: TimeRange;
  selectedCategoryFilter: string | null;
  selectedDateFilter: string | null;
  quickAddOpen: boolean;
  editingTransactionId: string | null;
  commandPaletteOpen: boolean;
  importExportOpen: boolean;
  importExportTab: ImportExportTab;
  canUndo: boolean;
  canRedo: boolean;
  toast: ToastMessage | null;

  initialize: () => Promise<void>;
  setActiveNav: (nav: NavSection) => void;
  setTimeRange: (range: TimeRange) => void;
  drillDownCategory: (categoryId: string | null) => void;
  drillDownDate: (date: string | null) => void;
  openQuickAdd: (editingTransactionId?: string | null) => void;
  closeQuickAdd: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openImportExport: (tab?: ImportExportTab) => void;
  closeImportExport: () => void;
  showToast: (message: string, type?: ToastMessage['type']) => void;
  clearToast: () => void;
  undo: () => void;
  redo: () => void;

  addTransaction: (tx: NewTransactionInput) => Transaction;
  updateTransaction: (
    id: string,
    patch: Partial<Omit<Transaction, 'id' | 'createdAt'>>,
  ) => void;
  deleteTransactions: (ids: string[]) => void;
  bulkUpdateTransactions: (
    ids: string[],
    patch: Partial<Pick<Transaction, 'categoryId' | 'reviewed' | 'accountId' | 'tags'>> & {
      addTags?: string[];
    },
  ) => void;
  importTransactions: (rows: ParsedImportRow[], accountId: string) => number;

  addAccount: (account: Omit<Account, 'id' | 'createdAt'>) => Account;
  updateAccount: (id: string, patch: Partial<Omit<Account, 'id' | 'createdAt'>>) => void;
  deleteAccount: (id: string) => void;

  addCategory: (category: Omit<Category, 'id'>) => Category;
  updateCategory: (id: string, patch: Partial<Omit<Category, 'id'>>) => void;
  deleteCategory: (id: string, reassignToCategoryId?: string) => void;

  addRecurringBill: (bill: Omit<RecurringBill, 'id'>) => RecurringBill;
  updateRecurringBill: (id: string, patch: Partial<Omit<RecurringBill, 'id'>>) => void;
  deleteRecurringBill: (id: string) => void;
  markBillPaidAndLog: (billId: string, paidDate?: string) => Transaction | null;

  addSavingsGoal: (goal: Omit<SavingsGoal, 'id' | 'createdAt'>) => SavingsGoal;
  updateSavingsGoal: (
    id: string,
    patch: Partial<Omit<SavingsGoal, 'id' | 'createdAt'>>,
  ) => void;
  contributeToGoal: (goalId: string, amount: number, fromAccountId?: string) => void;
  deleteSavingsGoal: (id: string) => void;

  addRule: (rule: Omit<CategoryRule, 'id'>) => CategoryRule;
  updateRule: (id: string, patch: Partial<Omit<CategoryRule, 'id'>>) => void;
  deleteRule: (id: string) => void;
  runRulesOnAllTransactions: (onlyUnreviewed?: boolean) => number;

  saveImportPreset: (
    preset: Omit<BankImportPreset, 'id'> & { id?: string },
  ) => BankImportPreset;
  deleteImportPreset: (id: string) => void;

  updateSettings: (patch: Partial<VaultSettings>) => void;
  toggleTheme: () => void;
  togglePrivacyMask: () => void;
  setVaultPasscode: (passcode: string | null) => Promise<void>;
  unlockVault: (passcode: string) => Promise<boolean>;
  lockVault: () => void;
  loadSampleData: () => void;
  resetToFreshVault: () => void;
  replaceVaultData: (vault: VaultData) => void;
  createManualBackup: () => Promise<{ ok: boolean; fileName?: string }>;
}

const MAX_HISTORY = 30;
const SAVE_DEBOUNCE_MS = 350;

let pastStack: VaultData[] = [];
let futureStack: VaultData[] = [];
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let toastTimer: ReturnType<typeof setTimeout> | null = null;

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function todayIso(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function advanceIsoDate(isoDate: string, frequency: RecurrenceFrequency): string {
  const parts = isoDate.split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return todayIso();
  }
  const [y, m, d] = parts;

  let nextUtc: Date;
  if (frequency === 'weekly') {
    nextUtc = new Date(Date.UTC(y, m - 1, d + 7));
  } else if (frequency === 'biweekly') {
    nextUtc = new Date(Date.UTC(y, m - 1, d + 14));
  } else {
    const monthAdd = frequency === 'monthly' ? 1 : frequency === 'quarterly' ? 3 : 12;
    const first = new Date(Date.UTC(y, m - 1 + monthAdd, 1));
    const maxDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    nextUtc = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth(), Math.min(d, maxDay)),
    );
  }

  const ny = nextUtc.getUTCFullYear();
  const nm = String(nextUtc.getUTCMonth() + 1).padStart(2, '0');
  const nd = String(nextUtc.getUTCDate()).padStart(2, '0');
  return `${ny}-${nm}-${nd}`;
}

function detectInitialStorageMode(): 'desktop' | 'web' {
  return typeof window !== 'undefined' && Boolean(window.vaultDesktop?.isDesktop)
    ? 'desktop'
    : 'web';
}

export const useFinanceStore = create<FinanceStoreState>((set, get) => {
  const scheduleSave = (nextData: VaultData): void => {
    if (saveTimer !== null) {
      clearTimeout(saveTimer);
    }
    saveTimer = setTimeout(() => {
      saveTimer = null;
      void saveStoredVault(nextData).then((res) => {
        if (res.ok) {
          set({ lastSavedAt: res.savedAt, storageMode: res.mode });
        }
      });
    }, SAVE_DEBOUNCE_MS);
  };

  const commitData = (
    updater: (prev: VaultData) => VaultData,
    recordHistory: boolean = true,
  ): VaultData => {
    const prev = get().data;
    const updated = updater(prev);
    const stamped: VaultData = {
      ...updated,
      updatedAt: new Date().toISOString(),
    };

    if (recordHistory) {
      pastStack = [...pastStack.slice(-(MAX_HISTORY - 1)), prev];
      futureStack = [];
    }

    set({
      data: stamped,
      canUndo: pastStack.length > 0,
      canRedo: futureStack.length > 0,
    });

    scheduleSave(stamped);
    return stamped;
  };

  return {
    initialized: false,
    locked: false,
    storageMode: detectInitialStorageMode(),
    lastSavedAt: null,
    data: createEmptyVault(),
    activeNav: 'dashboard',
    timeRange: 'this_month',
    selectedCategoryFilter: null,
    selectedDateFilter: null,
    quickAddOpen: false,
    editingTransactionId: null,
    commandPaletteOpen: false,
    importExportOpen: false,
    importExportTab: 'import',
    canUndo: false,
    canRedo: false,
    toast: null,

    initialize: async () => {
      const mode = detectInitialStorageMode();
      const stored = await loadStoredVault();

      pastStack = [];
      futureStack = [];

      if (stored && Array.isArray(stored.accounts) && Array.isArray(stored.categories)) {
        const hasPasscode = Boolean(
          stored.settings?.passcodeHash && stored.settings?.passcodeSalt,
        );
        set({
          initialized: true,
          storageMode: mode,
          data: stored,
          locked: hasPasscode,
          lastSavedAt: stored.updatedAt ?? null,
          canUndo: false,
          canRedo: false,
        });
        return;
      }

      const seeded = createSampleVault();
      const saveRes = await saveStoredVault(seeded);
      set({
        initialized: true,
        storageMode: saveRes.mode,
        data: seeded,
        locked: false,
        lastSavedAt: saveRes.ok ? saveRes.savedAt : seeded.updatedAt,
        canUndo: false,
        canRedo: false,
      });
    },

    setActiveNav: (nav) => set({ activeNav: nav }),

    setTimeRange: (range) => set({ timeRange: range }),

    drillDownCategory: (categoryId) =>
      set((state) => ({
        selectedCategoryFilter: categoryId,
        selectedDateFilter: categoryId ? null : state.selectedDateFilter,
        activeNav: categoryId ? 'transactions' : state.activeNav,
      })),

    drillDownDate: (date) =>
      set((state) => ({
        selectedDateFilter: date,
        selectedCategoryFilter: date ? null : state.selectedCategoryFilter,
        activeNav: date ? 'transactions' : state.activeNav,
      })),

    openQuickAdd: (editingTransactionId = null) =>
      set({
        quickAddOpen: true,
        editingTransactionId: editingTransactionId ?? null,
      }),

    closeQuickAdd: () =>
      set({
        quickAddOpen: false,
        editingTransactionId: null,
      }),

    setCommandPaletteOpen: (open) => set({ commandPaletteOpen: open }),

    openImportExport: (tab = 'import') =>
      set({
        importExportOpen: true,
        importExportTab: tab,
      }),

    closeImportExport: () => set({ importExportOpen: false }),

    showToast: (message, type = 'info') => {
      if (toastTimer !== null) {
        clearTimeout(toastTimer);
      }
      const id = generateId('toast');
      set({ toast: { id, message, type } });
      toastTimer = setTimeout(() => {
        if (get().toast?.id === id) {
          set({ toast: null });
        }
      }, 3600);
    },

    clearToast: () => {
      if (toastTimer !== null) {
        clearTimeout(toastTimer);
        toastTimer = null;
      }
      set({ toast: null });
    },

    undo: () => {
      if (pastStack.length === 0) {
        return;
      }
      const current = get().data;
      const previous = pastStack[pastStack.length - 1];
      pastStack = pastStack.slice(0, -1);
      futureStack = [current, ...futureStack].slice(0, MAX_HISTORY);

      set({
        data: previous,
        canUndo: pastStack.length > 0,
        canRedo: futureStack.length > 0,
      });
      scheduleSave(previous);
      get().showToast('Undid last change', 'info');
    },

    redo: () => {
      if (futureStack.length === 0) {
        return;
      }
      const current = get().data;
      const next = futureStack[0];
      futureStack = futureStack.slice(1);
      pastStack = [...pastStack, current].slice(-MAX_HISTORY);

      set({
        data: next,
        canUndo: pastStack.length > 0,
        canRedo: futureStack.length > 0,
      });
      scheduleSave(next);
      get().showToast('Redid change', 'info');
    },

    addTransaction: (input) => {
      const now = new Date().toISOString();
      const rules = get().data.rules;
      let payee = input.payee.trim();
      let categoryId = input.categoryId;
      let tags = [...(input.tags ?? [])];
      let reviewed = input.reviewed ?? true;

      const isUncategorized =
        !categoryId || categoryId === 'cat_uncategorized' || categoryId === 'uncategorized';

      if (input.type !== 'transfer' && isUncategorized && rules.length > 0) {
        const applied = applyRulesToTransaction(
          {
            payee,
            notes: input.notes ?? '',
            amount: Math.abs(input.amount),
            categoryId: categoryId || 'cat_uncategorized',
            tags,
            reviewed,
          },
          rules,
        );
        payee = applied.payee;
        categoryId = applied.categoryId ?? (categoryId || 'cat_uncategorized');
        tags = applied.tags;
        if (applied.reviewed !== undefined) {
          reviewed = applied.reviewed;
        }
      }

      const created: Transaction = {
        id: generateId('tx'),
        date: input.date,
        type: input.type,
        amount: roundMoney(Math.abs(input.amount)),
        accountId: input.accountId,
        transferAccountId: input.transferAccountId,
        payee,
        categoryId: categoryId || 'cat_uncategorized',
        splits: input.splits,
        tags,
        notes: input.notes ?? '',
        reviewed,
        recurringId: input.recurringId,
        receipt: input.receipt,
        importHash: input.importHash,
        createdAt: now,
        updatedAt: now,
      };

      commitData((prev) => ({
        ...prev,
        transactions: [created, ...prev.transactions],
      }));

      return created;
    },

    updateTransaction: (id, patch) => {
      const now = new Date().toISOString();
      commitData((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) => {
          if (tx.id !== id) {
            return tx;
          }
          return {
            ...tx,
            ...patch,
            amount:
              patch.amount !== undefined ? roundMoney(Math.abs(patch.amount)) : tx.amount,
            updatedAt: now,
          };
        }),
      }));
    },

    deleteTransactions: (ids) => {
      if (ids.length === 0) {
        return;
      }
      const idSet = new Set(ids);
      commitData((prev) => ({
        ...prev,
        transactions: prev.transactions.filter((tx) => !idSet.has(tx.id)),
      }));
    },

    bulkUpdateTransactions: (ids, patch) => {
      if (ids.length === 0) {
        return;
      }
      const idSet = new Set(ids);
      const now = new Date().toISOString();
      commitData((prev) => ({
        ...prev,
        transactions: prev.transactions.map((tx) => {
          if (!idSet.has(tx.id)) {
            return tx;
          }
          let nextTags = patch.tags !== undefined ? [...patch.tags] : [...tx.tags];
          if (patch.addTags && patch.addTags.length > 0) {
            const setTags = new Set(nextTags);
            for (const tag of patch.addTags) {
              const clean = tag.trim();
              if (clean) {
                setTags.add(clean);
              }
            }
            nextTags = Array.from(setTags);
          }
          return {
            ...tx,
            categoryId: patch.categoryId ?? tx.categoryId,
            reviewed: patch.reviewed ?? tx.reviewed,
            accountId: patch.accountId ?? tx.accountId,
            tags: nextTags,
            updatedAt: now,
          };
        }),
      }));
    },

    importTransactions: (rows, accountId) => {
      const selectedRows = rows.filter((r) => r.selected);
      if (selectedRows.length === 0) {
        return 0;
      }
      const now = new Date().toISOString();
      const created: Transaction[] = selectedRows.map((row) => ({
        id: generateId('tx'),
        date: row.date,
        type: row.type,
        amount: roundMoney(Math.abs(row.amount)),
        accountId,
        payee: row.payee,
        categoryId: row.categoryId || 'cat_uncategorized',
        tags: [...row.tags],
        notes: row.notes,
        reviewed: false,
        importHash: row.importHash,
        createdAt: now,
        updatedAt: now,
      }));

      commitData((prev) => ({
        ...prev,
        transactions: [...created, ...prev.transactions],
      }));

      return created.length;
    },

    addAccount: (account) => {
      const created: Account = {
        ...account,
        id: generateId('acc'),
        openingBalance: roundMoney(account.openingBalance),
        createdAt: new Date().toISOString(),
      };
      commitData((prev) => ({
        ...prev,
        accounts: [...prev.accounts, created],
      }));
      return created;
    },

    updateAccount: (id, patch) => {
      commitData((prev) => ({
        ...prev,
        accounts: prev.accounts.map((acc) =>
          acc.id === id
            ? {
                ...acc,
                ...patch,
                openingBalance:
                  patch.openingBalance !== undefined
                    ? roundMoney(patch.openingBalance)
                    : acc.openingBalance,
              }
            : acc,
        ),
      }));
    },

    deleteAccount: (id) => {
      commitData((prev) => ({
        ...prev,
        accounts: prev.accounts.filter((acc) => acc.id !== id),
      }));
    },

    addCategory: (category) => {
      const created: Category = {
        ...category,
        id: generateId('cat'),
        monthlyBudget: roundMoney(Math.max(0, category.monthlyBudget)),
      };
      commitData((prev) => ({
        ...prev,
        categories: [...prev.categories, created],
      }));
      return created;
    },

    updateCategory: (id, patch) => {
      commitData((prev) => ({
        ...prev,
        categories: prev.categories.map((cat) =>
          cat.id === id
            ? {
                ...cat,
                ...patch,
                monthlyBudget:
                  patch.monthlyBudget !== undefined
                    ? roundMoney(Math.max(0, patch.monthlyBudget))
                    : cat.monthlyBudget,
              }
            : cat,
        ),
      }));
    },

    deleteCategory: (id, reassignToCategoryId = 'cat_uncategorized') => {
      commitData((prev) => ({
        ...prev,
        categories: prev.categories.filter((cat) => cat.id !== id),
        transactions: prev.transactions.map((tx) => ({
          ...tx,
          categoryId: tx.categoryId === id ? reassignToCategoryId : tx.categoryId,
          splits: tx.splits?.map((s) =>
            s.categoryId === id ? { ...s, categoryId: reassignToCategoryId } : s,
          ),
        })),
        recurringBills: prev.recurringBills.map((b) =>
          b.categoryId === id ? { ...b, categoryId: reassignToCategoryId } : b,
        ),
      }));
    },

    addRecurringBill: (bill) => {
      const created: RecurringBill = {
        ...bill,
        id: generateId('bill'),
        amount: roundMoney(Math.abs(bill.amount)),
      };
      commitData((prev) => ({
        ...prev,
        recurringBills: [...prev.recurringBills, created],
      }));
      return created;
    },

    updateRecurringBill: (id, patch) => {
      commitData((prev) => ({
        ...prev,
        recurringBills: prev.recurringBills.map((b) =>
          b.id === id
            ? {
                ...b,
                ...patch,
                amount:
                  patch.amount !== undefined
                    ? roundMoney(Math.abs(patch.amount))
                    : b.amount,
              }
            : b,
        ),
      }));
    },

    deleteRecurringBill: (id) => {
      commitData((prev) => ({
        ...prev,
        recurringBills: prev.recurringBills.filter((b) => b.id !== id),
      }));
    },

    markBillPaidAndLog: (billId, paidDate) => {
      const bill = get().data.recurringBills.find((b) => b.id === billId);
      if (!bill) {
        return null;
      }

      const dateStr = paidDate ?? todayIso();
      const now = new Date().toISOString();
      const nextDue = advanceIsoDate(bill.nextDueDate, bill.frequency);

      const loggedTx: Transaction = {
        id: generateId('tx'),
        date: dateStr,
        type: bill.type,
        amount: roundMoney(Math.abs(bill.amount)),
        accountId: bill.accountId,
        payee: bill.payee || bill.name,
        categoryId: bill.categoryId,
        tags: bill.isSubscription ? ['subscription'] : ['recurring'],
        notes: bill.notes ?? `Logged from recurring bill: ${bill.name}`,
        reviewed: true,
        recurringId: bill.id,
        createdAt: now,
        updatedAt: now,
      };

      commitData((prev) => ({
        ...prev,
        transactions: [loggedTx, ...prev.transactions],
        recurringBills: prev.recurringBills.map((b) =>
          b.id === billId
            ? {
                ...b,
                lastPaidDate: dateStr,
                nextDueDate: nextDue,
              }
            : b,
        ),
      }));

      return loggedTx;
    },

    addSavingsGoal: (goal) => {
      const created: SavingsGoal = {
        ...goal,
        id: generateId('goal'),
        targetAmount: roundMoney(Math.max(0, goal.targetAmount)),
        currentAmount: roundMoney(Math.max(0, goal.currentAmount)),
        monthlyContribution: roundMoney(Math.max(0, goal.monthlyContribution)),
        createdAt: new Date().toISOString(),
      };
      commitData((prev) => ({
        ...prev,
        savingsGoals: [...prev.savingsGoals, created],
      }));
      return created;
    },

    updateSavingsGoal: (id, patch) => {
      commitData((prev) => ({
        ...prev,
        savingsGoals: prev.savingsGoals.map((g) =>
          g.id === id
            ? {
                ...g,
                ...patch,
                targetAmount:
                  patch.targetAmount !== undefined
                    ? roundMoney(Math.max(0, patch.targetAmount))
                    : g.targetAmount,
                currentAmount:
                  patch.currentAmount !== undefined
                    ? roundMoney(Math.max(0, patch.currentAmount))
                    : g.currentAmount,
                monthlyContribution:
                  patch.monthlyContribution !== undefined
                    ? roundMoney(Math.max(0, patch.monthlyContribution))
                    : g.monthlyContribution,
              }
            : g,
        ),
      }));
    },

    contributeToGoal: (goalId, amount, fromAccountId) => {
      const cleanAmount = roundMoney(Math.abs(amount));
      if (cleanAmount <= 0) {
        return;
      }

      const goal = get().data.savingsGoals.find((g) => g.id === goalId);
      if (!goal) {
        return;
      }

      const now = new Date().toISOString();
      const shouldLogTransfer = Boolean(
        fromAccountId && goal.linkedAccountId && fromAccountId !== goal.linkedAccountId,
      );

      commitData((prev) => {
        const nextGoals = prev.savingsGoals.map((g) =>
          g.id === goalId
            ? { ...g, currentAmount: roundMoney(g.currentAmount + cleanAmount) }
            : g,
        );

        if (!shouldLogTransfer || !fromAccountId || !goal.linkedAccountId) {
          return { ...prev, savingsGoals: nextGoals };
        }

        const transferTx: Transaction = {
          id: generateId('tx'),
          date: todayIso(),
          type: 'transfer',
          amount: cleanAmount,
          accountId: fromAccountId,
          transferAccountId: goal.linkedAccountId,
          payee: `Goal Contribution: ${goal.name}`,
          categoryId: 'cat_emergency',
          tags: ['goal'],
          notes: `Contribution toward ${goal.name}`,
          reviewed: true,
          createdAt: now,
          updatedAt: now,
        };

        return {
          ...prev,
          savingsGoals: nextGoals,
          transactions: [transferTx, ...prev.transactions],
        };
      });
    },

    deleteSavingsGoal: (id) => {
      commitData((prev) => ({
        ...prev,
        savingsGoals: prev.savingsGoals.filter((g) => g.id !== id),
      }));
    },

    addRule: (rule) => {
      const created: CategoryRule = {
        ...rule,
        id: generateId('rule'),
      };
      commitData((prev) => ({
        ...prev,
        rules: [...prev.rules, created],
      }));
      return created;
    },

    updateRule: (id, patch) => {
      commitData((prev) => ({
        ...prev,
        rules: prev.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
      }));
    },

    deleteRule: (id) => {
      commitData((prev) => ({
        ...prev,
        rules: prev.rules.filter((r) => r.id !== id),
      }));
    },

    runRulesOnAllTransactions: (onlyUnreviewed = false) => {
      const { rules, transactions } = get().data;
      if (rules.length === 0) {
        return 0;
      }

      const now = new Date().toISOString();
      let updatedCount = 0;

      const nextTransactions = transactions.map((tx) => {
        if (tx.type === 'transfer') {
          return tx;
        }
        if (onlyUnreviewed && tx.reviewed) {
          return tx;
        }
        const res = applyRulesToTransaction(
          {
            payee: tx.payee,
            notes: tx.notes,
            amount: tx.amount,
            categoryId: tx.categoryId,
            tags: tx.tags,
            reviewed: tx.reviewed,
          },
          rules,
        );
        if (!res.matchedRuleId) {
          return tx;
        }

        const nextCategoryId = res.categoryId ?? tx.categoryId;
        const nextReviewed = res.reviewed ?? tx.reviewed;
        const tagsChanged =
          res.tags.length !== tx.tags.length ||
          res.tags.some((t, idx) => t !== tx.tags[idx]);

        const changed =
          res.payee !== tx.payee ||
          nextCategoryId !== tx.categoryId ||
          nextReviewed !== tx.reviewed ||
          tagsChanged;

        if (!changed) {
          return tx;
        }

        updatedCount += 1;
        return {
          ...tx,
          payee: res.payee,
          categoryId: nextCategoryId,
          tags: res.tags,
          reviewed: nextReviewed,
          updatedAt: now,
        };
      });

      if (updatedCount > 0) {
        commitData((prev) => ({
          ...prev,
          transactions: nextTransactions,
        }));
      }

      return updatedCount;
    },

    saveImportPreset: (preset) => {
      const existing = preset.id
        ? get().data.importPresets.find((p) => p.id === preset.id)
        : undefined;

      const saved: BankImportPreset = {
        ...preset,
        id: existing ? existing.id : generateId('preset'),
      };

      commitData((prev) => ({
        ...prev,
        importPresets: existing
          ? prev.importPresets.map((p) => (p.id === saved.id ? saved : p))
          : [...prev.importPresets, saved],
      }));

      return saved;
    },

    deleteImportPreset: (id) => {
      commitData((prev) => ({
        ...prev,
        importPresets: prev.importPresets.filter((p) => p.id !== id),
      }));
    },

    updateSettings: (patch) => {
      commitData((prev) => ({
        ...prev,
        settings: {
          ...prev.settings,
          ...patch,
        },
      }));
    },

    toggleTheme: () => {
      commitData(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            theme: prev.settings.theme === 'dark' ? 'light' : 'dark',
          },
        }),
        false,
      );
    },

    togglePrivacyMask: () => {
      commitData(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            privacyMask: !prev.settings.privacyMask,
          },
        }),
        false,
      );
    },

    setVaultPasscode: async (passcode) => {
      if (!passcode) {
        commitData(
          (prev) => ({
            ...prev,
            settings: {
              ...prev.settings,
              passcodeHash: null,
              passcodeSalt: null,
            },
          }),
          false,
        );
        set({ locked: false });
        return;
      }

      const { hash, salt } = await hashPasscode(passcode);
      commitData(
        (prev) => ({
          ...prev,
          settings: {
            ...prev.settings,
            passcodeHash: hash,
            passcodeSalt: salt,
          },
        }),
        false,
      );
    },

    unlockVault: async (passcode) => {
      const { passcodeHash, passcodeSalt } = get().data.settings;
      if (!passcodeHash || !passcodeSalt) {
        set({ locked: false });
        return true;
      }
      const ok = await verifyPasscode(passcode, passcodeHash, passcodeSalt);
      if (ok) {
        set({ locked: false });
      }
      return ok;
    },

    lockVault: () => {
      const { passcodeHash, passcodeSalt } = get().data.settings;
      if (passcodeHash && passcodeSalt) {
        set({ locked: true });
      }
    },

    loadSampleData: () => {
      const sample = createSampleVault();
      commitData(() => sample);
      set({
        selectedCategoryFilter: null,
        selectedDateFilter: null,
      });
    },

    resetToFreshVault: () => {
      const fresh = createEmptyVault();
      commitData(() => fresh);
      set({
        selectedCategoryFilter: null,
        selectedDateFilter: null,
      });
    },

    replaceVaultData: (vault) => {
      commitData(() => vault);
      set({
        selectedCategoryFilter: null,
        selectedDateFilter: null,
      });
    },

    createManualBackup: async () => {
      const current = get().data;
      const nowIso = new Date().toISOString();

      if (typeof window !== 'undefined' && window.vaultDesktop?.isDesktop) {
        try {
          const res = await window.vaultDesktop.createBackupSnapshot(current);
          if (res.ok) {
            commitData(
              (prev) => ({
                ...prev,
                settings: { ...prev.settings, lastBackupAt: nowIso },
              }),
              false,
            );
          }
          return res;
        } catch {
          return { ok: false };
        }
      }

      const fileName = `vaultledger-backup-${todayIso()}.json`;
      commitData(
        (prev) => ({
          ...prev,
          settings: { ...prev.settings, lastBackupAt: nowIso },
        }),
        false,
      );
      return { ok: true, fileName };
    },
  };
});
