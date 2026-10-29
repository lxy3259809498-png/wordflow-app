import { describe, expect, it } from 'vitest';
import {
  buildTrend,
  computeDailyStats,
  computeStreak,
  emptyDailyStats,
  levelFor,
  summarise,
  xpForLog,
} from '@/lib/stats';
import { toDateKey } from '@/lib/time';
import type { DailyStats, ReviewLog, StudySession } from '@/lib/types';

const T0 = new Date(2026, 4, 10, 10, 0, 0).getTime(); // local 2026-05-10
const DAY = 86_400_000;

function log(partial: Partial<ReviewLog> & { id: string }): ReviewLog {
  const { id, ...rest } = partial;
  return {
    id,
    eventId: `evt-${id}`,
    wordId: `w-${id}`,
    sessionId: 's1',
    rating: 'known',
    reviewMode: 'en-zh',
    reviewedAt: T0,
    dateKey: toDateKey(T0),
    elapsedMs: 3000,
    scheduledDaysBefore: 0,
    scheduledDaysAfter: 1,
    stateBefore: 'new',
    stateAfter: 'review',
    wasCorrect: true,
    algorithmVersion: 'wf-fsrs-4.5-lite',
    ...rest,
  };
}

function stats(dateKey: string, overrides: Partial<DailyStats> = {}): DailyStats {
  return { ...emptyDailyStats(dateKey, T0), ...overrides };
}

describe('daily stats aggregation', () => {
  it('deduplicates words but counts every review event', () => {
    const logs = [
      log({ id: '1', wordId: 'w1' }),
      log({ id: '2', wordId: 'w1', reviewedAt: T0 + 1000 }),
      log({ id: '3', wordId: 'w2', reviewedAt: T0 + 2000 }),
    ];
    const result = sum(logs, []);
    expect(result.studiedCount).toBe(2);
    expect(result.correctCount).toBe(3);
  });

  it('counts reviewed separately from first-time new words', () => {
    const logs = [
      log({ id: '1', wordId: 'w1', stateBefore: 'new' }),
      log({ id: '2', wordId: 'w1', stateBefore: 'review' }),
      log({ id: '3', wordId: 'w2', stateBefore: 'new' }),
    ];
    const result = sum(logs, []);
    expect(result.newCount).toBe(2);
    expect(result.reviewedCount).toBe(1);
    expect(result.studiedCount).toBe(2);
  });

  it('sums session duration only for sessions started that day', () => {
    const sessions: StudySession[] = [
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { startedAt: T0, durationSeconds: 120 } as any,
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      { startedAt: T0 - DAY, durationSeconds: 500 } as any,
    ];
    const result = sum([log({ id: '1' })], sessions);
    expect(result.durationSeconds).toBe(120);
  });

  it('awards XP per rating and an extra bonus for new words', () => {
    expect(xpForLog(log({ id: '1', rating: 'known', stateBefore: 'review' }))).toBe(4);
    expect(xpForLog(log({ id: '2', rating: 'known', stateBefore: 'new' }))).toBe(7);
    expect(xpForLog(log({ id: '3', rating: 'fuzzy', stateBefore: 'review' }))).toBe(2);
    expect(xpForLog(log({ id: '4', rating: 'forgot', stateBefore: 'review' }))).toBe(1);
    expect(xpForLog(log({ id: '5', rating: 'fuzzy', stateBefore: 'new' }))).toBe(5);
  });
});

function sum(logs: ReviewLog[], sessions: StudySession[]): DailyStats {
  return computeDailyStats(toDateKey(T0), logs, sessions, false, T0);
}

describe('streak calculation', () => {
  it('counts consecutive days ending today', () => {
    const keys = ['2026-05-10', '2026-05-09', '2026-05-08'].map((k) => k);
    expect(computeStreak(keys, T0)).toBe(3);
  });

  it('still counts yesterday when today has no activity yet', () => {
    expect(computeStreak(['2026-05-09', '2026-05-08'], T0)).toBe(2);
  });

  it('resets when a day is missing', () => {
    expect(computeStreak(['2026-05-10', '2026-05-08'], T0)).toBe(1);
  });

  it('returns 0 when there is no history', () => {
    expect(computeStreak([], T0)).toBe(0);
  });

  it('does not double count duplicate date keys', () => {
    expect(computeStreak(['2026-05-10', '2026-05-10', '2026-05-09'], T0)).toBe(2);
  });

  it('ignores a lone old day', () => {
    expect(computeStreak(['2026-04-01'], T0)).toBe(0);
  });
});

describe('level progression', () => {
  it('starts at level 1', () => {
    const info = levelFor(0);
    expect(info.level).toBe(1);
    expect(info.progress).toBe(0);
  });

  it('levels up after enough XP and never loses remainder', () => {
    const first = levelFor(120);
    expect(first.level).toBe(2);
    const big = levelFor(10_000);
    expect(big.level).toBeGreaterThan(2);
    expect(big.totalXp).toBe(10_000);
  });
});

describe('summary derivation', () => {
  it('derives today, totals and goal completion from raw rows', () => {
    const todayKey = toDateKey(T0);
    const rows = [
      stats(todayKey, { studiedCount: 25, newCount: 10, reviewedCount: 15, correctCount: 20, forgotCount: 3, xpEarned: 120 }),
      stats('2026-05-09', { studiedCount: 30, xpEarned: 90 }),
    ];
    const logs = [
      log({ id: '1', wordId: 'w1' }),
      log({ id: '2', wordId: 'w2', rating: 'forgot' }),
    ];
    const summary = summarise(rows, logs, T0, 20);
    expect(summary.todayStudied).toBe(25);
    expect(summary.totalStudied).toBe(55);
    expect(summary.correctRecallRate).toBe(50);
    expect(summary.streak).toBe(2);
    expect(summary.xp).toBe(210);
    expect(summary.goalCompletionRate).toBe(100);
  });

  it('reports zeroes for a brand-new profile without dividing by zero', () => {
    const summary = summarise([], [], T0, 20);
    expect(summary.correctRecallRate).toBe(0);
    expect(summary.goalCompletionRate).toBe(0);
    expect(summary.streak).toBe(0);
    expect(summary.todayStudied).toBe(0);
  });
});

describe('trend window', () => {
  it('produces exactly N ordered points ending today', () => {
    const byKey = {
      '2026-05-10': stats('2026-05-10', { studiedCount: 5, correctCount: 4 }),
      '2026-05-08': stats('2026-05-08', { studiedCount: 2, correctCount: 1 }),
    };
    const points = buildTrend(byKey, 7, T0);
    expect(points).toHaveLength(7);
    expect(points[6].dateKey).toBe('2026-05-10');
    expect(points[6].studied).toBe(5);
    expect(points.find((p) => p.dateKey === '2026-05-08')?.studied).toBe(2);
    expect(points[0].studied).toBe(0);
  });

  it('handles a 30 day window across a month boundary', () => {
    const points = buildTrend({}, 30, T0);
    expect(points).toHaveLength(30);
    expect(points[points.length - 1].dateKey).toBe('2026-05-10');
  });
});
