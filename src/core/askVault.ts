import type {
  Account,
  Category,
  CurrencyCode,
  RecurringBill,
  Transaction,
  VaultAnswer,
  VaultAnswerRow,
  VaultData,
  VaultSettings,
} from '../types/finance';
import {
  computeAllAccountBalances,
  computeDashboardKPIs,
  formatCurrency,
} from './analytics';

export const SUGGESTED_VAULT_QUERIES: string[] = [
  'How much did I spend on dining this month?',
  'Compare groceries vs last month',
  'Top 5 merchants this month',
  'Total subscriptions',
  'Average daily spend this month',
  'What is my safe to spend?',
];

const SHORT_MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

const MONTH_NAME_MAP: Record<string, number> = {
  january: 0,
  jan: 0,
  february: 1,
  feb: 1,
  march: 2,
  mar: 2,
  april: 3,
  apr: 3,
  may: 4,
  june: 5,
  jun: 5,
  july: 6,
  jul: 6,
  august: 7,
  aug: 7,
  september: 8,
  sept: 8,
  sep: 8,
  october: 9,
  oct: 9,
  november: 10,
  nov: 10,
  december: 11,
  dec: 11,
};

const CATEGORY_SYNONYMS: Array<{ patterns: string[]; targets: string[] }> = [
  {
    patterns: [
      'dining',
      'eating out',
      'eat out',
      'food',
      'restaurant',
      'restaurants',
      'dinner',
      'lunch',
      'brunch',
      'takeout',
    ],
    targets: ['dining', 'food'],
  },
  {
    patterns: ['coffee', 'cafe', 'cafes', 'latte', 'espresso', 'caffeine'],
    targets: ['coffee', 'cafe', 'dining'],
  },
  {
    patterns: ['groceries', 'grocery', 'supermarket', 'produce'],
    targets: ['grocer'],
  },
  {
    patterns: ['rent', 'housing', 'mortgage', 'apartment'],
    targets: ['housing', 'rent'],
  },
  {
    patterns: ['utilities', 'utility', 'internet', 'wifi', 'electric', 'electricity', 'fiber'],
    targets: ['utilit', 'internet'],
  },
  {
    patterns: ['transport', 'transportation', 'commute', 'fuel', 'gas', 'transit'],
    targets: ['transport'],
  },
  {
    patterns: ['health', 'healthcare', 'medical', 'pharmacy', 'doctor', 'dental'],
    targets: ['health'],
  },
  {
    patterns: ['insurance', 'policy'],
    targets: ['insurance'],
  },
  {
    patterns: ['shopping', 'clothes', 'clothing', 'apparel', 'retail'],
    targets: ['shopping'],
  },
  {
    patterns: ['entertainment', 'movies', 'movie', 'cinema', 'concert', 'games'],
    targets: ['entertain'],
  },
  {
    patterns: ['travel', 'flight', 'flights', 'hotel', 'vacation', 'trip'],
    targets: ['travel'],
  },
  {
    patterns: ['subscription', 'subscriptions'],
    targets: ['subscription'],
  },
];

const STOP_WORDS = new Set([
  'how',
  'much',
  'many',
  'did',
  'do',
  'does',
  'have',
  'has',
  'was',
  'were',
  'is',
  'are',
  'am',
  'i',
  'my',
  'me',
  'we',
  'our',
  'you',
  'your',
  'what',
  'whats',
  'where',
  'when',
  'which',
  'who',
  'spend',
  'spent',
  'spending',
  'pay',
  'paid',
  'cost',
  'costs',
  'expense',
  'expenses',
  'transaction',
  'transactions',
  'total',
  'all',
  'show',
  'list',
  'find',
  'search',
  'get',
  'give',
  'tell',
  'check',
  'see',
  'look',
  'up',
  'on',
  'in',
  'at',
  'for',
  'of',
  'to',
  'from',
  'with',
  'by',
  'about',
  'the',
  'a',
  'an',
  'and',
  'or',
  'this',
  'that',
  'last',
  'past',
  'previous',
  'prior',
  'current',
  'month',
  'months',
  'year',
  'years',
  'day',
  'days',
  'week',
  'weeks',
  'quarter',
  'ytd',
  'time',
  'ever',
  'compare',
  'vs',
  'versus',
  'against',
  'top',
  'biggest',
  'largest',
  'highest',
  'most',
  'expensive',
  'average',
  'avg',
  'daily',
  'per',
  'rate',
  'burn',
  'money',
]);

interface TimeWindow {
  kind:
    | 'this_month'
    | 'last_month'
    | 'last_30_days'
    | 'last_90_days'
    | 'ytd'
    | 'all_time'
    | 'month';
  label: string;
  startIso: string | null;
  endIso: string | null;
  monthKey?: string;
  year?: number;
  monthIndex?: number;
  elapsedDays: number;
  daysInMonth?: number;
  matchedText?: string;
}

interface MonthRef {
  year: number;
  monthIndex: number;
  monthKey: string;
  label: string;
  daysInMonth: number;
  rawMatch: string;
  index: number;
}

// ---------- Date & Currency Utilities (aligned with analytics.ts) ----------

function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function toAnchorUtc(referenceDate: Date = new Date()): Date {
  return new Date(
    Date.UTC(
      referenceDate.getFullYear(),
      referenceDate.getMonth(),
      referenceDate.getDate(),
    ),
  );
}

