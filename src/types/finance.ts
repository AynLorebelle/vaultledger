// Shared domain types & interfaces for VaultLedger (Offline-First Personal Finance & Expense Tracker)

export type CurrencyCode = 'USD' | 'EUR' | 'GBP' | 'PHP' | 'JPY' | 'CAD' | 'AUD' | 'SGD';

export type AccountType = 'checking' | 'savings' | 'cash' | 'credit' | 'investment' | 'loan';

export type TransactionType = 'expense' | 'income' | 'transfer' | 'refund';

export type CategoryGroup = 'needs' | 'wants' | 'savings' | 'income';

export type RecurrenceFrequency = 'weekly' | 'biweekly' | 'monthly' | 'quarterly' | 'yearly';

export type NavSection =
  | 'dashboard'
  | 'transactions'
  | 'budgets'
  | 'recurring'
  | 'goals'
  | 'squad'
  | 'coach'
  | 'forecast'
  | 'accounts'
  | 'rules'
  | 'download';

export type TimeRange = 'this_month' | 'last_30_days' | 'quarter' | 'year' | 'all';

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  currency: CurrencyCode;
  openingBalance: number; // positive for assets; positive owed amount or negative for liabilities (convention: credit/loan store negative balance when owed, or we track signed balance cleanly: checking +2500, credit -420, loan -5000)
  creditLimit?: number; // for credit cards
  apr?: number; // annual percentage rate for credit cards / loans (e.g. 19.99)
  minPayment?: number; // minimum monthly payment for debt payoff planner
  institution?: string;
  color: string;
  archived?: boolean;
  createdAt: string;
}

export interface Category {
  id: string;
  name: string;
  group: CategoryGroup;
  icon: string; // lucide icon name or emoji
  color: string;
  monthlyBudget: number; // 0 = no budget limit set
  rolloverEnabled: boolean; // envelope rollover toggle
  isDefault?: boolean;
}

export interface TransactionSplit {
  id: string;
  categoryId: string;
  amount: number; // always positive magnitude; inherits parent sign/type
  note?: string;
}

export interface ReceiptAttachment {
  id: string;
  name: string;
  mimeType: string;
  sizeBytes: number;
  /** In Electron: relative filename in userData/receipts; in Web: compressed data URL */
  storageRef: string;
  addedAt: string;
}

export interface Transaction {
  id: string;
  date: string; // ISO YYYY-MM-DD
  type: TransactionType;
  amount: number; // always positive magnitude; direction determined by type
  accountId: string;
  transferAccountId?: string; // only when type === 'transfer'
  payee: string;
  categoryId: string; // primary category (for refunds, offsets that expense category!)
  splits?: TransactionSplit[]; // optional split across multiple categories
  tags: string[];
  notes: string;
  reviewed: boolean; // false = sits in "Inbox Zero" review queue
  recurringId?: string;
  receipt?: ReceiptAttachment;
  importHash?: string; // deduplication fingerprint
  createdAt: string;
  updatedAt: string;
}

export interface RecurringBill {
  id: string;
  name: string;
  payee: string;
  amount: number;
  type: 'expense' | 'income';
  categoryId: string;
  accountId: string;
  frequency: RecurrenceFrequency;
  nextDueDate: string; // ISO YYYY-MM-DD
  isSubscription: boolean;
  autoPay: boolean;
  notes?: string;
  lastPaidDate?: string;
  active: boolean;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmount: number;
  currentAmount: number;
  targetDate: string; // ISO YYYY-MM-DD
  linkedAccountId?: string;
  color: string;
  icon: string;
  monthlyContribution: number;
  createdAt: string;
}

export interface CategoryRule {
  id: string;
  name: string;
  enabled: boolean;
  matchField: 'payee' | 'notes' | 'any';
  matchType: 'contains' | 'startsWith' | 'equals' | 'regex';
  pattern: string;
  minAmount?: number;
  maxAmount?: number;
  renamePayeeTo?: string;
  assignCategoryId?: string;
  addTags?: string[];
  markReviewed?: boolean;
  priority: number;
}

