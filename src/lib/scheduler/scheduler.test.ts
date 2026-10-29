import { describe, expect, it } from 'vitest';
import {
  ALGORITHM_VERSION,
  DEFAULT_ALGORITHM_CONFIG,
  RATING_TO_GRADE,
  intervalFromStability,
  isDue,
  isDueToday,
  retrievability,
  schedule,
  shouldEnterErrorBook,
} from '@/lib/scheduler';
import type { Rating, UserWordState } from '@/lib/types';
import { DAY_MS, MINUTE_MS } from '@/lib/time';

const T0 = Date.UTC(2026, 4, 1, 9, 0, 0); // fixed clock → deterministic tests

function makeState(overrides: Partial<UserWordState> = {}): UserWordState {
  return {
    id: 'state-1',
    wordId: 'word-1',
    deckId: null,
    state: 'new',
    difficulty: 0,
    stability: 0,
    scheduledDays: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    repetitionCount: 0,
    lapseCount: 0,
    correctCount: 0,
    estimatedRecall: 0,
    fuzzyStreak: 0,
    isStarred: false,
    isInErrorBook: false,
    algorithmVersion: ALGORITHM_VERSION,
    createdAt: T0,
    updatedAt: T0,
    ...overrides,
  };
}

/** Build a state by chaining ratings, advancing the clock by `elapsedDays`. */
function chain(ratings: Rating[], start = T0, elapsedDays = 0): UserWordState {
  let clock = start;
  let state: UserWordState | null = null;
  for (const rating of ratings) {
    const result = schedule({ state, rating, now: clock });
    state = {
      ...makeState({
        state: result.state,
        difficulty: result.difficulty,
        stability: result.stability,
        scheduledDays: result.scheduledDays,
        lastReviewedAt: clock,
        nextReviewAt: result.nextReviewAt,
        repetitionCount: result.repetitionCount,
        lapseCount: result.lapseCount,
        correctCount: result.correctCount,
        estimatedRecall: result.estimatedRecall,
      }),
    };
    clock += elapsedDays * DAY_MS;
  }
  return state as UserWordState;
}

