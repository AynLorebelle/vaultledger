import React, { useMemo, useState } from 'react';
import {
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
          <h1 className="text-xl font-bold text-[var(--text-primary)] tracking-tight">
            Auto-Categorization Rules
          </h1>
          <p className="text-xs text-[var(--text-muted)] mt-0.5">
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
            className="tactile-btn inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <Play className="w-3.5 h-3.5" style={{ color: 'var(--accent-positive)' }} />
            <span>Run All Rules on Existing Transactions</span>
          </button>
          <button
            type="button"
            onClick={openNewRule}
            className="tactile-btn-primary inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" />
            <span>New Rule</span>
          </button>
        </div>
      </div>

      {/* Smart Suggested Rules Banner */}
      {suggestions.length > 0 && (
        <div className="tactile-card border-l-4 border-l-[var(--accent-primary)] p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <SlidersHorizontal className="w-4 h-4" style={{ color: 'var(--accent-primary-text)' }} />
              <h2 className="text-sm font-semibold text-[var(--text-primary)]">
                Smart Rule Suggestions
              </h2>
              <span
                className="px-2 py-0.5 rounded-full text-[11px] font-semibold tabular-nums"
                style={{
                  backgroundColor: 'var(--accent-primary-soft)',
                  color: 'var(--accent-primary-text)',
                }}
              >
                {suggestions.length} detected
              </span>
            </div>
            <span className="text-xs text-[var(--text-muted)] hidden sm:inline">
              Based on payees you&apos;ve categorized consistently
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-2.5">
            {suggestions.map((sug) => {
              const cat = categoryMap.get(sug.categoryId);
              return (
                <div
                  key={`${sug.payee}-${sug.categoryId}`}
                  className="tactile-well flex items-center justify-between gap-3 px-3.5 py-2.5"
                >
                  <div className="min-w-0">
                    <div className="text-xs font-semibold text-[var(--text-primary)] truncate">
                      {sug.payee}
                    </div>
                    <div className="flex items-center gap-1.5 text-[11px] text-[var(--text-secondary)] mt-0.5">
                      <ArrowRight className="w-3 h-3 shrink-0 text-[var(--text-muted)]" />
                      <span
                        className="w-2 h-2 rounded-full shrink-0"
                        style={{ backgroundColor: cat?.color ?? '#1B4D3E' }}
                      />
                      <span className="truncate">{cat?.name ?? sug.categoryId}</span>
                      <span className="text-[var(--text-muted)] tabular-nums">({sug.count}×)</span>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleAcceptSuggestion(sug.payee, sug.categoryId)}
                    className="tactile-btn-primary px-2.5 py-1.5 rounded-lg text-[11px] font-semibold shrink-0 cursor-pointer"
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
      <div className="tactile-card overflow-hidden">
        {sortedRules.length === 0 ? (
          <div className="p-10 text-center">
            <SlidersHorizontal className="w-8 h-8 text-[var(--text-muted)] mx-auto mb-3 opacity-60" />
            <p className="text-sm font-semibold text-[var(--text-primary)]">
              No categorization rules yet
            </p>
            <p className="text-xs text-[var(--text-muted)] mt-1">
              Create your first rule to automatically categorize bank imports and recurring merchants.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-[var(--border-hairline)]">
            {sortedRules.map((rule) => {
              const cat = rule.assignCategoryId ? categoryMap.get(rule.assignCategoryId) : null;
              return (
                <div
                  key={rule.id}
                  className={`p-4 flex flex-col md:flex-row md:items-center justify-between gap-3 transition-colors hover:bg-[var(--bg-surface-hover)] ${
                    rule.enabled ? '' : 'opacity-60 bg-[var(--bg-subtle)]'
                  }`}
                >
                  <div className="flex items-start gap-3 min-w-0">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={rule.enabled}
                      onClick={() => updateRule(rule.id, { enabled: !rule.enabled })}
                      className="mt-0.5 w-9 h-5 rounded-full transition-colors relative shrink-0 cursor-pointer border border-[var(--border-hairline)]"
                      style={{
                        backgroundColor: rule.enabled
                          ? 'var(--accent-primary)'
                          : 'var(--bg-inset)',
                      }}
                      aria-label={
                        rule.enabled ? `Disable rule ${rule.name}` : `Enable rule ${rule.name}`
                      }
                    >
                      <span
                        className={`block w-3.5 h-3.5 rounded-full bg-white shadow-xs transition-transform ${
                          rule.enabled ? 'translate-x-4.5' : 'translate-x-0.5'
                        }`}
                      />
                    </button>

                    <div className="min-w-0 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-sm font-semibold text-[var(--text-primary)]">
                          {rule.name}
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[10px] font-mono text-[var(--text-muted)] tabular-nums">
                          P{rule.priority}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-1.5 text-xs">
                        <span className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] font-mono text-[11px]">
                          IF {rule.matchField} {rule.matchType} &quot;{rule.pattern}&quot;
                        </span>
                        {(rule.minAmount !== undefined || rule.maxAmount !== undefined) && (
                          <span className="px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-[11px] tabular-nums">
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
                        <ArrowRight className="w-3.5 h-3.5 text-[var(--text-muted)]" />
                        {cat && (
                          <span
                            className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md font-semibold text-[11px]"
                            style={{
                              backgroundColor: 'var(--accent-primary-soft)',
                              color: 'var(--accent-primary-text)',
                            }}
                          >
                            <span
                              className="w-2 h-2 rounded-full"
                              style={{ backgroundColor: cat.color }}
                            />
                            {cat.name}
                          </span>
                        )}
                        {rule.renamePayeeTo && (
                          <span
                            className="px-2 py-0.5 rounded-md font-medium text-[11px]"
                            style={{
                              backgroundColor: 'var(--accent-positive-soft)',
                              color: 'var(--accent-positive)',
                            }}
                          >
                            Rename → {rule.renamePayeeTo}
                          </span>
                        )}
                        {rule.addTags?.map((tg) => (
                          <span
                            key={tg}
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-[var(--bg-subtle)] border border-[var(--border-hairline)] text-[var(--text-secondary)] text-[11px]"
                          >
                            <Tag className="w-2.5 h-2.5" />#{tg}
                          </span>
                        ))}
                        {rule.markReviewed && (
                          <span
                            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-medium text-[11px]"
                            style={{
                              backgroundColor: 'var(--accent-positive-soft)',
                              color: 'var(--accent-positive)',
                            }}
                          >
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
                      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-subtle)] transition-colors cursor-pointer"
                      aria-label={`Edit rule ${rule.name}`}
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteRule(rule.id)}
                      className="p-2 rounded-lg text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-[var(--accent-danger-soft)] transition-colors cursor-pointer"
                      aria-label={`Delete rule ${rule.name}`}
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
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Rule Name
              </label>
              <input
                type="text"
                value={draft.name}
                onChange={(e) => setDraft({ ...draft, name: e.target.value })}
                placeholder="e.g. Coffee Shops → Dining Out"
                className="tactile-input w-full px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Priority (lower runs first)
              </label>
              <input
                type="number"
                value={draft.priority}
                onChange={(e) => setDraft({ ...draft, priority: Number(e.target.value) || 1 })}
                className="tactile-input w-full px-3 py-2 text-sm tabular-nums"
              />
            </div>
          </div>

          {/* Match Condition */}
          <div className="tactile-well p-3.5 space-y-3">
            <div className="text-xs font-semibold text-[var(--text-primary)]">
              When transaction matches:
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
              <select
                value={draft.matchField}
                onChange={(e) =>
                  setDraft({ ...draft, matchField: e.target.value as CategoryRule['matchField'] })
                }
                aria-label="Match field"
                className="tactile-input px-2.5 py-2 text-xs"
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
                aria-label="Match operator"
                className="tactile-input px-2.5 py-2 text-xs"
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
                className="tactile-input col-span-2 sm:col-span-1 px-2.5 py-2 text-xs"
              />
            </div>
            <div className="grid grid-cols-2 gap-2.5">
              <input
                type="number"
                step="0.01"
                value={draft.minAmount}
                onChange={(e) => setDraft({ ...draft, minAmount: e.target.value })}
                placeholder="Min amount (optional)"
                className="tactile-input px-2.5 py-1.5 text-xs tabular-nums"
              />
              <input
                type="number"
                step="0.01"
                value={draft.maxAmount}
                onChange={(e) => setDraft({ ...draft, maxAmount: e.target.value })}
                placeholder="Max amount (optional)"
                className="tactile-input px-2.5 py-1.5 text-xs tabular-nums"
              />
            </div>
          </div>

          {/* Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Assign Category
              </label>
              <select
                value={draft.assignCategoryId}
                onChange={(e) => setDraft({ ...draft, assignCategoryId: e.target.value })}
                className="tactile-input w-full px-3 py-2 text-sm"
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
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Clean / Rename Payee (optional)
              </label>
              <input
                type="text"
                value={draft.renamePayeeTo}
                onChange={(e) => setDraft({ ...draft, renamePayeeTo: e.target.value })}
                placeholder="e.g. Starbucks Coffee"
                className="tactile-input w-full px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-center">
            <div>
              <label className="block text-xs font-medium text-[var(--text-secondary)] mb-1">
                Add Tags (comma-separated)
              </label>
              <input
                type="text"
                value={draft.addTagsText}
                onChange={(e) => setDraft({ ...draft, addTagsText: e.target.value })}
                placeholder="coffee, treat"
                className="tactile-input w-full px-3 py-2 text-sm"
              />
            </div>
            <label className="inline-flex items-center gap-2 text-xs text-[var(--text-secondary)] mt-4 cursor-pointer">
              <input
                type="checkbox"
                checked={draft.markReviewed}
                onChange={(e) => setDraft({ ...draft, markReviewed: e.target.checked })}
                className="rounded border-[var(--border-strong)] accent-[var(--accent-primary)]"
              />
              <span>Auto-mark matching transactions as reviewed</span>
            </label>
          </div>

          {/* Live Test Preview */}
          <div
            className="tactile-well p-3 space-y-2 border-l-4"
            style={{ borderLeftColor: 'var(--accent-primary)' }}
          >
            <div className="flex items-center justify-between text-xs">
              <span
                className="font-semibold"
                style={{ color: 'var(--accent-primary-text)' }}
              >
                Live Preview
              </span>
              <span className="tabular-nums text-[var(--text-muted)]">
                Matches <strong className="text-[var(--text-primary)]">{previewMatches.length}</strong>{' '}
                existing {previewMatches.length === 1 ? 'transaction' : 'transactions'}
              </span>
            </div>
            {previewMatches.length > 0 && (
              <div className="space-y-1 max-h-28 overflow-y-auto">
                {previewMatches.slice(0, 5).map((tx) => (
                  <div
                    key={tx.id}
                    className="flex items-center justify-between text-[11px] px-2.5 py-1.5 rounded-lg bg-[var(--bg-surface)] border border-[var(--border-hairline)]"
                  >
                    <span className="truncate font-medium text-[var(--text-primary)] tabular-nums">
                      {tx.date} · {tx.payee}
                    </span>
                    <span
                      className={`tabular-nums font-semibold text-[var(--text-primary)] ${
                        privacyMask ? 'privacy-blur' : ''
                      }`}
                    >
                      {formatMoney(tx.amount, currency)}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-[var(--border-hairline)]">
            <button
              type="button"
              onClick={() => setModalOpen(false)}
              className="tactile-btn px-4 py-2 rounded-xl text-xs font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-4 py-2 rounded-xl text-xs font-semibold cursor-pointer"
            >
              {draft.id ? 'Save Rule' : 'Create Rule'}
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
