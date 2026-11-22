import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import {
  Bot,
  Send,
  Wifi,
  WifiOff,
  KeyRound,
  Trash2,
  ShieldCheck,
  Users,
  X,
  ChevronDown,
  ChevronUp,
  Check,
  User,
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
import { CURRENCY_METADATA } from '../core/currency';
import { computeFinancialHealthScore } from '../core/healthScore';
import { computeSquadLeaderboard, createDefaultSavingsSquads } from '../core/savingsSquad';
import type { AiChatMessage, AynieeeTone, CurrencyCode } from '../types/finance';
import { Money } from './ui';

const CHAT_STORAGE_KEY = 'aynlytics-aynieee-chat-v3';

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
    content: `Hi **${displayName}**, I'm **Aynieee**, your financial advisor in **AYNLYTICS**.\n\nWhen online, I use Groq Cloud with your live **${currency}** numbers (Safe to spend, Budgets, Health Score, and Friend Savings Squad shares). When offline, I switch automatically to the local financial engine.\n\nPick a question below or type your own.`,
    createdAt: new Date().toISOString(),
    source: 'groq-cloud',
    modelUsed: 'Aynieee',
  };
}

export const AiCoachView: React.FC<{ compactDrawer?: boolean; onCloseDrawer?: () => void }> = ({
  compactDrawer = false,
  onCloseDrawer,
}) => {
  const data = useFinanceStore((s) => s.data);
  const updateSettings = useFinanceStore((s) => s.updateSettings);
  const updateUserProfile = useFinanceStore((s) => s.updateUserProfile);
  const setActiveNav = useFinanceStore((s) => s.setActiveNav);
  const setProfileModalOpen = useFinanceStore((s) => s.setProfileModalOpen);
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
    updateSettings({ groqApiKey: cleaned, groqModel: selectedModel });
    setKeyDrawerOpen(false);
    showToast(
      cleaned
        ? 'Saved Groq API key locally'
        : 'Cleared custom Groq API key',
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
    showToast('Reset conversation with Aynieee', 'info');
  };

  return (
    <div className={compactDrawer ? 'space-y-4' : 'space-y-6 pb-10'}>
      {/* Clean Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-2xl clay-surface-peach flex items-center justify-center shrink-0">
            <Bot className="w-5 h-5 text-[#1F2937]" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h1
                className={`${
                  compactDrawer ? 'text-lg' : 'text-xl sm:text-2xl'
                } font-extrabold text-[var(--text-primary)] tracking-tight`}
              >
                Aynieee, your financial advisor
              </h1>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                  isOnline ? 'clay-surface-mint' : 'clay-surface-peach'
                }`}
              >
                {isOnline ? (
                  <>
                    <Wifi className="w-3 h-3 text-[#065F46]" />
                    <span>Online</span>
                  </>
                ) : (
                  <>
                    <WifiOff className="w-3 h-3 text-[#92400E]" />
                    <span>Offline</span>
                  </>
                )}
              </span>
            </div>
            {!compactDrawer && (
              <p className="text-xs font-medium text-[var(--text-secondary)] mt-0.5">
                Advising {profile.displayName} in {CURRENCY_METADATA[currency].name} ({CURRENCY_METADATA[currency].symbol})
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <select
            value={profile.aynieeeTone}
            onChange={(e) =>
              updateUserProfile({ aynieeeTone: e.target.value as AynieeeTone })
            }
            aria-label="Select Aynieee tone"
            className="tactile-input px-3 py-1.5 text-xs font-bold cursor-pointer"
          >
            {AYNIEEE_TONE_OPTIONS.map((t) => (
              <option key={t.id} value={t.id}>
                Style: {t.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            onClick={() => {
              setTempKey(savedKey);
              setKeyDrawerOpen((v) => !v);
            }}
            className="tactile-btn px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <KeyRound className="w-3.5 h-3.5 text-[#6D28D9]" />
            <span>Model &amp; Key</span>
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
            className="tactile-btn px-3 py-1.5 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>

          {compactDrawer && onCloseDrawer && (
            <button
              type="button"
              onClick={onCloseDrawer}
              aria-label="Close Aynieee Drawer"
              className="tactile-btn p-1.5 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Collapsible Model & API Key Drawer */}
      <AnimatePresence>
        {keyDrawerOpen && (
          <motion.form
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -6 }}
            onSubmit={handleSaveKey}
            className="card clay-surface-blue space-y-3"
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-[#1F2937] mb-1">
                  Groq Model
                </label>
                <select
                  value={selectedModel}
                  onChange={(e) => updateSettings({ groqModel: e.target.value })}
                  aria-label="Select Groq AI Model"
                  className="tactile-input w-full px-3 py-2 text-xs font-bold cursor-pointer"
                >
                  {GROQ_MODELS.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.label} ({m.badge})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#1F2937] mb-1">
                  Optional Personal Groq Key (stored on device)
                </label>
                <div className="flex gap-2">
                  <input
                    type="password"
                    value={tempKey}
                    onChange={(e) => setTempKey(e.target.value)}
                    placeholder="Optional: gsk_..."
                    aria-label="Groq API key"
                    className="tactile-input flex-1 px-3 py-2 text-xs font-mono font-bold"
                  />
                  <button
                    type="submit"
                    className="tactile-btn-primary px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1 cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Save</span>
                  </button>
                </div>
              </div>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* Main Layout: Chat Column + Compact Context Sidebar */}
      <div className={compactDrawer ? 'space-y-4' : 'grid grid-cols-1 lg:grid-cols-12 gap-6'}>
        {/* Main Chat Card */}
        <div
          className={`${
            compactDrawer ? '' : 'lg:col-span-8'
          } card clay-surface-lavender flex flex-col justify-between space-y-4`}
        >
          {/* Starter Prompt Chips */}
          <div className="space-y-1.5">
            <div className="text-xs font-bold text-[#1F2937]/80">
              Suggested questions
            </div>
            <div className="flex flex-wrap gap-2">
              {AI_COACH_STARTER_PROMPTS.map((prompt) => (
                <button
                  key={prompt}
                  type="button"
                  disabled={loading}
                  onClick={() => void handleSend(prompt)}
                  className="px-3 py-1.5 rounded-2xl text-xs font-bold bg-white/85 hover:bg-white text-[#1F2937] border border-white shadow-xs transition-colors cursor-pointer disabled:opacity-50 text-left"
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
            } overflow-y-auto space-y-3 pr-1`}
          >
            {messages.map((msg) => {
              const isUser = msg.role === 'user';
              return (
                <div
                  key={msg.id}
                  className={`flex ${isUser ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[90%] sm:max-w-[84%] rounded-3xl p-4 border-2 border-white/85 shadow-xs ${
                      isUser
                        ? 'clay-surface-peach text-[#1F2937]'
                        : 'bg-white/95 text-[#1F2937]'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2 mb-1.5">
                      <span className="text-xs font-bold text-[#1F2937]/80">
                        {isUser ? profile.displayName : 'Aynieee'}
                      </span>
                      {!isUser && msg.modelUsed && (
                        <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[#E6E6FA] text-[#1F2937]">
                          {msg.source === 'groq-cloud' ? 'Groq Cloud' : 'Local Engine'}
                        </span>
                      )}
                    </div>
                    {formatMessageText(msg.content)}
                  </div>
                </div>
              );
            })}

            {loading && (
              <div className="flex justify-start">
                <div className="rounded-2xl px-4 py-2.5 bg-white/90 border-2 border-white/85 text-xs font-bold text-[#1F2937] inline-flex items-center gap-2 animate-pulse">
                  <Bot className="w-4 h-4 text-[#6D28D9]" />
                  <span>Aynieee is reviewing your {currency} numbers...</span>
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
            className="flex flex-col sm:flex-row gap-2.5 pt-2 border-t border-white/60"
          >
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder={`Ask Aynieee about your ${currency} budget, savings, debt, or Friend Squad...`}
              aria-label="Ask Aynieee financial advisor"
              disabled={loading}
              className="tactile-input flex-1 px-4 py-2.5 text-sm font-semibold"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              className="button tactile-btn-primary !px-5 !py-2.5 !text-sm inline-flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
            >
              <Send className="w-4 h-4" />
              <span>Send</span>
            </button>
          </form>
        </div>

        {/* Right Column: Clean Vault Summary (2 cards instead of 4 cluttered ones) */}
        {!compactDrawer && (
          <div className="lg:col-span-4 space-y-4">
            <div className="card clay-surface-mint space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[#1F2937]/80">
                  Live Vault Context
                </span>
                <ShieldCheck className="w-4 h-4 text-[#065F46]" />
              </div>
              <div>
                <div className="text-xs font-medium text-[#1F2937]/75">Safe to spend</div>
                <div className="text-xl font-extrabold text-[#1F2937] tabular-nums">
                  <Money amount={kpis.safeToSpend} currency={currency} privacyMask={privacyMask} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 pt-1 text-xs">
                <div className="p-2.5 rounded-xl bg-white/80">
                  <div className="text-[11px] font-medium text-[#1F2937]/75">Health Score</div>
                  <div className="font-extrabold text-[#1F2937] tabular-nums">
                    {health.score}/100 ({health.grade})
                  </div>
                </div>
                <div className="p-2.5 rounded-xl bg-white/80">
                  <div className="text-[11px] font-medium text-[#1F2937]/75">Savings Rate</div>
                  <div className="font-extrabold text-[#1F2937] tabular-nums">
                    {kpis.savingsRate.toFixed(1)}%
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setProfileModalOpen(true)}
                className="tactile-btn w-full py-2 text-xs font-bold inline-flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <User className="w-3.5 h-3.5" />
                <span>Edit Profile &amp; Currency ({currency})</span>
              </button>
            </div>

            {primarySquad && squadBoard && (
              <div className="card clay-surface-pink space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#1F2937]/80">
                    Active Friend Squad
                  </span>
                  <Users className="w-4 h-4 text-[#9F1239]" />
                </div>
                <div className="text-base font-extrabold text-[#1F2937]">
                  {primarySquad.name}
                </div>
                <div className="text-xs font-medium text-[#1F2937]/85">
                  {squadBoard.headline}
                </div>
                <button
                  type="button"
                  onClick={() => setActiveNav('squad')}
                  className="tactile-btn w-full py-2 text-xs font-bold cursor-pointer mt-1"
                >
                  Open Friend Squads
                </button>
              </div>
            )}
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
    <div className="no-print fixed bottom-5 right-5 z-40">
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
        aria-label="Open Aynieee financial advisor"
        className="tactile-btn-primary px-4 py-2.5 rounded-full inline-flex items-center gap-2 text-xs sm:text-sm font-extrabold cursor-pointer shadow-lg"
      >
        <Bot className="w-4 h-4 text-[#1F2937]" />
        <span>{open ? 'Hide Aynieee' : 'Ask Aynieee'}</span>
      </button>
    </div>
  );
};