export interface BankImportPreset {
  id: string;
  name: string;
  delimiter: ',' | ';' | '\t';
  skipRows: number;
  dateColumn: number;
  payeeColumn: number;
  amountColumn: number;
  debitColumn?: number;
  creditColumn?: number;
  notesColumn?: number;
  invertAmount: boolean;
}

export type AynieeeTone = 'conyo_bestie' | 'gentle_coach' | 'strict_cfo';

export interface UserProfile {
  displayName: string;
  tagline: string;
  avatarEmoji: string;
  clayAccent: string; // '#FDBCB4' | '#FFD1DC' | '#98FF98' | '#ADD8E6' | '#E6E6FA' | '#B5EAD7'
  monthlySavingsGoalPct: number; // e.g. 25
  aynieeeTone: AynieeeTone;
}

export interface VaultSettings {
  baseCurrency: CurrencyCode;
  exchangeRates: Record<CurrencyCode, number>; // value of 1 baseCurrency in target currency
  exchangeRatesUpdatedAt?: string;
  theme: 'dark' | 'light';
  privacyMask: boolean;
  passcodeHash: string | null; // PBKDF2 hash if vault screen lock enabled
  passcodeSalt: string | null;
  autoBackupEnabled: boolean;
  lastBackupAt: string | null;
  isDemoData: boolean;
  budgetRolloverAdjustments: Record<string, number>; // categoryId -> rollover carry-in amount
  groqApiKey?: string;
  groqModel?: string;
  profile?: UserProfile;
}

export interface AiChatMessage {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  source?: 'groq-cloud' | 'local-offline';
  modelUsed?: string;
}

export interface SquadMember {
  id: string;
  name: string;
  role: 'owner' | 'friend';
  clayColor: string; // e.g. #FDBCB4, #ADD8E6, #98FF98, #FFD1DC, #E6E6FA, #B5EAD7
  avatarInitials: string;
}

export interface SquadContribution {
  id: string;
  memberId: string;
  amount: number;
  date: string; // ISO YYYY-MM-DD
  note: string;
  createdAt: string;
}

export interface SavingsSquadPot {
  id: string;
  name: string;
  emoji: string;
  targetAmount: number;
  currency: CurrencyCode;
  roomCode: string;
  members: SquadMember[];
  contributions: SquadContribution[];
  createdAt: string;
  updatedAt: string;
}

export interface SquadLeaderboardEntry {
  rank: number;
  member: SquadMember;
  totalContributed: number;
  sharePercent: number; // % of totalSaved (0..100)
  targetSharePercent: number; // % of targetAmount (0..100)
  contributionCount: number;
  largestSingleDeposit: number;
  lastContributionDate: string | null;
  leadOverNext: number; // positive dollar/peso lead over rank+1
  shareGapPercent: number; // percentage-point share lead over rank+1
  isTopSaver: boolean;
}

export interface SquadLeaderboardResult {
  totalSaved: number;
  targetAmount: number;
  progressPercent: number;
  remainingAmount: number;
  entries: SquadLeaderboardEntry[];
  topSaver: SquadLeaderboardEntry | null;
  headline: string;
}

export interface VaultData {
  schemaVersion: number;
  updatedAt: string;
  accounts: Account[];
  categories: Category[];
  transactions: Transaction[];
  recurringBills: RecurringBill[];
  savingsGoals: SavingsGoal[];
  savingsSquads?: SavingsSquadPot[];
  rules: CategoryRule[];
  importPresets: BankImportPreset[];
  forecastMilestones?: ForecastMilestone[];
  settings: VaultSettings;
}

// ---------- Analytics & Visualization Types ----------

