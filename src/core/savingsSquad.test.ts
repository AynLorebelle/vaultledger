import { describe, expect, it } from 'vitest';
import {
  computeSquadLeaderboard,
  encodeSquadSharePayload,
  decodeSquadSharePayload,
  mergeSharedSquadPot,
  createDefaultSavingsSquads,
} from './savingsSquad';
import { normalizeVaultData } from './currency';
import { createSampleVault } from './seedData';
import type { SavingsSquadPot } from '../types/finance';

describe('savingsSquad: Friend Co-Op Savings Share Leaderboard & Sync', () => {
  it('computes each friend total, exact ownership share %, rank, and lead margin', () => {
    const pot: SavingsSquadPot = {
      id: 'squad-tokyo',
      name: 'Tokyo Besties Trip 2027',
      emoji: 'plane',
      targetAmount: 10000,
      currency: 'USD',
      roomCode: 'AYN-777',
      createdAt: '2026-11-01T00:00:00.000Z',
      updatedAt: '2026-11-22T00:00:00.000Z',
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
          name: 'Mia Santos',
          role: 'friend',
          clayColor: '#ADD8E6',
          avatarInitials: 'MS',
        },
      ],
      contributions: [
        {
          id: 'c-1',
          memberId: 'mem-ayn',
          amount: 2400,
          date: '2026-11-05',
          note: 'Freelance design bonus',
          createdAt: '2026-11-05T10:00:00.000Z',
        },
        {
          id: 'c-2',
          memberId: 'mem-mia',
          amount: 1600,
          date: '2026-11-10',
          note: 'November paycheck save',
          createdAt: '2026-11-10T10:00:00.000Z',
        },
        {
          id: 'c-3',
          memberId: 'mem-ayn',
          amount: 1000,
          date: '2026-11-18',
          note: 'No-spend challenge week',
          createdAt: '2026-11-18T10:00:00.000Z',
        },
      ],
    };

    const board = computeSquadLeaderboard(pot);
    expect(board.totalSaved).toBe(5000);
    expect(board.progressPercent).toBe(50);
    expect(board.remainingAmount).toBe(5000);
    expect(board.entries).toHaveLength(2);

    // #1 Top Saver = Ayn ($3,400 = 68% share of the $5,000 pot)
    const leader = board.entries[0];
    expect(leader.member.name).toBe('Ayn Lorebelle');
    expect(leader.rank).toBe(1);
    expect(leader.isTopSaver).toBe(true);
    expect(leader.totalContributed).toBe(3400);
    expect(leader.sharePercent).toBeCloseTo(68, 1);
    expect(leader.leadOverNext).toBe(1800);
    expect(leader.shareGapPercent).toBeCloseTo(36, 1);

    // #2 = Mia ($1,600 = 32% share of the $5,000 pot)
    const runnerUp = board.entries[1];
    expect(runnerUp.member.name).toBe('Mia Santos');
    expect(runnerUp.rank).toBe(2);
    expect(runnerUp.isTopSaver).toBe(false);
    expect(runnerUp.totalContributed).toBe(1600);
    expect(runnerUp.sharePercent).toBeCloseTo(32, 1);
  });

  it('encodes and decodes a shareable friend sync code / URL payload losslessly', () => {
    const squads = createDefaultSavingsSquads('USD');
    const encoded = encodeSquadSharePayload(squads[0]);
    expect(encoded.startsWith('AYNSQ1_')).toBe(true);

    const decoded = decodeSquadSharePayload(encoded);
    expect(decoded).not.toBeNull();
    expect(decoded?.name).toBe(squads[0].name);
    expect(decoded?.members.length).toBeGreaterThanOrEqual(2);
    expect(decoded?.contributions.length).toBe(squads[0].contributions.length);
  });

  it('merges a friend shared pot cleanly without duplicating existing contributions', () => {
    const base = createDefaultSavingsSquads('USD')[0];
    const incoming: SavingsSquadPot = {
      ...base,
      contributions: [
        ...base.contributions,
        {
          id: 'c-friend-new',
          memberId: base.members[1].id,
          amount: 1250,
          date: '2026-11-22',
          note: 'Friend synced new savings!',
          createdAt: '2026-11-22T12:00:00.000Z',
        },
      ],
    };

    const merged = mergeSharedSquadPot([base], incoming);
    expect(merged).toHaveLength(1);
    expect(merged[0].contributions).toHaveLength(base.contributions.length + 1);
  });

  it('backfills default Friend Savings Squads when normalizing legacy demo vaults', () => {
    const legacy = {
      ...createSampleVault(),
      savingsSquads: undefined,
    };

    const migrated = normalizeVaultData(legacy);
    expect(Array.isArray(migrated.savingsSquads)).toBe(true);
    expect((migrated.savingsSquads || []).length).toBeGreaterThanOrEqual(2);
  });
});
