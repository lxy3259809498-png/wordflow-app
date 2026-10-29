import { describe, expect, it } from 'vitest';
import {
  buildSessionPlan,
  createSession,
  interleavePlan,
  pickNextCard,
  advanceSession,
  finishSession,
  sessionProgress,
  SHORT_QUEUE_GAP,
} from '@/lib/study/session';

const T0 = Date.UTC(2026, 4, 1, 9, 0, 0);

const basePlan = (ids: string[], kind: 'review' | 'new' = 'review') =>
  ids.map((wordId) => ({ wordId, kind, dueAt: null }));

describe('session planner', () => {
  it('puts due reviews first and fills remaining time with new words', () => {
    const plan = buildSessionPlan({
      dueWordIds: ['r1', 'r2', 'r3'],
      newWordIds: ['n1', 'n2', 'n3', 'n4'],
      dailyReviewLimit: 50,
      dailyNewLimit: 2,
      timeBudgetMinutes: 18, // 54 cards at 20s → plenty
      now: T0,
    });
    expect(plan.plannedReview).toBe(3);
    expect(plan.plannedNew).toBe(2);
    expect(plan.items.map((i) => i.wordId)).toEqual(['r1', 'r2', 'r3', 'n1', 'n2']);
    expect(plan.pressure).toBe(false);
  });

  it('caps reviews by the daily review limit', () => {
    const plan = buildSessionPlan({
      dueWordIds: Array.from({ length: 120 }, (_, i) => `r${i}`),
      newWordIds: ['n1', 'n2'],
      dailyReviewLimit: 10,
      dailyNewLimit: 5,
      timeBudgetMinutes: 120,
      now: T0,
    });
    expect(plan.plannedReview).toBe(10);
    expect(plan.pressure).toBe(true);
  });

  it('halves new words under review pressure', () => {
    const plan = buildSessionPlan({
      dueWordIds: Array.from({ length: 60 }, (_, i) => `r${i}`),
      newWordIds: ['n1', 'n2', 'n3', 'n4', 'n5', 'n6', 'n7', 'n8'],
      dailyReviewLimit: 60,
      dailyNewLimit: 8,
      timeBudgetMinutes: 90,
      now: T0,
    });
    expect(plan.pressure).toBe(true);
    expect(plan.plannedNew).toBe(4);
  });

  it('respects the time budget when reviews already consume it', () => {
    const plan = buildSessionPlan({
      dueWordIds: Array.from({ length: 100 }, (_, i) => `r${i}`),
      newWordIds: ['n1', 'n2', 'n3'],
      dailyReviewLimit: 100,
      dailyNewLimit: 10,
      timeBudgetMinutes: 10, // 30 cards
      now: T0,
    });
    expect(plan.plannedReview).toBe(30);
    expect(plan.plannedNew).toBe(0);
  });

  it('never plans more new words than available', () => {
    const plan = buildSessionPlan({
      dueWordIds: [],
      newWordIds: ['n1'],
      dailyReviewLimit: 80,
      dailyNewLimit: 20,
      timeBudgetMinutes: 60,
      now: T0,
    });
    expect(plan.plannedNew).toBe(1);
  });

  it('interleaves new words between review blocks', () => {
    const items = interleavePlan([
      ...basePlan(['r1', 'r2', 'r3', 'r4', 'r5', 'r6', 'r7', 'r8', 'r9'], 'review'),
      ...basePlan(['n1', 'n2'], 'new'),
    ]);
    expect(items).toHaveLength(11);
    const firstNewIndex = items.findIndex((i) => i.kind === 'new');
    expect(firstNewIndex).toBeGreaterThan(0);
    expect(firstNewIndex).toBeLessThan(9);
  });
});

describe('short-term requeue', () => {
  const makeSession = () => createSession({
    id: 's1',
    plan: basePlan(['w1', 'w2', 'w3', 'w4']),
    mode: 'mixed',
    reviewMode: 'en-zh',
    deckIds: [],
    now: T0,
  });

  it('shows cards in order before any replay', () => {
    const session = makeSession();
    expect(pickNextCard(session)).toEqual({ wordId: 'w1', source: 'main' });
  });

  it('never repeats the same word immediately after itself', () => {
    let session = makeSession();
    expect(pickNextCard(session)?.wordId).toBe('w1');
    session = advanceSession(session, { rating: 'forgot', wasNew: true, source: 'main', wordId: 'w1', now: T0 });
    // w1 is requeued but not allowed to appear right away.
    expect(pickNextCard(session)?.wordId).toBe('w2');
    expect(session.shortQueue).toHaveLength(1);
  });

  it('replays a forgotten word after the configured gap', () => {
    let session = makeSession();
    for (const wordId of ['w1', 'w2', 'w3']) {
      const next = pickNextCard(session);
      expect(next?.wordId).toBe(wordId);
      session = advanceSession(session, {
        rating: wordId === 'w1' ? 'forgot' : 'known',
        wasNew: true,
        source: next!.source,
        wordId,
        now: T0,
      });
    }
    expect(session.cursor).toBe(3);
    // Gap is satisfied now → the forgotten word returns before w4.
    expect(pickNextCard(session)).toEqual({ wordId: 'w1', source: 'short' });
    expect(pickNextCard(session)?.wordId).toBe('w1');
  });

  it('does not replay a word answered correctly', () => {
    let session = makeSession();
    session = advanceSession(session, { rating: 'known', wasNew: true, source: 'main', wordId: 'w1', now: T0 });
    expect(session.shortQueue).toHaveLength(0);
  });

  it('keeps replays separate from the long-term due queue', () => {
    let session = makeSession();
    session = advanceSession(session, { rating: 'fuzzy', wasNew: true, source: 'main', wordId: 'w1', now: T0 });
    expect(session.shortQueue[0].dueAfter).toBeGreaterThanOrEqual(SHORT_QUEUE_GAP);
    // Replay does not advance the main queue pointer.
    expect(session.mainIndex).toBe(1);
    expect(session.sequence).toHaveLength(4);
  });

  it('reports progress from the main queue and pending replays separately', () => {
    let session = makeSession();
    session = advanceSession(session, { rating: 'forgot', wasNew: true, source: 'main', wordId: 'w1', now: T0 });
    const progress = sessionProgress(session);
    expect(progress.done).toBe(1);
    expect(progress.total).toBe(4);
    expect(progress.replaysPending).toBe(1);
  });

  it('finishes only when both queues are empty', () => {
    let session = makeSession();
    session = advanceSession(session, { rating: 'forgot', wasNew: true, source: 'main', wordId: 'w1', now: T0 });
    for (const wordId of ['w2', 'w3', 'w4']) {
      session = advanceSession(session, { rating: 'known', wasNew: true, source: 'main', wordId, now: T0 });
    }
    // w1 still pending in the short queue.
    expect(pickNextCard(session)).toEqual({ wordId: 'w1', source: 'short' });
    session = advanceSession(session, { rating: 'known', wasNew: false, source: 'short', wordId: 'w1', now: T0 });
    expect(pickNextCard(session)).toBeNull();
    const finished = finishSession(session, T0 + 60_000);
    expect(finished.status).toBe('completed');
    expect(finished.endedAt).toBe(T0 + 60_000);
  });
});
