import type {
  CurrencyCode,
  SavingsSquadPot,
  SquadContribution,
  SquadLeaderboardEntry,
  SquadLeaderboardResult,
  SquadMember,
} from '../types/finance';

export const CLAY_MEMBER_COLORS = [
  { name: 'Clay Peach', hex: '#FDBCB4' },
  { name: 'Clay Sky Blue', hex: '#ADD8E6' },
  { name: 'Clay Mint', hex: '#98FF98' },
  { name: 'Clay Blossom Pink', hex: '#FFD1DC' },
  { name: 'Clay Sage', hex: '#B5EAD7' },
  { name: 'Clay Lavender', hex: '#E6E6FA' },
] as const;

function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

export function getInitials(name: string): string {
  const parts = name
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'FR';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
}

export function createDefaultSavingsSquads(
  baseCurrency: CurrencyCode = 'USD'
): SavingsSquadPot[] {
  const mult = baseCurrency === 'PHP' ? 50 : 1;
  return [
    {
      id: 'squad-tokyo-2027',
      name: 'Tokyo Besties Trip 2027',
      emoji: 'plane',
      targetAmount: 6000 * mult,
      currency: baseCurrency,
      roomCode: 'AYN-777',
      createdAt: '2026-10-01T08:00:00.000Z',
      updatedAt: '2026-11-22T09:00:00.000Z',
      members: [
        {
          id: 'mem-ayn',
          name: 'Ayn Lorebelle',
          role: 'owner',
          clayColor: '#FDBCB4',
          avatarInitials: 'AL',
        },
        {
          id: 'mem-mia',
          name: 'Mia Santos (Bestie)',
          role: 'friend',
          clayColor: '#ADD8E6',
          avatarInitials: 'MS',
        },
        {
          id: 'mem-chloe',
          name: 'Chloe Tan',
          role: 'friend',
          clayColor: '#98FF98',
          avatarInitials: 'CT',
        },
      ],
      contributions: [
        {
          id: 'sc-1',
          memberId: 'mem-ayn',
          amount: 1450 * mult,
          date: '2026-11-02',
          note: 'Freelance UI project bonus',
          createdAt: '2026-11-02T10:00:00.000Z',
        },
        {
          id: 'sc-2',
          memberId: 'mem-mia',
          amount: 950 * mult,
          date: '2026-11-05',
          note: 'November flight fund deposit',
          createdAt: '2026-11-05T14:20:00.000Z',
        },
        {
          id: 'sc-3',
          memberId: 'mem-chloe',
          amount: 750 * mult,
          date: '2026-11-11',
          note: 'Hotel + DisneySea share',
          createdAt: '2026-11-11T16:15:00.000Z',
        },
        {
          id: 'sc-4',
          memberId: 'mem-ayn',
          amount: 1000 * mult,
          date: '2026-11-18',
          note: 'No-spend week challenge win',
          createdAt: '2026-11-18T19:00:00.000Z',
        },
        {
          id: 'sc-5',
          memberId: 'mem-mia',
          amount: 550 * mult,
          date: '2026-11-20',
          note: 'Extra side-hustle savings',
          createdAt: '2026-11-20T11:30:00.000Z',
        },
      ],
    },
    {
      id: 'squad-condo-duo',
      name: 'Co-Op Dream Studio & Emergency Pot',
      emoji: 'home',
      targetAmount: 12000 * mult,
      currency: baseCurrency,
      roomCode: 'AYN-204',
      createdAt: '2026-09-15T08:00:00.000Z',
      updatedAt: '2026-11-21T09:00:00.000Z',
      members: [
        {
          id: 'mem-ayn-2',
          name: 'Ayn Lorebelle',
          role: 'owner',
          clayColor: '#FFD1DC',
          avatarInitials: 'AL',
        },
        {
          id: 'mem-liam',
          name: 'Liam Rivera',
          role: 'friend',
          clayColor: '#B5EAD7',
          avatarInitials: 'LR',
        },
      ],
      contributions: [
        {
          id: 'sc-201',
          memberId: 'mem-ayn-2',
          amount: 2800 * mult,
          date: '2026-10-25',
          note: 'Initial studio seed deposit',
          createdAt: '2026-10-25T10:00:00.000Z',
        },
        {
          id: 'sc-202',
          memberId: 'mem-liam',
          amount: 2500 * mult,
          date: '2026-10-28',
          note: 'Matching October contribution',
          createdAt: '2026-10-28T15:00:00.000Z',
        },
        {
          id: 'sc-203',
          memberId: 'mem-ayn-2',
          amount: 2000 * mult,
          date: '2026-11-15',
          note: 'Mid-month paycheck transfer',
          createdAt: '2026-11-15T09:30:00.000Z',
        },
        {
          id: 'sc-204',
          memberId: 'mem-liam',
          amount: 1500 * mult,
          date: '2026-11-19',
          note: 'November deposit',
          createdAt: '2026-11-19T18:00:00.000Z',
        },
      ],
    },
  ];
}