function formatUtcIsoDate(utcDate: Date): string {
  const y = utcDate.getUTCFullYear();
  const m = String(utcDate.getUTCMonth() + 1).padStart(2, '0');
  const d = String(utcDate.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function parseIsoToUtc(iso: string): Date {
  const parts = iso.slice(0, 10).split('-').map(Number);
  if (parts.length !== 3 || parts.some((n) => !Number.isFinite(n))) {
    return new Date(Date.UTC(1970, 0, 1));
  }
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

function addUtcDays(utcDate: Date, days: number): Date {
  return new Date(
    Date.UTC(
      utcDate.getUTCFullYear(),
      utcDate.getUTCMonth(),
      utcDate.getUTCDate() + days,
    ),
  );
}

function diffUtcDays(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

function daysInUtcMonth(year: number, monthIndex: number): number {
  return new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
}

function formatMonthKey(year: number, monthIndex: number): string {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}`;
}

function convertToBaseCurrency(
  amount: number,
  fromCurrency: CurrencyCode,
  settings: VaultSettings,
): number {
  if (fromCurrency === settings.baseCurrency) {
    return amount;
  }
  const rate = settings.exchangeRates[fromCurrency];
  if (!rate || !Number.isFinite(rate) || rate <= 0) {
    return amount;
  }
  return amount / rate;
}

function buildAccountCurrencyMap(accounts: Account[]): Map<string, CurrencyCode> {
  const map = new Map<string, CurrencyCode>();
  for (const acc of accounts) {
    map.set(acc.id, acc.currency);
  }
  return map;
}

function getTxCurrency(
  tx: Transaction,
  accountCurrencies: Map<string, CurrencyCode>,
  baseCurrency: CurrencyCode,
): CurrencyCode {
  return accountCurrencies.get(tx.accountId) ?? baseCurrency;
}

function getExpenseCategoryAllocations(
  tx: Transaction,
): Array<{ categoryId: string; signedAmount: number }> {
  if (tx.type !== 'expense' && tx.type !== 'refund') {
    return [];
  }
  const sign = tx.type === 'refund' ? -1 : 1;

  if (tx.splits && tx.splits.length > 0) {
    const result: Array<{ categoryId: string; signedAmount: number }> = [];
    let splitSumCents = 0;
    for (const split of tx.splits) {
      const splitCents = Math.round(split.amount * 100);
      splitSumCents += splitCents;
      result.push({
        categoryId: split.categoryId,
        signedAmount: (sign * splitCents) / 100,
      });
    }
    const txCents = Math.round(tx.amount * 100);
    const remainderCents = txCents - splitSumCents;
    if (remainderCents > 1) {
      result.push({
        categoryId: tx.categoryId,
        signedAmount: (sign * remainderCents) / 100,
      });
    }
    return result;
  }

  return [{ categoryId: tx.categoryId, signedAmount: sign * tx.amount }];
}

function monthlyEquivalent(amount: number, frequency: RecurringBill['frequency']): number {
  switch (frequency) {
    case 'weekly':
      return (amount * 52) / 12;
    case 'biweekly':
      return (amount * 26) / 12;
    case 'monthly':
      return amount;
    case 'quarterly':
      return amount / 3;
    case 'yearly':
      return amount / 12;
    default:
      return amount;
  }
}

function normalizeText(input: string): string {
  return input
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function containsWholePhrase(haystack: string, phrase: string): boolean {
  const escaped = escapeRegex(phrase.trim());
  if (!escaped) {
    return false;
  }
  const regex = new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i');
  return regex.test(haystack);
}

// ---------- Question Detection ----------

const QUESTION_PATTERNS: RegExp[] = [
  /\bhow\s+(much|many)\b/i,
  /\bwhat(?:'s|\s+is|\s+was|\s+are|\s+did|\s+were)?\b/i,
  /\bwhere\s+(?:do|did)\s+i\b/i,
  /\bcompare\b/i,
  /\bvs\.?\b/i,
  /\bversus\b/i,
  /\btop\s+/i,
  /\btotal\s+/i,
  /\baverage\b/i,
  /\bavg\b/i,
  /\bbiggest\b/i,
  /\blargest\b/i,
  /\bmost\s+expensive\b/i,
  /\bhighest\s+expense/i,
  /\bspent\b/i,
  /\bspend(?:ing)?\b/i,
  /\bnet\s+worth\b/i,
  /\bsafe[\s-]+to[\s-]+spend\b/i,
  /\bleft\s+to\s+spend\b/i,
  /\bsavings?\s+rate\b/i,
  /\bburn\s+rate\b/i,
  /\bper\s+day\b/i,
  /\bsubscriptions?\b/i,
  /\bbills?\b/i,
];

export function isLikelyVaultQuestion(query: string): boolean {
  const trimmed = query.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.endsWith('?') && trimmed.length > 1) {
    return true;
  }
  return QUESTION_PATTERNS.some((pattern) => pattern.test(trimmed));
}

// ---------- Time Window Extraction ----------

function extractExplicitMonths(normalized: string, anchor: Date): MonthRef[] {
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const regex =
    /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b/gi;

  const refs: MonthRef[] = [];
  let match: RegExpExecArray | null;
  while ((match = regex.exec(normalized)) !== null) {
    const token = match[1].toLowerCase();
    // Avoid treating modal verb "may" as month (e.g. "what may I spend")
    if (token === 'may') {
      const prefix = normalized.slice(0, match.index).trimEnd();
      if (/\b(i|you|we|it|that|what|who)$/.test(prefix)) {
        continue;
      }
    }
    const monthIndex = MONTH_NAME_MAP[token];
    if (monthIndex === undefined) {
      continue;
    }
    const year = monthIndex <= anchorMonth ? anchorYear : anchorYear - 1;
    const days = daysInUtcMonth(year, monthIndex);
    refs.push({
      year,
      monthIndex,
      monthKey: formatMonthKey(year, monthIndex),
      label: `${SHORT_MONTHS[monthIndex]} ${year}`,
      daysInMonth: days,
      rawMatch: match[0],
      index: match.index,
    });
  }

  return refs;
}

function buildMonthWindow(
  year: number,
  monthIndex: number,
  anchor: Date,
  kind: 'this_month' | 'last_month' | 'month',
  customLabel?: string,
  matchedText?: string,
): TimeWindow {
  const days = daysInUtcMonth(year, monthIndex);
  const monthKey = formatMonthKey(year, monthIndex);
  const isCurrentMonth =
    year === anchor.getUTCFullYear() && monthIndex === anchor.getUTCMonth();

  return {
    kind,
    label: customLabel ?? `${SHORT_MONTHS[monthIndex]} ${year}`,
    startIso: `${monthKey}-01`,
    endIso: `${monthKey}-${String(days).padStart(2, '0')}`,
    monthKey,
    year,
    monthIndex,
    elapsedDays: isCurrentMonth ? Math.max(1, anchor.getUTCDate()) : days,
    daysInMonth: days,
    matchedText,
  };
}

function extractTimeWindow(normalized: string, referenceDate: Date): TimeWindow {
  const anchor = toAnchorUtc(referenceDate);
  const anchorIso = formatUtcIsoDate(anchor);
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();

  const allTimeMatch = normalized.match(/\b(all[\s-]+time|ever)\b/i);
  if (allTimeMatch) {
    return {
      kind: 'all_time',
      label: 'All time',
      startIso: null,
      endIso: null,
      elapsedDays: 30,
      matchedText: allTimeMatch[0],
    };
  }

  const ytdMatch = normalized.match(/\b(this\s+year|year\s+to\s+date|ytd)\b/i);
  if (ytdMatch) {
    const startOfYear = new Date(Date.UTC(anchorYear, 0, 1));
    return {
      kind: 'ytd',
      label: `This year (${anchorYear})`,
      startIso: `${anchorYear}-01-01`,
      endIso: anchorIso,
      elapsedDays: Math.max(1, diffUtcDays(anchor, startOfYear) + 1),
      matchedText: ytdMatch[0],
    };
  }

  const last90Match = normalized.match(
    /\b((?:last|past)\s+90\s+days|(?:last|past)\s+3\s+months|3\s+months|this\s+quarter|quarter)\b/i,
  );
  if (last90Match) {
    return {
      kind: 'last_90_days',
      label: 'Last 90 days',
      startIso: formatUtcIsoDate(addUtcDays(anchor, -90)),
      endIso: anchorIso,
      elapsedDays: 90,
      matchedText: last90Match[0],
    };
  }

  const last30Match = normalized.match(/\b((?:last|past)\s+30\s+days)\b/i);
  if (last30Match) {
    return {
      kind: 'last_30_days',
      label: 'Last 30 days',
      startIso: formatUtcIsoDate(addUtcDays(anchor, -30)),
      endIso: anchorIso,
      elapsedDays: 30,
      matchedText: last30Match[0],
    };
  }

  const lastMonthMatch = normalized.match(/\b(last\s+month|previous\s+month|prior\s+month)\b/i);
  if (lastMonthMatch) {
    const prevDate = new Date(Date.UTC(anchorYear, anchorMonth - 1, 1));
    return buildMonthWindow(
      prevDate.getUTCFullYear(),
      prevDate.getUTCMonth(),
      anchor,
      'last_month',
      `Last month (${SHORT_MONTHS[prevDate.getUTCMonth()]} ${prevDate.getUTCFullYear()})`,
      lastMonthMatch[0],
    );
  }

  const thisMonthMatch = normalized.match(/\b(this\s+month|current\s+month|mtd)\b/i);
  if (thisMonthMatch) {
    return buildMonthWindow(
      anchorYear,
      anchorMonth,
      anchor,
      'this_month',
      'This month',
      thisMonthMatch[0],
    );
  }

  const explicitMonths = extractExplicitMonths(normalized, anchor);
  if (explicitMonths.length > 0) {
    const m = explicitMonths[0];
    return buildMonthWindow(m.year, m.monthIndex, anchor, 'month', m.label, m.rawMatch);
  }

  return buildMonthWindow(anchorYear, anchorMonth, anchor, 'this_month', 'This month');
}

function filterTransactionsForWindow(
  transactions: Transaction[],
  window: TimeWindow,
): Transaction[] {
  if (window.kind === 'all_time') {
    return transactions;
  }
  if (window.monthKey) {
    return transactions.filter((tx) => tx.date.slice(0, 7) === window.monthKey);
  }
  const start = window.startIso ?? '0000-01-01';
  const end = window.endIso ?? '9999-12-31';
  return transactions.filter((tx) => tx.date >= start && tx.date <= end);
}

// ---------- Entity Matching (Categories & Merchants) ----------

function findMatchingCategory(normalized: string, categories: Category[]): Category | null {
  let best: { category: Category; score: number } | null = null;

  for (const cat of categories) {
    const catLower = normalizeText(cat.name);

    // 1. Exact full category name phrase match
    if (containsWholePhrase(normalized, catLower)) {
      const score = 100 + catLower.length;
      if (!best || score > best.score) {
        best = { category: cat, score };
      }
      continue;
    }

    // 2. Significant word from category name (e.g. "dining" -> "Dining Out", "housing" -> "Housing & Rent")
    const words = catLower
      .split(/[^a-z0-9]+/)
      .filter((w) => w.length >= 3 && w !== 'and' && w !== 'out' && w !== 'other');
    for (const word of words) {
      if (containsWholePhrase(normalized, word)) {
        const score = 70 + word.length;
        if (!best || score > best.score) {
          best = { category: cat, score };
        }
      }
    }
  }

  if (best) {
    return best.category;
  }

  // 3. Synonym table
  for (const entry of CATEGORY_SYNONYMS) {
    const matchedPattern = entry.patterns.find((p) => containsWholePhrase(normalized, p));
    if (!matchedPattern) {
      continue;
    }
    for (const target of entry.targets) {
      const found = categories.find((cat) =>
        normalizeText(cat.name).includes(target),
      );
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function stripTimePhrases(normalized: string, window: TimeWindow): string {
  let cleaned = normalized
    .replace(/\b(all[\s-]+time|ever)\b/gi, ' ')
    .replace(/\b(this\s+year|year\s+to\s+date|ytd)\b/gi, ' ')
    .replace(
      /\b((?:last|past)\s+90\s+days|(?:last|past)\s+3\s+months|3\s+months|this\s+quarter|quarter)\b/gi,
      ' ',
    )
    .replace(/\b((?:last|past)\s+30\s+days)\b/gi, ' ')
    .replace(/\b(last\s+month|previous\s+month|prior\s+month|this\s+month|current\s+month|mtd)\b/gi, ' ');

  if (window.matchedText) {
    cleaned = cleaned.replace(new RegExp(`\\b${escapeRegex(window.matchedText)}\\b`, 'gi'), ' ');
  }

  return cleaned.replace(/[?!.,]+/g, ' ').replace(/\s+/g, ' ').trim();
}

interface MerchantMatch {
  queryTerm: string;
  displayName: string;
  explicit: boolean;
}

function findMatchingMerchant(
  normalized: string,
  window: TimeWindow,
  transactions: Transaction[],
): MerchantMatch | null {
  const cleaned = stripTimePhrases(normalized, window);

  // Collect unique non-transfer payees (preferring longer names first for accuracy)
  const payeeMap = new Map<string, string>();
  for (const tx of transactions) {
    if (tx.type === 'transfer') {
      continue;
    }
    const normPayee = normalizeText(tx.payee);
    if (normPayee && !payeeMap.has(normPayee)) {
      payeeMap.set(normPayee, tx.payee);
    }
  }

  const allPayees = Array.from(payeeMap.entries()).sort((a, b) => b[0].length - a[0].length);

  // 1. Explicit "at <merchant>" / "from <merchant>" pattern
  const atMatch = cleaned.match(/\b(?:at|from)\s+([a-z0-9'&.\-\s]{2,})$/i);
  if (atMatch) {
    const candidate = atMatch[1].trim();
    if (candidate.length >= 2) {
      const matched = allPayees.find(
        ([normPayee]) => normPayee.includes(candidate) || candidate.includes(normPayee),
      );
      if (matched) {
        return {
          queryTerm: candidate,
          displayName: matched[1],
          explicit: true,
        };
      }
    }
  }

  // 2. Full payee substring appears in the query (e.g. "Trader Joe's", "Blue Bottle Coffee")
  for (const [normPayee, displayName] of allPayees) {
    if (normPayee.length >= 4 && containsWholePhrase(cleaned, normPayee)) {
      return {
        queryTerm: normPayee,
        displayName,
        explicit: true,
      };
    }
  }

  // 3. Distinctive merchant brand tokens (excluding generic words that belong to categories)
  const genericMerchantWords = new Set([
    'market',
    'coffee',
    'cafe',
    'bakery',
    'bistro',
    'online',
    'local',
    'fitness',
    'standard',
    'family',
    'service',
    'station',
    'trip',
    'payment',
    'monthly',
    'auto',
    'loan',
    'home',
    'fiber',
    'internet',
    'store',
    'superstore',
    'pharmacy',
    'cinema',
    'studio',
    'design',
    'corp',
    'payroll',
    'refund',
    'apartments',
    'services',
    'electric',
    'oil',
  ]);

  const queryWords = cleaned
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w) && !genericMerchantWords.has(w));

  for (const word of queryWords) {
    const matched = allPayees.find(([normPayee]) => containsWholePhrase(normPayee, word));
    if (matched) {
      return {
        queryTerm: word,
        displayName: matched[1],
        explicit: false,
      };
    }
  }

  return null;
}

// ---------- Aggregation Helpers ----------

function computeExpenseNetCents(
  transactions: Transaction[],
  accountCurrencies: Map<string, CurrencyCode>,
  settings: VaultSettings,
  categoryId?: string,
): { netCents: number; txCount: number } {
  let netCents = 0;
  let txCount = 0;

  for (const tx of transactions) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    const currency = getTxCurrency(tx, accountCurrencies, settings.baseCurrency);
    const allocations = getExpenseCategoryAllocations(tx);
    let touched = false;

    for (const alloc of allocations) {
      if (categoryId && alloc.categoryId !== categoryId) {
        continue;
      }
      const baseSigned = convertToBaseCurrency(alloc.signedAmount, currency, settings);
      netCents += Math.round(baseSigned * 100);
      touched = true;
    }

    if (touched) {
      txCount += 1;
    }
  }

  return { netCents: Math.max(0, netCents), txCount };
}

function parseTopLimit(normalized: string, defaultLimit: number = 5): number {
  const match = normalized.match(/\b(?:top|biggest|largest|first)\s+(\d+)\b/i);
  if (!match) {
    return defaultLimit;
  }
  const parsed = Number(match[1]);
  if (!Number.isFinite(parsed) || parsed < 1) {
    return defaultLimit;
  }
  return Math.min(20, Math.floor(parsed));
}

// ---------- Intent Handlers ----------

function handleComparePeriod(
  normalized: string,
  vault: VaultData,
  referenceDate: Date,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const anchor = toAnchorUtc(referenceDate);
  const anchorYear = anchor.getUTCFullYear();
  const anchorMonth = anchor.getUTCMonth();
  const baseCurrency = vault.settings.baseCurrency;

  const explicitMonths = extractExplicitMonths(normalized, anchor);
  let targetWindow: TimeWindow;
  let baselineWindow: TimeWindow;
  let baselineShortLabel: string;

  if (explicitMonths.length >= 2) {
    const first = explicitMonths[0];
    const second = explicitMonths[1];
    targetWindow = buildMonthWindow(first.year, first.monthIndex, anchor, 'month', first.label);
    baselineWindow = buildMonthWindow(
      second.year,
      second.monthIndex,
      anchor,
      'month',
      second.label,
    );
    baselineShortLabel = second.label;
  } else if (explicitMonths.length === 1) {
    const first = explicitMonths[0];
    targetWindow = buildMonthWindow(first.year, first.monthIndex, anchor, 'month', first.label);
    const prevDate = new Date(Date.UTC(first.year, first.monthIndex - 1, 1));
    const prevLabel = `${SHORT_MONTHS[prevDate.getUTCMonth()]} ${prevDate.getUTCFullYear()}`;
    baselineWindow = buildMonthWindow(
      prevDate.getUTCFullYear(),
      prevDate.getUTCMonth(),
      anchor,
      'month',
      prevLabel,
    );
    baselineShortLabel = prevLabel;
  } else {
    targetWindow = buildMonthWindow(anchorYear, anchorMonth, anchor, 'this_month', 'This month');
    const prevDate = new Date(Date.UTC(anchorYear, anchorMonth - 1, 1));
    baselineWindow = buildMonthWindow(
      prevDate.getUTCFullYear(),
      prevDate.getUTCMonth(),
      anchor,
      'last_month',
      `Last month (${SHORT_MONTHS[prevDate.getUTCMonth()]} ${prevDate.getUTCFullYear()})`,
    );
    baselineShortLabel = 'last month';
  }

  const matchedCategory = findMatchingCategory(normalized, vault.categories);
  const targetTxs = filterTransactionsForWindow(vault.transactions, targetWindow);
  const baselineTxs = filterTransactionsForWindow(vault.transactions, baselineWindow);

  const currentStats = computeExpenseNetCents(
    targetTxs,
    accountCurrencies,
    vault.settings,
    matchedCategory?.id,
  );
  const prevStats = computeExpenseNetCents(
    baselineTxs,
    accountCurrencies,
    vault.settings,
    matchedCategory?.id,
  );

  const currentAmount = roundMoney(currentStats.netCents / 100);
  const prevAmount = roundMoney(prevStats.netCents / 100);
  const diff = roundMoney(currentAmount - prevAmount);

  let deltaText: string;
  let deltaTone: 'positive' | 'negative' | 'neutral';

  if (prevAmount > 0) {
    const pct = ((currentAmount - prevAmount) / prevAmount) * 100;
    const sign = pct > 0 ? '+' : '';
    deltaText = `${sign}${pct.toFixed(1)}% vs ${baselineShortLabel}`;
    deltaTone = diff > 0 ? 'negative' : diff < 0 ? 'positive' : 'neutral';
  } else if (currentAmount > 0) {
    deltaText = `New spend vs ${baselineShortLabel}`;
    deltaTone = 'negative';
  } else {
    deltaText = `No change vs ${baselineShortLabel}`;
    deltaTone = 'neutral';
  }

  const subject = matchedCategory ? matchedCategory.name : 'Total spending';
  const maxVal = Math.max(currentAmount, prevAmount);

  const rows: VaultAnswerRow[] = [
    {
      id: 'compare_current',
      label: targetWindow.label,
      sublabel: `${currentStats.txCount} transaction${currentStats.txCount === 1 ? '' : 's'}`,
      amount: currentAmount,
      percent: maxVal > 0 ? roundMoney((currentAmount / maxVal) * 100) : 0,
      filterCategoryId: matchedCategory?.id,
    },
    {
      id: 'compare_previous',
      label: baselineWindow.label,
      sublabel: `${prevStats.txCount} transaction${prevStats.txCount === 1 ? '' : 's'}`,
      amount: prevAmount,
      percent: maxVal > 0 ? roundMoney((prevAmount / maxVal) * 100) : 0,
      filterCategoryId: matchedCategory?.id,
    },
  ];

  const diffFormatted = formatCurrency(Math.abs(diff), baseCurrency);
  const directionWord = diff > 0 ? 'more' : diff < 0 ? 'less' : 'the same';
  const summary =
    diff === 0
      ? `${subject} was ${formatCurrency(currentAmount, baseCurrency)} in both ${targetWindow.label.toLowerCase()} and ${baselineShortLabel}.`
      : `${subject} is ${formatCurrency(currentAmount, baseCurrency)} vs ${formatCurrency(
          prevAmount,
          baseCurrency,
        )} in ${baselineShortLabel} (${diffFormatted} ${directionWord}).`;

  return {
    matched: true,
    intent: 'compare_period',
    headline: `${subject}: ${targetWindow.label} vs ${baselineShortLabel}`,
    periodLabel: `${targetWindow.label} vs ${baselineShortLabel}`,
    primaryAmount: currentAmount,
    primaryLabel: `${subject} (${targetWindow.label})`,
    deltaText,
    deltaTone,
    summary,
    rows,
    drillAction: matchedCategory
      ? {
          label: `View ${matchedCategory.name}`,
          nav: 'transactions',
          categoryId: matchedCategory.id,
        }
      : {
          label: 'View Transactions',
          nav: 'transactions',
        },
  };
}

function handleSubscriptions(
  normalized: string,
  vault: VaultData,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const activeExpenseBills = vault.recurringBills.filter(
    (b) => b.active && b.type === 'expense',
  );

  const wantsOnlySubs =
    /\bsubscriptions?\b/i.test(normalized) &&
    !/\b(bills?|recurring|upcoming)\b/i.test(normalized);
  const wantsUpcoming = /\bupcoming\b/i.test(normalized);

  const subBills = activeExpenseBills.filter((b) => b.isSubscription);
  const selectedBills =
    wantsOnlySubs && subBills.length > 0 ? subBills : activeExpenseBills;

  const billItems = selectedBills.map((bill) => {
    const cur = accountCurrencies.get(bill.accountId) ?? baseCurrency;
    const baseAmount = convertToBaseCurrency(bill.amount, cur, vault.settings);
    const monthly = monthlyEquivalent(baseAmount, bill.frequency);
    return {
      bill,
      baseAmount: roundMoney(baseAmount),
      monthly: roundMoney(monthly),
    };
  });

  if (wantsUpcoming) {
    billItems.sort((a, b) => a.bill.nextDueDate.localeCompare(b.bill.nextDueDate));
  } else {
    billItems.sort((a, b) => b.monthly - a.monthly);
  }

  const monthlyTotal = roundMoney(
    billItems.reduce((sum, item) => sum + item.monthly, 0),
  );
  const annualTotal = roundMoney(monthlyTotal * 12);

  const rows: VaultAnswerRow[] = billItems.slice(0, 8).map((item) => ({
    id: item.bill.id,
    label: item.bill.name,
    sublabel: `${item.bill.frequency} · due ${item.bill.nextDueDate}`,
    amount: item.monthly,
    percent: monthlyTotal > 0 ? roundMoney((item.monthly / monthlyTotal) * 100) : 0,
    filterSearch: item.bill.payee,
    filterCategoryId: item.bill.categoryId,
  }));

  const labelKind = wantsOnlySubs && subBills.length > 0 ? 'subscriptions' : 'recurring bills';
  const headline = wantsUpcoming
    ? 'Upcoming recurring bills'
    : wantsOnlySubs && subBills.length > 0
      ? 'Active subscriptions'
      : 'Recurring bills & subscriptions';

  const summary =
    billItems.length === 0
      ? 'You have no active recurring bills or subscriptions configured.'
      : `${billItems.length} active ${labelKind} totaling ${formatCurrency(
          monthlyTotal,
          baseCurrency,
        )}/mo (${formatCurrency(annualTotal, baseCurrency)}/yr).`;

  return {
    matched: true,
    intent: 'subscriptions',
    headline,
    periodLabel: wantsUpcoming ? 'Upcoming schedule' : 'Monthly recurring',
    primaryAmount: monthlyTotal,
    primaryLabel: 'Monthly equivalent',
    deltaText: `${formatCurrency(annualTotal, baseCurrency)} / year`,
    deltaTone: 'neutral',
    summary,
    rows,
    drillAction: {
      label: 'Open Recurring',
      nav: 'recurring',
    },
  };
}

function handleNetWorth(normalized: string, vault: VaultData): VaultAnswer {
  const balances = computeAllAccountBalances(vault.accounts, vault.transactions);
  const baseCurrency = vault.settings.baseCurrency;
  const activeAccounts = vault.accounts.filter((a) => !a.archived);

  let totalAssets = 0;
  let totalLiabilities = 0;
  let liquidCash = 0;

  const accountEntries: Array<{ account: Account; baseBalance: number }> = [];

  for (const acc of activeAccounts) {
    const raw = balances[acc.id] ?? acc.openingBalance;
    const base = roundMoney(convertToBaseCurrency(raw, acc.currency, vault.settings));
    accountEntries.push({ account: acc, baseBalance: base });

    if (base >= 0) {
      totalAssets += base;
      if (acc.type === 'checking' || acc.type === 'savings' || acc.type === 'cash') {
        liquidCash += base;
      }
    } else {
      totalLiabilities += Math.abs(base);
    }
  }

  totalAssets = roundMoney(totalAssets);
  totalLiabilities = roundMoney(totalLiabilities);
  liquidCash = roundMoney(liquidCash);
  const netWorth = roundMoney(totalAssets - totalLiabilities);

  const asksNetWorth = /\bnet\s+worth\b/i.test(normalized);
  const asksDebt = !asksNetWorth && /\b(debts?|liabilit(?:y|ies))\b/i.test(normalized);
  const asksLiquid = !asksNetWorth && !asksDebt && /\b(liquid|cash)\b/i.test(normalized);
  const asksAssets = !asksNetWorth && !asksDebt && !asksLiquid && /\bassets?\b/i.test(normalized);

  let filteredEntries = accountEntries;
  let headline = 'Net worth snapshot';
  let primaryAmount = netWorth;
  let primaryLabel = 'Total net worth';
  let deltaTone: 'positive' | 'negative' | 'neutral' =
    netWorth >= 0 ? 'positive' : 'negative';

  if (asksDebt) {
    filteredEntries = accountEntries.filter((e) => e.baseBalance < 0);
    headline = 'Total debt & liabilities';
    primaryAmount = totalLiabilities;
    primaryLabel = 'Total owed';
    deltaTone = totalLiabilities === 0 ? 'positive' : 'negative';
  } else if (asksLiquid) {
    filteredEntries = accountEntries.filter(
      (e) =>
        (e.account.type === 'checking' ||
          e.account.type === 'savings' ||
          e.account.type === 'cash') &&
        e.baseBalance > 0,
    );
    headline = 'Liquid cash balance';
    primaryAmount = liquidCash;
    primaryLabel = 'Available cash';
    deltaTone = liquidCash > 0 ? 'positive' : 'neutral';
  } else if (asksAssets) {
    filteredEntries = accountEntries.filter((e) => e.baseBalance >= 0);
    headline = 'Total assets';
    primaryAmount = totalAssets;
    primaryLabel = 'Gross assets';
    deltaTone = totalAssets > 0 ? 'positive' : 'neutral';
  }

  filteredEntries.sort((a, b) => Math.abs(b.baseBalance) - Math.abs(a.baseBalance));

  const denominator = filteredEntries.reduce((sum, e) => sum + Math.abs(e.baseBalance), 0);
  const rows: VaultAnswerRow[] = filteredEntries.map(({ account, baseBalance }) => ({
    id: account.id,
    label: account.name,
    sublabel: account.institution
      ? `${account.type} · ${account.institution}`
      : account.type,
    amount: asksDebt ? Math.abs(baseBalance) : baseBalance,
    percent: denominator > 0 ? roundMoney((Math.abs(baseBalance) / denominator) * 100) : 0,
  }));

  return {
    matched: true,
    intent: 'net_worth',
    headline,
    periodLabel: 'Current balances',
    primaryAmount,
    primaryLabel,
    deltaText: `${formatCurrency(totalAssets, baseCurrency)} assets · ${formatCurrency(
      totalLiabilities,
      baseCurrency,
    )} debt`,
    deltaTone,
    summary: `Net worth is ${formatCurrency(netWorth, baseCurrency)}: ${formatCurrency(
      totalAssets,
      baseCurrency,
    )} in assets (${formatCurrency(liquidCash, baseCurrency)} liquid cash) minus ${formatCurrency(
      totalLiabilities,
      baseCurrency,
    )} in liabilities across ${activeAccounts.length} accounts.`,
    rows,
    drillAction: {
      label: 'Open Accounts',
      nav: 'accounts',
    },
  };
}

function handleSafeToSpend(
  vault: VaultData,
  referenceDate: Date,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const kpis = computeDashboardKPIs(vault, 'this_month', referenceDate);
  const baseCurrency = vault.settings.baseCurrency;
  const anchor = toAnchorUtc(referenceDate);
  const plus30Iso = formatUtcIsoDate(addUtcDays(anchor, 30));

  let upcoming30DayBills = 0;
  let upcomingCount = 0;
  for (const bill of vault.recurringBills) {
    if (!bill.active || bill.type !== 'expense') {
      continue;
    }
    if (bill.nextDueDate <= plus30Iso) {
      const cur = accountCurrencies.get(bill.accountId) ?? baseCurrency;
      upcoming30DayBills += convertToBaseCurrency(bill.amount, cur, vault.settings);
      upcomingCount += 1;
    }
  }
  upcoming30DayBills = roundMoney(upcoming30DayBills);

  let earmarkedGoalReserves = 0;
  let activeGoalCount = 0;
  for (const goal of vault.savingsGoals) {
    if (goal.currentAmount < goal.targetAmount && goal.monthlyContribution > 0) {
      earmarkedGoalReserves += goal.monthlyContribution;
      activeGoalCount += 1;
    }
  }
  earmarkedGoalReserves = roundMoney(earmarkedGoalReserves);

  const rows: VaultAnswerRow[] = [
    {
      id: 'sts_liquid_cash',
      label: 'Liquid cash',
      sublabel: 'Checking, savings & cash accounts',
      amount: kpis.liquidCash,
      percent: 100,
    },
    {
      id: 'sts_upcoming_bills',
      label: 'Upcoming 30-day bills',
      sublabel: `${upcomingCount} active bill${upcomingCount === 1 ? '' : 's'} due`,
      amount: upcoming30DayBills,
      percent:
        kpis.liquidCash > 0 ? roundMoney((upcoming30DayBills / kpis.liquidCash) * 100) : 0,
    },
    {
      id: 'sts_goal_reserves',
      label: 'Earmarked goal reserves',
      sublabel: `${activeGoalCount} active savings goal${activeGoalCount === 1 ? '' : 's'}`,
      amount: earmarkedGoalReserves,
      percent:
        kpis.liquidCash > 0
          ? roundMoney((earmarkedGoalReserves / kpis.liquidCash) * 100)
          : 0,
    },
  ];

  return {
    matched: true,
    intent: 'safe_to_spend',
    headline: 'Safe to spend',
    periodLabel: 'Next 30 days',
    primaryAmount: kpis.safeToSpend,
    primaryLabel: 'Available after bills & goals',
    deltaText: `${formatCurrency(kpis.liquidCash, baseCurrency)} liquid cash`,
    deltaTone: kpis.safeToSpend > 0 ? 'positive' : kpis.safeToSpend < 0 ? 'negative' : 'neutral',
    summary: `After setting aside ${formatCurrency(
      upcoming30DayBills,
      baseCurrency,
    )} for upcoming 30-day bills and ${formatCurrency(
      earmarkedGoalReserves,
      baseCurrency,
    )} for savings goals, you have ${formatCurrency(
      kpis.safeToSpend,
      baseCurrency,
    )} safe to spend.`,
    rows,
    drillAction: {
      label: 'View Dashboard',
      nav: 'dashboard',
    },
  };
}

function handleSavingsRate(
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);

  let incomeCents = 0;
  let expenseNetCents = 0;

  for (const tx of windowTxs) {
    if (tx.type === 'transfer') {
      continue;
    }
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    if (tx.type === 'income') {
      incomeCents += Math.round(
        convertToBaseCurrency(tx.amount, cur, vault.settings) * 100,
      );
    } else if (tx.type === 'expense' || tx.type === 'refund') {
      for (const alloc of getExpenseCategoryAllocations(tx)) {
        expenseNetCents += Math.round(
          convertToBaseCurrency(alloc.signedAmount, cur, vault.settings) * 100,
        );
      }
    }
  }

  const income = roundMoney(incomeCents / 100);
  const expenses = roundMoney(Math.max(0, expenseNetCents) / 100);
  const netSaved = roundMoney(income - expenses);
  const savingsRate = income > 0 ? roundMoney((netSaved / income) * 100) : 0;

  const rows: VaultAnswerRow[] = [
    {
      id: 'sr_income',
      label: 'Total income',
      sublabel: window.label,
      amount: income,
      percent: 100,
    },
    {
      id: 'sr_expenses',
      label: 'Net expenses',
      sublabel: window.label,
      amount: expenses,
      percent: income > 0 ? roundMoney((expenses / income) * 100) : 0,
    },
    {
      id: 'sr_net',
      label: 'Net saved',
      sublabel: `${savingsRate.toFixed(1)}% of income`,
      amount: netSaved,
      percent: savingsRate,
    },
  ];

  return {
    matched: true,
    intent: 'savings_rate',
    headline: `Savings rate (${window.label})`,
    periodLabel: window.label,
    primaryAmount: netSaved,
    primaryText: `${savingsRate.toFixed(1)}%`,
    primaryLabel: 'Savings rate',
    deltaText: `${savingsRate.toFixed(1)}% of income`,
    deltaTone: savingsRate >= 20 ? 'positive' : savingsRate < 0 ? 'negative' : 'neutral',
    summary: `You earned ${formatCurrency(income, baseCurrency)} and spent ${formatCurrency(
      expenses,
      baseCurrency,
    )}, saving ${formatCurrency(netSaved, baseCurrency)} (${savingsRate.toFixed(1)}%).`,
    rows,
    drillAction: {
      label: 'View Budgets',
      nav: 'budgets',
    },
  };
}

function handleDailySpend(
  vault: VaultData,
  window: TimeWindow,
  referenceDate: Date,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);
  const anchor = toAnchorUtc(referenceDate);

  const { netCents, txCount } = computeExpenseNetCents(
    windowTxs,
    accountCurrencies,
    vault.settings,
  );
  const totalSpent = roundMoney(netCents / 100);

  let elapsedDays = window.elapsedDays;
  if (window.kind === 'all_time') {
    const dates = windowTxs
      .filter((tx) => tx.type === 'expense' || tx.type === 'refund')
      .map((tx) => tx.date)
      .filter((d) => d.length >= 10)
      .sort();
    if (dates.length >= 2) {
      elapsedDays = Math.max(
        1,
        diffUtcDays(parseIsoToUtc(dates[dates.length - 1]), parseIsoToUtc(dates[0])) + 1,
      );
    } else {
      elapsedDays = Math.max(1, anchor.getUTCDate());
    }
  }

  const avgDaily = roundMoney(totalSpent / Math.max(1, elapsedDays));
  const daysInMonth =
    window.daysInMonth ?? daysInUtcMonth(anchor.getUTCFullYear(), anchor.getUTCMonth());
  const projectedMonthEnd = roundMoney(avgDaily * daysInMonth);

  const rows: VaultAnswerRow[] = [
    {
      id: 'daily_avg',
      label: 'Average daily spend',
      sublabel: `Across ${elapsedDays} day${elapsedDays === 1 ? '' : 's'}`,
      amount: avgDaily,
    },
    {
      id: 'daily_total',
      label: `Total spent (${window.label})`,
      sublabel: `${txCount} transaction${txCount === 1 ? '' : 's'}`,
      amount: totalSpent,
    },
    {
      id: 'daily_projected',
      label: 'Projected month-end spend',
      sublabel: `${daysInMonth}-day pace at ${formatCurrency(avgDaily, baseCurrency)}/day`,
      amount: projectedMonthEnd,
    },
  ];

  return {
    matched: true,
    intent: 'daily_spend',
    headline: `Average daily spend (${window.label})`,
    periodLabel: window.label,
    primaryAmount: avgDaily,
    primaryLabel: 'Average per day',
    deltaText: `Projected ${formatCurrency(projectedMonthEnd, baseCurrency)} / mo`,
    deltaTone: 'neutral',
    summary: `Averaging ${formatCurrency(avgDaily, baseCurrency)}/day across ${elapsedDays} days (${formatCurrency(
      totalSpent,
      baseCurrency,
    )} total), pacing toward ${formatCurrency(projectedMonthEnd, baseCurrency)} for a ${daysInMonth}-day month.`,
    rows,
    drillAction: {
      label: 'View Transactions',
      nav: 'transactions',
    },
  };
}

function handleTopMerchants(
  normalized: string,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const limit = parseTopLimit(normalized, 5);
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);

  const byMerchant = new Map<string, { payee: string; cents: number; count: number }>();

  for (const tx of windowTxs) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const sign = tx.type === 'refund' ? -1 : 1;
    const baseCents = Math.round(
      sign * convertToBaseCurrency(tx.amount, cur, vault.settings) * 100,
    );
    const key = normalizeText(tx.payee);
    const existing = byMerchant.get(key) ?? { payee: tx.payee, cents: 0, count: 0 };
    existing.cents += baseCents;
    existing.count += 1;
    byMerchant.set(key, existing);
  }

  const ranked = Array.from(byMerchant.values())
    .filter((m) => m.cents > 0)
    .sort((a, b) => b.cents - a.cents);

  const totalWindowCents = ranked.reduce((sum, m) => sum + m.cents, 0);
  const top = ranked.slice(0, limit);
  const topSum = roundMoney(top.reduce((sum, m) => sum + m.cents, 0) / 100);

  const rows: VaultAnswerRow[] = top.map((m, idx) => {
    const amount = roundMoney(m.cents / 100);
    return {
      id: `merchant_${idx}_${normalizeText(m.payee).replace(/\s+/g, '_')}`,
      label: m.payee,
      sublabel: `${m.count} transaction${m.count === 1 ? '' : 's'}`,
      amount,
      percent: totalWindowCents > 0 ? roundMoney((m.cents / totalWindowCents) * 100) : 0,
      filterSearch: m.payee,
    };
  });

  const summary =
    top.length === 0
      ? `No merchant expenses recorded in ${window.label.toLowerCase()}.`
      : `Top ${top.length} merchant${top.length === 1 ? '' : 's'} accounted for ${formatCurrency(
          topSum,
          baseCurrency,
        )}, led by ${top[0].payee} (${formatCurrency(roundMoney(top[0].cents / 100), baseCurrency)}).`;

  return {
    matched: true,
    intent: 'top_merchants',
    headline: `Top ${limit} merchants (${window.label})`,
    periodLabel: window.label,
    primaryAmount: topSum,
    primaryLabel: `Top ${top.length} combined`,
    summary,
    rows,
    drillAction: {
      label: 'View Transactions',
      nav: 'transactions',
    },
  };
}

function handleTopCategories(
  normalized: string,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
  customHeadline?: string,
): VaultAnswer {
  const limit = parseTopLimit(normalized, 5);
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);
  const categoryById = new Map<string, Category>(vault.categories.map((c) => [c.id, c]));

  const spentCents = new Map<string, number>();
  const txCounts = new Map<string, number>();

  for (const tx of windowTxs) {
    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const touched = new Set<string>();
    for (const alloc of getExpenseCategoryAllocations(tx)) {
      const baseCents = Math.round(
        convertToBaseCurrency(alloc.signedAmount, cur, vault.settings) * 100,
      );
      spentCents.set(alloc.categoryId, (spentCents.get(alloc.categoryId) ?? 0) + baseCents);
      touched.add(alloc.categoryId);
    }
    for (const catId of touched) {
      txCounts.set(catId, (txCounts.get(catId) ?? 0) + 1);
    }
  }

  const ranked = Array.from(spentCents.entries())
    .map(([categoryId, cents]) => ({
      categoryId,
      category: categoryById.get(categoryId),
      cents,
      count: txCounts.get(categoryId) ?? 0,
    }))
    .filter((item) => item.cents > 0 && item.category?.group !== 'income')
    .sort((a, b) => b.cents - a.cents);

  const totalCents = ranked.reduce((sum, item) => sum + item.cents, 0);
  const totalSpent = roundMoney(totalCents / 100);
  const top = ranked.slice(0, limit);

  const rows: VaultAnswerRow[] = top.map((item) => ({
    id: `top_cat_${item.categoryId}`,
    label: item.category?.name ?? 'Uncategorized',
    sublabel: `${item.count} transaction${item.count === 1 ? '' : 's'}`,
    amount: roundMoney(item.cents / 100),
    percent: totalCents > 0 ? roundMoney((item.cents / totalCents) * 100) : 0,
    filterCategoryId: item.categoryId,
  }));

  const summary =
    top.length === 0
      ? `No expenses recorded in ${window.label.toLowerCase()}.`
      : `Total spending was ${formatCurrency(totalSpent, baseCurrency)} across ${
          ranked.length
        } categories, led by ${top[0].category?.name ?? 'Uncategorized'} (${formatCurrency(
          roundMoney(top[0].cents / 100),
          baseCurrency,
        )}).`;

  return {
    matched: true,
    intent: 'top_categories',
    headline: customHeadline ?? `Top ${limit} categories (${window.label})`,
    periodLabel: window.label,
    primaryAmount: totalSpent,
    primaryLabel: 'Total spending',
    summary,
    rows,
    drillAction: {
      label: 'View Budgets',
      nav: 'budgets',
    },
  };
}

function handleLargestTransactions(
  normalized: string,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const limit = parseTopLimit(normalized, 5);
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);
  const categoryById = new Map<string, Category>(vault.categories.map((c) => [c.id, c]));

  const expenses = windowTxs
    .filter((tx) => tx.type === 'expense')
    .map((tx) => {
      const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
      const baseAmount = roundMoney(convertToBaseCurrency(tx.amount, cur, vault.settings));
      return { tx, baseAmount };
    })
    .sort((a, b) => b.baseAmount - a.baseAmount);

  const totalExpenses = expenses.reduce((sum, item) => sum + item.baseAmount, 0);
  const top = expenses.slice(0, limit);

  const rows: VaultAnswerRow[] = top.map(({ tx, baseAmount }) => {
    const catName = categoryById.get(tx.categoryId)?.name ?? 'Uncategorized';
    return {
      id: tx.id,
      label: tx.payee,
      sublabel: `${tx.date} · ${catName}`,
      amount: baseAmount,
      percent: totalExpenses > 0 ? roundMoney((baseAmount / totalExpenses) * 100) : 0,
      filterSearch: tx.payee,
      filterCategoryId: tx.categoryId,
    };
  });

  const largestAmount = top[0]?.baseAmount ?? 0;
  const summary =
    top.length === 0
      ? `No expenses found in ${window.label.toLowerCase()}.`
      : `Largest expense was ${formatCurrency(largestAmount, baseCurrency)} at ${
          top[0].tx.payee
        } on ${top[0].tx.date}.`;

  return {
    matched: true,
    intent: 'largest_transactions',
    headline: `Largest expenses (${window.label})`,
    periodLabel: window.label,
    primaryAmount: largestAmount,
    primaryLabel: 'Largest single expense',
    summary,
    rows,
    drillAction: {
      label: 'View Transactions',
      nav: 'transactions',
      searchQuery: top[0]?.tx.payee,
    },
  };
}

function handleCategorySpend(
  category: Category,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);

  let totalCents = 0;
  let txCount = 0;
  const merchantCents = new Map<string, { payee: string; cents: number; count: number }>();

  for (const tx of windowTxs) {
    if (tx.type === 'transfer') {
      continue;
    }
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);

    if (category.group === 'income') {
      if (tx.type !== 'income' || tx.categoryId !== category.id) {
        continue;
      }
      const cents = Math.round(convertToBaseCurrency(tx.amount, cur, vault.settings) * 100);
      totalCents += cents;
      txCount += 1;
      const key = normalizeText(tx.payee);
      const entry = merchantCents.get(key) ?? { payee: tx.payee, cents: 0, count: 0 };
      entry.cents += cents;
      entry.count += 1;
      merchantCents.set(key, entry);
      continue;
    }

    if (tx.type !== 'expense' && tx.type !== 'refund') {
      continue;
    }

    const allocations = getExpenseCategoryAllocations(tx);
    let txCatCents = 0;
    let touched = false;
    for (const alloc of allocations) {
      if (alloc.categoryId !== category.id) {
        continue;
      }
      txCatCents += Math.round(
        convertToBaseCurrency(alloc.signedAmount, cur, vault.settings) * 100,
      );
      touched = true;
    }

    if (touched) {
      totalCents += txCatCents;
      txCount += 1;
      const key = normalizeText(tx.payee);
      const entry = merchantCents.get(key) ?? { payee: tx.payee, cents: 0, count: 0 };
      entry.cents += txCatCents;
      entry.count += 1;
      merchantCents.set(key, entry);
    }
  }

  const netTotal = roundMoney(Math.max(0, totalCents) / 100);

  const topMerchants = Array.from(merchantCents.values())
    .filter((m) => m.cents > 0)
    .sort((a, b) => b.cents - a.cents)
    .slice(0, 5);

  const rows: VaultAnswerRow[] = topMerchants.map((m, idx) => ({
    id: `cat_merchant_${idx}_${category.id}`,
    label: m.payee,
    sublabel: `${m.count} transaction${m.count === 1 ? '' : 's'}`,
    amount: roundMoney(m.cents / 100),
    percent: netTotal > 0 ? roundMoney((m.cents / 100 / netTotal) * 100) : 0,
    filterSearch: m.payee,
    filterCategoryId: category.id,
  }));

  let deltaText: string | undefined;
  let deltaTone: 'positive' | 'negative' | 'neutral' | undefined;

  const isSingleMonthWindow =
    window.kind === 'this_month' || window.kind === 'last_month' || window.kind === 'month';
  if (isSingleMonthWindow && category.monthlyBudget > 0 && category.group !== 'income') {
    const pctUsed = roundMoney((netTotal / category.monthlyBudget) * 100);
    if (netTotal > category.monthlyBudget) {
      const overBy = roundMoney(netTotal - category.monthlyBudget);
      deltaText = `${formatCurrency(overBy, baseCurrency)} over ${formatCurrency(
        category.monthlyBudget,
        baseCurrency,
      )} budget`;
      deltaTone = 'negative';
    } else {
      deltaText = `${pctUsed.toFixed(0)}% of ${formatCurrency(
        category.monthlyBudget,
        baseCurrency,
      )} budget`;
      deltaTone = pctUsed <= 85 ? 'positive' : 'neutral';
    }
  }

  const verb = category.group === 'income' ? 'received' : 'spent';
  const summary =
    txCount === 0
      ? `No ${category.name} transactions recorded in ${window.label.toLowerCase()}.`
      : `You ${verb} ${formatCurrency(netTotal, baseCurrency)} on ${category.name} across ${txCount} transaction${
          txCount === 1 ? '' : 's'
        } in ${window.label.toLowerCase()}.`;

  return {
    matched: true,
    intent: 'category_spend',
    headline: `${category.name} (${window.label})`,
    periodLabel: window.label,
    primaryAmount: netTotal,
    primaryLabel: category.group === 'income' ? 'Total received' : 'Net spent',
    deltaText,
    deltaTone,
    summary,
    rows,
    drillAction: {
      label: `View ${category.name}`,
      nav: 'transactions',
      categoryId: category.id,
    },
  };
}

function handleMerchantSpend(
  match: MerchantMatch,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const windowTxs = filterTransactionsForWindow(vault.transactions, window);
  const categoryById = new Map<string, Category>(vault.categories.map((c) => [c.id, c]));
  const needle = normalizeText(match.queryTerm);

  const matching = windowTxs
    .filter((tx) => {
      if (tx.type === 'transfer') {
        return false;
      }
      const normPayee = normalizeText(tx.payee);
      return normPayee.includes(needle) || needle.includes(normPayee);
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  let netExpenseCents = 0;
  let incomeCents = 0;
  let hasExpenseOrRefund = false;

  for (const tx of matching) {
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const baseCents = Math.round(
      convertToBaseCurrency(tx.amount, cur, vault.settings) * 100,
    );
    if (tx.type === 'expense') {
      netExpenseCents += baseCents;
      hasExpenseOrRefund = true;
    } else if (tx.type === 'refund') {
      netExpenseCents -= baseCents;
      hasExpenseOrRefund = true;
    } else if (tx.type === 'income') {
      incomeCents += baseCents;
    }
  }

  const totalAmount = hasExpenseOrRefund
    ? roundMoney(Math.max(0, netExpenseCents) / 100)
    : roundMoney(incomeCents / 100);

  const rows: VaultAnswerRow[] = matching.slice(0, 6).map((tx) => {
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const baseAmount = roundMoney(convertToBaseCurrency(tx.amount, cur, vault.settings));
    const signed = tx.type === 'refund' ? -baseAmount : baseAmount;
    const catName = categoryById.get(tx.categoryId)?.name ?? 'Uncategorized';
    return {
      id: tx.id,
      label: tx.payee,
      sublabel: `${tx.date} · ${tx.type === 'refund' ? 'Refund' : catName}`,
      amount: signed,
      filterSearch: tx.payee,
      filterCategoryId: tx.categoryId,
    };
  });

  const displayTitle = matching[0]?.payee ?? match.displayName;
  const searchQuery =
    match.queryTerm.length >= 3 && matching.length > 1 ? match.queryTerm : displayTitle;

  const summary =
    matching.length === 0
      ? `No transactions found for ${match.displayName} in ${window.label.toLowerCase()}.`
      : `${matching.length} transaction${matching.length === 1 ? '' : 's'} matching "${displayTitle}" totaling ${formatCurrency(
          totalAmount,
          baseCurrency,
        )} in ${window.label.toLowerCase()}.`;

  return {
    matched: true,
    intent: 'merchant_spend',
    headline: `${displayTitle} (${window.label})`,
    periodLabel: window.label,
    primaryAmount: totalAmount,
    primaryLabel: hasExpenseOrRefund ? 'Net spent' : 'Total received',
    summary,
    rows,
    drillAction: {
      label: `Filter "${displayTitle}"`,
      nav: 'transactions',
      searchQuery,
    },
  };
}

function handleKeywordSearch(
  originalQuery: string,
  normalized: string,
  vault: VaultData,
  window: TimeWindow,
  accountCurrencies: Map<string, CurrencyCode>,
): VaultAnswer {
  const baseCurrency = vault.settings.baseCurrency;
  const cleaned = stripTimePhrases(normalized, window);
  const keywords = cleaned
    .split(/[^a-z0-9']+/)
    .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));

  if (keywords.length === 0) {
    return {
      matched: false,
      intent: 'keyword_search',
      headline: `Couldn't match "${originalQuery.trim()}"`,
      periodLabel: window.label,
      summary:
        'Try asking about a category (e.g. "dining this month"), a merchant (e.g. "Trader Joe\'s"), "top 5 merchants", "total subscriptions", or "net worth".',
      rows: [],
    };
  }

  const windowTxs = filterTransactionsForWindow(vault.transactions, window);
  const categoryById = new Map<string, Category>(vault.categories.map((c) => [c.id, c]));

  const matches = windowTxs
    .filter((tx) => {
      const searchable = normalizeText(
        `${tx.payee} ${tx.notes} ${tx.tags.join(' ')}`,
      );
      return keywords.every((kw) => searchable.includes(kw));
    })
    .sort((a, b) => b.date.localeCompare(a.date));

  if (matches.length === 0) {
    return {
      matched: false,
      intent: 'keyword_search',
      headline: `No matches for "${keywords.join(' ')}"`,
      periodLabel: window.label,
      summary: `No transactions matched "${keywords.join(
        ' ',
      )}" in ${window.label.toLowerCase()}. Try widening the time range with "all time" or asking about a category or merchant.`,
      rows: [],
    };
  }

  let totalCents = 0;
  for (const tx of matches) {
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const sign = tx.type === 'refund' ? -1 : 1;
    totalCents += Math.round(
      sign * convertToBaseCurrency(tx.amount, cur, vault.settings) * 100,
    );
  }
  const totalAmount = roundMoney(Math.max(0, totalCents) / 100);
  const searchQuery = keywords.join(' ');

  const rows: VaultAnswerRow[] = matches.slice(0, 6).map((tx) => {
    const cur = getTxCurrency(tx, accountCurrencies, baseCurrency);
    const baseAmount = roundMoney(convertToBaseCurrency(tx.amount, cur, vault.settings));
    const catName = categoryById.get(tx.categoryId)?.name ?? 'Uncategorized';
    return {
      id: tx.id,
      label: tx.payee,
      sublabel: `${tx.date} · ${catName}`,
      amount: tx.type === 'refund' ? -baseAmount : baseAmount,
      filterSearch: searchQuery,
      filterCategoryId: tx.categoryId,
    };
  });

  return {
    matched: true,
    intent: 'keyword_search',
    headline: `Search: "${searchQuery}"`,
    periodLabel: window.label,
    primaryAmount: totalAmount,
    primaryLabel: `${matches.length} matching transaction${matches.length === 1 ? '' : 's'}`,
    summary: `Found ${matches.length} transaction${
      matches.length === 1 ? '' : 's'
    } matching "${searchQuery}" totaling ${formatCurrency(
      totalAmount,
      baseCurrency,
    )} in ${window.label.toLowerCase()}.`,
    rows,
    drillAction: {
      label: `Search "${searchQuery}"`,
      nav: 'transactions',
      searchQuery,
    },
  };
}

// ---------- Main Entrypoint ----------

export function askVault(
  query: string,
  vault: VaultData,
  referenceDate: Date = new Date(),
): VaultAnswer {
  const trimmed = query.trim();
  if (!trimmed) {
    return {
      matched: false,
      intent: 'empty',
      headline: 'Ask your vault',
      periodLabel: 'This month',
      summary: `Ask natural-language questions offline — for example: "${SUGGESTED_VAULT_QUERIES[0]}", "${SUGGESTED_VAULT_QUERIES[1]}", or "${SUGGESTED_VAULT_QUERIES[5]}"`,
      rows: [],
    };
  }

  const normalized = normalizeText(trimmed);
  const accountCurrencies = buildAccountCurrencyMap(vault.accounts);
  const window = extractTimeWindow(normalized, referenceDate);

  // 1. Compare period (e.g. "Compare groceries vs last month")
  if (/\b(compare|vs\.?|versus)\b/i.test(normalized)) {
    return handleComparePeriod(normalized, vault, referenceDate, accountCurrencies);
  }

  // 2. Subscriptions & recurring bills
  if (/\b(subscriptions?|recurring|bills?|upcoming)\b/i.test(normalized)) {
    return handleSubscriptions(normalized, vault, accountCurrencies);
  }

  // 3. Net worth / assets / debt / liquid cash
  if (/\b(net\s+worth|assets?|liabilit(?:y|ies)|debts?|liquid|cash)\b/i.test(normalized)) {
    return handleNetWorth(normalized, vault);
  }

  // 4. Safe to spend
  if (/\b(safe[\s-]+to[\s-]+spend|left\s+to\s+spend|available\s+to\s+spend)\b/i.test(normalized)) {
    return handleSafeToSpend(vault, referenceDate, accountCurrencies);
  }

  // 5. Savings rate
  if (
    /\bsavings?\s+rate\b/i.test(normalized) ||
    /\bhow\s+much\s+(?:did|have)\s+i\s+save\b/i.test(normalized) ||
    /\bnet\s+saved\b/i.test(normalized) ||
    (/\bsaving\b/i.test(normalized) && !/\bspen[dt]\w*\s+on\b/i.test(normalized))
  ) {
    return handleSavingsRate(vault, window, accountCurrencies);
  }

  // 6. Average daily spend / burn rate
  if (/\b(average\s+daily|daily\s+(?:spend|spending|average|burn)|burn\s+rate|per\s+day)\b/i.test(normalized)) {
    return handleDailySpend(vault, window, referenceDate, accountCurrencies);
  }

  // 7. Top merchants
  if (
    /\b(top\s+\d*\s*(?:merchants?|payees?|stores?|places?|vendors?)|where\s+(?:do|did)\s+i\s+spend|most\s+spent\s+at)\b/i.test(
      normalized,
    )
  ) {
    return handleTopMerchants(normalized, vault, window, accountCurrencies);
  }

  // 8. Top categories / spending breakdown
  if (
    /\b(top\s+\d*\s*categor(?:y|ies)|(?:biggest|largest)\s+categor(?:y|ies)|spending\s+breakdown|breakdown\s+by\s+category)\b/i.test(
      normalized,
    )
  ) {
    return handleTopCategories(normalized, vault, window, accountCurrencies);
  }

  // 9. Largest individual transactions
  if (
    /\b(biggest|largest|most\s+expensive|highest\s+(?:expense|expenses|purchase|purchases|transaction|transactions|spend))\b/i.test(
      normalized,
    )
  ) {
    return handleLargestTransactions(normalized, vault, window, accountCurrencies);
  }

  // 10 & 11. Category spend vs Merchant spend
  const merchantMatch = findMatchingMerchant(normalized, window, vault.transactions);
  const categoryMatch = findMatchingCategory(normalized, vault.categories);

  // Explicit merchant lookup (e.g. "how much at Blue Bottle Coffee" or exact full payee) wins over incidental category word overlap
  if (merchantMatch && merchantMatch.explicit) {
    return handleMerchantSpend(merchantMatch, vault, window, accountCurrencies);
  }

  if (categoryMatch) {
    return handleCategorySpend(categoryMatch, vault, window, accountCurrencies);
  }

  if (merchantMatch) {
    return handleMerchantSpend(merchantMatch, vault, window, accountCurrencies);
  }

  // Overall total spend without category/merchant (e.g. "How much did I spend this month?")
  if (
    /\b(how\s+much\s+(?:did|have)\s+i\s+spen[dt]|total\s+(?:spend|spending|expenses?)|my\s+spending)\b/i.test(
      normalized,
    )
  ) {
    const cleaned = stripTimePhrases(normalized, window);
    const leftover = cleaned
      .split(/[^a-z0-9']+/)
      .filter((w) => w.length >= 2 && !STOP_WORDS.has(w));
    if (leftover.length === 0) {
      return handleTopCategories(
        normalized,
        vault,
        window,
        accountCurrencies,
        `Total spending (${window.label})`,
      );
    }
  }

  // 12. Keyword search fallback
  return handleKeywordSearch(trimmed, normalized, vault, window, accountCurrencies);
}
