import type { AppSettings } from '@/lib/types';

/**
 * Daily workload presets.
 *
 * The app has five separate numbers (new words, reviews, session budget, daily
 * word goal, daily minute goal). Editing them one by one is confusing and easy
 * to leave inconsistent, so this module derives a coherent plan from a single
 * choice: "how much time per day" + "how many new words per day".
 */

export type DailyPresetId = 'light' | 'steady' | 'serious' | 'intense';

export interface DailyPreset {
  id: DailyPresetId;
  label: string;
  /** One-line description of the commitment. */
  hint: string;
  dailyGoalMinutes: number;
  dailyNewLimit: number;
  dailyReviewLimit: number;
  dailyGoalCount: number;
  timeBudgetMinutes: number;
}

/** Average seconds a learner spends per card (measured against the planner). */
export const SECONDS_PER_CARD = 20;

export const DAILY_PRESETS: DailyPreset[] = [
  {
    id: 'light',
    label: '轻松',
    hint: '每天 10 分钟，适合刚起步或时间零碎',
    dailyGoalMinutes: 10,
    dailyNewLimit: 8,
    dailyReviewLimit: 60,
    dailyGoalCount: 15,
    timeBudgetMinutes: 10,
  },
  {
    id: 'steady',
    label: '标准',
    hint: '每天 15 分钟，多数人可持续的节奏',
    dailyGoalMinutes: 15,
    dailyNewLimit: 12,
    dailyReviewLimit: 80,
    dailyGoalCount: 20,
    timeBudgetMinutes: 15,
  },
  {
    id: 'serious',
    label: '认真',
    hint: '每天 30 分钟，备考期推荐',
    dailyGoalMinutes: 30,
    dailyNewLimit: 25,
    dailyReviewLimit: 160,
    dailyGoalCount: 40,
    timeBudgetMinutes: 30,
  },
  {
    id: 'intense',
    label: '冲刺',
    hint: '每天 60 分钟，短期突击，注意复习压力',
    dailyGoalMinutes: 60,
    dailyNewLimit: 50,
    dailyReviewLimit: 300,
    dailyGoalCount: 80,
    timeBudgetMinutes: 60,
  },
];

export const presetById = (id: DailyPresetId): DailyPreset =>
  DAILY_PRESETS.find((preset) => preset.id === id) ?? DAILY_PRESETS[1];

/** Detects which preset the current settings match, or null for a custom mix. */
export function matchPreset(settings: AppSettings): DailyPresetId | null {
  const found = DAILY_PRESETS.find(
    (preset) =>
      preset.dailyGoalMinutes === settings.dailyGoalMinutes &&
      preset.dailyNewLimit === settings.dailyNewLimit &&
      preset.dailyReviewLimit === settings.dailyReviewLimit &&
      preset.dailyGoalCount === settings.dailyGoalCount,
  );
  return found?.id ?? null;
}

/** Applies a preset (pure, for optimistic updates). */
export function applyPreset(preset: DailyPreset): Partial<AppSettings> {
  return {
    dailyGoalMinutes: preset.dailyGoalMinutes,
    dailyNewLimit: preset.dailyNewLimit,
    dailyReviewLimit: preset.dailyReviewLimit,
    dailyGoalCount: preset.dailyGoalCount,
    timeBudgetMinutes: preset.timeBudgetMinutes,
  };
}

/**
 * How many cards fit in a time budget. Used to show "this budget allows N cards"
 * so the learner can see the consequence of moving the slider.
 */
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
 * Keeps the derived numbers consistent when the learner drags one slider:
 * - a longer daily goal allows more new words,
 * - the review cap scales with the same time budget.
 *
 * Deliberately conservative: new words are capped at what the time budget can
 * actually absorb, because new words cost more attention than reviews.
 */
export function deriveFromMinutes(minutes: number, newPerDay?: number): Partial<AppSettings> {
  const clamped = Math.min(240, Math.max(5, Math.round(minutes)));
  const capacity = cardsForMinutes(clamped);
  // Reserve ~60% of the session for reviews, the rest for new cards.
  const newCapacity = Math.max(1, Math.floor(capacity * 0.4));
  const reviewCapacity = Math.max(10, Math.ceil(capacity * 0.7));
  return {
    dailyGoalMinutes: clamped,
    timeBudgetMinutes: clamped,
    dailyNewLimit: newPerDay === undefined ? newCapacity : Math.min(newPerDay, newCapacity),
    dailyReviewLimit: reviewCapacity,
    // The word-count goal counts reviews + new cards actually studied.
    dailyGoalCount: Math.max(5, Math.round(capacity * 0.8)),
  };
}

/** Estimates the daily workload in words and minutes for a settings snapshot. */
export function estimateWorkload(settings: AppSettings): {
  wordsPerDay: number;
  minutes: number;
  reviewShare: number;
} {
  const newWords = settings.dailyNewLimit;
  // Roughly 2.5 reviews per new word once the deck is established.
  const reviews = Math.min(settings.dailyReviewLimit, Math.round(newWords * 2.5));
  const wordsPerDay = newWords + reviews;
  return {
    wordsPerDay,
    minutes: minutesForCards(wordsPerDay),
    reviewShare: wordsPerDay === 0 ? 0 : reviews / wordsPerDay,
  };
}