export interface DashboardKPIs {
  totalNetWorth: number;
  liquidCash: number;
  totalDebt: number;
  periodIncome: number;
  periodExpenses: number;
  netCashflow: number;
  savingsRate: number; // percentage 0..100 (can be negative)
  safeToSpend: number; // liquid cash minus upcoming 30-day bills & earmarked goal reserves
  dailyBurnRate: number;
  projectedMonthEndExpense: number;
  monthlyBudgetTotal: number;
  unreviewedCount: number;
}

export interface SankeyNode {
  id: string;
  label: string;
  column: 0 | 1 | 2 | 3; // 0: Income sources, 1: Net Pool, 2: Needs/Wants/Savings, 3: Top Categories
  value: number;
  color: string;
  filterType?: 'category' | 'group' | 'income';
  filterId?: string;
}

export interface SankeyLink {
  source: string;
  target: string;
  value: number;
  color: string;
}

export interface SankeyGraph {
  nodes: SankeyNode[];
  links: SankeyLink[];
  totalIncome: number;
  totalAllocated: number;
}

export interface CategorySpendSummary {
  categoryId: string;
  categoryName: string;
  group: CategoryGroup;
  color: string;
  icon: string;
  spent: number; // net of refunds
  budget: number;
  rollover: number;
  effectiveBudget: number;
  percentUsed: number;
  transactionCount: number;
}

export interface MonthlyTrendPoint {
  month: string; // YYYY-MM
  label: string; // e.g., "Nov"
  income: number;
  expenses: number;
  net: number;
  netWorth: number;
}

export interface HeatmapDay {
  date: string; // YYYY-MM-DD
  amount: number;
  count: number;
  level: 0 | 1 | 2 | 3 | 4;
}

export interface ProactiveInsight {
  id: string;
  severity: 'info' | 'warning' | 'positive';
  title: string;
  detail: string;
  actionLabel?: string;
  actionTarget?: NavSection;
  filterCategoryId?: string;
}

export type HealthMetricStatus = 'strong' | 'fair' | 'attention';

export interface HealthMetric {
  id: 'savings_rate' | 'budget_adherence' | 'emergency_runway' | 'debt_ratio' | 'fixed_cost_ratio';
  label: string;
  score: number; // 0-100
  weight: number; // 0-1, sum = 1
  displayValue: string;
  benchmarkLabel: string;
  status: HealthMetricStatus;
  explanation: string;
  actionTarget: NavSection;
}

export interface HealthScoreResult {
  score: number; // 0-100 rounded integer
  grade: 'A+' | 'A' | 'B+' | 'B' | 'C' | 'D';
  summary: string;
  metrics: HealthMetric[];
}

export interface VaultAnswerDrillAction {
  label: string;
  nav: NavSection;
  categoryId?: string;
  searchQuery?: string;
  date?: string;
}

export interface VaultAnswerRow {
  id: string;
  label: string;
  sublabel?: string;
  amount: number;
  percent?: number;
  filterCategoryId?: string;
  filterSearch?: string;
}

export interface VaultAnswer {
  matched: boolean;
  intent:
    | 'category_spend'
    | 'merchant_spend'
    | 'compare_period'
    | 'top_merchants'
    | 'top_categories'
    | 'subscriptions'
    | 'daily_spend'
    | 'net_worth'
    | 'safe_to_spend'
    | 'savings_rate'
    | 'largest_transactions'
    | 'keyword_search'
    | 'empty';
  headline: string;
  periodLabel: string;
  primaryAmount?: number;
  primaryText?: string;
  primaryLabel?: string;
  deltaText?: string;
  deltaTone?: 'positive' | 'negative' | 'neutral';
  summary: string;
  rows: VaultAnswerRow[];
  drillAction?: VaultAnswerDrillAction;
}

export interface ForecastMilestone {
  id: string;
  label: string;
  monthOffset: number; // 1..60
  amount: number; // positive = inflow/windfall, negative = outflow/expense
  recurring: boolean; // false = one-time lump sum, true = recurring monthly delta starting at monthOffset
  enabled: boolean;
}

