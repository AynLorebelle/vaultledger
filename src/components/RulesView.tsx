import React, { useMemo, useState } from 'react';
import {
  Sparkles,
  Plus,
  Play,
  Edit3,
  Trash2,
  SlidersHorizontal,
  CheckCircle2,
  ArrowRight,
  Tag,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { applyRulesToTransaction, suggestRulesFromTransactions } from '../core/rules';
import type { CategoryRule } from '../types/finance';
import { Modal, formatMoney } from './ui';

interface RuleDraft {
  id?: string;
  name: string;
  enabled: boolean;
  matchField: CategoryRule['matchField'];
  matchType: CategoryRule['matchType'];
  pattern: string;
  minAmount: string;
  maxAmount: string;
  renamePayeeTo: string;
  assignCategoryId: string;
  addTagsText: string;
  markReviewed: boolean;
  priority: number;
}

const EMPTY_DRAFT: RuleDraft = {
  name: '',
  enabled: true,
  matchField: 'payee',
  matchType: 'contains',
  pattern: '',
  minAmount: '',
  maxAmount: '',
  renamePayeeTo: '',
  assignCategoryId: '',
  addTagsText: '',
  markReviewed: true,
  priority: 10,
};

export const RulesView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const addRule = useFinanceStore((s) => s.addRule);
  const updateRule = useFinanceStore((s) => s.updateRule);
  const deleteRule = useFinanceStore((s) => s.deleteRule);
  const runRulesOnAllTransactions = useFinanceStore((s) => s.runRulesOnAllTransactions);
  const showToast = useFinanceStore((s) => s.showToast);

  const [modalOpen, setModalOpen] = useState(false);
  const [draft, setDraft] = useState<RuleDraft>(EMPTY_DRAFT);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  const categoryMap = useMemo(() => {
    const m = new Map<string, (typeof data.categories)[number]>();
    data.categories.forEach((c) => m.set(c.id, c));
    return m;
  }, [data.categories]);

  const suggestions = useMemo(
    () => suggestRulesFromTransactions(data.transactions, data.rules).slice(0, 6),
    [data.transactions, data.rules]
  );

  const sortedRules = useMemo(
    () => [...data.rules].sort((a, b) => a.priority - b.priority),
    [data.rules]
  );

  const openNewRule = () => {
    setDraft({
      ...EMPTY_DRAFT,
      priority: (data.rules.length + 1) * 10,
      assignCategoryId: data.categories.find((c) => c.group !== 'income')?.id ?? '',
    });
    setModalOpen(true);
  };

  const openEditRule = (rule: CategoryRule) => {
    setDraft({
      id: rule.id,
      name: rule.name,
      enabled: rule.enabled,
      matchField: rule.matchField,
      matchType: rule.matchType,
      pattern: rule.pattern,
      minAmount: rule.minAmount !== undefined ? String(rule.minAmount) : '',
      maxAmount: rule.maxAmount !== undefined ? String(rule.maxAmount) : '',
      renamePayeeTo: rule.renamePayeeTo ?? '',
      assignCategoryId: rule.assignCategoryId ?? '',
      addTagsText: (rule.addTags ?? []).join(', '),
      markReviewed: Boolean(rule.markReviewed),
      priority: rule.priority,
    });
    setModalOpen(true);
  };

  const handleAcceptSuggestion = (payee: string, catId: string) => {
    const cat = categoryMap.get(catId);
    addRule({
      name: `${payee} → ${cat?.name ?? 'Category'}`,
      enabled: true,
      matchField: 'payee',
      matchType: 'contains',
      pattern: payee,
      assignCategoryId: catId,
      markReviewed: true,
      priority: (data.rules.length + 1) * 10,
    });
  };

  // Live preview matches for the rule currently in the modal
  const previewMatches = useMemo(() => {
    if (!modalOpen || !draft.pattern.trim()) return [];
    const testRule: CategoryRule = {
      id: 'preview_rule',
      name: draft.name || 'Preview',
      enabled: true,
      matchField: draft.matchField,
      matchType: draft.matchType,
      pattern: draft.pattern,
      minAmount: draft.minAmount !== '' ? Number(draft.minAmount) : undefined,
      maxAmount: draft.maxAmount !== '' ? Number(draft.maxAmount) : undefined,
      renamePayeeTo: draft.renamePayeeTo.trim() || undefined,
      assignCategoryId: draft.assignCategoryId || undefined,
      addTags: draft.addTagsText
        .split(',')
        .map((t) => t.trim())
        .filter(Boolean),
      markReviewed: draft.markReviewed,
      priority: 1,
    };
    return data.transactions.filter((tx) => {
      const res = applyRulesToTransaction(tx, [testRule]);
      return res.matchedRuleId === 'preview_rule';
    });
  }, [modalOpen, draft, data.transactions]);

  const handleSaveRule = (e: React.FormEvent) => {
    e.preventDefault();
    if (!draft.pattern.trim()) {
      showToast('Enter a match pattern for the rule', 'error');
      return;
    }
    const parsedTags = draft.addTagsText
      .split(',')
      .map((s) => s.replace(/^#/, '').trim().toLowerCase())
      .filter(Boolean);

    const payload = {
      name:
        draft.name.trim() ||
        `${draft.pattern.trim()} → ${categoryMap.get(draft.assignCategoryId)?.name ?? 'Action'}`,
      enabled: draft.enabled,
      matchField: draft.matchField,
      matchType: draft.matchType,
      pattern: draft.pattern.trim(),
      minAmount: draft.minAmount !== '' ? Number(draft.minAmount) : undefined,
      maxAmount: draft.maxAmount !== '' ? Number(draft.maxAmount) : undefined,
      renamePayeeTo: draft.renamePayeeTo.trim() || undefined,
      assignCategoryId: draft.assignCategoryId || undefined,
      addTags: parsedTags.length > 0 ? parsedTags : undefined,
      markReviewed: draft.markReviewed,
      priority: Number(draft.priority) || 10,
    };

    if (draft.id) {
      updateRule(draft.id, payload);
    } else {
      addRule(payload);
    }
    setModalOpen(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-white tracking-tight">
            Auto-Categorization Rules
          </h1>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Automatically clean merchant names, assign categories, add tags, and auto-review imports.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              const updated = runRulesOnAllTransactions();
              showToast(
                updated > 0
                  ? `Updated ${updated} transaction${updated === 1 ? '' : 's'} using your active rules`
                  : 'All transactions already match your active rules',
                updated > 0 ? 'success' : 'info'
              );
            }}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 text-xs font-semibold text-slate-700 dark:text-slate-200 transition-colors cursor-pointer"
          >
            <Play className="w-3.5 h-3.5 text-emerald-500" />
            <span>Run All Rules on Existing Transactions</span>
          </button>
          <button
            type="button"
            onClick={openNewRule}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Rule</span>
          </button>
        </div>
      </div>

      {/* Smart Suggested Rules Banner */}
      {suggestions.length > 0 && (
        <div className="rounded-2xl bg-indigo-500/8 dark:bg-indigo-500/10 border border-indigo-500/25 p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-500" />
              <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                Smart Rule Suggestions
              </h2>
              <span className="px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 text-[11px] font-semibold">
                {suggestions.length} detected
              </span>
            </div>
            <span className="text-xs text-slate-500 dark:text-slate-400 hidden sm:inline">
              Based on payees you&apos;ve categorized consistently
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {suggestions.map((sug) => {
              const cat = categoryMap.get(sug.categoryId);
              return (
                <div
                  key={`${sug.payee}-${sug.categoryId}`}
                  className="flex items-center justify-between gap-3 px-3.5 py-2.5 rounded-xl bg-white/90 dark:bg-slate-900/90 border border-slate-200/80 dark:border-slate-800"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-slate-900 dark:text-slate-100 truncate">
                      {sug.payee}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                      <ArrowRight className="w-3 h-3 shrink-0 text-slate-400" />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color ?? '#6366f1' }}
                      />
                      <span className="truncate">{cat?.name ?? sug.categoryId}</span>
                      <span className="text-slate-400 tabular-nums">({sug.count}×)</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAcceptSuggestion(sug.payee, sug.categoryId)}
                    className="px-2.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-[11px] font-semibold shrink-0 transition-colors cursor-pointer"
                  >
                    Create Rule
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Active Rules List */}
      <div className="rounded-2xl bg-white dark:bg-slate-900/70 border border-slate-200 dark:border-slate-800/80 overflow-hidden">
        {sortedRules.length === 0 ? (
          <div className="p-10 text-center">
            <SlidersHorizontal className="w-8 h-8 text-slate-300 dark:text-slate-700 mx-auto mb-3" />
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-300">
              No categorization rules yet
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Create your first rule to automatically categorize bank imports and recurring merchants.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100 dark:divide-slate-800/80">
            {sortedRules.map((rule) => {
              const cat = rule.assignCategoryId ? categoryMap.get(rule.assignCategoryId) : null;
              return (
                <div
                  key={rule.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors ${
                    rule.enabled ? '' : 'opacity-55 bg-slate-50/60 dark:bg-slate-950/30'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                      className={`mt-0.5 w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer ${
                        rule.enabled ? 'bg-indigo-600' : 'bg-slate-300 dark:bg-slate-700'
                      }`}
                      aria-label={rule.enabled ? 'Disable rule' : 'Enable rule'}
                    >
                      <span
                        className={`block w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform ${
                          rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <div className="min-w-0 space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {rule.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[10px] font-mono text-slate-500">
                          P{rule.priority}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 font-mono text-[11px]">
                          IF {rule.matchField} {rule.matchType} &quot;{rule.pattern}&quot;
                        </span>
                        {(rule.minAmount !== undefined || rule.maxAmount !== undefined) && (
                          <span className="px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800/90 text-slate-600 dark:text-slate-300 text-[11px] tabular-nums">
                            Amount:{' '}
                            {rule.minAmount !== undefined
                              ? formatMoney(rule.minAmount, currency)
                              : '0'}{' '}
                            –{' '}
                            {rule.maxAmount !== undefined
                              ? formatMoney(rule.maxAmount, currency)
                              : '∞'}
                          </span>
                        )}
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400" />
                        {cat && (
                          <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md bg-indigo-500/12 text-indigo-700 dark:text-indigo-300 font-medium text-[11px]">
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        )}
                        {rule.renamePayeeTo && (
                          <span className="px-2 py-0.5 rounded-md bg-emerald-500/12 text-emerald-700 dark:text-emerald-300 text-[11px]">
                            Rename → {rule.renamePayeeTo}
                          </span>
                        )}
                        {rule.addTags?.map((tg) => (
                          <span
                            key={tg}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[11px]"
                          >
                            <Tag className="w-2.5 h-2.5" />#{tg}
                          </span>
                        ))}
                        {rule.markReviewed && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 text-[11px]">
                            <CheckCircle2 className="w-3 h-3" />
                            Auto-Review
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 self-end md:self-center shrink-0">
                    <button
                      type="button"
                      onClick={() => openEditRule(rule)}
                      className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
                      aria-label="Edit rule"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule.id)}
                      className="p-2 rounded-lg text-slate-400 hover:text-rose-500 hover:bg-rose-500/10 cursor-pointer"
                      aria-label="Delete rule"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add / Edit Rule Modal */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={draft.id ? 'Edit Rule' : 'Create Auto-Categorization Rule'}
        subtitle="Test patterns live against your existing transactions"
        maxWidthClass="max-w-xl"
      >
        <form onSubmit={handleSaveRule} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="sm:col-span-2">
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Coffee Shops → Dining Out"
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Priority (lower runs first)
              </label>
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 1 })}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm tabular-nums outline-none focus:border-indigo-500"
              />
            </div>
          </div>

          {/* Match Condition */}
          <div className="rounded-xl bg-slate-50 dark:bg-slate-950/60 border border-slate-200 dark:border-slate-800 p-3.5 space-y-3">
            <div className="text-xs font-semibold text-slate-700 dark:text-slate-200">
              When transaction matches:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <select
                value={draft.matchField}
                onChange={(e) =>
                  setDraft({ ...draft, matchField: e.target.value as CategoryRule['matchField'] })
                }
                className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-2 text-xs outline-none"
              >
                <option value="payee">Payee</option>
                <option value="notes">Notes</option>
                <option value="any">Payee or Notes</option>
              </select>
              <select
                value={draft.matchType}
                onChange={(e) =>
                  setDraft({ ...draft, matchType: e.target.value as CategoryRule['matchType'] })
                }
                className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-2 text-xs outline-none"
              >
                <option value="contains">Contains</option>
                <option value="startsWith">Starts with</option>
                <option value="equals">Equals</option>
                <option value="regex">Regex</option>
              </select>
              <input
                type="text"
                value={draft.pattern}
                onChange={(e) => setDraft({ ...draft, pattern: e.target.value })}
                placeholder="Pattern (e.g. Starbucks)"
                required
                className="col-span-2 sm:col-span-1 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-2 text-xs outline-none focus:border-indigo-500"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                step="0.01"
                value={draft.minAmount}
                onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })}
                placeholder="Min amount (optional)"
                className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs tabular-nums outline-none"
              />
              <input
                type="number"
                step="0.01"
                value={draft.maxAmount}
                onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })}
                placeholder="Max amount (optional)"
                className="rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 px-2.5 py-1.5 text-xs tabular-nums outline-none"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Assign Category
              </label>
              <select
                value={draft.assignCategoryId}
                onChange={(e) => setDraft({ ...draft, assignCategoryId: e.target.value })}
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              >
                <option value="">Keep existing category</option>
                {data.categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} ({c.group})
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Clean / Rename Payee (optional)
              </label>
              <input
                type="text"
                value={draft.renamePayeeTo}
                onChange={(e) => setDraft({ ...draft, renamePayeeTo: e.target.value })}
                placeholder="e.g. Starbucks Coffee"
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
                Add Tags (comma-separated)
              </label>
              <input
                type="text"
                value={draft.addTagsText}
                onChange={(e) => setDraft({ ...draft, addTagsText: e.target.value })}
                placeholder="coffee, treat"
                className="w-full rounded-xl bg-slate-50 dark:bg-slate-950 border border-slate-200 dark:border-slate-800 px-3 py-2 text-sm outline-none"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-slate-600 dark:text-slate-300 mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.markReviewed}
                onChange={(e) => setDraft({ ...draft, markReviewed: e.target.checked })}
                className="rounded border-slate-300 text-indigo-600"
              />
              <span>Auto-mark matching transactions as reviewed</span>
            </label>
          </div>

          {/* Live Test Preview */}
          <div className="rounded-xl bg-indigo-500/6 border border-indigo-500/20 p-3 space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-indigo-700 dark:text-indigo-300">
                Live Preview
              </span>
              <span className="tabular-nums text-slate-500 dark:text-slate-400">
                Matches <strong>{previewMatches.length}</strong> existing{' '}
                {previewMatches.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
            {previewMatches.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {previewMatches.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-[11px] px-2 py-1 rounded bg-white/80 dark:bg-slate-900/80"
                  >
                    <span className="truncate font-medium text-slate-700 dark:text-slate-200">
                      {tx.date} · {tx.payee}
                    </span>
                    <span className={`tabular-nums font-semibold ${privacyMask ? 'privacy-blur' : ''}`}>
                      {formatMoney(tx.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-200/80 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold cursor-pointer"
            >
              {draft.id ? 'Save Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
