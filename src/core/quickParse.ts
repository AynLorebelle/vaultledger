import type { Category } from '../types/finance';

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'op'; value: '+' | '-' | '*' | '/' }
  | { kind: 'lparen' }
  | { kind: 'rparen' };

function roundMoney(value: number): number {
  const rounded = Math.round((value + Number.EPSILON) * 100) / 100;
  return Object.is(rounded, -0) ? 0 : rounded;
}

function tokenizeExpression(expr: string): Token[] | null {
  const cleaned = expr.replace(/[$€£¥₱,]/g, '').trim();
  if (!cleaned) {
    return null;
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < cleaned.length) {
    const ch = cleaned[i];
    if (/\s/.test(ch)) {
      i += 1;
      continue;
    }

    if ((ch >= '0' && ch <= '9') || ch === '.') {
      let numStr = '';
      let dotCount = 0;
      while (
        i < cleaned.length &&
        ((cleaned[i] >= '0' && cleaned[i] <= '9') || cleaned[i] === '.')
      ) {
        if (cleaned[i] === '.') {
          dotCount += 1;
          if (dotCount > 1) {
            return null;
          }
        }
        numStr += cleaned[i];
        i += 1;
      }
      if (numStr === '.') {
        return null;
      }
      const value = Number(numStr);
      if (!Number.isFinite(value)) {
        return null;
      }
      tokens.push({ kind: 'number', value });
      continue;
    }

    if (ch === '+' || ch === '-' || ch === '*' || ch === '/') {
      tokens.push({ kind: 'op', value: ch });
      i += 1;
      continue;
    }

    if (ch === '(') {
      tokens.push({ kind: 'lparen' });
      i += 1;
      continue;
    }

    if (ch === ')') {
      tokens.push({ kind: 'rparen' });
      i += 1;
      continue;
    }

    return null;
  }

  return tokens.length > 0 ? tokens : null;
}

/**
 * Safe recursive-descent math expression evaluator supporting +, -, *, /, parentheses, and decimals.
 * Never uses eval or Function.
 */
export function evaluateAmountExpression(expr: string): number | null {
  const tokens = tokenizeExpression(expr);
  if (!tokens) {
    return null;
  }

  let pos = 0;

  function peek(): Token | undefined {
    return tokens![pos];
  }

  function consume(): Token {
    const tok = tokens![pos];
    pos += 1;
    return tok;
  }

  function parseExpr(): number | null {
    let left = parseTerm();
    if (left === null) {
      return null;
    }

    while (true) {
      const next = peek();
      if (next && next.kind === 'op' && (next.value === '+' || next.value === '-')) {
        consume();
        const right = parseTerm();
        if (right === null) {
          return null;
        }
        left = next.value === '+' ? left + right : left - right;
      } else {
        break;
      }
    }

    return left;
  }

  function parseTerm(): number | null {
    let left = parseUnary();
    if (left === null) {
      return null;
    }

    while (true) {
      const next = peek();
      if (next && next.kind === 'op' && (next.value === '*' || next.value === '/')) {
        consume();
        const right = parseUnary();
        if (right === null) {
          return null;
        }
        if (next.value === '/') {
          if (right === 0) {
            return null;
          }
          left = left / right;
        } else {
          left = left * right;
        }
      } else {
        break;
      }
    }

    return left;
  }

  function parseUnary(): number | null {
    const next = peek();
    if (next && next.kind === 'op' && (next.value === '+' || next.value === '-')) {
      consume();
      const operand = parseUnary();
      if (operand === null) {
        return null;
      }
      return next.value === '-' ? -operand : operand;
    }
    return parsePrimary();
  }

  function parsePrimary(): number | null {
    const next = peek();
    if (!next) {
      return null;
    }

    if (next.kind === 'number') {
      consume();
      return next.value;
    }

    if (next.kind === 'lparen') {
      consume();
      const inner = parseExpr();
      if (inner === null) {
        return null;
      }
      const closing = peek();
      if (!closing || closing.kind !== 'rparen') {
        return null;
      }
      consume();
      return inner;
    }

    return null;
  }

  const result = parseExpr();
  if (result === null || pos !== tokens.length || !Number.isFinite(result)) {
    return null;
  }

  return roundMoney(result);
}