export interface ForecastInput {
  currentNetWorth: number;
  currentLiquidAssets: number;
  currentDebt: number;
  baselineMonthlyIncome: number;
  baselineMonthlyExpense: number;
  horizonMonths: 12 | 60;
  incomeChangePct: number; // -30..50
  expenseChangePct: number; // -40..25
  expectedAnnualReturnPct: number; // 0..12
  milestones: ForecastMilestone[];
}

export interface ForecastPoint {
  monthIndex: number; // 0..horizonMonths
  monthKey: string; // YYYY-MM
  label: string; // e.g. "Nov 26"
  baselineNetWorth: number;
  scenarioNetWorth: number;
  scenarioCashflow: number;
  milestoneLabels: string[];
}

export interface ForecastResult {
  points: ForecastPoint[];
  endingBaselineNetWorth: number;
  endingScenarioNetWorth: number;
  netWorthDelta: number;
  projectedMonthlyIncome: number;
  projectedMonthlyExpense: number;
  projectedMonthlySavings: number;
  totalMilestoneImpact: number;
}

export interface DebtPayoffInput {
  id: string;
  name: string;
  balance: number; // positive owed amount
  apr: number; // e.g., 19.99
  minPayment: number;
  color: string;
}

export interface DebtPayoffMonthPoint {
  month: number;
  label: string;
  totalRemaining: number;
  cumulativeInterest: number;
  balancesById: Record<string, number>;
}

export interface DebtPayoffResult {
  strategy: 'snowball' | 'avalanche';
  monthsToPayoff: number;
  debtFreeDate: string;
  totalInterestPaid: number;
  totalPaid: number;
  payoffOrder: Array<{ id: string; name: string; paidOffMonth: number; interestPaid: number }>;
  schedule: DebtPayoffMonthPoint[];
}

export interface ParsedImportRow {
  rowIndex: number;
  date: string;
  payee: string;
  amount: number;
  type: 'expense' | 'income' | 'refund';
  notes: string;
  categoryId: string;
  tags: string[];
  importHash: string;
  isDuplicate: boolean;
  selected: boolean;
}

export interface EncryptedVaultEnvelope {
  format: 'vaultledger-encrypted-v1';
  kdf: 'PBKDF2-SHA256';
  iterations: number;
  cipher: 'AES-256-GCM';
  saltB64: string;
  ivB64: string;
  ciphertextB64: string;
  createdAt: string;
}

// ---------- Electron Native Desktop Bridge ----------

export interface DesktopBackupInfo {
  fileName: string;
  createdAt: string;
  sizeBytes: number;
}

export interface VaultDesktopBridge {
  isDesktop: true;
  platform: string;
  appVersion: string;
  getStorageInfo: () => Promise<{ vaultPath: string; backupsDir: string; receiptsDir: string }>;
  loadVault: () => Promise<VaultData | null>;
  saveVault: (data: VaultData) => Promise<{ ok: boolean; savedAt: string }>;
  createBackupSnapshot: (data: VaultData) => Promise<{ ok: boolean; fileName?: string }>;
  listBackups: () => Promise<DesktopBackupInfo[]>;
  exportFileDialog: (opts: {
    defaultName: string;
    content: string;
    filters: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{ canceled: boolean; filePath?: string }>;
  importFileDialog: (opts: {
    filters: Array<{ name: string; extensions: string[] }>;
  }) => Promise<{ canceled: boolean; fileName?: string; content?: string }>;
  saveReceiptFile: (opts: {
    fileName: string;
    base64Data: string;
  }) => Promise<{ ok: boolean; storageRef: string }>;
  readReceiptFile: (storageRef: string) => Promise<string | null>;
  openDataFolder: () => Promise<void>;
}

declare global {
  interface Window {
    vaultDesktop?: VaultDesktopBridge;
  }
}
