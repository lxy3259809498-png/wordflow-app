import type { AlgorithmConfig, MemoryState, Rating, UserWordState } from '@/lib/types';
import { DAY_MS, MINUTE_MS } from '@/lib/time';

/**
 * WordFlow Scheduler v1 — an auditable, FSRS-compatible implementation.
 *
 * It follows the FSRS-4.5 difficulty/stability/retrievability model and uses the
 * public default weights, but it is NOT the official FSRS library and has not been
 * calibrated against real review histories. It only maps three UI ratings:
 *   forgot = Again(1), fuzzy = Hard(2), known = Good(3)  (no Easy grade).
 * Every parameter lives here; tests inject `now` so results are deterministic.
 */

export const ALGORITHM_VERSION = 'wf-fsrs-4.5-lite';

export const DEFAULT_ALGORITHM_CONFIG: AlgorithmConfig = {
  version: ALGORITHM_VERSION,
  weights: [
    0.4072, 1.1829, 3.1262, 15.4722, 7.2102, 0.5316, 1.0651, 0.0234, 1.616, 0.1544, 1.0824,
    1.9813, 0.0953, 0.2975, 2.2042, 0.2407, 2.9466, 0.5034, 0.6567,
  ],
  desiredRetention: 0.9,
  maximumIntervalDays: 365 * 10,
  learningAgainMinutes: 3,
  learningFuzzyMinutes: 10,
  relearningAgainMinutes: 10,
  relearningFuzzyMinutes: 20,
  graduationMinIntervalDays: 1,
  maxConsecutiveReviews: 6,
};

export const RATING_TO_GRADE: Record<Rating, 1 | 2 | 3> = {
  forgot: 1,
  fuzzy: 2,
  known: 3,
};

const FACTOR = 19 / 81;
const DECAY = -0.5;
const MIN_STABILITY = 0.1;
const MAX_DIFFICULTY = 10;
const MIN_DIFFICULTY = 1;

const clamp = (value: number, min: number, max: number): number =>
  Math.min(max, Math.max(min, value));

const round = (value: number, digits = 4): number => {
  const f = 10 ** digits;
  return Math.round(value * f) / f;
};

export interface SchedulerInput {
  state: UserWordState | null;
  rating: Rating;
  now: number;
  config?: AlgorithmConfig;
  /** Optional explicit elapsed time; defaults to `now - lastReviewedAt`. */
  elapsedDays?: number;
}

export interface SchedulerResult {
  state: MemoryState;
  difficulty: number;
  stability: number;
  scheduledDays: number;
  nextReviewAt: number;
  repetitionCount: number;
  lapseCount: number;
  correctCount: number;
  estimatedRecall: number;
  /** `short` → same-session re-drill, `long` → cross-day review queue. */
  queue: 'short' | 'long';
  algorithmVersion: string;
}

export function retrievability(elapsedDays: number, stability: number): number {
  if (stability <= 0) return 0;
  const t = Math.max(0, elapsedDays);
  return (1 + (FACTOR * t) / stability) ** DECAY;
}

