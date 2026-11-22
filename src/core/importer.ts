import type {
  Account,
  BankImportPreset,
  Category,
  CategoryRule,
  ParsedImportRow,
  Transaction,
} from '../types/finance';
import { applyRulesToTransaction } from './rules';

function normalizePayee(payee: string): string {
  return payee
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

export function computeImportHash(date: string, amount: number, payee: string): string {
  const canonical = `${date.trim()}|${Math.abs(amount).toFixed(2)}|${normalizePayee(payee)}`;

  // Dual FNV-1a 32-bit hashes combined for a compact, collision-resistant deterministic fingerprint
  let h1 = 0x811c9dc5;
  let h2 = 0x01000193;
  for (let i = 0; i < canonical.length; i += 1) {
    const c = canonical.charCodeAt(i);
    h1 ^= c;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= c ^ (i & 0xff);
    h2 = Math.imul(h2, 0x85ebca6b);
  }

  const hex1 = (h1 >>> 0).toString(16).padStart(8, '0');
  const hex2 = (h2 >>> 0).toString(16).padStart(8, '0');
  return `imp_${hex1}${hex2}`;
}

function detectDelimiter(content: string): ',' | ';' | '\t' {
  const firstLine =
    content
      .split(/\r?\n/)
      .map((l) => l.trim())
      .find((l) => l.length > 0) ?? '';

  const counts: Record<',' | ';' | '\t', number> = { ',': 0, ';': 0, '\t': 0 };
  let inQuotes = false;

  for (let i = 0; i < firstLine.length; i += 1) {
    const ch = firstLine[i];
    if (ch === '"') {
      inQuotes = !inQuotes;
    } else if (!inQuotes) {
      if (ch === ',' || ch === ';' || ch === '\t') {
        counts[ch] += 1;
      }
    }
  }

  if (counts['\t'] > counts[','] && counts['\t'] >= counts[';']) {
    return '\t';
  }
  if (counts[';'] > counts[',']) {
    return ';';
  }
  return ',';
}

/**
 * RFC 4180 compliant CSV parser with automatic delimiter detection.
 */
export function parseCsvRaw(
  content: string,
  delimiter?: ',' | ';' | '\t',
): string[][] {
  const cleaned = content.replace(/^\uFEFF/, '');
  if (!cleaned.trim()) {
    return [];
  }

  const sep = delimiter ?? detectDelimiter(cleaned);
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];

    if (inQuotes) {
      if (ch === '"') {
        if (cleaned[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i += 1;
        continue;
      }
      field += ch;
      i += 1;
      continue;
    }

    if (ch === '"' && field.length === 0) {
      inQuotes = true;
      i += 1;
      continue;
    }

    if (ch === sep) {
      row.push(field.trim());
      field = '';
      i += 1;
      continue;
    }

    if (ch === '\r' || ch === '\n') {
      row.push(field.trim());
      if (row.some((cell) => cell.length > 0)) {
        rows.push(row);
      }
      row = [];
      field = '';
      if (ch === '\r' && cleaned[i + 1] === '\n') {
        i += 2;
      } else {
        i += 1;
      }
      continue;
    }

    field += ch;
    i += 1;
  }

  if (field.length > 0 || row.length > 0) {
    row.push(field.trim());
    if (row.some((cell) => cell.length > 0)) {
      rows.push(row);
    }
  }

  return rows;
}

function isValidYmd(year: number, month: number, day: number): boolean {
  if (year < 1900 || year > 2100 || month < 1 || month > 12 || day < 1 || day > 31) {
    return false;
  }
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

function formatYmd(year: number, month: number, day: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function parseFlexibleDate(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  // 1. ISO YYYY-MM-DD / YYYY/MM/DD / YYYY.MM.DD (with optional trailing time)
  const isoMatch = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})/.exec(trimmed);
  if (isoMatch) {
    const y = Number(isoMatch[1]);
    const m = Number(isoMatch[2]);
    const d = Number(isoMatch[3]);
    return isValidYmd(y, m, d) ? formatYmd(y, m, d) : null;
  }

  // 2. OFX compact YYYYMMDD...
  const ofxMatch = /^(\d{4})(\d{2})(\d{2})/.exec(trimmed);
  if (ofxMatch) {
    const y = Number(ofxMatch[1]);
    const m = Number(ofxMatch[2]);
    const d = Number(ofxMatch[3]);
    return isValidYmd(y, m, d) ? formatYmd(y, m, d) : null;
  }

  // 3. MM/DD/YYYY, DD/MM/YYYY, DD.MM.YYYY, MM-DD-YYYY, or 2-digit year
  const slashMatch = /^(\d{1,2})([/.-])(\d{1,2})\2(\d{2,4})$/.exec(trimmed);
  if (slashMatch) {
    const p1 = Number(slashMatch[1]);
    const sep = slashMatch[2];
    const p2 = Number(slashMatch[3]);
    let year = Number(slashMatch[4]);
    if (year < 100) {
      year += year >= 70 ? 1900 : 2000;
    }

    let month: number;
    let day: number;
    if (p1 > 12 && p2 <= 12) {
      // Unambiguously DD/MM/YYYY
      day = p1;
      month = p2;
    } else if (p2 > 12 && p1 <= 12) {
      // Unambiguously MM/DD/YYYY
      month = p1;
      day = p2;
    } else if (sep === '.') {
      // European dotted format DD.MM.YYYY
      day = p1;
      month = p2;
    } else {
      // Default to MM/DD/YYYY
      month = p1;
      day = p2;
    }

    return isValidYmd(year, month, day) ? formatYmd(year, month, day) : null;
  }

  // 4. Fallback native parse for textual dates like "Nov 22, 2026"
  const parsed = new Date(trimmed);
  if (!Number.isNaN(parsed.getTime())) {
    return formatYmd(parsed.getFullYear(), parsed.getMonth() + 1, parsed.getDate());
  }

  return null;
}

function parseFlexibleAmount(raw: string): number | null {
  let s = raw.trim();
  if (!s) {
    return null;
  }

  let negative = false;
  if (s.startsWith('(') && s.endsWith(')')) {
    negative = true;
    s = s.slice(1, -1).trim();
  }
  if (s.endsWith('-')) {
    negative = true;
    s = s.slice(0, -1).trim();
  }

  s = s.replace(/[$€£¥₱\s]/g, '');
  if (s.startsWith('-')) {
    negative = !negative;
    s = s.slice(1);
  } else if (s.startsWith('+')) {
    s = s.slice(1);
  }

  if (!s) {
    return null;
  }

  const lastComma = s.lastIndexOf(',');
  const lastDot = s.lastIndexOf('.');
  if (lastComma > -1 && lastDot > -1) {
    if (lastComma > lastDot) {
      // European format: 1.234,56
      s = s.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56
      s = s.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    const digitsAfter = s.length - lastComma - 1;
    if (digitsAfter === 2 || digitsAfter === 1) {
      s = s.replace(',', '.');
    } else {
      s = s.replace(/,/g, '');
    }
  }

  const num = Number(s);
  if (!Number.isFinite(num)) {
    return null;
  }

  return roundMoney(negative ? -Math.abs(num) : num);
}

function isoDateDiffDays(aIso: string, bIso: string): number {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  const aUtc = Date.UTC(ay, am - 1, ad);
  const bUtc = Date.UTC(by, bm - 1, bd);
  return Math.abs(Math.round((aUtc - bUtc) / 86_400_000));
}

function payeesFuzzyMatch(a: string, b: string): boolean {
  const na = normalizePayee(a);
  const nb = normalizePayee(b);
  if (!na || !nb) {
    return false;
  }
  if (na === nb) {
    return true;
  }
  if (na.length >= 4 && nb.length >= 4) {
    return na.includes(nb) || nb.includes(na);
  }
  return false;
}

function checkDuplicate(
  date: string,
  absAmount: number,
  payee: string,
  importHash: string,
  existingTransactions: Transaction[],
  existingHashes: Set<string>,
  seenBatchHashes: Set<string>,
): boolean {
  if (existingHashes.has(importHash) || seenBatchHashes.has(importHash)) {
    return true;
  }

  for (const tx of existingTransactions) {
    if (Math.abs(tx.amount - absAmount) >= 0.01) {
      continue;
    }
    if (isoDateDiffDays(tx.date, date) > 2) {
      continue;
    }
    if (payeesFuzzyMatch(tx.payee, payee)) {
      return true;
    }
  }

  return false;
}

function inferImportType(
  signedAmount: number,
  payee: string,
  notes: string,
): 'expense' | 'income' | 'refund' {
  if (signedAmount < 0) {
    return 'expense';
  }
  const combined = `${payee} ${notes}`.toLowerCase();
  if (combined.includes('refund') || combined.includes('return credit')) {
    return 'refund';
  }
  return 'income';
}

function buildExistingHashSet(existingTransactions: Transaction[]): Set<string> {
  const set = new Set<string>();
  for (const tx of existingTransactions) {
    if (tx.importHash) {
      set.add(tx.importHash);
    }
    set.add(computeImportHash(tx.date, tx.amount, tx.payee));
  }
  return set;
}

export function previewCsvImport(
  rows: string[][],
  mapping: Omit<BankImportPreset, 'id' | 'name'>,
  existingTransactions: Transaction[],
  rules: CategoryRule[],
  fallbackCategoryId: string,
): ParsedImportRow[] {
  const existingHashes = buildExistingHashSet(existingTransactions);
  const seenBatchHashes = new Set<string>();
  const results: ParsedImportRow[] = [];

  const startRow = Math.max(0, mapping.skipRows);

  for (let i = startRow; i < rows.length; i += 1) {
    const row = rows[i];
    if (!row || row.length === 0) {
      continue;
    }

    const rawDate = row[mapping.dateColumn] ?? '';
    const date = parseFlexibleDate(rawDate);
    if (!date) {
      continue;
    }

    let signedAmount: number | null = null;
    if (
      mapping.debitColumn !== undefined &&
      mapping.creditColumn !== undefined &&
      mapping.debitColumn >= 0 &&
      mapping.creditColumn >= 0
    ) {
      const debitVal = parseFlexibleAmount(row[mapping.debitColumn] ?? '') ?? 0;
      const creditVal = parseFlexibleAmount(row[mapping.creditColumn] ?? '') ?? 0;
      if (debitVal === 0 && creditVal === 0) {
        continue;
      }
      signedAmount = roundMoney(Math.abs(creditVal) - Math.abs(debitVal));
    } else {
      signedAmount = parseFlexibleAmount(row[mapping.amountColumn] ?? '');
    }

    if (signedAmount === null || signedAmount === 0) {
      continue;
    }

    if (mapping.invertAmount) {
      signedAmount = roundMoney(-signedAmount);
    }

    const rawPayee = (row[mapping.payeeColumn] ?? '').trim() || 'Unknown Payee';
    const notes =
      mapping.notesColumn !== undefined && mapping.notesColumn >= 0
        ? (row[mapping.notesColumn] ?? '').trim()
        : '';
    const absAmount = roundMoney(Math.abs(signedAmount));
    const type = inferImportType(signedAmount, rawPayee, notes);

    const importHash = computeImportHash(date, absAmount, rawPayee);
    const ruleResult = applyRulesToTransaction(
      {
        payee: rawPayee,
        notes,
        amount: absAmount,
        categoryId: fallbackCategoryId,
        tags: [],
      },
      rules,
    );

    const isDuplicate =
      checkDuplicate(
        date,
        absAmount,
        rawPayee,
        importHash,
        existingTransactions,
        existingHashes,
        seenBatchHashes,
      ) ||
      (ruleResult.payee !== rawPayee &&
        checkDuplicate(
          date,
          absAmount,
          ruleResult.payee,
          computeImportHash(date, absAmount, ruleResult.payee),
          existingTransactions,
          existingHashes,
          seenBatchHashes,
        ));

    seenBatchHashes.add(importHash);

    results.push({
      rowIndex: i,
      date,
      payee: ruleResult.payee,
      amount: absAmount,
      type,
      notes,
      categoryId: ruleResult.categoryId ?? fallbackCategoryId,
      tags: ruleResult.tags,
      importHash,
      isDuplicate,
      selected: !isDuplicate,
    });
  }

  return results;
}

function extractOfxTag(block: string, tagName: string): string {
  const xmlRegex = new RegExp(`<${tagName}>([^<]*)</${tagName}>`, 'i');
  const xmlMatch = xmlRegex.exec(block);
  if (xmlMatch) {
    return xmlMatch[1].trim();
  }
  const sgmlRegex = new RegExp(`<${tagName}>([^<\\r\\n]+)`, 'i');
  const sgmlMatch = sgmlRegex.exec(block);
  return sgmlMatch ? sgmlMatch[1].trim() : '';
}

export function parseOfxImport(
  content: string,
  existingTransactions: Transaction[],
  rules: CategoryRule[],
  fallbackCategoryId: string,
): ParsedImportRow[] {
  const existingHashes = buildExistingHashSet(existingTransactions);
  const seenBatchHashes = new Set<string>();
  const results: ParsedImportRow[] = [];

  const blockRegex = /<STMTTRN>([\s\S]*?)<\/STMTTRN>/gi;
  let match: RegExpExecArray | null;
  let rowIndex = 0;

  while ((match = blockRegex.exec(content)) !== null) {
    const block = match[1];
    const dtPosted = extractOfxTag(block, 'DTPOSTED');
    const trnAmt = extractOfxTag(block, 'TRNAMT');
    const name = extractOfxTag(block, 'NAME');
    const memo = extractOfxTag(block, 'MEMO');

    const date = parseFlexibleDate(dtPosted);
    const signedAmount = parseFlexibleAmount(trnAmt);
    if (!date || signedAmount === null || signedAmount === 0) {
      rowIndex += 1;
      continue;
    }

    const rawPayee = name || memo || 'Bank Transaction';
    const notes = memo && memo !== rawPayee ? memo : '';
    const absAmount = roundMoney(Math.abs(signedAmount));
    const type = inferImportType(signedAmount, rawPayee, notes);
    const importHash = computeImportHash(date, absAmount, rawPayee);

    const ruleResult = applyRulesToTransaction(
      {
        payee: rawPayee,
        notes,
        amount: absAmount,
        categoryId: fallbackCategoryId,
        tags: [],
      },
      rules,
    );

    const isDuplicate =
      checkDuplicate(
        date,
        absAmount,
        rawPayee,
        importHash,
        existingTransactions,
        existingHashes,
        seenBatchHashes,
      ) ||
      (ruleResult.payee !== rawPayee &&
        checkDuplicate(
          date,
          absAmount,
          ruleResult.payee,
          computeImportHash(date, absAmount, ruleResult.payee),
          existingTransactions,
          existingHashes,
          seenBatchHashes,
        ));

    seenBatchHashes.add(importHash);

    results.push({
      rowIndex,
      date,
      payee: ruleResult.payee,
      amount: absAmount,
      type,
      notes,
      categoryId: ruleResult.categoryId ?? fallbackCategoryId,
      tags: ruleResult.tags,
      importHash,
      isDuplicate,
      selected: !isDuplicate,
    });

    rowIndex += 1;
  }

  return results;
}

function escapeCsvCell(value: string): string {
  if (
    value.includes(',') ||
    value.includes('"') ||
    value.includes('\n') ||
    value.includes('\r')
  ) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

export function exportTransactionsToCsv(
  transactions: Transaction[],
  accounts: Account[],
  categories: Category[],
): string {
  const accountMap = new Map(accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  const headers = [
    'Date',
    'Type',
    'Payee',
    'Amount',
    'Category',
    'Account',
    'TransferAccount',
    'Tags',
    'Notes',
    'Reviewed',
  ];

  const lines: string[] = [headers.join(',')];

  const sorted = [...transactions].sort((a, b) => b.date.localeCompare(a.date));

  for (const tx of sorted) {
    const signedAmount =
      tx.type === 'expense' ? -Math.abs(tx.amount) : Math.abs(tx.amount);
    const categoryName =
      tx.splits && tx.splits.length > 0
        ? tx.splits
            .map(
              (s) =>
                `${categoryMap.get(s.categoryId) ?? s.categoryId}:${s.amount.toFixed(2)}`,
            )
            .join('; ')
        : categoryMap.get(tx.categoryId) ?? tx.categoryId;

    const row = [
      tx.date,
      tx.type,
      tx.payee,
      signedAmount.toFixed(2),
      categoryName,
      accountMap.get(tx.accountId) ?? tx.accountId,
      tx.transferAccountId ? accountMap.get(tx.transferAccountId) ?? tx.transferAccountId : '',
      tx.tags.join(';'),
      tx.notes,
      tx.reviewed ? 'true' : 'false',
    ];

    lines.push(row.map(escapeCsvCell).join(','));
  }

  return lines.join('\n');
}