export function computeSquadLeaderboard(pot: SavingsSquadPot): SquadLeaderboardResult {
  const targetAmount = Math.max(0, Number(pot.targetAmount) || 0);
  const byMember = new Map<
    string,
    {
      total: number;
      count: number;
      largest: number;
      lastDate: string | null;
    }
  >();

  for (const m of pot.members) {
    byMember.set(m.id, { total: 0, count: 0, largest: 0, lastDate: null });
  }

  let totalSaved = 0;
  for (const c of pot.contributions) {
    const amt = Number(c.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    totalSaved += amt;
    const prev = byMember.get(c.memberId) ?? {
      total: 0,
      count: 0,
      largest: 0,
      lastDate: null,
    };
    prev.total = round2(prev.total + amt);
    prev.count += 1;
    if (amt > prev.largest) prev.largest = amt;
    if (!prev.lastDate || c.date > prev.lastDate) prev.lastDate = c.date;
    byMember.set(c.memberId, prev);
  }

  totalSaved = round2(totalSaved);
  const progressPercent =
    targetAmount > 0 ? round2(Math.min(100, (totalSaved / targetAmount) * 100)) : 0;
  const remainingAmount = round2(Math.max(0, targetAmount - totalSaved));

  const sortedMembers = [...pot.members].sort((a, b) => {
    const totA = byMember.get(a.id)?.total ?? 0;
    const totB = byMember.get(b.id)?.total ?? 0;
    if (totB !== totA) return totB - totA;
    return a.name.localeCompare(b.name);
  });

  const entries: SquadLeaderboardEntry[] = sortedMembers.map((member, idx) => {
    const stats = byMember.get(member.id) ?? {
      total: 0,
      count: 0,
      largest: 0,
      lastDate: null,
    };
    const nextMember = sortedMembers[idx + 1];
    const nextTotal = nextMember ? byMember.get(nextMember.id)?.total ?? 0 : 0;
    const sharePercent = totalSaved > 0 ? round2((stats.total / totalSaved) * 100) : 0;
    const nextSharePercent =
      nextMember && totalSaved > 0 ? round2((nextTotal / totalSaved) * 100) : 0;
    const targetSharePercent =
      targetAmount > 0 ? round2((stats.total / targetAmount) * 100) : 0;

    return {
      rank: idx + 1,
      member,
      totalContributed: stats.total,
      sharePercent,
      targetSharePercent,
      contributionCount: stats.count,
      largestSingleDeposit: stats.largest,
      lastContributionDate: stats.lastDate,
      leadOverNext: round2(Math.max(0, stats.total - nextTotal)),
      shareGapPercent: round2(Math.max(0, sharePercent - nextSharePercent)),
      isTopSaver: idx === 0 && stats.total > 0,
    };
  });

  const topSaver = entries[0] && entries[0].totalContributed > 0 ? entries[0] : null;
  let headline = 'No contributions logged yet — add the first deposit to start the race!';
  if (topSaver) {
    if (entries.length >= 2 && entries[0].totalContributed === entries[1].totalContributed) {
      headline = `${entries[0].member.name} and ${entries[1].member.name} are tied at ${entries[0].sharePercent.toFixed(1)}% share each!`;
    } else if (entries.length >= 2) {
      headline = `${topSaver.member.name} holds the #1 Top Saver spot with ${topSaver.sharePercent.toFixed(1)}% of the pot (+${topSaver.shareGapPercent.toFixed(1)}% share ahead of ${entries[1].member.name})!`;
    } else {
      headline = `${topSaver.member.name} has contributed 100% of the pot so far.`;
    }
  }

  return {
    totalSaved,
    targetAmount,
    progressPercent,
    remainingAmount,
    entries,
    topSaver,
    headline,
  };
}

function toBase64Url(utf8Str: string): string {
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(utf8Str, 'utf8')
      .toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/g, '');
  }
  const bytes = new TextEncoder().encode(utf8Str);
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function fromBase64Url(b64url: string): string {
  const padded = b64url.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  const full = padded + '='.repeat(padLen);
  if (typeof Buffer !== 'undefined') {
    return Buffer.from(full, 'base64').toString('utf8');
  }
  const binary = atob(full);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return new TextDecoder().decode(bytes);
}

