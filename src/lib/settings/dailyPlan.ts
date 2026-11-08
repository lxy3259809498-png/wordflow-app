import type { AppSettings } from '@/lib/types';

/**
 * Daily workload presets.
 *
 * Design note: there is exactly **one** user-facing knob — how many words per
 * day. Time is an *estimate* derived from it, never something the learner has to
 * configure. Two independent knobs (words AND minutes) contradicted each other
 * and made the learner guess which one actually decided the session size.
 *
 * `timeBudgetMinutes` still exists in settings because the session planner uses
 * it as a hard cap (so a huge review backlog cannot produce a 400-card session).
 * It is now derived from the word counts instead of being set by hand.
 */

export type DailyPresetId = 'light' | 'steady' | 'serious' | 'intense';

export interface DailyPreset {
  id: DailyPresetId;
  label: string;
  /** One-line description of the commitment, expressed in words. */
  hint: string;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  dailyGoalCount: number;
}

/** Average seconds a learner spends per card (matches the session planner). */
export const SECONDS_PER_CARD = 20;

export const DAILY_PRESETS: DailyPreset[] = [
  {
    id: 'light',
    label: '轻松',
    hint: '每天 8 个新词，约 10 分钟',
    dailyNewLimit: 8,
    dailyReviewLimit: 60,
    dailyGoalCount: 15,
  },
  {
    id: 'steady',
    label: '标准',
    hint: '每天 12 个新词，约 15 分钟',
    dailyNewLimit: 12,
    dailyReviewLimit: 80,
    dailyGoalCount: 20,
  },
  {
    id: 'serious',
    label: '认真',
    hint: '每天 25 个新词，约 30 分钟',
    dailyNewLimit: 25,
    dailyReviewLimit: 160,
    dailyGoalCount: 40,
  },
  {
    id: 'intense',
    label: '冲刺',
    hint: '每天 50 个新词，约 60 分钟',
    dailyNewLimit: 50,
    dailyReviewLimit: 300,
    dailyGoalCount: 80,
  },
];

export const presetById = (id: DailyPresetId): DailyPreset =>
  DAILY_PRESETS.find((preset) => preset.id === id) ?? DAILY_PRESETS[1];

/** Detects which preset the current settings match, or null for a custom mix. */
export function matchPreset(settings: AppSettings): DailyPresetId | null {
  const found = DAILY_PRESETS.find(
    (preset) =>
      preset.dailyNewLimit === settings.dailyNewLimit &&
      preset.dailyReviewLimit === settings.dailyReviewLimit &&
      preset.dailyGoalCount === settings.dailyGoalCount,
  );
  return found?.id ?? null;
}

/** How many cards fit in a time budget. */
export function cardsForMinutes(minutes: number): number {
  if (!Number.isFinite(minutes) || minutes <= 0) return 0;
  return Math.floor((minutes * 60) / SECONDS_PER_CARD);
}

/** Minutes needed for a card count (inverse of `cardsForMinutes`). */
export function minutesForCards(cards: number): number {
  if (!Number.isFinite(cards) || cards <= 0) return 0;
  return Math.ceil((cards * SECONDS_PER_CARD) / 60);
}

/**
 * Estimated cards studied per day for a new-word count.
 * Reviews accumulate at roughly 2.5 per new word once a deck is established.
 */
export function expectedCards(dailyNewLimit: number, dailyReviewLimit: number): number {
  const reviews = Math.min(dailyReviewLimit, Math.round(dailyNewLimit * 2.5));
  return dailyNewLimit + reviews;
}

/**
 * Derives every dependent number from the single choice "new words per day".
 *
 * - `dailyReviewLimit` scales with the new-word load (never below 20),
 * - `dailyGoalCount` is what the learner will actually touch in a day,
 * - `timeBudgetMinutes` becomes the planner's safety cap, with headroom so the
 *   plan is not cut short mid-session,
 * - `dailyGoalMinutes` is stored purely for display/legacy, equal to the estimate.
 */
export function deriveFromWords(newPerDay: number): Partial<AppSettings> {
  const newLimit = Math.min(100, Math.max(0, Math.round(newPerDay)));
  const reviewLimit = Math.max(20, Math.min(500, Math.round(newLimit * 5)));
  const goalCount = Math.max(5, Math.round(newLimit * 2));
  const expected = expectedCards(newLimit, reviewLimit);
  // 1.5× headroom: the cap must not truncate the plan the learner asked for.
  const budget = Math.max(5, Math.ceil(minutesForCards(expected) * 1.5));

  return {
    dailyNewLimit: newLimit,
    dailyReviewLimit: reviewLimit,
    dailyGoalCount: goalCount,
    timeBudgetMinutes: budget,
    dailyGoalMinutes: Math.max(5, minutesForCards(expected)),
  };
}

/** Applies a preset, deriving the dependent numbers from its word count. */
export function applyPreset(preset: DailyPreset): Partial<AppSettings> {
  return {
    dailyNewLimit: preset.dailyNewLimit,
    dailyReviewLimit: preset.dailyReviewLimit,
    dailyGoalCount: preset.dailyGoalCount,
    timeBudgetMinutes: Math.max(5, Math.ceil(minutesForCards(expectedCards(preset.dailyNewLimit, preset.dailyReviewLimit)) * 1.5)),
    dailyGoalMinutes: Math.max(5, minutesForCards(expectedCards(preset.dailyNewLimit, preset.dailyReviewLimit))),
  };
}

/** Estimates the daily workload in words and minutes for a settings snapshot. */
export function estimateWorkload(settings: AppSettings): {
  wordsPerDay: number;
  minutes: number;
  reviewShare: number;
} {
  const newWords = settings.dailyNewLimit;
  const reviews = Math.min(settings.dailyReviewLimit, Math.round(newWords * 2.5));
  const wordsPerDay = newWords + reviews;
  return {
    wordsPerDay,
    minutes: minutesForCards(wordsPerDay),
    reviewShare: wordsPerDay === 0 ? 0 : reviews / wordsPerDay,
  };
}

/** Days needed to finish the remaining vocabulary at the chosen pace. */
export function daysToFinish(remainingWords: number, newPerDay: number): number | null {
  if (newPerDay <= 0) return null;
  if (remainingWords <= 0) return 0;
  return Math.ceil(remainingWords / newPerDay);
}
