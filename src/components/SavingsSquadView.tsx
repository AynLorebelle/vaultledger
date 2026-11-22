import React, { useEffect, useMemo, useState } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import confetti from 'canvas-confetti';
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  BarChart,
  Bar,
  XAxis,
  YAxis,
} from 'recharts';
import {
  Crown,
  Users,
  Share2,
  Copy,
  Check,
  Plus,
  Sparkles,
  Trash2,
  Trophy,
  UserPlus,
  Link2,
  ArrowUpRight,
  PiggyBank,
} from 'lucide-react';
import { useFinanceStore } from '../store/useFinanceStore';
import {
  CLAY_MEMBER_COLORS,
  buildSquadShareUrl,
  computeSquadLeaderboard,
  createDefaultSavingsSquads,
  encodeSquadSharePayload,
} from '../core/savingsSquad';
import { SUPPORTED_CURRENCIES } from '../core/currency';
import type { CurrencyCode, SavingsSquadPot } from '../types/finance';
import { Modal, Money, formatMoney, formatShortDate, todayIso } from './ui';

function getClaySurfaceClass(hex: string): string {
  const upper = hex.toUpperCase();
  if (upper === '#FDBCB4') return 'clay-surface-peach';
  if (upper === '#ADD8E6') return 'clay-surface-blue';
  if (upper === '#98FF98') return 'clay-surface-mint';
  if (upper === '#FFD1DC') return 'clay-surface-pink';
  if (upper === '#E6E6FA') return 'clay-surface-lavender';
  if (upper === '#B5EAD7') return 'clay-surface-sage';
  return 'clay-surface-peach';
}

function triggerPastelConfetti(): void {
  try {
    void confetti({
      particleCount: 55,
      spread: 65,
      origin: { y: 0.7 },
      colors: ['#FDBCB4', '#ADD8E6', '#98FF98', '#FFD1DC', '#E6E6FA', '#B5EAD7'],
    });
  } catch {
    // ignore if canvas-confetti fails in headless or restricted context
  }
}