const SHARE_PREFIX = 'AYNSQ1_';

export function encodeSquadSharePayload(pot: SavingsSquadPot): string {
  const payload = JSON.stringify(pot);
  return `${SHARE_PREFIX}${toBase64Url(payload)}`;
}

export function decodeSquadSharePayload(rawInput: string): SavingsSquadPot | null {
  if (!rawInput || typeof rawInput !== 'string') return null;
  let token = rawInput.trim();

  // Extract from full URL if user pasted a link
  const match = token.match(/AYNSQ1_[A-Za-z0-9_-]+/);
  if (match) {
    token = match[0];
  }

  if (!token.startsWith(SHARE_PREFIX)) return null;
  try {
    const jsonStr = fromBase64Url(token.slice(SHARE_PREFIX.length));
    const parsed = JSON.parse(jsonStr) as SavingsSquadPot;
    if (
      !parsed ||
      typeof parsed.id !== 'string' ||
      typeof parsed.name !== 'string' ||
      !Array.isArray(parsed.members) ||
      !Array.isArray(parsed.contributions)
    ) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export function buildSquadShareUrl(pot: SavingsSquadPot, origin?: string): string {
  const token = encodeSquadSharePayload(pot);
  const baseOrigin =
    origin ??
    (typeof window !== 'undefined' && window.location?.origin && window.location.origin !== 'null'
      ? `${window.location.origin}${window.location.pathname}`
      : 'https://vaultledger-zeta.vercel.app/');
  const cleanBase = baseOrigin.replace(/\?.*$/, '').replace(/#.*$/, '');
  return `${cleanBase}?squad=${token}`;
}

export function mergeSharedSquadPot(
  existingPots: SavingsSquadPot[],
  incoming: SavingsSquadPot
): SavingsSquadPot[] {
  const idx = existingPots.findIndex(
    (p) => p.id === incoming.id || p.roomCode.toUpperCase() === incoming.roomCode.toUpperCase()
  );

  if (idx === -1) {
    return [incoming, ...existingPots];
  }

  const current = existingPots[idx];
  const memberMap = new Map<string, SquadMember>();
  for (const m of current.members) memberMap.set(m.id, m);
  for (const m of incoming.members) {
    if (!memberMap.has(m.id)) {
      memberMap.set(m.id, m);
    } else {
      memberMap.set(m.id, { ...memberMap.get(m.id)!, ...m });
    }
  }

  const contribMap = new Map<string, SquadContribution>();
  for (const c of current.contributions) contribMap.set(c.id, c);
  for (const c of incoming.contributions) contribMap.set(c.id, c);

  const mergedContributions = Array.from(contribMap.values()).sort((a, b) =>
    b.date.localeCompare(a.date)
  );

  const mergedPot: SavingsSquadPot = {
    ...current,
    name: incoming.name || current.name,
    emoji: incoming.emoji || current.emoji,
    targetAmount: incoming.targetAmount || current.targetAmount,
    members: Array.from(memberMap.values()),
    contributions: mergedContributions,
    updatedAt: new Date().toISOString(),
  };

  const next = [...existingPots];
  next[idx] = mergedPot;
  return next;
}
