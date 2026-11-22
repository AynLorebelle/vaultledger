import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Send,
  Sparkles,
  Wifi,
  WifiOff,
  KeyRound,
  Trash2,
  ShieldCheck,
  TrendingUp,
  Users,
  X,
  MessageSquareHeart,
  ChevronDown,
  ChevronUp,
  Check,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  AI_COACH_STARTER_PROMPTS,
  GROQ_MODELS,
  sendGroqAdvisorMessage,
} from '../core/aiCoach';
import { computeDashboardKPIs } from '../core/analytics';
import { computeFinancialHealthScore } from '../core/healthScore';
import { computeSquadLeaderboard, createDefaultSavingsSquads } from '../core/savingsSquad';
import type { AiChatMessage } from '../types/finance';
import { Money } from './ui';

function formatMessageText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

        // Render bold segments **...**
        const parts = line.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
        const formattedLine = parts.map((part, j) => {
          if (part.startsWith('**') && part.endsWith('**')) {
            return (
              <strong key={j} className="font-extrabold">
                {part.slice(2, -2)}
              </strong>
            );
          }
          if (part.startsWith('`') && part.endsWith('`')) {
            return (
              <code
                key={j}
                className="px-1.5 py-0.5 rounded-md bg-white/70 text-[#1F2937] font-mono text-xs font-bold"
              >
                {part.slice(1, -1)}
              </code>
            );
          }
          return <React.Fragment key={j}>{part}</React.Fragment>;
        });

        return <p key={i}>{formattedLine}</p>;
      })}
    </div>
  );
}

const INITIAL_WELCOME_MESSAGE: AiChatMessage = {
  id: 'msg-welcome',
  role: 'assistant',
  content:
    'Hey! I am your **AYNLYTICS Groq AI Financial Coach**. When you are online, I use **Groq Cloud AI (GPT-OSS 120B / Qwen 3.8)** with your live vault numbers (Safe-to-Spend, Budgets, Financial Health Score, and Friend Savings Squad shares) to give personalized money advice—and if you go offline, I switch automatically to my local financial engine.\n\nAsk me anything below or tap a quick coaching prompt!',
  createdAt: new Date().toISOString(),
  source: 'groq-cloud',
  modelUsed: 'openai/gpt-oss-120b',
};

