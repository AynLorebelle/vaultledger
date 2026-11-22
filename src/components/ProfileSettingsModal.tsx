import React, { useEffect, useState } from 'react';
import {
  User,
  Coins,
  Sparkles,
  Check,
  Palette,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Bot,
  Target,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { CURRENCY_METADATA, SUPPORTED_CURRENCIES } from '../core/currency';
import { AYNIEEE_TONE_OPTIONS, getEffectiveProfile } from '../core/aiCoach';
import { CLAY_MEMBER_COLORS } from '../core/savingsSquad';
import type { AynieeeTone, CurrencyCode } from '../types/finance';
import { Modal } from './ui';

const AVATAR_EMOJIS = ['🌸', '🦋', '👑', '🧸', '✨', '💸', '🍓', '🐱', '🚀', '💎', '🥑', '🎀'];

export const ProfileSettingsModal: React.FC = () => {
  const open = useFinanceStore((s) => s.profileModalOpen);
  const setOpen = useFinanceStore((s) => s.setProfileModalOpen);
  const data = useFinanceStore((s) => s.data);
  const updateUserProfile = useFinanceStore((s) => s.updateUserProfile);
  const setBaseCurrency = useFinanceStore((s) => s.setBaseCurrency);
  const toggleTheme = useFinanceStore((s) => s.toggleTheme);
  const togglePrivacyMask = useFinanceStore((s) => s.togglePrivacyMask);
  const showToast = useFinanceStore((s) => s.showToast);

  const profile = getEffectiveProfile(data);
  const baseCurrency = data.settings.baseCurrency;
  const isDark = data.settings.theme === 'dark';
  const privacyMask = data.settings.privacyMask;

  const [displayName, setDisplayName] = useState(profile.displayName);
  const [tagline, setTagline] = useState(profile.tagline);
  const [avatarEmoji, setAvatarEmoji] = useState(profile.avatarEmoji);
  const [clayAccent, setClayAccent] = useState(profile.clayAccent);
  const [monthlySavingsGoalPct, setMonthlySavingsGoalPct] = useState(
    profile.monthlySavingsGoalPct
  );
  const [aynieeeTone, setAynieeeTone] = useState<AynieeeTone>(profile.aynieeeTone);

  useEffect(() => {
    if (open) {
      const current = getEffectiveProfile(data);
      setDisplayName(current.displayName);
      setTagline(current.tagline);
      setAvatarEmoji(current.avatarEmoji);
      setClayAccent(current.clayAccent);
      setMonthlySavingsGoalPct(current.monthlySavingsGoalPct);
      setAynieeeTone(current.aynieeeTone);
    }
  }, [open, data]);

  const handleSaveProfile = (e: React.FormEvent) => {
    e.preventDefault();
    updateUserProfile({
      displayName: displayName.trim() || 'Ayn Lorebelle',
      tagline: tagline.trim() || 'Smart Saver & Co-Op Squad Leader',
      avatarEmoji,
      clayAccent,
      monthlySavingsGoalPct,
      aynieeeTone,
    });
    showToast('Saved your personalized profile & Aynieee preferences!', 'success');
    setOpen(false);
  };

  const handleCurrencyClick = (code: CurrencyCode) => {
    setBaseCurrency(code);
  };

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Your Profile, Currency & Aynieee Personalization"
      subtitle="Customize your identity, active currency, 3D Clay accent color, savings target, and how Aynieee talks to you"
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSaveProfile} className="p-5 space-y-6">
        {/* 1. Live Profile Preview Card */}
        <div
          className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{
            backgroundColor: clayAccent,
            color: '#1F2937',
          }}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-14 h-14 rounded-2xl bg-white/90 border-3 border-white flex items-center justify-center text-3xl shadow-sm shrink-0">
              {avatarEmoji}
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-white/80 text-[11px] font-extrabold text-[#1F2937] mb-1">
                <Sparkles className="w-3 h-3 text-[#6D28D9]" />
                <span>AYNLYTICS 2.0 Personal Profile</span>
              </div>
              <h3 className="text-xl font-extrabold text-[#1F2937] leading-tight">
                {displayName || 'Ayn Lorebelle'}
              </h3>
              <p className="text-xs font-bold text-[#1F2937]/80">
                {tagline || 'Smart Saver & Co-Op Squad Leader'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-white/85 text-xs font-extrabold text-[#1F2937] tabular-nums">
              {CURRENCY_METADATA[baseCurrency].symbol} {baseCurrency}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white/85 text-xs font-extrabold text-[#1F2937] tabular-nums">
              Goal: {monthlySavingsGoalPct}% saved
            </span>
          </div>
        </div>

        {/* 2. Instant Base Currency Switcher */}
        <div className="space-y-2.5">
          <div className="flex items-center justify-between">
            <label className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#6D28D9]" />
              <span>1-Click Active Currency (Rebases Vault &amp; Friend Squads)</span>
            </label>
            <span className="text-xs font-bold text-[var(--text-muted)]">
              Current: {CURRENCY_METADATA[baseCurrency].name} ({CURRENCY_METADATA[baseCurrency].symbol})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {SUPPORTED_CURRENCIES.map((code) => {
              const meta = CURRENCY_METADATA[code];
              const active = baseCurrency === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleCurrencyClick(code)}
                  aria-pressed={active}
                  className={`p-3 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between ${
                    active
                      ? 'clay-surface-peach scale-[1.02]'
                      : 'tactile-btn opacity-90 hover:opacity-100'
                  }`}
                >
                  <div>
                    <div className="text-sm font-extrabold">
                      {meta.symbol} {code}
                    </div>
                    <div className="text-[11px] font-semibold opacity-80 truncate">
                      {meta.name}
                    </div>
                  </div>
                  {active && <Check className="w-4 h-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Name, Tagline & Avatar Emoji */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="profile-display-name"
              className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Your Display Name</span>
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ayn Lorebelle"
              className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-tagline"
              className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Sparkles className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Financial Era / Tagline</span>
            </label>
            <input
              id="profile-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Smart Saver & Co-Op Squad Leader"
              className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
            />
          </div>
        </div>

        {/* Avatar Emoji & Signature Clay Accent */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] block">
              Pick Your Avatar Icon
            </span>
            <div className="flex flex-wrap gap-2">
              {AVATAR_EMOJIS.map((emoji) => (
                <button
                  key={emoji}
                  type="button"
                  onClick={() => setAvatarEmoji(emoji)}
                  aria-label={`Select avatar ${emoji}`}
                  aria-pressed={avatarEmoji === emoji}
                  className={`w-10 h-10 rounded-xl text-lg flex items-center justify-center cursor-pointer transition-transform ${
                    avatarEmoji === emoji
                      ? 'clay-surface-peach scale-110'
                      : 'tactile-btn'
                  }`}
                >
                  {emoji}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Signature 3D Clay Accent</span>
            </span>
            <div className="flex flex-wrap gap-2.5">
              {CLAY_MEMBER_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setClayAccent(c.hex)}
                  aria-label={`Select ${c.name}`}
                  aria-pressed={clayAccent.toUpperCase() === c.hex.toUpperCase()}
                  className="px-3 py-2 rounded-xl text-xs font-extrabold border-3 border-white shadow-sm flex items-center gap-1.5 cursor-pointer text-[#1F2937] transition-transform hover:scale-105"
                  style={{ backgroundColor: c.hex }}
                >
                  <span>{c.name.replace('Clay ', '')}</span>
                  {clayAccent.toUpperCase() === c.hex.toUpperCase() && (
                    <Check className="w-3.5 h-3.5" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. Aynieee AI Personality & Monthly Savings Target */}
        <div className="space-y-3">
          <label className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5">
            <Bot className="w-4 h-4 text-[#6D28D9]" />
            <span>How Should Aynieee Talk to You? (AI Bestie Vibe)</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
            {AYNIEEE_TONE_OPTIONS.map((t) => {
              const active = aynieeeTone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAynieeeTone(t.id)}
                  aria-pressed={active}
                  className={`p-3 rounded-2xl text-left cursor-pointer transition-all ${
                    active ? 'clay-surface-pink scale-[1.01]' : 'tactile-btn'
                  }`}
                >
                  <div className="text-xs font-extrabold flex items-center justify-between">
                    <span>{t.label}</span>
                    {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                  </div>
                  <p className="text-[11px] font-medium opacity-80 mt-1 leading-snug">
                    {t.description}
                  </p>
                </button>
              );
            })}
          </div>
        </div>

        <div className="tactile-well p-4 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="savings-goal-slider"
              className="text-xs font-extrabold uppercase tracking-wider text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Target className="w-4 h-4 text-[#059669]" />
              <span>Personal Monthly Savings Rate Target</span>
            </label>
            <span className="px-2.5 py-0.5 rounded-full clay-surface-mint text-xs font-extrabold tabular-nums">
              {monthlySavingsGoalPct}% of income
            </span>
          </div>
          <input
            id="savings-goal-slider"
            type="range"
            min={5}
            max={65}
            step={5}
            value={monthlySavingsGoalPct}
            onChange={(e) => setMonthlySavingsGoalPct(Number(e.target.value))}
            className="w-full accent-[#EC4899] cursor-pointer"
          />
        </div>

        {/* 5. Quick App Preferences (Theme & Privacy Mask) */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="tactile-btn px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? 'Switch to Pastel Clay Day' : 'Switch to Clay Twilight'}</span>
            </button>
            <button
              type="button"
              onClick={togglePrivacyMask}
              className="tactile-btn px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {privacyMask ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{privacyMask ? 'Privacy Blur: ON' : 'Privacy Blur: OFF'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tactile-btn px-4 py-2.5 text-xs font-extrabold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-5 py-2.5 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Profile &amp; Preferences</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
