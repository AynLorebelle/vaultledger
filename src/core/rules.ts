import type { CategoryRule, Transaction } from '../types/finance';

export interface RuleTargetTransaction {
  payee: string;
  notes?: string;
  amount?: number;
  categoryId?: string;
  tags?: string[];
  reviewed?: boolean;
}

export interface RuleApplicationResult {
  payee: string;
  categoryId?: string;
  tags: string[];
  reviewed?: boolean;
  matchedRuleId?: string;
}

function matchesPattern(
  text: string,
  pattern: string,
  matchType: CategoryRule['matchType'],
): boolean {
  const trimmedPattern = pattern.trim();
  if (!trimmedPattern) {
    return false;
  }
  const normalizedText = text.trim();
  if (!normalizedText) {
    return false;
  }

  switch (matchType) {
    case 'contains':
      return normalizedText.toLowerCase().includes(trimmedPattern.toLowerCase());
    case 'startsWith':
      return normalizedText.toLowerCase().startsWith(trimmedPattern.toLowerCase());
    case 'equals':
      return normalizedText.toLowerCase() === trimmedPattern.toLowerCase();
    case 'regex':
      try {
        return new RegExp(trimmedPattern, 'i').test(normalizedText);
      } catch {
        return false;
      }
    default:
      return false;
  }
}

function ruleMatchesTransaction(tx: RuleTargetTransaction, rule: CategoryRule): boolean {
  if (!rule.enabled) {
    return false;
  }

  if (rule.minAmount !== undefined) {
    if (tx.amount === undefined || Math.abs(tx.amount) < rule.minAmount) {
      return false;
    }
  }

  if (rule.maxAmount !== undefined) {
    if (tx.amount === undefined || Math.abs(tx.amount) > rule.maxAmount) {
      return false;
    }
  }

  const payee = tx.payee ?? '';
  const notes = tx.notes ?? '';

  switch (rule.matchField) {
    case 'payee':
      return matchesPattern(payee, rule.pattern, rule.matchType);
    case 'notes':
      return matchesPattern(notes, rule.pattern, rule.matchType);
    case 'any':
      return (
        matchesPattern(payee, rule.pattern, rule.matchType) ||
        matchesPattern(notes, rule.pattern, rule.matchType)
      );
    default:
      return false;
  }
}

export function applyRulesToTransaction(
  tx: RuleTargetTransaction,
  rules: CategoryRule[],
): RuleApplicationResult {
  const sortedRules = [...rules]
    .filter((r) => r.enabled)
    .sort((a, b) => a.priority - b.priority);

  let payee = tx.payee;
  let categoryId = tx.categoryId;
  let reviewed = tx.reviewed;
  let matchedRuleId: string | undefined;

  const tagSet = new Set<string>(
    (tx.tags ?? []).map((t) => t.trim()).filter((t) => t.length > 0),
  );

  let payeeRenamed = false;
  let categoryAssigned = false;

  for (const rule of sortedRules) {
    if (!ruleMatchesTransaction(tx, rule)) {
      continue;
    }

    if (!matchedRuleId) {
      matchedRuleId = rule.id;
    }

    if (!payeeRenamed && rule.renamePayeeTo && rule.renamePayeeTo.trim().length > 0) {
      payee = rule.renamePayeeTo.trim();
      payeeRenamed = true;
    }

    if (!categoryAssigned && rule.assignCategoryId) {
      categoryId = rule.assignCategoryId;
      categoryAssigned = true;
    }

    if (rule.addTags && rule.addTags.length > 0) {
      for (const tag of rule.addTags) {
        const clean = tag.trim();
        if (clean.length > 0) {
          tagSet.add(clean);
        }
      }
    }

    if (rule.markReviewed === true) {
      reviewed = true;
    }
  }

  return {
    payee,
    categoryId,
    tags: Array.from(tagSet),
    reviewed,
    matchedRuleId,
  };
}

export function suggestRulesFromTransactions(
  transactions: Transaction[],
  existingRules: CategoryRule[],
): Array<{ payee: string; categoryId: string; count: number }> {
  interface PayeeStats {
    displayNames: Map<string, number>;
    categoryCounts: Map<string, number>;
    totalCategorized: number;
  }

  const byPayee = new Map<string, PayeeStats>();

  for (const tx of transactions) {
    if (tx.type === 'transfer') {
      continue;
    }
    const rawPayee = tx.payee.trim();
    if (!rawPayee || !tx.categoryId || tx.categoryId === 'cat_uncategorized') {
      continue;
    }

    const key = rawPayee.toLowerCase();
    let stats = byPayee.get(key);
    if (!stats) {
      stats = {
        displayNames: new Map<string, number>(),
        categoryCounts: new Map<string, number>(),
        totalCategorized: 0,
      };
      byPayee.set(key, stats);
    }

    stats.displayNames.set(rawPayee, (stats.displayNames.get(rawPayee) ?? 0) + 1);
    stats.categoryCounts.set(
      tx.categoryId,
      (stats.categoryCounts.get(tx.categoryId) ?? 0) + 1,
    );
    stats.totalCategorized += 1;
  }

  const suggestions: Array<{ payee: string; categoryId: string; count: number }> = [];

  for (const [, stats] of byPayee) {
    let bestCategoryId = '';
    let bestCount = 0;
    for (const [catId, count] of stats.categoryCounts) {
      if (count > bestCount) {
        bestCount = count;
        bestCategoryId = catId;
      }
    }

    // Require at least 2 occurrences with identical category (and clear majority >= 75%)
    if (bestCount < 2 || bestCount / stats.totalCategorized < 0.75) {
      continue;
    }

    let displayPayee = '';
    let bestNameCount = 0;
    for (const [name, count] of stats.displayNames) {
      if (count > bestNameCount) {
        bestNameCount = count;
        displayPayee = name;
      }
    }

    // Skip if an existing enabled rule already matches this payee and assigns a category
    const simulated = applyRulesToTransaction({ payee: displayPayee }, existingRules);
    if (simulated.matchedRuleId && simulated.categoryId === bestCategoryId) {
      continue;
    }

    suggestions.push({
      payee: displayPayee,
      categoryId: bestCategoryId,
      count: bestCount,
    });
  }

  suggestions.sort((a, b) => {
    if (b.count !== a.count) {
      return b.count - a.count;
    }
    return a.payee.localeCompare(b.payee);
  });

  return suggestions;
}
