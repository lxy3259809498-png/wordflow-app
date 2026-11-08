import { describe, expect, it } from 'vitest';
import {
  DAILY_PRESETS,
  SECONDS_PER_CARD,
  applyPreset,
  cardsForMinutes,
  daysToFinish,
  deriveFromWords,
  estimateWorkload,
  matchPreset,
  minutesForCards,
  presetById,
} from '@/lib/settings/dailyPlan';
import { DEFAULT_SETTINGS } from '@/lib/settings/settings';
import type { AppSettings } from '@/lib/types';

const base: AppSettings = { ...DEFAULT_SETTINGS };

describe('cardsForMinutes / minutesForCards', () => {
  it('converts using the same 20s/card constant the planner uses', () => {
    expect(cardsForMinutes(10)).toBe(30);
    expect(cardsForMinutes(1)).toBe(3);
    expect(minutesForCards(30)).toBe(10);
    expect(SECONDS_PER_CARD).toBe(20);
  });

  it('round-trips a few values', () => {
    for (const minutes of [5, 10, 15, 30, 60]) {
      expect(minutesForCards(cardsForMinutes(minutes))).toBe(minutes);
    }
  });

  it('returns 0 for non-positive or invalid input', () => {
    expect(cardsForMinutes(0)).toBe(0);
    expect(cardsForMinutes(-5)).toBe(0);
    expect(cardsForMinutes(Number.NaN)).toBe(0);
    expect(minutesForCards(0)).toBe(0);
  });
});

describe('presets', () => {
  it('every preset is internally consistent', () => {
    for (const preset of DAILY_PRESETS) {
      expect(preset.dailyNewLimit).toBeGreaterThan(0);
      expect(preset.dailyReviewLimit).toBeGreaterThanOrEqual(preset.dailyNewLimit);
      expect(preset.dailyGoalCount).toBeGreaterThan(0);
    }
  });

  it('presets are ordered from lighter to heavier word load', () => {
    const newLimits = DAILY_PRESETS.map((preset) => preset.dailyNewLimit);
    expect([...newLimits].sort((a, b) => a - b)).toEqual(newLimits);
  });

  it('applies a preset and derives a workable time budget', () => {
    const patch = applyPreset(presetById('serious'));
    expect(patch.dailyNewLimit).toBe(25);
    expect(patch.dailyReviewLimit).toBe(160);
    // The derived cap must be large enough not to truncate the requested plan.
    const expectedCards = 25 + Math.min(160, Math.round(25 * 2.5));
    expect(patch.timeBudgetMinutes!).toBeGreaterThanOrEqual(minutesForCards(expectedCards));
  });

  it('detects the active preset', () => {
    const steady = presetById('steady');
    const settings = { ...base, ...applyPreset(steady) };
    expect(matchPreset(settings)).toBe('steady');
  });

  it('returns null for a custom mix', () => {
    const settings: AppSettings = {
      ...base,
      ...applyPreset(presetById('steady')),
      dailyNewLimit: 37,
    };
    expect(matchPreset(settings)).toBeNull();
  });
});

describe('deriveFromWords — the single knob', () => {
  it('scales reviews and goal with the new-word count', () => {
    const low = deriveFromWords(5);
    const high = deriveFromWords(40);
    expect(high.dailyReviewLimit!).toBeGreaterThan(low.dailyReviewLimit!);
    expect(high.dailyGoalCount!).toBeGreaterThan(low.dailyGoalCount!);
    expect(high.timeBudgetMinutes!).toBeGreaterThan(low.timeBudgetMinutes!);
  });

  it('keeps the time cap generous enough for the requested load', () => {
    for (const words of [0, 5, 12, 25, 50, 100]) {
      const patch = deriveFromWords(words);
      const expected = words + Math.min(patch.dailyReviewLimit!, Math.round(words * 2.5));
      expect(patch.timeBudgetMinutes!).toBeGreaterThanOrEqual(minutesForCards(expected));
    }
  });

  it('clamps out-of-range input', () => {
    expect(deriveFromWords(-10).dailyNewLimit).toBe(0);
    expect(deriveFromWords(9999).dailyNewLimit).toBe(100);
  });

  it('handles a review-only plan without dividing by zero', () => {
    const patch = deriveFromWords(0);
    expect(patch.dailyNewLimit).toBe(0);
    expect(patch.dailyGoalCount).toBeGreaterThan(0);
    expect(Number.isFinite(patch.timeBudgetMinutes)).toBe(true);
  });

  it('always produces an estimate label', () => {
    expect(deriveFromWords(20).dailyGoalMinutes).toBeGreaterThan(0);
  });
});

describe('estimateWorkload', () => {
  it('counts new words plus reviews', () => {
    const workload = estimateWorkload({ ...base, dailyNewLimit: 10, dailyReviewLimit: 100 });
    expect(workload.wordsPerDay).toBe(35);
    expect(workload.reviewShare).toBeGreaterThan(0);
    expect(workload.minutes).toBe(minutesForCards(35));
  });

  it('handles a review-only plan', () => {
    const workload = estimateWorkload({ ...base, dailyNewLimit: 0, dailyReviewLimit: 50 });
    expect(workload.wordsPerDay).toBe(0);
    expect(workload.reviewShare).toBe(0);
    expect(workload.minutes).toBe(0);
  });

  it('respects a low review cap', () => {
    const workload = estimateWorkload({ ...base, dailyNewLimit: 20, dailyReviewLimit: 5 });
    expect(workload.wordsPerDay).toBe(25);
  });
});

describe('daysToFinish', () => {
  it('divides remaining words by the daily pace', () => {
    expect(daysToFinish(100, 10)).toBe(10);
    expect(daysToFinish(101, 10)).toBe(11);
  });

  it('returns null when the pace is zero, so callers show ∞', () => {
    expect(daysToFinish(100, 0)).toBeNull();
  });

  it('returns 0 when nothing is left', () => {
    expect(daysToFinish(0, 25)).toBe(0);
  });
});
