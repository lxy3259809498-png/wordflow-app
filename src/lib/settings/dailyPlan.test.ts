import { describe, expect, it } from 'vitest';
import {
  DAILY_PRESETS,
  SECONDS_PER_CARD,
  applyPreset,
  cardsForMinutes,
  deriveFromMinutes,
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
      expect(preset.dailyGoalMinutes).toBeGreaterThan(0);
      expect(preset.dailyNewLimit).toBeGreaterThan(0);
      expect(preset.dailyReviewLimit).toBeGreaterThanOrEqual(preset.dailyNewLimit);
      expect(preset.timeBudgetMinutes).toBe(preset.dailyGoalMinutes);
    }
  });

  it('presets are ordered from lighter to heavier', () => {
    const minutes = DAILY_PRESETS.map((preset) => preset.dailyGoalMinutes);
    expect([...minutes].sort((a, b) => a - b)).toEqual(minutes);
  });

  it('applies a preset to settings', () => {
    const patch = applyPreset(presetById('serious'));
    expect(patch.dailyGoalMinutes).toBe(30);
    expect(patch.dailyNewLimit).toBe(25);
    expect(patch.timeBudgetMinutes).toBe(30);
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

describe('deriveFromMinutes', () => {
  it('caps new words by what the time budget can absorb', () => {
    // 5 minutes = 15 cards; new words must not exceed the session capacity.
    const patch = deriveFromMinutes(5);
    expect(patch.timeBudgetMinutes).toBe(5);
    expect(patch.dailyNewLimit!).toBeLessThanOrEqual(cardsForMinutes(5));
  });

  it('scales the plan with the requested minutes', () => {
    const short = deriveFromMinutes(10);
    const long = deriveFromMinutes(60);
    expect(long.dailyNewLimit!).toBeGreaterThan(short.dailyNewLimit!);
    expect(long.dailyReviewLimit!).toBeGreaterThan(short.dailyReviewLimit!);
    expect(long.dailyGoalCount!).toBeGreaterThan(short.dailyGoalCount!);
  });

  it('never lowers an explicit new-word choice below its own value', () => {
    const patch = deriveFromMinutes(30, 10);
    expect(patch.dailyNewLimit).toBe(10);
  });

  it('clamps out-of-range minutes', () => {
    expect(deriveFromMinutes(1).dailyGoalMinutes).toBe(5);
    expect(deriveFromMinutes(9999).dailyGoalMinutes).toBe(240);
  });
});

describe('estimateWorkload', () => {
  it('counts new words plus reviews', () => {
    const workload = estimateWorkload({ ...base, dailyNewLimit: 10, dailyReviewLimit: 100 });
    // 10 new + min(100, 25) reviews
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
