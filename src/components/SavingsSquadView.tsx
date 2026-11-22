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
  Share2,
  Copy,
  Check,
  Plus,
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
import { CategoryIcon, Modal, Money, formatMoney, formatShortDate, todayIso } from './ui';

const SQUAD_ICON_OPTIONS = [
  { id: 'plane', label: 'Travel' },
  { id: 'home', label: 'Home' },
  { id: 'piggy-bank', label: 'Savings' },
  { id: 'target', label: 'Goal' },
  { id: 'gift', label: 'Event' },
  { id: 'heart', label: 'Wellness' },
];

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
  const [squadEmoji, setSquadEmoji] = useState<string>('plane');
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
      'Copied live share link to clipboard',
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
      'Copied offline squad sync code (AYNSQ1_...)',
      'success',
    );
  };

  const handleLogContribution = (e: React.FormEvent) => {
    e.preventDefault();
    if (!activePot) return;
    const amt = Number(depositAmount);
    if (!Number.isFinite(amt) || amt <= 0) {
      showToast('Enter a valid positive deposit amount', 'error');
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
      showToast('Enter your friend’s name first', 'error');
      return;
    }
    addSquadMember(activePot.id, newFriendName.trim(), newFriendColor);
    setNewFriendName('');
  };

  const handleImportCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!syncInputCode.trim()) {
      showToast('Paste a friend’s share link or AYNSQ1_ code first', 'error');
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
      showToast('Enter a squad name and valid target amount', 'error');
      return;
    }
    createSavingsSquad({
      name: squadName.trim(),
      emoji: squadEmoji.trim() || 'piggy-bank',
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
          <h1 className="text-xl sm:text-2xl font-extrabold text-[var(--text-primary)] tracking-tight">
            Friend Savings Squads
          </h1>
          <p className="text-xs sm:text-sm text-[var(--text-secondary)] mt-0.5">
            Save together on shared goals, compare ownership shares, and sync via link or code
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => setInlineSyncOpen((prev) => !prev)}
            className="tactile-btn px-4 py-2 text-xs sm:text-sm font-bold inline-flex items-center gap-2 cursor-pointer"
          >
            <Link2 className="w-4 h-4 text-[var(--accent-primary-text)]" />
            <span>Sync Friend&apos;s Link / Code</span>
          </button>
          <button
            type="button"
            onClick={() => setNewSquadModalOpen(true)}
            className="tactile-btn-primary px-4 py-2 text-xs sm:text-sm font-extrabold inline-flex items-center gap-2 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>New Shared Squad</span>
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
              className={`px-4 py-2 rounded-2xl text-xs sm:text-sm font-extrabold transition-all cursor-pointer inline-flex items-center gap-2 ${
                isSelected
                  ? 'clay-surface-peach'
                  : 'tactile-btn opacity-85 hover:opacity-100'
              }`}
            >
              <CategoryIcon icon={pot.emoji} className="w-4 h-4" />
              <span>{pot.name}</span>
              <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-white/75 text-[#1F2937] tabular-nums">
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
                <h2 className="text-sm font-extrabold text-[#1F2937] flex items-center gap-2">
                  <Share2 className="w-4 h-4" />
                  <span>Sync Friend&apos;s Squad Link or Code</span>
                </h2>
                <p className="text-xs font-medium text-[#1F2937]/80">
                  Paste the share URL or <code className="font-mono font-bold">AYNSQ1_...</code> code your friend sent you to merge their latest deposits.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInlineSyncOpen(false)}
                className="text-xs font-bold underline text-[#1F2937] self-start sm:self-center cursor-pointer"
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
                className="tactile-input flex-1 px-3.5 py-2 text-xs sm:text-sm font-semibold"
              />
              <button
                type="submit"
                className="tactile-btn-primary px-5 py-2 text-xs sm:text-sm font-extrabold cursor-pointer shrink-0"
              >
                Merge Savings Pot
              </button>
            </div>
          </motion.form>
        )}
      </AnimatePresence>

      {/* 2. Hero Co-Op Savings Pot Card */}
      <div className="card clay-surface-lavender space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex flex-wrap items-center gap-2.5">
              <span className="w-9 h-9 rounded-2xl bg-white/85 flex items-center justify-center text-[#1F2937] shadow-xs">
                <CategoryIcon icon={activePot.emoji} className="w-5 h-5" />
              </span>
              <h2 className="text-xl sm:text-2xl font-extrabold text-[#1F2937] tracking-tight">
                {activePot.name}
              </h2>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/80 text-[#1F2937] font-mono">
                Room {activePot.roomCode}
              </span>
              <span className="px-2.5 py-1 rounded-full text-xs font-bold bg-white/75 text-[#1F2937]">
                {activePot.members.length} savers
              </span>
            </div>
            <p className="text-xs sm:text-sm font-medium text-[#1F2937]/80">
              {board.headline}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => void handleCopyShareLink()}
              className="tactile-btn-primary px-3.5 py-2 text-xs font-extrabold inline-flex items-center gap-1.5 cursor-pointer"
            >
              {copiedMode === 'link' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Share2 className="w-4 h-4" />
              )}
              <span>Share Live Link</span>
            </button>
            <button
              type="button"
              onClick={() => void handleCopyOfflineCode()}
              className="tactile-btn px-3.5 py-2 text-xs font-bold inline-flex items-center gap-1.5 cursor-pointer bg-white/90 text-[#1F2937]"
            >
              {copiedMode === 'code' ? (
                <Check className="w-4 h-4" />
              ) : (
                <Copy className="w-4 h-4" />
              )}
              <span>Copy Sync Code</span>
            </button>
            {squads.length > 1 && (
              <button
                type="button"
                onClick={() => deleteSavingsSquad(activePot.id)}
                className="p-2 rounded-xl bg-white/70 hover:bg-white text-[#9F1239] transition-colors cursor-pointer"
                aria-label={`Delete ${activePot.name}`}
                title="Delete shared squad"
              >
                <Trash2 className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Pot KPIs */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="p-4 rounded-2xl bg-white/80 border border-white">
            <div className="text-xs font-bold text-[#374151]">
              Total saved
            </div>
            <div className="text-2xl font-extrabold text-[#1F2937] mt-1 tabular-nums">
              <Money
                amount={board.totalSaved}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-medium text-[#374151] mt-0.5">
              {activePot.contributions.length} deposits logged
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/80 border border-white">
            <div className="text-xs font-bold text-[#374151]">
              Target goal
            </div>
            <div className="text-2xl font-extrabold text-[#1F2937] mt-1 tabular-nums">
              <Money
                amount={board.targetAmount}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-medium text-[#374151] mt-0.5 tabular-nums">
              {board.progressPercent.toFixed(1)}% funded
            </div>
          </div>

          <div className="p-4 rounded-2xl bg-white/80 border border-white">
            <div className="text-xs font-bold text-[#374151]">
              Remaining
            </div>
            <div className="text-2xl font-extrabold text-[#1F2937] mt-1 tabular-nums">
              <Money
                amount={board.remainingAmount}
                currency={activePot.currency}
                privacyMask={privacyMask}
              />
            </div>
            <div className="text-xs font-medium text-[#374151] mt-0.5">
              {board.remainingAmount <= 0
                ? 'Target reached'
                : 'Left to reach target'}
            </div>
          </div>
        </div>

        {/* Claymorphism Progress Bar */}
        <div className="space-y-1.5">
          <div className="flex items-center justify-between text-xs font-bold text-[#1F2937]">
            <span>Goal progress</span>
            <span className="tabular-nums">{board.progressPercent.toFixed(1)}%</span>
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
      </div>

      {/* 3. Ownership Share Leaderboard & Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Ranked Friend Cards */}
        <div className="lg:col-span-7 space-y-4">
          <div>
            <h2 className="text-base sm:text-lg font-extrabold text-[var(--text-primary)] flex items-center gap-2">
              <Trophy className="w-4 h-4 text-[#D97706]" />
              <span>Ownership Share Leaderboard</span>
            </h2>
            <p className="text-xs text-[var(--text-secondary)]">
              Ranked by total savings contributed and share percentage of the pot
            </p>
          </div>

          <div className="space-y-3.5">
            {board.entries.map((entry) => {
              const clayClass = getClaySurfaceClass(entry.member.clayColor);
              const deficitToLeader = Math.max(0, leaderTotal - entry.totalContributed);

              return (
                <div
                  key={entry.member.id}
                  className={`card ${clayClass} space-y-3`}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-white/90 border-2 border-white flex items-center justify-center text-sm font-extrabold text-[#1F2937] shadow-xs shrink-0">
                        {entry.member.avatarInitials}
                      </div>
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="px-2 py-0.5 rounded-full text-xs font-extrabold bg-white/85 text-[#1F2937] tabular-nums">
                            #{entry.rank}
                          </span>
                          <h3 className="text-base font-extrabold text-[#1F2937]">
                            {entry.member.name}
                          </h3>
                          {entry.isTopSaver && (
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full bg-white text-[#1F2937] text-xs font-extrabold">
                              <Crown className="w-3.5 h-3.5 text-[#D97706]" />
                              <span>Top Saver</span>
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-medium text-[#1F2937]/80 mt-0.5 tabular-nums">
                          {entry.contributionCount} deposits | Largest:{' '}
                          <Money
                            amount={entry.largestSingleDeposit}
                            currency={activePot.currency}
                            privacyMask={privacyMask}
                          />
                        </div>
                      </div>
                    </div>

                    <div className="sm:text-right bg-white/80 px-3.5 py-2 rounded-2xl border border-white">
                      <div className="text-xl font-extrabold text-[#1F2937] tabular-nums">
                        {entry.sharePercent.toFixed(1)}%{' '}
                        <span className="text-xs font-bold">share</span>
                      </div>
                      <div className="text-xs font-bold text-[#374151] tabular-nums">
                        <Money
                          amount={entry.totalContributed}
                          currency={activePot.currency}
                          privacyMask={privacyMask}
                        />
                      </div>
                    </div>
                  </div>

                  <div className="progress h-3.5">
                    <span
                      style={{
                        width: `${Math.max(3, Math.min(100, entry.sharePercent))}%`,
                        transition: 'width 420ms cubic-bezier(0.22, 1, 0.36, 1)',
                      }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-xs font-bold text-[#1F2937]/85 tabular-nums">
                    <span>
                      {entry.isTopSaver && board.entries.length >= 2
                        ? entry.leadOverNext > 0
                          ? `Ahead by ${formatMoney(entry.leadOverNext, activePot.currency)} (+${entry.shareGapPercent.toFixed(1)}% share)`
                          : 'Tied for #1'
                        : deficitToLeader > 0
                        ? `${formatMoney(deficitToLeader, activePot.currency)} behind #1`
                        : 'Ready for first deposit'}
                    </span>
                    <span>{entry.targetSharePercent.toFixed(1)}% of total goal</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Right Column: Ownership Share Split Chart */}
        <div className="lg:col-span-5 space-y-6 min-w-0">
          <div className="card space-y-4 min-w-0">
            <div>
              <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                Pot Ownership Split
              </h2>
              <p className="text-xs text-[var(--text-secondary)]">
                Share breakdown across {activePot.name}
              </p>
            </div>

            <div className="h-52 w-full min-w-0">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={80}
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

            <div className="h-36 w-full min-w-0">
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
                    tick={{ fontSize: 12, fontWeight: 700, fill: 'var(--text-primary)' }}
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
          </div>
        </div>
      </div>

      {/* 4. Log Deposit + Add Friend + Contribution Feed */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 space-y-5">
          <form onSubmit={handleLogContribution} className="card clay-surface-mint space-y-4">
            <div className="flex items-center gap-2.5">
              <div className="w-9 h-9 rounded-2xl bg-white/85 flex items-center justify-center text-[#1F2937]">
                <PiggyBank className="w-4 h-4" />
              </div>
              <div>
                <h2 className="text-base font-extrabold text-[#1F2937]">
                  Log Savings Deposit
                </h2>
                <p className="text-xs font-medium text-[#1F2937]/80">
                  Add a deposit for yourself or a friend
                </p>
              </div>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-[#1F2937] mb-1">
                  Member
                </label>
                <select
                  value={selectedMemberId}
                  onChange={(e) => setSelectedMemberId(e.target.value)}
                  aria-label="Who is saving"
                  className="tactile-input w-full px-3.5 py-2 text-sm font-bold"
                >
                  {activePot.members.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.role === 'owner' ? 'Owner' : 'Friend'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-[#1F2937] mb-1">
                    Amount ({activePot.currency})
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    min="1"
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    aria-label="Deposit Amount"
                    className="tactile-input w-full px-3.5 py-2 text-sm font-bold tabular-nums"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-[#1F2937] mb-1">
                    Date
                  </label>
                  <input
                    type="date"
                    value={depositDate}
                    onChange={(e) => setDepositDate(e.target.value)}
                    aria-label="Deposit Date"
                    className="tactile-input w-full px-3.5 py-2 text-sm font-bold"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-[#1F2937] mb-1">
                  Note
                </label>
                <input
                  type="text"
                  value={depositNote}
                  onChange={(e) => setDepositNote(e.target.value)}
                  placeholder="e.g. Monthly savings deposit"
                  aria-label="Win or savings note"
                  className="tactile-input w-full px-3.5 py-2 text-sm font-medium"
                />
              </div>
            </div>

            <button
              type="submit"
              className="button w-full py-3 text-sm font-extrabold inline-flex items-center justify-center gap-2 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Add Savings to Pot</span>
            </button>
          </form>

          {/* Add Another Friend */}
          <form onSubmit={handleAddFriend} className="card clay-surface-peach space-y-3">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-[#1F2937]" />
              <h3 className="text-sm font-extrabold text-[#1F2937]">
                Add Friend to Squad
              </h3>
            </div>
            <div className="space-y-2.5">
              <input
                type="text"
                value={newFriendName}
                onChange={(e) => setNewFriendName(e.target.value)}
                placeholder="Friend's Name (e.g. Sofia Cruz)"
                aria-label="Friend's Name"
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
              />
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-bold text-[#1F2937]">
                  Badge Color:
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
                          ? 'border-[#1F2937] scale-110'
                          : 'border-white'
                      }`}
                      style={{ backgroundColor: c.hex }}
                    />
                  ))}
                </div>
              </div>
              <button
                type="submit"
                className="tactile-btn w-full py-2 text-xs font-extrabold bg-white/90 text-[#1F2937] cursor-pointer"
              >
                Add Friend
              </button>
            </div>
          </form>
        </div>

        {/* Contribution History Feed */}
        <div className="lg:col-span-7">
          <div className="card space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-extrabold text-[var(--text-primary)]">
                  Contribution History
                </h2>
                <p className="text-xs text-[var(--text-secondary)]">
                  {activePot.contributions.length} deposits recorded
                </p>
              </div>
              <div className="text-xs font-extrabold px-3 py-1 rounded-full clay-surface-sage tabular-nums">
                Total:{' '}
                <Money
                  amount={board.totalSaved}
                  currency={activePot.currency}
                  privacyMask={privacyMask}
                />
              </div>
            </div>

            {activePot.contributions.length === 0 ? (
              <div className="p-8 text-center rounded-2xl tactile-well">
                <p className="text-sm font-bold text-[var(--text-primary)]">
                  No deposits in this squad pot yet
                </p>
              </div>
            ) : (
              <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
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
                      className="p-3 rounded-2xl bg-[var(--bg-subtle)] border border-white/70 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div
                          className="w-9 h-9 rounded-2xl border border-white flex items-center justify-center text-xs font-extrabold text-[#1F2937] shrink-0"
                          style={{ backgroundColor: clayHex }}
                        >
                          {initials}
                        </div>
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-sm font-extrabold text-[var(--text-primary)] truncate">
                              {memberName}
                            </span>
                            <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-white/80 text-[#1F2937] tabular-nums">
                              {shareImpact}% of pot
                            </span>
                            <span className="text-xs text-[var(--text-muted)]">
                              {formatShortDate(contrib.date)}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--text-secondary)] truncate mt-0.5">
                            {contrib.note}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <div className="text-sm font-extrabold text-[var(--accent-positive)] tabular-nums flex items-center gap-0.5">
                          <ArrowUpRight className="w-3.5 h-3.5" />
                          <Money
                            amount={contrib.amount}
                            currency={activePot.currency}
                            privacyMask={privacyMask}
                          />
                        </div>
                        <button
                          type="button"
                          onClick={() => deleteSquadContribution(activePot.id, contrib.id)}
                          aria-label={`Delete deposit by ${memberName}`}
                          className="p-1.5 rounded-xl text-[var(--text-muted)] hover:text-[var(--accent-danger)] hover:bg-white/60 transition-colors cursor-pointer"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
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
        title="Create Friend Savings Squad"
        subtitle="Start a new shared savings pot and compare ownership shares"
      >
        <form onSubmit={handleCreateNewSquad} className="p-5 space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">Icon</label>
              <select
                value={squadEmoji}
                onChange={(e) => setSquadEmoji(e.target.value)}
                className="tactile-input w-full px-3 py-2 text-sm font-bold"
              >
                {SQUAD_ICON_OPTIONS.map((opt) => (
                  <option key={opt.id} value={opt.id}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold mb-1">
                Squad Goal Name
              </label>
              <input
                type="text"
                value={squadName}
                onChange={(e) => setSquadName(e.target.value)}
                placeholder="e.g. Seoul Trip 2027"
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold mb-1">
                Target Amount
              </label>
              <input
                type="number"
                min="100"
                step="1"
                value={squadTarget}
                onChange={(e) => setSquadTarget(e.target.value)}
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold tabular-nums"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                Currency
              </label>
              <select
                value={squadCurrency}
                onChange={(e) => setSquadCurrency(e.target.value as CurrencyCode)}
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
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
              <label className="block text-xs font-bold mb-1">
                Your Name (Owner)
              </label>
              <input
                type="text"
                value={squadOwnerName}
                onChange={(e) => setSquadOwnerName(e.target.value)}
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
                required
              />
            </div>
            <div>
              <label className="block text-xs font-bold mb-1">
                Friend&apos;s Name
              </label>
              <input
                type="text"
                value={squadFriendName}
                onChange={(e) => setSquadFriendName(e.target.value)}
                className="tactile-input w-full px-3.5 py-2 text-sm font-semibold"
                required
              />
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={() => setNewSquadModalOpen(false)}
              className="tactile-btn px-4 py-2 text-xs font-bold cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="tactile-btn-primary px-5 py-2 text-xs font-extrabold cursor-pointer"
            >
              Create Shared Squad
            </button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
