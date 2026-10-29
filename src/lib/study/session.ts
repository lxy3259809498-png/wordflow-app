import type { Rating, SessionPlanItem, ShortQueueEntry, StudySession } from '@/lib/types';
import { toDateKey } from '@/lib/time';

/** How many further cards must be shown before a short-queue word may resurface. */
export const SHORT_QUEUE_GAP = 2;

export interface PlanOptions {
  dueWordIds: string[];
  newWordIds: string[];
  dailyReviewLimit: number;
  dailyNewLimit: number;
  timeBudgetMinutes: number;
  /** Average seconds a learner spends per card; used for the time-budget estimate. */
  secondsPerCard?: number;
  now: number;
}

export interface BuiltPlan {
  items: SessionPlanItem[];
  plannedNew: number;
  plannedReview: number;
  /** True when due reviews were clamped, so new-word intake is suppressed. */
  pressure: boolean;
}

/**
 * Reviews always come first. When the due backlog is large, new words are cut so
 * the session still fits the time budget (and never exceeds the review limit).
 */
export function buildSessionPlan(options: PlanOptions): BuiltPlan {
  const {
    dueWordIds,
    newWordIds,
    dailyReviewLimit,
    dailyNewLimit,
    timeBudgetMinutes,
    secondsPerCard = 20,
    now,
  } = options;

  const reviewSlotsFromTime =
    timeBudgetMinutes > 0 ? Math.floor((timeBudgetMinutes * 60) / secondsPerCard) : Infinity;
  const reviewCap = Math.max(0, Math.min(dailyReviewLimit, reviewSlotsFromTime));
  const reviews = dueWordIds.slice(0, reviewCap);
  const pressure = dueWordIds.length > reviews.length || reviews.length >= dailyReviewLimit;

  const remainingSlots = Math.max(0, reviewSlotsFromTime - reviews.length);
  const newCap = pressure ? Math.min(dailyNewLimit, Math.ceil(dailyNewLimit / 2)) : dailyNewLimit;
  const newCount = Math.max(0, Math.min(newWordIds.length, newCap, remainingSlots));
  const newWords = newWordIds.slice(0, newCount);

  const items: SessionPlanItem[] = [
    ...reviews.map((wordId) => ({ wordId, kind: 'review' as const, dueAt: null })),
    ...newWords.map((wordId) => ({ wordId, kind: 'new' as const, dueAt: null })),
  ];

  void now;
  return { items, plannedNew: newWords.length, plannedReview: reviews.length, pressure };
}

/** Interleave a little so a long review block does not feel monotonous. */
export function interleavePlan(items: SessionPlanItem[]): SessionPlanItem[] {
  const reviews = items.filter((i) => i.kind === 'review');
  const news = items.filter((i) => i.kind === 'new');
  const out: SessionPlanItem[] = [];
  let r = 0;
  let n = 0;
  let sinceNew = 0;
  while (r < reviews.length || n < news.length) {
    const wantsNew = news.length > 0 && (sinceNew >= 4 || r >= reviews.length);
    if (wantsNew) {
      out.push(news[n]);
      n += 1;
      sinceNew = 0;
    } else if (r < reviews.length) {
      out.push(reviews[r]);
      r += 1;
      sinceNew += 1;
    }
  }
  return out;
}

export interface NextCard {
  wordId: string;
  source: 'short' | 'main';
}

/**
 * Resolve the next card. Short-queue entries win once their gap has elapsed,
 * which guarantees a forgotten word comes back later in the session — never
 * immediately after itself.
 */
export function pickNextCard(session: StudySession): NextCard | null {
  const eligible = session.shortQueue
    .filter((entry) => entry.dueAfter <= session.cursor)
    .sort((a, b) => a.dueAfter - b.dueAfter);
  if (eligible.length > 0) {
    return { wordId: eligible[0].wordId, source: 'short' };
  }
  if (session.mainIndex < session.sequence.length) {
    return { wordId: session.sequence[session.mainIndex], source: 'main' };
  }
  return null;
}

export function consumeShortQueue(queue: ShortQueueEntry[], wordId: string): ShortQueueEntry[] {
  const index = queue.findIndex((entry) => entry.wordId === wordId);
  if (index === -1) return queue;
  return [...queue.slice(0, index), ...queue.slice(index + 1)];
}