export const SavingsSquadView: React.FC = () => {
  const data = useFinanceStore((s) => s.data);
  const createSavingsSquad = useFinanceStore((s) => s.createSavingsSquad);
  const deleteSavingsSquad = useFinanceStore((s) => s.deleteSavingsSquad);
  const addSquadMember = useFinanceStore((s) => s.addSquadMember);
  const addSquadContribution = useFinanceStore((s) => s.addSquadContribution);
  const deleteSquadContribution = useFinanceStore((s) => s.deleteSquadContribution);
  const importSharedSquadCode = useFinanceStore((s) => s.importSharedSquadCode);
  const showToast = useFinanceStore((s) => s.showToast);

  const baseCurrency = data.settings.baseCurrency;
  const privacyMask = data.settings.privacyMask;

  const squads: SavingsSquadPot[] = useMemo(() => {
    if (Array.isArray(data.savingsSquads) && data.savingsSquads.length > 0) {
      return data.savingsSquads;
    }
    return createDefaultSavingsSquads(baseCurrency);
  }, [data.savingsSquads, baseCurrency]);

  const [selectedPotId, setSelectedPotId] = useState<string>(() => squads[0]?.id ?? '');

  useEffect(() => {
    if (!squads.some((p) => p.id === selectedPotId) && squads[0]) {
      setSelectedPotId(squads[0].id);
    }
  }, [squads, selectedPotId]);

  const activePot = useMemo(
    () => squads.find((p) => p.id === selectedPotId) ?? squads[0],
    [squads, selectedPotId],
  );

  const board = useMemo(
    () => computeSquadLeaderboard(activePot),
    [activePot],
  );

  // Deposit Form State
  const [selectedMemberId, setSelectedMemberId] = useState<string>(
    () => activePot?.members[0]?.id ?? '',
  );
  const [depositAmount, setDepositAmount] = useState<string>('250');
  const [depositDate, setDepositDate] = useState<string>(() => todayIso());
  const [depositNote, setDepositNote] = useState<string>('');

  useEffect(() => {
    if (
      activePot &&
      !activePot.members.some((m) => m.id === selectedMemberId) &&
      activePot.members[0]
    ) {
      setSelectedMemberId(activePot.members[0].id);
    }
  }, [activePot, selectedMemberId]);

  // Add Friend Mini-Form State
  const [newFriendName, setNewFriendName] = useState<string>('');
  const [newFriendColor, setNewFriendColor] = useState<string>(
    CLAY_MEMBER_COLORS[3].hex,
  );

  // Sync / Paste Inline & Modal State
  const [inlineSyncOpen, setInlineSyncOpen] = useState<boolean>(false);
  const [syncInputCode, setSyncInputCode] = useState<string>('');
  const [copiedMode, setCopiedMode] = useState<'link' | 'code' | null>(null);

  // Create New Shared Squad Modal State
  const [newSquadModalOpen, setNewSquadModalOpen] = useState<boolean>(false);
  const [squadName, setSquadName] = useState<string>('');
  const [squadEmoji, setSquadEmoji] = useState<string>('🏖️');
  const [squadTarget, setSquadTarget] = useState<string>('5000');
  const [squadCurrency, setSquadCurrency] = useState<CurrencyCode>(baseCurrency);
  const [squadOwnerName, setSquadOwnerName] = useState<string>('Ayn Lorebelle');
  const [squadFriendName, setSquadFriendName] = useState<string>('Mia Santos');

  const handleCopyShareLink = async () => {
    if (!activePot) return;
    const url = buildSquadShareUrl(activePot);
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // Fallback if clipboard permission denied
    }
    setCopiedMode('link');
    setTimeout(() => setCopiedMode(null), 2600);
    showToast(
      'Copied live share link! Send it to your friend so they can see the leaderboard & add their savings.',
      'success',
    );
  };

  const handleCopyOfflineCode = async () => {
    if (!activePot) return;
    const token = encodeSquadSharePayload(activePot);
    try {
      await navigator.clipboard.writeText(token);
    } catch {
      // Fallback if clipboard permission denied
    }
    setCopiedMode('code');
    setTimeout(() => setCopiedMode(null), 2600);
    showToast(
      'Copied offline squad sync code (AYNSQ1_...) to clipboard!',
      'success',
    );
  };

  const handleLogContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePot) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Please enter a valid positive savings deposit amount.', 'error');
      return;
    }
    const targetMemberId = selectedMemberId || activePot.members[0]?.id;
    if (!targetMemberId) return;

    addSquadContribution(activePot.id, {
      memberId: targetMemberId,
      amount: amt,
      date: depositDate || todayIso(),
      note: depositNote.trim() || 'Shared squad savings deposit',
    });

    triggerPastelConfetti();
    setDepositNote('');
  };

  const handleAddFriend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePot) return;
    if (!newFriendName.trim()) {
      showToast('Enter your friend’s name first!', 'error');
      return;
    }
    addSquadMember(activePot.id, newFriendName.trim(), newFriendColor);
    setNewFriendName('');
  };

  const handleImportCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncInputCode.trim()) {
      showToast('Paste a friend’s share link or AYNSQ1_ code first.', 'error');
      return;
    }
    const res = importSharedSquadCode(syncInputCode.trim());
    if (res.ok) {
      triggerPastelConfetti();
      setSyncInputCode('');
      setInlineSyncOpen(false);
    }
  };

  const handleCreateNewSquad = (e: React.FormEvent) => {
    e.preventDefault();
    const targetAmt = Number(squadTarget);
    if (!squadName.trim() || !Number.isFinite(targetAmt) || targetAmt <= 0) {
      showToast('Please enter a squad name and valid target amount.', 'error');
      return;
    }
    createSavingsSquad({
      name: squadName.trim(),
      emoji: squadEmoji.trim() || '🐷',
      targetAmount: targetAmt,
      currency: squadCurrency,
      ownerName: squadOwnerName.trim() || 'Ayn Lorebelle',
      friendName: squadFriendName.trim() || 'Bestie',
    });
    triggerPastelConfetti();
    setNewSquadModalOpen(false);
    setSquadName('');
  };

  const chartData = useMemo(() => {
    return board.entries.map((entry) => ({
      name: entry.member.name,
      shortName: entry.member.name.split(' ')[0],
      value: entry.totalContributed,
      sharePercent: entry.sharePercent,
      color: entry.member.clayColor,
    }));
  }, [board.entries]);

  const memberMap = useMemo(() => {
    const map = new Map<string, SavingsSquadPot['members'][number]>();
    if (activePot) {
      for (const m of activePot.members) {
        map.set(m.id, m);
      }
    }
    return map;
  }, [activePot]);

  if (!activePot) {
    return null;
  }

  const leaderTotal = board.entries[0]?.totalContributed ?? 0;

  return (
    <div className="space-y-6 pb-10">
      {/* 1. Top Header & Squad Switcher */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div>
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full clay-surface-pink text-xs font-extrabold tracking-wide uppercase mb-2">
            <Users className="w-3.5 h-3.5" />
            Co-Op Friend Savings & Ownership Share Tracker
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Friend Savings Squads &amp; Share Leaderboard
          </h1>
          <p className="text-sm text-[var(--text-secondary)] mt-1">
            Save together with a friend, compare ownership shares of the pot, and sync via live link or offline squad code
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setInlineSyncOpen((prev) => !prev)}
            className="tactile-btn px-4 py-2.5 text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-[var(--accent-primary-text)]" />
            Sync Friend&apos;s Link / Code
          </button>
          <button
            type="button"
            onClick={() => setNewSquadModalOpen(true)}
            className="tactile-btn-primary px-4 py-2.5 text-sm inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            + New Shared Squad
          </button>
        </div>
      </div>

      {/* Squad Selector Pills */}
      <div className="flex flex-wrap items-center gap-2.5">
        {squads.map((pot) => {
          const isSelected = pot.id === activePot.id;
          const potBoard = computeSquadLeaderboard(pot);
          return (
            <button
              key={pot.id}
              type="button"
              onClick={() => setSelectedPotId(pot.id)}
              className={`px-4 py-2.5 rounded-2xl text-sm font-extrabold transition-all cursor-pointer inline-flex items-center gap-2.5 ${
                isSelected
                  ? 'clay-surface-peach scale-[1.02]'
                  : 'tactile-btn opacity-85 hover:opacity-100'
              }`}
            >
              <span className="text-lg leading-none">{pot.emoji}</span>
              <span>{pot.name}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-white/70 text-[#1F2937] tabular-nums">
                {potBoard.progressPercent.toFixed(0)}%
              </span>
            </button>
          );
        })}
      </div>

      {/* Optional Inline Sync Drawer */}
      <AnimatePresence>
        {inlineSyncOpen && (
          <motion.form
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            onSubmit={handleImportCodeSubmit}
            className="card clay-surface-blue space-y-3"
          >
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h2 className="text-base font-extrabold text-[#1F2937] flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  Sync Friend&apos;s Updated Squad Link or Code
                </h2>
                <p className="text-xs font-semibold text-[#1F2937]/80">
                  Paste the share URL or <code className="font-mono font-bold">AYNSQ1_...</code> code your friend sent you to merge their latest savings deposits immediately.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInlineSyncOpen(false)}
                className="text-xs font-extrabold underline text-[#1F2937] self-start sm:self-center cursor-pointer"
              >
                Close
              </button>
            </div>
            <div className="flex flex-col sm:flex-row gap-2.5">
              <input
                type="text"
                value={syncInputCode}
                onChange={(e) => setSyncInputCode(e.target.value)}
                placeholder="Paste https://...?squad=AYNSQ1_... or AYNSQ1_ token here"
                aria-label="Friend squad share link or code"
                className="tactile-input flex-1 px-4 py-2.5 text-sm font-semibold"
              />
              <button
                type="submit"
                className="tactile-btn-primary px-5 py-2.5 text-sm cursor-pointer shrink-0"
              >
                Merge Friend&apos;s Savings Pot
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 2. Hero Co-Op Savings Pot Card (.card clay-surface-lavender) */}
      <div className="card clay-surface-lavender space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="text-3xl leading-none select-none">{activePot.emoji}</span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#1F2937] tracking-tight">
                {activePot.name}
              </h2>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-white/80 text-[#1F2937] border-2 border-white shadow-xs font-mono">
                Room: {activePot.roomCode}
              </span>
              <span className="px-3 py-1 rounded-full text-xs font-extrabold bg-white/75 text-[#1F2937]">
                {activePot.members.length} Savers
              </span>
            </div>
            <p className="text-sm font-bold text-[#1F2937]/85">
              Shared Co-Op Goal Pot • Real-time ownership share split &amp; friend leaderboard
            </p>
          </div>

          {/* Two 1-Click Friend Sharing Actions */}
          <div className="flex flex-wrap items-center gap-2.5">
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="tactile-btn-primary px-4 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer"
            >
              {copiedMode === 'link' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              Share Live Link to Friend
            </button>
            <button
              type="button"
              onClick={() => void handleCopyOfflineCode()}
              className="tactile-btn px-4 py-2.5 text-xs sm:text-sm inline-flex items-center gap-2 cursor-pointer bg-white/90 text-[#1F2937]"
            >
              {copiedMode === 'code' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              Copy Offline Sync Code
            </button>
            {squads.length > 1 && (
              <button
                type="button"
                onClick={() => deleteSavingsSquad(activePot.id)}
                className="p-2.5 rounded-xl bg-white/70 hover:bg-white text-[#9F1239] transition-colors cursor-pointer"
                aria-label={`Delete ${activePot.name}`}
                title="Delete shared squad"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Pot KPIs & Chunky Claymorphism .progress Bar */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-1">
          <div className="p-4 rounded-2xl bg-white/75 border-2 border-white/90">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#374151]">
              Total Squad Pot Saved
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1F2937] mt-1">
              <Money
                amount={board.totalSaved}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-bold text-[#374151] mt-1">
              Across {activePot.contributions.length} friend deposits
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/75 border-2 border-white/90">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#374151]">
              Shared Target Goal
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1F2937] mt-1">
              <Money
                amount={board.targetAmount}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-bold text-[#374151] mt-1 tabular-nums">
              {board.progressPercent.toFixed(1)}% of squad target funded
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/75 border-2 border-white/90">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#374151]">
              Remaining to Goal
            </div>
            <div className="text-2xl sm:text-3xl font-extrabold text-[#1F2937] mt-1">
              <Money
                amount={board.remainingAmount}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-bold text-[#374151] mt-1">
              {board.remainingAmount <= 0
                ? '🎉 Goal 100% Unlocked!'
                : 'Keep stacking deposits together'}
            </div>
          </div>
        </div>

        {/* Chunky Claymorphism Progress Bar */}
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs font-extrabold text-[#1F2937]">
            <span>Co-Op Goal Completion</span>
            <span className="tabular-nums">{board.progressPercent.toFixed(1)}% Funded</span>
          </div>
          <div
            className="progress h-5"
            role="progressbar"
            aria-valuenow={Math.round(board.progressPercent)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <span
              style={{
                width: `${Math.max(4, Math.min(100, board.progressPercent))}%`,
                transition: 'width 400ms cubic-bezier(0.22, 1, 0.36, 1)',
              }}
            />
          </div>
        </div>

        {/* Headline Banner */}
        <div className="p-4 rounded-2xl clay-surface-pink flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-white/85 flex items-center justify-center text-[#1F2937] shrink-0 shadow-xs">
              <Crown className="w-5 h-5 text-[#D97706]" />
            </div>
            <div>
              <div className="text-[11px] font-extrabold uppercase tracking-wider text-[#1F2937]/75">
                Live Share Leaderboard Status
              </div>
              <div className="text-sm sm:text-base font-extrabold text-[#1F2937]">
                {board.headline}
              </div>
            </div>
          </div>
          {board.topSaver && (
            <div className="px-3.5 py-1.5 rounded-full bg-white/85 text-xs font-extrabold text-[#1F2937] tabular-nums shrink-0 self-start sm:self-center">
              #1 Share: {board.topSaver.sharePercent.toFixed(1)}% of pot
            </div>
          )}
        </div>
      </div>

      {/* 3. Who Has the Bigger Share? — Interactive Leaderboard & Share Breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column — Ranked Friend Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
                <Trophy className="w-5 h-5 text-[#D97706]" />
                Who Has the Bigger Share? — Friend Leaderboard
              </h2>
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Ranked by total savings contributed and exact ownership percentage of the pot
              </p>
            </div>
          </div>

          <div className="space-y-4">
            {board.entries.map((entry) => {
              const clayClass = getClaySurfaceClass(entry.member.clayColor);
              const deficitToLeader = Math.max(0, leaderTotal - entry.totalContributed);

              return (
                <motion.div
                  key={entry.member.id}
                  layout
                  transition={{ type: 'spring', stiffness: 360, damping: 28 }}
                  className={`card ${clayClass} space-y-4`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3.5">
                      <div className="w-12 h-12 rounded-2xl bg-white/90 border-2 border-white flex items-center justify-center text-base font-extrabold text-[#1F2937] shadow-sm shrink-0">
                        {entry.member.avatarInitials}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2.5 py-0.5 rounded-full text-xs font-extrabold bg-white/85 text-[#1F2937] tabular-nums">
                            Rank #{entry.rank}
                          </span>
                          <h3 className="text-lg font-extrabold text-[#1F2937]">
                            {entry.member.name}
                          </h3>
                          <span className="px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-black/10 text-[#1F2937]">
                            {entry.member.role === 'owner' ? 'You / Owner' : 'Friend'}
                          </span>
                        </div>

                        {entry.isTopSaver && (
                          <div className="inline-flex items-center gap-1.5 mt-1.5 px-3 py-1 rounded-full bg-white text-[#1F2937] text-xs font-extrabold shadow-xs">
                            <Crown className="w-3.5 h-3.5 text-[#D97706]" />
                            #1 TOP SAVER • MOST SHARES
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Exact Ownership Share % & Total Contributed */}
                    <div className="sm:text-right bg-white/75 px-4 py-2.5 rounded-2xl border-2 border-white/90">
                      <div className="text-2xl sm:text-3xl font-extrabold text-[#1F2937] tabular-nums">
                        {entry.sharePercent.toFixed(1)}%{' '}
                        <span className="text-xs font-extrabold uppercase">of pot</span>
                      </div>
                      <div className="text-sm font-extrabold text-[#374151] tabular-nums">
                        Contributed:{' '}
                        <Money
                          amount={entry.totalContributed}
                          currency={activePot.currency}
                          privacyMask={privacyMask}
                        />
                      </div>
                    </div>
                  </div>

                  {/* Animated Share Progress Bar */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between text-xs font-extrabold text-[#1F2937]">
                      <span>Ownership Share of Saved Pot</span>
                      <span className="tabular-nums">
                        {entry.sharePercent.toFixed(1)}% share ({entry.targetSharePercent.toFixed(1)}% of total goal)
                      </span>
                    </div>
                    <div className="progress h-4">
                      <span
                        style={{
                          width: `${Math.max(3, Math.min(100, entry.sharePercent))}%`,
                          transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                        }}
                      />
                    </div>
                  </div>

                  {/* Lead Margin Pill & Stats Footer */}
                  <div className="flex flex-wrap items-center justify-between gap-2 pt-1 text-xs font-extrabold text-[#1F2937]">
                    <div className="px-3 py-1.5 rounded-xl bg-white/80 tabular-nums">
                      {entry.isTopSaver && board.entries.length >= 2 ? (
                        entry.leadOverNext > 0 ? (
                          <span>
                            +{formatMoney(entry.leadOverNext, activePot.currency)} ahead (+
                            {entry.shareGapPercent.toFixed(1)}% share lead)
                          </span>
                        ) : (
                          <span>Tied for #1 Top Saver!</span>
                        )
                      ) : deficitToLeader > 0 ? (
                        <span>
                          Needs {formatMoney(deficitToLeader, activePot.currency)} to tie #1
                        </span>
                      ) : (
                        <span>Ready for first deposit</span>
                      )}
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs font-bold text-[#1F2937]/85 tabular-nums">
                      <span>{entry.contributionCount} deposits</span>
                      <span>•</span>
                      <span>
                        Largest:{' '}
                        <Money
                          amount={entry.largestSingleDeposit}
                          currency={activePot.currency}
                          privacyMask={privacyMask}
                        />
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        </div>

        {/* Right Column — Ownership Share Donut & Head-to-Head Chart (.card) */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          <div className="card space-y-4 min-w-0">
            <div>
              <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                Pot Ownership Share Split
              </h2>
              <p className="text-xs font-semibold text-[var(--text-secondary)]">
                Visual comparison of who owns the biggest slice of {activePot.name}
              </p>
            </div>

            {/* Recharts Donut Chart */}
            <div className="h-56 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={52}
                    outerRadius={84}
                    paddingAngle={4}
                    stroke="#FFFFFF"
                    strokeWidth={3}
                  >
                    {chartData.map((item, idx) => (
                      <Cell key={`cell-${idx}`} fill={item.color} />
                    ))}
                  </Pie>
                  <Tooltip
                    formatter={(value: unknown, _name: unknown, props: { payload?: { sharePercent?: number } }) => {
                      const num = Number(value) || 0;
                      const share = props?.payload?.sharePercent ?? 0;
                      return [
                        `${formatMoney(num, activePot.currency)} (${share.toFixed(1)}% share)`,
                        'Saved',
                      ];
                    }}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>

            {/* Head-to-Head BarChart */}
            <div className="h-44 w-full min-w-0 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={chartData}
                  layout="vertical"
                  margin={{ top: 4, right: 16, left: 8, bottom: 4 }}
                >
                  <XAxis type="number" domain={[0, 100]} hide />
                  <YAxis
                    type="category"
                    dataKey="shortName"
                    width={72}
                    tick={{ fontSize: 12, fontWeight: 800, fill: 'var(--text-primary)' }}
                  />
                  <Tooltip
                    formatter={(value: unknown) => [
                      `${Number(value).toFixed(1)}% of pot`,
                      'Ownership Share',
                    ]}
                  />
                  <Bar dataKey="sharePercent" radius={[0, 10, 10, 0]}>
                    {chartData.map((item, idx) => (
                      <Cell key={`bar-${idx}`} fill={item.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>

            {/* Share Legend */}
            <div className="space-y-2 pt-1">
              {board.entries.map((entry) => (
                <div
                  key={entry.member.id}
                  className="flex items-center justify-between text-xs font-extrabold p-2.5 rounded-xl bg-[var(--bg-subtle)]"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className="w-3.5 h-3.5 rounded-full border border-black/20 shrink-0"
                      style={{ backgroundColor: entry.member.clayColor }}
                    />
                    <span className="text-[var(--text-primary)]">{entry.member.name}</span>
                  </div>
                  <div className="tabular-nums text-[var(--text-primary)]">
                    {entry.sharePercent.toFixed(1)}% (
                    <Money
                      amount={entry.totalContributed}
                      currency={activePot.currency}
                      privacyMask={privacyMask}
                    />
                    )
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 4. Log Friend Savings Deposit + Add Another Friend + Contribution Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Quick Deposit Card (.card clay-surface-mint) + Add Friend to Squad */}
        <div className="lg:col-span-5 space-y-6">
          <form onSubmit={handleLogContribution} className="card clay-surface-mint space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-2xl bg-white/85 flex items-center justify-center text-[#1F2937] shadow-xs">
                <PiggyBank className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-extrabold text-[#1F2937]">
                  Log Friend Savings Deposit
                </h2>
                <p className="text-xs font-bold text-[#1F2937]/80">
                  Add savings for yourself or a friend to boost your share %!
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1F2937] mb-1">
                  Who is saving?
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  aria-label="Who is saving"
                  className="tactile-input w-full px-3.5 py-2.5 text-sm font-extrabold"
                >
                  {activePot.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role === 'owner' ? 'You / Owner' : 'Friend'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1F2937] mb-1">
                    Deposit Amount ({activePot.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    aria-label="Deposit Amount"
                    className="tactile-input w-full px-3.5 py-2.5 text-sm font-extrabold tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1F2937] mb-1">
                    Deposit Date
                  </label>
                  <input
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                    aria-label="Deposit Date"
                    className="tactile-input w-full px-3.5 py-2.5 text-sm font-extrabold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-extrabold uppercase tracking-wider text-[#1F2937] mb-1">
                  Win / Savings Note
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  placeholder="e.g. Skipped iced coffee week / Freelance bonus"
                  aria-label="Win or savings note"
                  className="tactile-input w-full px-3.5 py-2.5 text-sm font-semibold"
                />
              </div>
            </div>

            <button
              type="submit"
              className="button w-full py-3.5 text-base font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Sparkles className="w-5 h-5" />
              Add Savings to Pot
            </button>
          </form>

          {/* Add Another Friend to Squad Mini-Form */}
          <form onSubmit={handleAddFriend} className="card clay-surface-peach space-y-3.5">
            <div className="flex items-center gap-2">
              <UserPlus className="w-5 h-5 text-[#1F2937]" />
              <h3 className="text-base font-extrabold text-[#1F2937]">
                Add Another Friend to Squad
              </h3>
            </div>
            <div className="space-y-2.5">
              <input
                type="text"
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Friend's Name (e.g. Sofia Cruz)"
                aria-label="Friend's Name"
                className="tactile-input w-full px-3.5 py-2 text-sm font-bold"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-[#1F2937]">
                  Pick Clay Badge Color:
                </span>
                <div className="flex items-center gap-1.5">
                  {CLAY_MEMBER_COLORS.map((c) => (
                    <button
                      key={c.hex}
                      type="button"
                      onClick={() => setNewFriendColor(c.hex)}
                      aria-label={`Select ${c.name}`}
                      className={`w-6 h-6 rounded-full border-2 transition-transform cursor-pointer ${
                        newFriendColor === c.hex
                          ? 'border-[#1F2937] scale-115'
                          : 'border-white'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="tactile-btn w-full py-2.5 text-xs font-extrabold bg-white/90 text-[#1F2937] cursor-pointer"
              >
                + Add Friend to Leaderboard
              </button>
            </div>
          </form>
        </div>

        {/* Shared Contribution History Feed */}
        <div className="lg:col-span-7">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-lg font-extrabold text-[var(--text-primary)]">
                  Shared Contribution History Feed
                </h2>
                <p className="text-xs font-semibold text-[var(--text-secondary)]">
                  Every deposit logged by you and your friends ({activePot.contributions.length} total)
                </p>
              </div>
              <div className="text-xs font-extrabold px-3 py-1 rounded-full clay-surface-sage tabular-nums">
                Pot Total:{' '}
                <Money
                  amount={board.totalSaved}
                  currency={activePot.currency}
                  privacyMask={privacyMask}
                />
              </div>
            </div>

            {activePot.contributions.length === 0 ? (
              <div className="p-8 text-center rounded-2xl tactile-well">
                <p className="text-sm font-extrabold text-[var(--text-primary)]">
                  No deposits in this squad pot yet!
                </p>
                <p className="text-xs text-[var(--text-secondary)] mt-1">
                  Use the green Quick Deposit card to log the first savings contribution.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5 max-h-[540px] overflow-y-auto pr-1">
                {activePot.contributions.map((contrib) => {
                  const member = memberMap.get(contrib.memberId);
                  const memberName = member?.name ?? 'Squad Friend';
                  const initials = member?.avatarInitials ?? 'FR';
                  const clayHex = member?.clayColor ?? '#FDBCB4';
                  const shareImpact =
                    board.totalSaved > 0
                      ? ((contrib.amount / board.totalSaved) * 100).toFixed(1)
                      : '0.0';

                  return (
                    <div
                      key={contrib.id}
                      className="p-3.5 rounded-2xl bg-[var(--bg-subtle)] border-2 border-white/70 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-10 h-10 rounded-2xl border-2 border-white flex items-center justify-center text-xs font-extrabold text-[#1F2937] shrink-0 shadow-xs"
                          style={{ backgroundColor: clayHex }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                              {memberName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-extrabold bg-white/80 text-[#1F2937] tabular-nums">
                              +{shareImpact}% of pot
                            </span>
                            <span className="text-xs font-bold text-[var(--text-muted)]">
                              {formatShortDate(contrib.date)}
                            </span>
                          </div>
                          <p className="text-xs font-semibold text-[var(--text-secondary)] truncate mt-0.5">
                            {contrib.note}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2.5 shrink-0">
                        <div className="text-right">
                          <div className="text-sm sm:text-base font-extrabold text-[var(--accent-positive)] tabular-nums flex items-center gap-0.5">
                            <ArrowUpRight className="w-4 h-4" />
                            <Money
                              amount={contrib.amount}
                              currency={activePot.currency}
                              privacyMask={privacyMask}
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteSquadContribution(activePot.id, contrib.id)}
                          aria-label={`Delete deposit by ${memberName}`}
                          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-white/60 transition-colors cursor-pointer"
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
        </div>
      </div>

      {/* Create New Shared Squad Modal */}
      <Modal
        open={newSquadModalOpen}
        onClose={() => setNewSquadModalOpen(false)}
        title="Create New Friend Savings Squad"
        subtitle="Start a new co-op savings goal pot and compare ownership shares with a friend"
      >
        <form onSubmit={handleCreateNewSquad} className="p-5 space-y-4">
          <div className="grid grid-cols-4 gap-3">
            <div>
              <label className="block text-xs font-extrabold uppercase mb-1">Emoji</label>
              <input
                type="text"
                value={squadEmoji}
                onChange={(e) => setSquadEmoji(e.target.value)}
                className="tactile-input w-full px-3 py-2.5 text-center text-lg"
                maxLength={4}
              />
            </div>
            <div className="col-span-3">
              <label className="block text-xs font-extrabold uppercase mb-1">
                Shared Squad Goal Name
              </label>
              <input
                type="text"
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
                placeholder="e.g. Seoul Concert & Shopping Pot 2027"
                className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold uppercase mb-1">
                Target Pot Amount
              </label>
              <input
                type="number"
                min="100"
                step="1"
                value={squadTarget}
                onChange={(e) => setSquadTarget(e.target.value)}
                className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold tabular-nums"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold uppercase mb-1">
                Pot Currency
              </label>
              <select
                value={squadCurrency}
                onChange={(e) => setSquadCurrency(e.target.value as CurrencyCode)}
                className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
              >
                {SUPPORTED_CURRENCIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-extrabold uppercase mb-1">
                Your Name (Owner)
              </label>
              <input
                type="text"
                value={squadOwnerName}
                onChange={(e) => setSquadOwnerName(e.target.value)}
                className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-extrabold uppercase mb-1">
                Friend&apos;s Name
              </label>
              <input
                type="text"
                value={squadFriendName}
                onChange={(e) => setSquadFriendName(e.target.value)}
                className="tactile-input w-full px-3.5 py-2.5 text-sm font-bold"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2.5 pt-2">
            <button
              type="button"
              onClick={() => setNewSquadModalOpen(false)}
              className="tactile-btn px-4 py-2.5 text-sm cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-5 py-2.5 text-sm cursor-pointer"
            >
              Create Shared Squad
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
