import type { DailyStats, ReviewLog, StudySession } from '@/lib/types';
import { addDaysToKey, toDateKey } from '@/lib/time';

/**
 * All statistics are derived from raw `ReviewLog` rows (plus session durations).
 * This keeps the numbers verifiable and makes duplicate submissions harmless.
 */

export const XP_TABLE = {
  known: 4,
  fuzzy: 2,
  forgot: 1,
  newWordBonus: 3,
} as const;

export function xpForLog(log: ReviewLog): number {
  const base = XP_TABLE[log.rating];
  return base + (log.stateBefore === 'new' ? XP_TABLE.newWordBonus : 0);
}

export function computeDailyStats(
  dateKey: string,
  logs: ReviewLog[],
  sessions: StudySession[],
  goalCompleted: boolean,
  now: number,
): DailyStats {
  const dayLogs = logs.filter((l) => l.dateKey === dateKey);
  const daySeconds = sessions
    .filter((s) => toDateKey(s.startedAt) === dateKey)
    .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);

  const uniqueWords = new Set(dayLogs.map((l) => l.wordId));
  const reviewedWords = new Set(
    dayLogs.filter((l) => l.stateBefore !== 'new').map((l) => l.wordId),
  );

  return {
    dateKey,
    studiedCount: uniqueWords.size,
    reviewedCount: reviewedWords.size,
    newCount: new Set(dayLogs.filter((l) => l.stateBefore === 'new').map((l) => l.wordId)).size,
    correctCount: dayLogs.filter((l) => l.rating === 'known').length,
    fuzzyCount: dayLogs.filter((l) => l.rating === 'fuzzy').length,
    forgotCount: dayLogs.filter((l) => l.rating === 'forgot').length,
    durationSeconds: Math.round(daySeconds),
    goalCompleted,
    xpEarned: dayLogs.reduce((sum, l) => sum + xpForLog(l), 0),
    updatedAt: now,
  };
}

export function emptyDailyStats(dateKey: string, now = Date.now()): DailyStats {
  return {
    dateKey,
    studiedCount: 0,
    reviewedCount: 0,
    newCount: 0,
    correctCount: 0,
    fuzzyCount: 0,
    forgotCount: 0,
    durationSeconds: 0,
    goalCompleted: false,
    xpEarned: 0,
    updatedAt: now,
  };
}

/** Stored rows may be stale after an import/restore — fall back to empty stats. */
export function ensureStats(dateKey: string, row: DailyStats | undefined): DailyStats {
  return row ?? emptyDailyStats(dateKey);
}

export function totalXp(stats: DailyStats[]): number {
  return stats.reduce((sum, s) => sum + s.xpEarned, 0);
}

export interface LevelInfo {
  level: number;
  xpIntoLevel: number;
  xpForLevel: number;
  progress: number;
  totalXp: number;
}

const XP_PER_LEVEL_BASE = 120;

export function levelFor(totalXpValue: number): LevelInfo {
  let level = 1;
  let remaining = totalXpValue;
  let needed = XP_PER_LEVEL_BASE;
  while (remaining >= needed && level < 999) {
    remaining -= needed;
    level += 1;
    needed = XP_PER_LEVEL_BASE + (level - 1) * 60;
  }
  return {
    level,
    xpIntoLevel: remaining,
    xpForLevel: needed,
    progress: Math.min(100, Math.round((remaining / needed) * 100)),
    totalXp: totalXpValue,
  };
}

/** Consecutive days ending today (or yesterday, so a missed morning never resets). */
export function computeStreak(dateKeys: string[], now: number): number {
  const set = new Set(dateKeys);
  const today = toDateKey(now);
  let cursor = set.has(today) ? today : addDaysToKey(today, -1);
  if (!set.has(cursor)) return 0;
  let streak = 0;
  while (set.has(cursor)) {
    streak += 1;
    cursor = addDaysToKey(cursor, -1);
  }
  return streak;
}

export interface TrendPoint {
  dateKey: string;
  label: string;
  studied: number;
  correct: number;
  newWords: number;
}

export function buildTrend(stats: Record<string, DailyStats>, days: number, now: number): TrendPoint[] {
  const today = toDateKey(now);
  const points: TrendPoint[] = [];
  for (let i = days - 1; i >= 0; i -= 1) {
    const key = addDaysToKey(today, -i);
    const row = stats[key];
    points.push({
      dateKey: key,
      label: key.slice(5),
      studied: row?.studiedCount ?? 0,
      correct: row?.correctCount ?? 0,
      newWords: row?.newCount ?? 0,
    });
  }
  return points;
}

export interface SummaryStats {
  todayStudied: number;
  todayReviewed: number;
  todayNew: number;
  todayCorrect: number;
  todayForgot: number;
  todayDuration: number;
  todayGoalCompleted: boolean;
  totalStudied: number;
  totalReviews: number;
  correctRecallRate: number;
  totalForgot: number;
  totalDuration: number;
  streak: number;
  activeDays: number;
  xp: number;
  level: LevelInfo;
  goalCompletionRate: number;
}

export function summarise(
  stats: DailyStats[],
  logs: ReviewLog[],
  now: number,
  dailyGoalCount: number,
): SummaryStats {
  const todayKey = toDateKey(now);
  const byKey = new Map(stats.map((s) => [s.dateKey, s]));
  const today = byKey.get(todayKey) ?? emptyDailyStats(todayKey, now);
  const activeKeys = stats.filter((s) => s.studiedCount > 0).map((s) => s.dateKey);
  const known = logs.filter((l) => l.rating === 'known').length;
  const totalReviews = logs.length;
  const totalXpValue = stats.reduce((sum, s) => sum + s.xpEarned, 0);
  // A day counts as a goal day when the stored flag says so or the word goal was
  // met (older rows may predate the flag).
  const goalDays = stats.filter((s) => s.goalCompleted || s.studiedCount >= dailyGoalCount).length;

  return {
    todayStudied: today.studiedCount,
    todayReviewed: today.reviewedCount,
    todayNew: today.newCount,
    todayCorrect: today.correctCount,
    todayForgot: today.forgotCount,
    todayDuration: today.durationSeconds,
    todayGoalCompleted: today.goalCompleted || today.studiedCount >= dailyGoalCount,
    totalStudied: stats.reduce((sum, s) => sum + s.studiedCount, 0),
    totalReviews,
    correctRecallRate: totalReviews === 0 ? 0 : Math.round((known / totalReviews) * 100),
    totalForgot: stats.reduce((sum, s) => sum + s.forgotCount, 0),
    totalDuration: stats.reduce((sum, s) => sum + s.durationSeconds, 0),
    streak: computeStreak(activeKeys, now),
    activeDays: activeKeys.length,
    xp: totalXpValue,
    level: levelFor(totalXpValue),
    goalCompletionRate: activeKeys.length === 0 ? 0 : Math.round((goalDays / activeKeys.length) * 100),
  };
}