const AMOUNT_TOKEN_REGEX =
  /^[+-]?[$€£¥₱]?(?:\(?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\)?)(?:[+\-*/]\(?(?:\d[\d,]*(?:\.\d+)?|\.\d+)\)?)*$/;

function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function findMatchingCategory(
  words: string[],
  categories: Category[],
): { category: Category; startIndex: number; wordCount: number } | null {
  if (words.length === 0 || categories.length === 0) {
    return null;
  }

  const normalizedWords = words.map(normalizeWord);

  // 1. Exact full category name match (prefer longest multi-word match)
  const sortedByNameLength = [...categories].sort(
    (a, b) => b.name.length - a.name.length,
  );

  for (const cat of sortedByNameLength) {
    const catWords = cat.name
      .split(/[\s&/]+/)
      .map(normalizeWord)
      .filter(Boolean);
    if (catWords.length === 0) {
      continue;
    }

    for (let i = 0; i <= normalizedWords.length - catWords.length; i += 1) {
      let allMatch = true;
      for (let j = 0; j < catWords.length; j += 1) {
        if (normalizedWords[i + j] !== catWords[j]) {
          allMatch = false;
          break;
        }
      }
      if (allMatch) {
        return { category: cat, startIndex: i, wordCount: catWords.length };
      }
    }
  }

  // 2. Single-word match against any significant word of a category name (e.g. "dining" -> "Dining Out")
  for (let i = normalizedWords.length - 1; i >= 0; i -= 1) {
    const word = normalizedWords[i];
    if (word.length < 3) {
      continue;
    }
    for (const cat of categories) {
      const catWords = cat.name
        .split(/[\s&/]+/)
        .map(normalizeWord)
        .filter((w) => w.length >= 3);

      if (catWords.some((cw) => cw === word || cw.startsWith(word) || word.startsWith(cw))) {
        return { category: cat, startIndex: i, wordCount: 1 };
      }
    }
  }

  return null;
}

export function parseQuickExpenseInput(
  input: string,
  categories: Category[],
): {
  payee: string;
  amount: number | null;
  categoryId: string | null;
  tags: string[];
  type: 'expense' | 'income' | 'refund';
} {
  const tags: string[] = [];
  const tagSet = new Set<string>();

  const withoutTags = input.replace(/#([a-zA-Z0-9_-]+)/g, (_match, tag: string) => {
    const clean = tag.toLowerCase();
    if (!tagSet.has(clean)) {
      tagSet.add(clean);
      tags.push(clean);
    }
    return ' ';
  });

  const rawTokens = withoutTags
    .trim()
    .split(/\s+/)
    .filter((t) => t.length > 0);

  let type: 'expense' | 'income' | 'refund' = 'expense';
  const filteredTokens: string[] = [];

  for (let i = 0; i < rawTokens.length; i += 1) {
    const lower = rawTokens[i].toLowerCase();
    if (lower === 'refund' && type !== 'refund') {
      type = 'refund';
      continue;
    }
    if (lower === 'income' && i === 0) {
      type = 'income';
      continue;
    }
    filteredTokens.push(rawTokens[i]);
  }

  let amount: number | null = null;
  let amountTokenIndex = -1;

  for (let i = 0; i < filteredTokens.length; i += 1) {
    const token = filteredTokens[i];
    if (!AMOUNT_TOKEN_REGEX.test(token)) {
      continue;
    }
    const evaluated = evaluateAmountExpression(token);
    if (evaluated !== null) {
      if (token.startsWith('+') && type !== 'refund') {
        type = 'income';
      }
      amount = Math.abs(evaluated);
      amountTokenIndex = i;
      break;
    }
  }

  const remainingWords = filteredTokens.filter((_, idx) => idx !== amountTokenIndex);

  let categoryId: string | null = null;
  let payeeWords = [...remainingWords];

  const categoryMatch = findMatchingCategory(remainingWords, categories);
  if (categoryMatch) {
    categoryId = categoryMatch.category.id;
    const withoutCat = [
      ...remainingWords.slice(0, categoryMatch.startIndex),
      ...remainingWords.slice(categoryMatch.startIndex + categoryMatch.wordCount),
    ];
    // Preserve payee if the category keyword was the only descriptive word (e.g. "+2500 Salary")
    if (withoutCat.length > 0) {
      payeeWords = withoutCat;
    }
  }

  const payee = payeeWords.join(' ').trim();

  return {
    payee,
    amount,
    categoryId,
    tags,
    type,
  };
}