export const AiCoachView: React.FC<{ compactDrawer?: boolean; onCloseDrawer?: () => void }> = ({
  compactDrawer = false,
  onCloseDrawer,
}) => {
  const data = useFinanceStore((s) => s.data);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const showToast = useFinanceStore((s) => s.showToast);

  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const savedKey = data.settings.groqApiKey || '';
  const selectedModel = data.settings.groqModel || GROQ_MODELS[0].id;

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [messages, setMessages] = useState<AiChatMessage[]>([INITIAL_WELCOME_MESSAGE]);
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [keyDrawerOpen, setKeyDrawerOpen] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>(savedKey);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const onOnline = () => setIsOnline(true);
    const onOffline = () => setIsOnline(false);
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    return () => {
      window.removeEventListener('online', onOnline);
      window.removeEventListener('offline', onOffline);
    };
  }, []);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, loading]);

  const kpis = useMemo(() => computeDashboardKPIs(data, 'this_month'), [data]);
  const health = useMemo(() => computeFinancialHealthScore(data), [data]);
  const primarySquad = useMemo(() => {
    const list =
      Array.isArray(data.savingsSquads) && data.savingsSquads.length > 0
        ? data.savingsSquads
        : createDefaultSavingsSquads(currency);
    return list[0];
  }, [data.savingsSquads, currency]);
  const squadBoard = useMemo(
    () => (primarySquad ? computeSquadLeaderboard(primarySquad) : null),
    [primarySquad]
  );

  const handleSend = async (promptText?: string) => {
    const text = (promptText ?? input).trim();
    if (!text || loading) return;

    const userMsg: AiChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: text,
      createdAt: new Date().toISOString(),
    };

    const nextHistory = [...messages, userMsg];
    setMessages(nextHistory);
    if (!promptText) setInput('');
    setLoading(true);

    try {
      const result = await sendGroqAdvisorMessage({
        messages: nextHistory,
        vault: data,
        apiKey: savedKey,
        model: selectedModel,
        isOnline,
      });

      const assistantMsg: AiChatMessage = {
        id: `ai-${Date.now()}`,
        role: 'assistant',
        content: result.reply,
        createdAt: new Date().toISOString(),
        source: result.source,
        modelUsed: result.modelUsed,
      };
      setMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveKey = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = tempKey.trim();
    updateSettings({ groqApiKey: cleaned });
    setKeyDrawerOpen(false);
    showToast(
      cleaned
        ? 'Saved Groq API key locally in your vault!'
        : 'Cleared custom Groq API key (using cloud proxy / local engine).',
      'success'
    );
  };

  const handleClearChat = () => {
    setMessages([INITIAL_WELCOME_MESSAGE]);
    showToast('Reset AI Coach conversation', 'info');
  };

  return (
    <div className={compactDrawer ? 'space-y-4' : 'space-y-6 pb-10'}>
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2 mb-1.5">
            <span
              className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-extrabold ${
                isOnline ? 'clay-surface-mint' : 'clay-surface-peach'
              }`}
            >
              {isOnline ? (
                <>
                  <Wifi className="w-3.5 h-3.5 text-[#065F46]" />
                  <span>Online • Groq Cloud AI Active</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#92400E]" />
                  <span>Offline Mode • Local Financial Advisor</span>
                </>
              )}
            </span>

            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full clay-surface-pink text-xs font-extrabold">
              <Sparkles className="w-3.5 h-3.5 text-[#9F1239]" />
              <span>Context-Aware Vault Coaching</span>
            </span>
          </div>

          <h1
            className={`${
              compactDrawer ? 'text-xl' : 'text-2xl sm:text-3xl'
            } font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5`}
          >
            <Bot className="w-7 h-7 text-[#6D28D9]" />
            <span>AYNLYTICS Groq AI Financial Coach</span>
          </h1>
          {!compactDrawer && (
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1">
              Ask personalized questions about your expenses, budgets, debt payoff, and Friend Savings Squad shares—powered by Groq Llama 3.3 70B when online
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Groq Model Selector */}
          <select
            value={selectedModel}
            onChange={(e) => updateSettings({ groqModel: e.target.value })}
            aria-label="Select Groq AI Model"
            className="tactile-input px-3 py-2 text-xs font-extrabold cursor-pointer"
          >
            {GROQ_MODELS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setTempKey(savedKey);
              setKeyDrawerOpen((v) => !v);
            }}
            className="tactile-btn px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>{savedKey ? 'Groq Key Connected' : 'Groq API Key'}</span>
            {keyDrawerOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleClearChat}
            aria-label="Reset conversation"
            className="tactile-btn px-3 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {compactDrawer && onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close AI Coach Drawer"
              className="tactile-btn p-2 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Custom Groq API Key Drawer */}
      <AnimatePresence>
        {keyDrawerOpen && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onSubmit={handleSaveKey}
            className="card clay-surface-blue space-y-2.5"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-sm font-extrabold text-[#1F2937] flex items-center gap-2">
                  <KeyRound className="w-4 h-4" />
                  Groq Cloud API Key Configuration
                </h2>
                <p className="text-xs font-semibold text-[#1F2937]/80">
                  AYNLYTICS uses our pre-configured cloud Groq proxy online automatically—or you can paste your own <code className="font-mono font-bold">gsk_...</code> key here (stored 100% locally on your device, never committed).
                </p>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                type="password"
                value={tempKey}
                onChange={(e) => setTempKey(e.target.value)}
                placeholder="Optional: gsk_..."
                aria-label="Groq API key"
                className="tactile-input flex-1 px-3.5 py-2 text-xs font-mono font-bold"
              />
              <button
                type="submit"
                className="tactile-btn-primary px-4 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Check className="w-3.5 h-3.5" />
                Save Key Locally
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Main Layout: Chat Column + Live Vault Context Sidebar */}
      <div className={compactDrawer ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-6'}>
        {/* Left/Main Chat Card */}
        <div
          className={`${
            compactDrawer ? '' : 'lg:col-span-8'
          } card clay-surface-lavender flex flex-col justify-between space-y-4`}
        >
          {/* Starter Prompt Chips */}
          <div className="space-y-1.5">
            <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1F2937]/75">
              Tap a Financial Coaching Question
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_COACH_STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSend(prompt)}
                  className="px-3 py-1.5 rounded-2xl text-xs font-extrabold bg-white/85 hover:bg-white text-[#1F2937] border-2 border-white shadow-xs transition-transform hover:scale-[1.02] active:scale-[0.98] cursor-pointer disabled:opacity-50 text-left"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* Messages Scroll Area */}
          <div
            className={`${
              compactDrawer ? 'max-h-[340px]' : 'min-h-[360px] max-h-[520px]'
            } overflow-y-auto space-y-3.5 pr-1`}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <motion.div
                  key={msg.id}
                  initial={{ opacity: 0, y: 6 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[82%] rounded-3xl p-4 border-3 border-white/85 shadow-sm ${
                      isUser
                        ? 'clay-surface-peach text-[#1F2937]'
                        : 'bg-white/92 text-[#1F2937]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1F2937]/75">
                        {isUser ? 'You' : 'AYNLYTICS Groq Coach'}
                      </span>
                      {!isUser && msg.modelUsed && (
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-extrabold ${
                            msg.source === 'groq-cloud'
                              ? 'bg-[#98FF98] text-[#065F46]'
                              : 'bg-[#FFD1DC] text-[#9F1239]'
                          }`}
                        >
                          {msg.source === 'groq-cloud' ? `Groq • ${msg.modelUsed}` : msg.modelUsed}
                        </span>
                      )}
                    </div>
                    {formatMessageText(msg.content)}
                  </div>
                </motion.div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-3xl px-4 py-3 bg-white/90 border-3 border-white/85 text-xs font-extrabold text-[#1F2937] inline-flex items-center gap-2 animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#6D28D9]" />
                  <span>Groq AI Coach is analyzing your vault numbers…</span>
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Input Form */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void handleSend();
            }}
            className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t-2 border-white/60"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Ask anything about your budget, savings rate, debt, or Friend Squad shares…"
              aria-label="Ask Groq AI Financial Coach"
              disabled={loading}
              className="tactile-input flex-1 px-4 py-3 text-sm font-bold"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="button tactile-btn-primary !px-6 !py-3 !text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Ask Groq Coach</span>
            </button>
          </form>
        </div>

        {/* Right Column: Live Vault Context Cards (Full Tab View) */}
        {!compactDrawer && (
          <div className="lg:col-span-4 space-y-4">
            <div className="card clay-surface-mint space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F2937]/80">
                  Live Context Fed to Groq
                </span>
                <ShieldCheck className="w-4 h-4 text-[#065F46]" />
              </div>
              <div className="text-xl font-extrabold text-[#1F2937] tabular-nums">
                Safe-to-Spend:{' '}
                <Money amount={kpis.safeToSpend} currency={currency} privacyMask={privacyMask} />
              </div>
              <div className="text-xs font-bold text-[#1F2937]/85">
                Health Score: <strong>{health.score}/100 ({health.grade})</strong> • Savings Rate:{' '}
                <strong>{kpis.savingsRate.toFixed(1)}%</strong>
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleSend(
                    `With my ${kpis.savingsRate.toFixed(1)}% savings rate and ${health.score}/100 health score, what is the #1 move I should make this week?`
                  )
                }
                className="tactile-btn w-full py-2 text-xs font-extrabold cursor-pointer mt-1"
              >
                Ask Coach: #1 Move This Week
              </button>
            </div>

            {primarySquad && squadBoard && (
              <div className="card clay-surface-pink space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F2937]/80">
                    Active Friend Squad Share
                  </span>
                  <Users className="w-4 h-4 text-[#9F1239]" />
                </div>
                <div className="text-base font-extrabold text-[#1F2937]">
                  {primarySquad.emoji} {primarySquad.name}
                </div>
                <div className="text-xs font-bold text-[#1F2937]/85">
                  {squadBoard.headline}
                </div>
                <div className="flex gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() =>
                      void handleSend(
                        `How can we reach our ${primarySquad.name} target faster and how much does #2 need to deposit to catch up to #1?`
                      )
                    }
                    className="tactile-btn flex-1 py-2 text-xs font-extrabold cursor-pointer"
                  >
                    Ask Squad Strategy
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveNav('squad')}
                    className="tactile-btn-primary px-3 py-2 text-xs font-extrabold cursor-pointer"
                  >
                    Open Squad
                  </button>
                </div>
              </div>
            )}

            <div className="card clay-surface-blue space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F2937]/80">
                  Debt & Runway Checkup
                </span>
                <TrendingUp className="w-4 h-4 text-[#1E40AF]" />
              </div>
              <div className="text-xs font-bold text-[#1F2937]/85">
                Liquid Cash:{' '}
                <Money amount={kpis.liquidCash} currency={currency} privacyMask={privacyMask} /> •
                Total Debt:{' '}
                <Money amount={kpis.totalDebt} currency={currency} privacyMask={privacyMask} />
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleSend(
                    'Compare Snowball vs Avalanche for my current debt and liquid cash runway.'
                  )
                }
                className="tactile-btn w-full py-2 text-xs font-extrabold cursor-pointer"
              >
                Ask Debt & Runway Advice
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export const FloatingAiCoachWidget: React.FC = () => {
  const activeNav = useFinanceStore((s) => s.activeNav);
  const [open, setOpen] = useState(false);

  if (activeNav === 'coach') return null;

  return (
    <div className="no-print fixed bottom-5 left-5 z-40">
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 16, scale: 0.95 }}
            className="mb-3 w-[92vw] max-w-[540px] tactile-card-elevated p-4 sm:p-5 bg-[var(--bg-surface)]"
          >
            <AiCoachView compactDrawer onCloseDrawer={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Groq AI Financial Coach"
        className="tactile-btn-primary px-4 py-3 rounded-full inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold cursor-pointer shadow-lg"
      >
        <MessageSquareHeart className="w-4 h-4 text-[#1F2937]" />
        <span>{open ? 'Hide Groq AI Coach' : 'Ask Groq AI Coach'}</span>
      </button>
    </div>
  );
};