describe('FSRS-compatible scheduler', () => {
  it('maps the three UI ratings onto FSRS grades', () => {
    expect(RATING_TO_GRADE).toEqual({ forgot: 1, fuzzy: 2, known: 3 });
  });

  describe('first exposure', () => {
    it('schedules a known word into review with a multi-day interval', () => {
      const result = schedule({ state: null, rating: 'known', now: T0 });
      expect(result.state).toBe('review');
      expect(result.scheduledDays).toBeGreaterThanOrEqual(1);
      expect(result.nextReviewAt).toBe(T0 + Math.round(result.scheduledDays * DAY_MS));
      expect(result.repetitionCount).toBe(1);
      expect(result.correctCount).toBe(1);
      expect(result.queue).toBe('long');
    });

    it('keeps a fuzzy word in same-day learning instead of days', () => {
      const result = schedule({ state: null, rating: 'fuzzy', now: T0 });
      expect(result.state).toBe('learning');
      expect(result.scheduledDays).toBeLessThan(1);
      expect(result.nextReviewAt).toBe(T0 + DEFAULT_ALGORITHM_CONFIG.learningFuzzyMinutes * MINUTE_MS);
      expect(result.queue).toBe('short');
    });

    it('counts a first-time lapse and revisits within minutes', () => {
      const result = schedule({ state: null, rating: 'forgot', now: T0 });
      expect(result.state).toBe('learning');
      expect(result.lapseCount).toBe(1);
      expect(result.nextReviewAt).toBe(T0 + DEFAULT_ALGORITHM_CONFIG.learningAgainMinutes * MINUTE_MS);
      expect(result.correctCount).toBe(0);
    });

    it('gives different intervals to known vs fuzzy vs forgot on the same new word', () => {
      const known = schedule({ state: null, rating: 'known', now: T0 });
      const fuzzy = schedule({ state: null, rating: 'fuzzy', now: T0 });
      const forgot = schedule({ state: null, rating: 'forgot', now: T0 });
      expect(known.nextReviewAt).toBeGreaterThan(fuzzy.nextReviewAt);
      expect(fuzzy.nextReviewAt).toBeGreaterThan(forgot.nextReviewAt);
      expect(known.scheduledDays).toBeGreaterThan(fuzzy.scheduledDays);
    });

    it('is not a fixed 1/3/7 ladder', () => {
      // Chain four successful reviews, always waiting exactly until the planned
      // due date. A hard-coded ladder would emit 1,3,7,15 regardless of input.
      let state: UserWordState | null = null;
      let clock = T0;
      const intervals: number[] = [];
      for (let i = 0; i < 4; i += 1) {
        const result = schedule({ state, rating: 'known', now: clock });
        intervals.push(result.scheduledDays);
        state = makeState({
          state: result.state,
          difficulty: result.difficulty,
          stability: result.stability,
          scheduledDays: result.scheduledDays,
          lastReviewedAt: clock,
          nextReviewAt: result.nextReviewAt,
          repetitionCount: result.repetitionCount,
        });
        clock = result.nextReviewAt;
      }
      expect(intervals).toEqual([...intervals].sort((a, b) => a - b));
      expect(intervals).not.toEqual([1, 3, 7, 15]);
      // Intervals keep expanding because stability compounds.
      expect(intervals[3]).toBeGreaterThan(intervals[1]);
    });
  });

  describe('normal review', () => {
    it('grows stability and interval after a successful review', () => {
      const learned = chain(['known'], T0);
      const reviewed = schedule({
        state: learned,
        rating: 'known',
        now: T0 + learned.scheduledDays * DAY_MS,
      });
      expect(reviewed.stability).toBeGreaterThan(learned.stability);
      expect(reviewed.scheduledDays).toBeGreaterThanOrEqual(learned.scheduledDays);
      expect(reviewed.correctCount).toBe(2);
      expect(reviewed.state).toBe('review');
    });

    it('schedules fuzzy sooner than known for the same mature word', () => {
      const learned = chain(['known'], T0);
      const at = T0 + learned.scheduledDays * DAY_MS;
      const withKnown = schedule({ state: learned, rating: 'known', now: at });
      const withFuzzy = schedule({ state: learned, rating: 'fuzzy', now: at });
      expect(withFuzzy.scheduledDays).toBeLessThan(withKnown.scheduledDays);
      expect(withFuzzy.nextReviewAt).toBeLessThan(withKnown.nextReviewAt);
      expect(withFuzzy.difficulty).toBeGreaterThanOrEqual(withKnown.difficulty);
    });

    it('lower stability yields shorter interval than high stability', () => {
      expect(intervalFromStability(5, DEFAULT_ALGORITHM_CONFIG)).toBeLessThan(
        intervalFromStability(50, DEFAULT_ALGORITHM_CONFIG),
      );
    });
  });

  describe('forgetting and relearning', () => {
    it('drops into relearning with a short step and increments lapses', () => {
      const learned = chain(['known'], T0);
      const at = T0 + learned.scheduledDays * DAY_MS;
      const lapsed = schedule({ state: learned, rating: 'forgot', now: at });
      expect(lapsed.state).toBe('relearning');
      expect(lapsed.queue).toBe('short');
      expect(lapsed.lapseCount).toBe(1);
      expect(lapsed.scheduledDays).toBeLessThan(1);
      expect(lapsed.nextReviewAt).toBe(at + DEFAULT_ALGORITHM_CONFIG.relearningAgainMinutes * MINUTE_MS);
      expect(lapsed.stability).toBeLessThan(learned.stability);
    });

    it('graduates from relearning back to review after a success', () => {
      const learned = chain(['known'], T0);
      const lapsed = schedule({ state: learned, rating: 'forgot', now: T0 + 5 * DAY_MS });
      const relearnState = makeState({
        ...learned,
        state: lapsed.state,
        difficulty: lapsed.difficulty,
        stability: lapsed.stability,
        scheduledDays: lapsed.scheduledDays,
        lapseCount: lapsed.lapseCount,
        repetitionCount: lapsed.repetitionCount,
        lastReviewedAt: T0 + 5 * DAY_MS,
        nextReviewAt: lapsed.nextReviewAt,
      });
      const recovered = schedule({ state: relearnState, rating: 'known', now: lapsed.nextReviewAt });
      expect(recovered.state).toBe('review');
      expect(recovered.scheduledDays).toBeGreaterThanOrEqual(1);
      expect(recovered.queue).toBe('long');
    });

    it('can accumulate multiple lapses without corrupting the state', () => {
      let state: UserWordState | null = null;
      let clock = T0;
      for (let i = 0; i < 3; i += 1) {
        const result = schedule({ state, rating: i === 0 ? 'known' : 'forgot', now: clock });
        state = makeState({
          state: result.state,
          difficulty: result.difficulty,
          stability: result.stability,
          scheduledDays: result.scheduledDays,
          lastReviewedAt: clock,
          nextReviewAt: result.nextReviewAt,
          repetitionCount: result.repetitionCount,
          lapseCount: result.lapseCount,
        });
        clock = result.nextReviewAt;
      }
      expect(state?.lapseCount).toBe(2);
      expect(state?.repetitionCount).toBe(3);
      expect(state?.state).toBe('relearning');
    });
  });

  describe('time boundaries', () => {
    it('is reproducible with an injected clock', () => {
      const a = schedule({ state: null, rating: 'known', now: T0 });
      const b = schedule({ state: null, rating: 'known', now: T0 });
      expect(a).toEqual(b);
    });

    it('treats a card as due exactly at nextReviewAt', () => {
      const result = schedule({ state: null, rating: 'known', now: T0 });
      expect(isDue({ nextReviewAt: result.nextReviewAt }, result.nextReviewAt)).toBe(true);
      expect(isDue({ nextReviewAt: result.nextReviewAt }, result.nextReviewAt - 1)).toBe(false);
    });

    it('counts due-today up to the end of the local day', () => {
      const endOfDay = new Date(T0);
      endOfDay.setHours(23, 59, 59, 999);
      expect(isDueToday(endOfDay.getTime(), T0)).toBe(true);
      expect(isDueToday(endOfDay.getTime() + 1000, T0)).toBe(false);
      expect(isDueToday(null, T0)).toBe(false);
    });

    it('uses elapsed days for retrievability decay', () => {
      expect(retrievability(0, 10)).toBeCloseTo(1, 5);
      expect(retrievability(10, 10)).toBeCloseTo(0.9, 2);
      expect(retrievability(30, 10)).toBeLessThan(retrievability(10, 10));
    });
  });

  describe('error book rules', () => {
    it('adds forgotten words immediately', () => {
      expect(shouldEnterErrorBook({ lapseCount: 0, fuzzyStreak: 0 }, 'forgot', 0)).toBe(true);
    });
    it('does not add a single fuzzy rating', () => {
      expect(shouldEnterErrorBook({ lapseCount: 0, fuzzyStreak: 0 }, 'fuzzy', 1)).toBe(false);
    });
    it('adds after two consecutive fuzzy ratings', () => {
      expect(shouldEnterErrorBook({ lapseCount: 0, fuzzyStreak: 1 }, 'fuzzy', 2)).toBe(true);
    });
    it('adds a word with two historical lapses even when rated known', () => {
      expect(shouldEnterErrorBook({ lapseCount: 2, fuzzyStreak: 0 }, 'known', 0)).toBe(true);
    });
  });
});
