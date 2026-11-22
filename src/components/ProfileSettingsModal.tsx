import React, { useEffect, useState } from 'react';
import {
  User,
  Coins,
  Check,
  Palette,
  Sun,
  Moon,
  Eye,
  EyeOff,
  Bot,
  Target,
  Tag,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import { CURRENCY_METADATA, SUPPORTED_CURRENCIES } from '../core/currency';
import { AYNIEEE_TONE_OPTIONS, getEffectiveProfile } from '../core/aiCoach';
import { CLAY_MEMBER_COLORS, getInitials } from '../core/savingsSquad';
import type { AynieeeTone, CurrencyCode } from '../types/finance';
import { Modal } from './ui';

const MONOGRAM_BADGES = ['AL', 'AY', 'MS', 'CT', 'LR', 'SC', 'VIP', 'PRO'];

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
    const cleanedName = displayName.trim() || 'Ayn Lorebelle';
    const cleanedBadge =
      /^[a-zA-Z0-9_-]{1,6}$/.test(avatarEmoji.trim())
        ? avatarEmoji.trim().toUpperCase()
        : getInitials(cleanedName);
    updateUserProfile({
      displayName: cleanedName,
      tagline: tagline.trim() || 'Smart Saver & Co-Op Squad Leader',
      avatarEmoji: cleanedBadge,
      clayAccent,
      monthlySavingsGoalPct,
      aynieeeTone,
    });
    showToast('Saved profile and preferences', 'success');
    setOpen(false);
  };

  const handleCurrencyClick = (code: CurrencyCode) => {
    setBaseCurrency(code);
  };

  const badgeLabel =
    /^[a-zA-Z0-9_-]{1,6}$/.test(avatarEmoji.trim())
      ? avatarEmoji.trim().toUpperCase()
      : getInitials(displayName || 'Ayn Lorebelle');

  return (
    <Modal
      open={open}
      onClose={() => setOpen(false)}
      title="Profile & Preferences"
      subtitle="Manage your display name, active currency, savings goal, and Aynieee tone"
      maxWidthClass="max-w-2xl"
    >
      <form onSubmit={handleSaveProfile} className="p-5 space-y-5">
        {/* 1. Profile Preview Card */}
        <div
          className="card flex flex-col sm:flex-row sm:items-center justify-between gap-4"
          style={{
            backgroundColor: clayAccent,
            color: '#1F2937',
          }}
        >
          <div className="flex items-center gap-3.5">
            <div className="w-13 h-13 rounded-2xl bg-white/90 border-3 border-white flex items-center justify-center text-base font-extrabold text-[#1F2937] shadow-sm shrink-0">
              {badgeLabel}
            </div>
            <div>
              <h3 className="text-lg font-extrabold text-[#1F2937] leading-tight">
                {displayName || 'Ayn Lorebelle'}
              </h3>
              <p className="text-xs font-semibold text-[#1F2937]/80 mt-0.5">
                {tagline || 'Smart Saver & Co-Op Squad Leader'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <span className="px-3 py-1.5 rounded-xl bg-white/85 text-xs font-extrabold text-[#1F2937] tabular-nums">
              {CURRENCY_METADATA[baseCurrency].symbol} {baseCurrency}
            </span>
            <span className="px-3 py-1.5 rounded-xl bg-white/85 text-xs font-extrabold text-[#1F2937] tabular-nums">
              Target: {monthlySavingsGoalPct}% saved
            </span>
          </div>
        </div>

        {/* 2. Base Currency Switcher */}
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Coins className="w-4 h-4 text-[#6D28D9]" />
              <span>Active Currency</span>
            </label>
            <span className="text-xs font-medium text-[var(--text-muted)]">
              {CURRENCY_METADATA[baseCurrency].name} ({CURRENCY_METADATA[baseCurrency].symbol})
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {SUPPORTED_CURRENCIES.map((code) => {
              const meta = CURRENCY_METADATA[code];
              const active = baseCurrency === code;
              return (
                <button
                  key={code}
                  type="button"
                  onClick={() => handleCurrencyClick(code)}
                  aria-pressed={active}
                  className={`p-2.5 rounded-2xl text-left transition-all cursor-pointer flex items-center justify-between ${
                    active
                      ? 'clay-surface-peach'
                      : 'tactile-btn opacity-90 hover:opacity-100'
                  }`}
                >
                  <div>
                    <div className="text-xs font-extrabold">
                      {meta.symbol} {code}
                    </div>
                    <div className="text-[11px] font-medium opacity-80 truncate">
                      {meta.name}
                    </div>
                  </div>
                  {active && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </div>

        {/* 3. Name & Tagline */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <label
              htmlFor="profile-display-name"
              className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <User className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Display Name</span>
            </label>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Ayn Lorebelle"
              className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
            />
          </div>

          <div className="space-y-1.5">
            <label
              htmlFor="profile-tagline"
              className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Tag className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Subtitle</span>
            </label>
            <input
              id="profile-tagline"
              type="text"
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="e.g. Smart Saver & Co-Op Squad Leader"
              className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
            />
          </div>
        </div>

        {/* Monogram Badge & Clay Accent */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <span className="text-xs font-bold text-[var(--text-primary)] block">
              Monogram Badge
            </span>
            <div className="flex flex-wrap gap-1.5">
              {MONOGRAM_BADGES.map((badge) => (
                <button
                  key={badge}
                  type="button"
                  onClick={() => setAvatarEmoji(badge)}
                  aria-label={`Select badge ${badge}`}
                  aria-pressed={badgeLabel === badge}
                  className={`px-3 py-1.5 rounded-xl text-xs font-extrabold cursor-pointer transition-colors ${
                    badgeLabel === badge ? 'clay-surface-peach' : 'tactile-btn'
                  }`}
                >
                  {badge}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <span className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
              <Palette className="w-3.5 h-3.5 text-[#6D28D9]" />
              <span>Accent Color</span>
            </span>
            <div className="flex flex-wrap gap-2">
              {CLAY_MEMBER_COLORS.map((c) => (
                <button
                  key={c.hex}
                  type="button"
                  onClick={() => setClayAccent(c.hex)}
                  aria-label={`Select ${c.name}`}
                  aria-pressed={clayAccent.toUpperCase() === c.hex.toUpperCase()}
                  className="px-2.5 py-1.5 rounded-xl text-xs font-extrabold border-2 border-white shadow-xs flex items-center gap-1 cursor-pointer text-[#1F2937]"
                  style={{ backgroundColor: c.hex }}
                >
                  <span>{c.name.replace('Clay ', '')}</span>
                  {clayAccent.toUpperCase() === c.hex.toUpperCase() && (
                    <Check className="w-3 h-3" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* 4. Aynieee Tone & Monthly Savings Target */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5">
            <Bot className="w-4 h-4 text-[#6D28D9]" />
            <span>Aynieee Advisor Style</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            {AYNIEEE_TONE_OPTIONS.map((t) => {
              const active = aynieeeTone === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setAynieeeTone(t.id)}
                  aria-pressed={active}
                  className={`p-3 rounded-2xl text-left cursor-pointer transition-all ${
                    active ? 'clay-surface-pink' : 'tactile-btn'
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

        <div className="tactile-well p-3.5 space-y-2">
          <div className="flex items-center justify-between">
            <label
              htmlFor="savings-goal-slider"
              className="text-xs font-bold text-[var(--text-primary)] flex items-center gap-1.5"
            >
              <Target className="w-4 h-4 text-[#059669]" />
              <span>Monthly Savings Target</span>
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

        {/* 5. App Preferences */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-[var(--border-hairline)]">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={toggleTheme}
              className="tactile-btn px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {isDark ? <Sun className="w-3.5 h-3.5" /> : <Moon className="w-3.5 h-3.5" />}
              <span>{isDark ? 'Light Theme' : 'Dark Theme'}</span>
            </button>
            <button
              type="button"
              onClick={togglePrivacyMask}
              className="tactile-btn px-3 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {privacyMask ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              <span>{privacyMask ? 'Privacy Blur: On' : 'Privacy Blur: Off'}</span>
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="tactile-btn px-4 py-2 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>Save Preferences</span>
            </button>
          </div>
        </div>
      </form>
    </Modal>
  );
};
