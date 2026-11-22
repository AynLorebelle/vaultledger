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
  User,
  Coins,
  Plus,
  PieChart,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  AI_COACH_STARTER_PROMPTS,
  AYNIEEE_TONE_OPTIONS,
  GROQ_MODELS,
  getEffectiveProfile,
  sendGroqAdvisorMessage,
} from '../core/aiCoach';
import { computeDashboardKPIs } from '../core/analytics';
import { CURRENCY_METADATA, SUPPORTED_CURRENCIES } from '../core/currency';
import { computeFinancialHealthScore } from '../core/healthScore';
import { computeSquadLeaderboard, createDefaultSavingsSquads } from '../core/savingsSquad';
import type { AiChatMessage, AynieeeTone, CurrencyCode } from '../types/finance';
import { Money } from './ui';

const CHAT_STORAGE_KEY = 'aynlytics-aynieee-chat-v2';

function formatMessageText(text: string): React.ReactNode {
  const lines = text.split('\n');
  return (
    <div className="space-y-1.5 text-sm leading-relaxed">
      {lines.map((line, i) => {
        const trimmed = line.trim();
        if (!trimmed) return <div key={i} className="h-1" />;

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

function buildWelcomeMessage(displayName: string, currency: CurrencyCode): AiChatMessage {
  return {
    id: 'msg-welcome',
    role: 'assistant',
    content: `Hey bestie **${displayName}**! I'm **Aynieee**, your personal AI Financial Bestie & Coach inside **AYNLYTICS 2.0**.\n\nWhen you're online, I use **Groq Cloud AI** with your live **${currency}** vault numbers (Safe-to-Spend, Budgets, Financial Health Score, and Friend Savings Squad shares) to give personalized money advice—and if you go offline, I switch automatically to my local financial engine.\n\nTap a quick question below or ask me anything!`,
    createdAt: new Date().toISOString(),
    source: 'groq-cloud',
    modelUsed: 'Aynieee • Groq Cloud AI',
  };
}

export const AiCoachView: React.FC<{ compactDrawer?: boolean; onCloseDrawer?: () => void }> = ({
  compactDrawer = false,
  onCloseDrawer,
}) => {
  const data = useFinanceStore((s) => s.data);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const updateUserProfile = useFinanceStore((s) => s.updateUserProfile);
  const setBaseCurrency = useFinanceStore((s) => s.setBaseCurrency);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const setProfileModalOpen = useFinanceStore((s) => s.setProfileModalOpen);
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);
  const showToast = useFinanceStore((s) => s.showToast);

  const profile = getEffectiveProfile(data);
  const currency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;
  const savedKey = data.settings.groqApiKey || '';
  const selectedModel = data.settings.groqModel || GROQ_MODELS[0].id;

  const [isOnline, setIsOnline] = useState<boolean>(() =>
    typeof navigator !== 'undefined' ? navigator.onLine : true
  );
  const [messages, setMessages] = useState<AiChatMessage[]>(() => {
    try {
      const raw = localStorage.getItem(CHAT_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as AiChatMessage[];
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {
      // ignore storage errors
    }
    return [buildWelcomeMessage(profile.displayName, currency)];
  });
  const [input, setInput] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [keyDrawerOpen, setKeyDrawerOpen] = useState<boolean>(false);
  const [tempKey, setTempKey] = useState<string>(savedKey);
  const chatEndRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    try {
      localStorage.setItem(CHAT_STORAGE_KEY, JSON.stringify(messages.slice(-20)));
    } catch {
      // ignore storage quota errors
    }
  }, [messages]);

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
        ? 'Saved your Groq API key locally for Aynieee!'
        : 'Cleared custom Groq API key (using cloud proxy / local engine).',
      'success'
    );
  };

  const handleClearChat = () => {
    const fresh = [buildWelcomeMessage(profile.displayName, currency)];
    setMessages(fresh);
    try {
      localStorage.removeItem(CHAT_STORAGE_KEY);
    } catch {
      // ignore
    }
    showToast('Reset your chat with Aynieee', 'info');
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
                  <span>Online • Aynieee Groq Cloud AI Active</span>
                </>
              ) : (
                <>
                  <WifiOff className="w-3.5 h-3.5 text-[#92400E]" />
                  <span>Offline Mode • Aynieee Local Engine</span>
                </>
              )}
            </span>

            <button
              type="button"
              onClick={() => setProfileModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full clay-surface-pink text-xs font-extrabold cursor-pointer hover:scale-105 transition-transform"
            >
              <span>{profile.avatarEmoji}</span>
              <span>For {profile.displayName}</span>
              <span>•</span>
              <span>{CURRENCY_METADATA[currency].symbol} {currency}</span>
            </button>
          </div>

          <h1
            className={`${
              compactDrawer ? 'text-xl' : 'text-2xl sm:text-3xl'
            } font-extrabold text-[var(--text-primary)] tracking-tight flex items-center gap-2.5`}
          >
            <span className="w-9 h-9 rounded-2xl clay-surface-peach inline-flex items-center justify-center text-lg shadow-xs">
              🌸
            </span>
            <span>Aynieee — Your Groq AI Financial Bestie</span>
          </h1>
          {!compactDrawer && (
            <p className="text-sm font-semibold text-[var(--text-secondary)] mt-1">
              Personalized money coaching for {profile.displayName} ({profile.tagline}) in{' '}
              <strong>
                {CURRENCY_METADATA[currency].name} ({CURRENCY_METADATA[currency].symbol})
              </strong>
            </p>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Aynieee Personality Tone Selector */}
          <select
            value={profile.aynieeeTone}
            onChange={(e) =>
              updateUserProfile({ aynieeeTone: e.target.value as AynieeeTone })
            }
            aria-label="Select Aynieee Personality Vibe"
            className="tactile-input px-3 py-2 text-xs font-extrabold cursor-pointer"
          >
            {AYNIEEE_TONE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                Vibe: {t.label}
              </option>
            ))}
          </select>

          {/* Instant Currency Switcher */}
          <select
            value={currency}
            onChange={(e) => setBaseCurrency(e.target.value as CurrencyCode)}
            aria-label="Switch active currency"
            className="tactile-input px-3 py-2 text-xs font-extrabold cursor-pointer"
          >
            {SUPPORTED_CURRENCIES.map((c) => (
              <option key={c} value={c}>
                {CURRENCY_METADATA[c].symbol} {c}
              </option>
            ))}
          </select>

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
            onClick={() => setProfileModalOpen(true)}
            className="tactile-btn px-3 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <User className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>Profile</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setTempKey(savedKey);
              setKeyDrawerOpen((v) => !v);
            }}
            className="tactile-btn px-3 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>{savedKey ? 'Groq Key' : 'API Key'}</span>
            {keyDrawerOpen ? (
              <ChevronUp className="w-3.5 h-3.5" />
            ) : (
              <ChevronDown className="w-3.5 h-3.5" />
            )}
          </button>

          <button
            type="button"
            onClick={handleClearChat}
            aria-label="Reset conversation with Aynieee"
            className="tactile-btn px-3 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {compactDrawer && onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close Aynieee Drawer"
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
            <div>
              <h2 className="text-sm font-extrabold text-[#1F2937] flex items-center gap-2">
                <KeyRound className="w-4 h-4" />
                Aynieee Groq Cloud API Key Configuration
              </h2>
              <p className="text-xs font-semibold text-[#1F2937]/80">
                Aynieee uses our pre-configured cloud Groq proxy online automatically—or you can paste your own <code className="font-mono font-bold">gsk_...</code> key here (stored 100% locally on your device).
              </p>
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
              Tap a Question to Ask Aynieee
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
                    className={`max-w-[90%] sm:max-w-[84%] rounded-3xl p-4 border-3 border-white/85 shadow-sm ${
                      isUser
                        ? 'clay-surface-peach text-[#1F2937]'
                        : 'bg-white/94 text-[#1F2937]'
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="text-[11px] font-extrabold uppercase tracking-wider text-[#1F2937]/80 flex items-center gap-1.5">
                        <span>{isUser ? profile.avatarEmoji : '🌸'}</span>
                        <span>{isUser ? profile.displayName : 'Aynieee'}</span>
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

                    {/* Smooth Workflow Quick Action Pills on Assistant Bubbles */}
                    {!isUser && (
                      <div className="flex flex-wrap items-center gap-1.5 mt-3 pt-2.5 border-t border-black/10">
                        <button
                          type="button"
                          onClick={() => openQuickAdd()}
                          className="px-2.5 py-1 rounded-xl bg-[#FDBCB4]/70 hover:bg-[#FDBCB4] text-[11px] font-extrabold text-[#1F2937] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Log Expense</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNav('squad');
                            onCloseDrawer?.();
                          }}
                          className="px-2.5 py-1 rounded-xl bg-[#98FF98]/70 hover:bg-[#98FF98] text-[11px] font-extrabold text-[#1F2937] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Users className="w-3 h-3" />
                          <span>Friend Squads</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveNav('budgets');
                            onCloseDrawer?.();
                          }}
                          className="px-2.5 py-1 rounded-xl bg-[#ADD8E6]/70 hover:bg-[#ADD8E6] text-[11px] font-extrabold text-[#1F2937] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <PieChart className="w-3 h-3" />
                          <span>Budgets</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProfileModalOpen(true)}
                          className="px-2.5 py-1 rounded-xl bg-[#FFD1DC]/70 hover:bg-[#FFD1DC] text-[11px] font-extrabold text-[#1F2937] inline-flex items-center gap-1 cursor-pointer transition-colors"
                        >
                          <Coins className="w-3 h-3" />
                          <span>Currency ({currency})</span>
                        </button>
                      </div>
                    )}
                  </div>
                </motion.div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-3xl px-4 py-3 bg-white/90 border-3 border-white/85 text-xs font-extrabold text-[#1F2937] inline-flex items-center gap-2 animate-pulse">
                  <Sparkles className="w-4 h-4 text-[#6D28D9]" />
                  <span>Aynieee is analyzing your {currency} vault numbers…</span>
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
              placeholder={`Ask Aynieee anything about your ${currency} budget, savings, debt, or Friend Squad…`}
              aria-label="Ask Aynieee AI Financial Bestie"
              disabled={loading}
              className="tactile-input flex-1 px-4 py-3 text-sm font-bold"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="button tactile-btn-primary !px-6 !py-3 !text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Ask Aynieee</span>
            </button>
          </form>
        </div>

        {/* Right Column: Live Vault Context Cards (Full Tab View) */}
        {!compactDrawer && (
          <div className="lg:col-span-4 space-y-4">
            {/* Personalized User Profile Card */}
            <div className="card clay-surface-peach space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F2937]/80">
                  Your Personalized Profile
                </span>
                <Bot className="w-4 h-4 text-[#1F2937]" />
              </div>
              <div className="flex items-center gap-3">
                <span className="w-11 h-11 rounded-2xl bg-white/90 border-2 border-white flex items-center justify-center text-2xl shadow-xs">
                  {profile.avatarEmoji}
                </span>
                <div>
                  <div className="text-base font-extrabold text-[#1F2937]">
                    {profile.displayName}
                  </div>
                  <div className="text-xs font-bold text-[#1F2937]/80">
                    {profile.tagline}
                  </div>
                </div>
              </div>
              <div className="flex flex-wrap gap-1.5 pt-1">
                <span className="px-2.5 py-1 rounded-xl bg-white/80 text-[11px] font-extrabold text-[#1F2937]">
                  Currency: {CURRENCY_METADATA[currency].symbol} {currency}
                </span>
                <span className="px-2.5 py-1 rounded-xl bg-white/80 text-[11px] font-extrabold text-[#1F2937]">
                  Goal: {profile.monthlySavingsGoalPct}% savings
                </span>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                className="tactile-btn w-full py-2 text-xs font-extrabold cursor-pointer mt-1"
              >
                Edit Profile, Currency &amp; Vibe
              </button>
            </div>

            <div className="card clay-surface-mint space-y-2.5">
              <div className="flex items-center justify-between">
                <span className="text-xs font-extrabold uppercase tracking-wider text-[#1F2937]/80">
                  Live Context Fed to Aynieee
                </span>
                <ShieldCheck className="w-4 h-4 text-[#065F46]" />
              </div>
              <div className="text-xl font-extrabold text-[#1F2937] tabular-nums">
                Safe-to-Spend:{' '}
                <Money amount={kpis.safeToSpend} currency={currency} privacyMask={privacyMask} />
              </div>
              <div className="text-xs font-bold text-[#1F2937]/85">
                Health Score: <strong>{health.score}/100 ({health.grade})</strong> • Savings Rate:{' '}
                <strong>{kpis.savingsRate.toFixed(1)}%</strong> (Goal: {profile.monthlySavingsGoalPct}%)
              </div>
              <button
                type="button"
                onClick={() =>
                  void handleSend(
                    `Aynieee, with my ${kpis.savingsRate.toFixed(1)}% savings rate and ${health.score}/100 health score, what is the #1 move I should make this week?`
                  )
                }
                className="tactile-btn w-full py-2 text-xs font-extrabold cursor-pointer mt-1"
              >
                Ask Aynieee: #1 Move This Week
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
                        `Aynieee, how can we reach our ${primarySquad.name} target faster and keep my #1 share lead?`
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
                  Debt &amp; Runway Checkup
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
                    'Aynieee, compare Snowball vs Avalanche for my current debt and liquid cash runway.'
                  )
                }
                className="tactile-btn w-full py-2 text-xs font-extrabold cursor-pointer"
              >
                Ask Debt &amp; Runway Advice
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
            className="mb-3 w-[92vw] max-w-[560px] tactile-card-elevated p-4 sm:p-5 bg-[var(--bg-surface)]"
          >
            <AiCoachView compactDrawer onCloseDrawer={() => setOpen(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open Aynieee AI Financial Bestie"
        className="tactile-btn-primary px-4 py-3 rounded-full inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold cursor-pointer shadow-lg"
      >
        <span className="text-base leading-none">🌸</span>
        <MessageSquareHeart className="w-4 h-4 text-[#1F2937]" />
        <span>{open ? 'Hide Aynieee' : 'Ask Aynieee AI'}</span>
      </button>
    </div>
  );
};