function initialDifficulty(grade: number, w: number[]): number {
  return clamp(w[4] - Math.exp(w[5] * (grade - 1)) + 1, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

function initialStability(grade: number, w: number[]): number {
  return Math.max(MIN_STABILITY, w[grade - 1] ?? w[0]);
}

function nextDifficulty(difficulty: number, grade: number, w: number[]): number {
  const delta = difficulty - w[6] * (grade - 3);
  const reverted = w[7] * initialDifficulty(3, w) + (1 - w[7]) * delta;
  return clamp(reverted, MIN_DIFFICULTY, MAX_DIFFICULTY);
}

function nextStabilityRecall(
  difficulty: number,
  stability: number,
  recall: number,
  grade: number,
  w: number[],
): number {
  const hardPenalty = grade === 2 ? w[15] : 1;
  const growth =
    Math.exp(w[8]) *
    (11 - difficulty) *
    Math.pow(stability, -w[9]) *
    (Math.exp((1 - recall) * w[10]) - 1) *
    hardPenalty;
  return Math.max(MIN_STABILITY, stability * (1 + growth));
}

function nextStabilityForget(
  difficulty: number,
  stability: number,
  recall: number,
  w: number[],
): number {
  const value =
    w[11] *
    Math.pow(difficulty, -w[12]) *
    (Math.pow(stability + 1, w[13]) - 1) *
    Math.exp(w[14] * (1 - recall));
  return Math.max(MIN_STABILITY, value);
}

/** Same-day (short-term) stability update, FSRS-4.5 short-term formula. */
function shortTermStability(stability: number, grade: number, w: number[]): number {
  const value = stability * Math.exp(w[17] * (grade - 3 + w[18]));
  return clamp(value, MIN_STABILITY, 100);
}

function intervalFromStability(stability: number, config: AlgorithmConfig): number {
  const retention = clamp(config.desiredRetention, 0.7, 0.99);
  const raw = (stability / FACTOR) * (Math.pow(retention, 1 / DECAY) - 1);
  const bounded = clamp(raw, 1, config.maximumIntervalDays);
  return Math.max(config.graduationMinIntervalDays, Math.round(bounded));
}

function minutesFromNow(now: number, minutes: number): number {
  return now + minutes * MINUTE_MS;
}

function emptyState(now: number): UserWordState {
  return {
    id: '',
    wordId: '',
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
    createdAt: now,
    updatedAt: now,
  };
}

export function schedule({
  state: previous,
  rating,
  now,
  config = DEFAULT_ALGORITHM_CONFIG,
  elapsedDays,
}: SchedulerInput): SchedulerResult {
  const w = config.weights;
  const grade = RATING_TO_GRADE[rating];
  const before = previous ?? emptyState(now);
  const priorState: MemoryState = previous?.state ?? 'new';
  const repsBefore = previous?.repetitionCount ?? 0;

  let difficulty = before.difficulty || initialDifficulty(grade, w);
  let stability = before.stability || initialStability(grade, w);
  let lapseCount = before.lapseCount;
  let correctCount = before.correctCount;
  let state: MemoryState;
  let scheduledDays: number;
  let nextReviewAt: number;
  let queue: 'short' | 'long' = 'long';

  const elapsed =
    elapsedDays ??
    (before.lastReviewedAt ? Math.max(0, (now - before.lastReviewedAt) / DAY_MS) : 0);
  const recallBefore =
    previous && previous.stability > 0 ? retrievability(elapsed, previous.stability) : 0;

  if (priorState === 'new' || previous === null) {
    difficulty = initialDifficulty(grade, w);
    stability = initialStability(grade, w);
    if (rating === 'known') {
      state = 'review';
      scheduledDays = intervalFromStability(stability, config);
      nextReviewAt = now + scheduledDays * DAY_MS;
    } else {
      state = 'learning';
      scheduledDays =
        (rating === 'fuzzy' ? config.learningFuzzyMinutes : config.learningAgainMinutes) / 1440;
      nextReviewAt = minutesFromNow(
        now,
        rating === 'fuzzy' ? config.learningFuzzyMinutes : config.learningAgainMinutes,
      );
      queue = 'short';
    }
    if (rating === 'forgot') lapseCount += 1;
    if (rating === 'known') correctCount += 1;
  } else if (priorState === 'learning' || priorState === 'relearning') {
    const isRelearning = priorState === 'relearning';
    stability = shortTermStability(before.stability, grade, w);
    difficulty = nextDifficulty(before.difficulty || initialDifficulty(grade, w), grade, w);
    if (rating === 'known') {
      state = 'review';
      scheduledDays = intervalFromStability(stability, config);
      nextReviewAt = now + scheduledDays * DAY_MS;
      correctCount += 1;
    } else {
      state = isRelearning ? 'relearning' : 'learning';
      const minutes = isRelearning
        ? rating === 'fuzzy'
          ? config.relearningFuzzyMinutes
          : config.relearningAgainMinutes
        : rating === 'fuzzy'
          ? config.learningFuzzyMinutes
          : config.learningAgainMinutes;
      scheduledDays = minutes / 1440;
      nextReviewAt = minutesFromNow(now, minutes);
      queue = 'short';
      if (rating === 'forgot' && isRelearning) lapseCount += 1;
    }
    if (rating === 'forgot' && !isRelearning) {
      // Second failure inside the same learning phase still counts as a lapse.
      lapseCount += 1;
    }
  } else {
    // priorState === 'review'
    difficulty = nextDifficulty(before.difficulty, grade, w);
    if (rating === 'forgot') {
      stability = nextStabilityForget(before.difficulty, before.stability, recallBefore, w);
      state = 'relearning';
      lapseCount += 1;
      scheduledDays = config.relearningAgainMinutes / 1440;
      nextReviewAt = minutesFromNow(now, config.relearningAgainMinutes);
      queue = 'short';
    } else {
      stability = nextStabilityRecall(before.difficulty, before.stability, recallBefore, grade, w);
      state = 'review';
      const base = intervalFromStability(stability, config);
      scheduledDays = rating === 'fuzzy' ? Math.max(1, Math.round(base * 0.6)) : base;
      nextReviewAt = now + scheduledDays * DAY_MS;
      if (rating === 'known') correctCount += 1;
    }
  }

  const repetitionCount = repsBefore + 1;
  const estimatedRecall = round(
    queue === 'long' ? retrievability(scheduledDays, stability) : 1,
    3,
  );

  return {
    state,
    difficulty: round(difficulty),
    stability: round(stability),
    scheduledDays: round(scheduledDays, 6),
    nextReviewAt: Math.round(nextReviewAt),
    repetitionCount,
    lapseCount,
    correctCount,
    estimatedRecall,
    queue,
    algorithmVersion: config.version,
  };
}

/** A word is due when its next review is at or before the current instant. */
export function isDue(state: Pick<UserWordState, 'nextReviewAt'>, now: number): boolean {
  return state.nextReviewAt !== null && state.nextReviewAt <= now;
}

/** True when a review is due inside the current day (used by the dashboard). */
export function isDueToday(nextReviewAt: number | null, now: number): boolean {
  if (nextReviewAt === null) return false;
  const end = new Date(now);
  end.setHours(23, 59, 59, 999);
  return nextReviewAt <= end.getTime();
}

export function shouldEnterErrorBook(
  state: Pick<UserWordState, 'lapseCount' | 'fuzzyStreak'>,
  rating: Rating,
  nextFuzzyStreak: number,
): boolean {
  if (rating === 'forgot') return true;
  if (nextFuzzyStreak >= 2) return true;
  return state.lapseCount >= 2;
}

export { intervalFromStability, initialDifficulty, initialStability, FACTOR, DECAY };