export function enqueueShort(
  queue: ShortQueueEntry[],
  wordId: string,
  cursor: number,
  gap = SHORT_QUEUE_GAP,
): ShortQueueEntry[] {
  const filtered = queue.filter((entry) => entry.wordId !== wordId);
  return [...filtered, { wordId, dueAfter: cursor + gap }];
}

export function isSessionFinished(session: StudySession): boolean {
  return pickNextCard(session) === null;
}

export function createSession(input: {
  id: string;
  plan: SessionPlanItem[];
  mode: StudySession['mode'];
  reviewMode: StudySession['reviewMode'];
  deckIds: string[];
  now: number;
}): StudySession {
  return {
    id: input.id,
    startedAt: input.now,
    endedAt: null,
    status: 'active',
    mode: input.mode,
    reviewMode: input.reviewMode,
    deckIds: input.deckIds,
    plannedNewCount: input.plan.filter((i) => i.kind === 'new').length,
    plannedReviewCount: input.plan.filter((i) => i.kind === 'review').length,
    plan: input.plan,
    sequence: input.plan.map((i) => i.wordId),
    mainIndex: 0,
    cursor: 0,
    shortQueue: [],
    completedWordIds: [],
    newWordsCount: 0,
    reviewedWordsCount: 0,
    correctCount: 0,
    fuzzyCount: 0,
    forgotCount: 0,
    durationSeconds: 0,
    updatedAt: input.now,
  };
}

export interface SessionProgress {
  done: number;
  total: number;
  percent: number;
  remaining: number;
  replaysPending: number;
}

export function sessionProgress(session: StudySession): SessionProgress {
  const total = session.sequence.length;
  const done = Math.min(session.mainIndex, total);
  return {
    done,
    total,
    remaining: Math.max(0, total - done) + session.shortQueue.length,
    percent: total === 0 ? 0 : Math.min(100, Math.round((done / total) * 100)),
    replaysPending: session.shortQueue.length,
  };
}

/**
 * Advance after a committed rating. `wasCorrect` drives the short queue: a word
 * the learner could not recall is re-drilled later in the same session, while
 * the long-term schedule is still written by the scheduler.
 */
export interface AdvanceInput {
  rating: Rating;
  wasNew: boolean;
  source: 'short' | 'main';
  wordId: string;
  now: number;
}

export function advanceSession(session: StudySession, input: AdvanceInput): StudySession {
  const queue = consumeShortQueue(session.shortQueue, input.wordId);
  const shouldReplay = input.rating !== 'known';
  const nextCursor = session.cursor + 1;
  // `nextCursor + gap` guarantees `gap` other cards are shown before this one
  // returns, so a lapsed word never repeats back-to-back.
  const shortQueue = shouldReplay
    ? enqueueShort(queue, input.wordId, nextCursor)
    : queue;

  const completed = session.completedWordIds.includes(input.wordId)
    ? session.completedWordIds
    : [...session.completedWordIds, input.wordId];

  return {
    ...session,
    mainIndex: session.mainIndex + (input.source === 'main' ? 1 : 0),
    cursor: nextCursor,
    shortQueue,
    completedWordIds: completed,
    newWordsCount: session.newWordsCount + (input.wasNew ? 1 : 0),
    reviewedWordsCount: session.reviewedWordsCount + (input.wasNew ? 0 : 1),
    correctCount: session.correctCount + (input.rating === 'known' ? 1 : 0),
    fuzzyCount: session.fuzzyCount + (input.rating === 'fuzzy' ? 1 : 0),
    forgotCount: session.forgotCount + (input.rating === 'forgot' ? 1 : 0),
    durationSeconds: Math.max(
      session.durationSeconds,
      Math.round((input.now - session.startedAt) / 1000),
    ),
    updatedAt: input.now,
  };
}

export function finishSession(session: StudySession, now: number): StudySession {
  return {
    ...session,
    status: 'completed',
    endedAt: now,
    shortQueue: [],
    durationSeconds: Math.max(session.durationSeconds, Math.round((now - session.startedAt) / 1000)),
    updatedAt: now,
  };
}

/** Sessions untouched for 12h are considered abandoned when listing "continue". */
export function isResumable(session: StudySession, now: number): boolean {
  return (
    (session.status === 'active' || session.status === 'paused') &&
    now - session.updatedAt < 12 * 60 * 60 * 1000
  );
}

export function defaultSessionId(now: number): string {
  return `s-${toDateKey(now)}-${Math.random().toString(36).slice(2, 8)}`;
}
