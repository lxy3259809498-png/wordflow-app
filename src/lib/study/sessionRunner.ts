import { db, type WordFlowDB } from '@/lib/db/db';
import { isUnstudied } from '@/lib/data/repository';
import { DEFAULT_SETTINGS } from '@/lib/settings/settings';
import type { AppSettings, ReviewMode, StudySession, Word } from '@/lib/types';
import { buildSessionPlan, createSession, interleavePlan } from '@/lib/study/session';
import { orderWords, type WordOrder } from '@/lib/study/ordering';

export type StartMode = 'mixed' | 'new' | 'review' | 'mistakes';

export interface StartResult {
  session: StudySession | null;
  reason?: 'no-words' | 'no-due' | 'no-new' | 'no-mistakes';
  counts: { due: number; fresh: number; mistakes: number; plannedNew: number; plannedReview: number };
  pressure?: boolean;
}

export interface PlanPreview {
  due: number;
  fresh: number;
  mistakes: number;
  plannedNew: number;
  plannedReview: number;
  estimatedMinutes: number;
  pressure: boolean;
  reason?: 'no-words' | 'no-due' | 'no-new' | 'no-mistakes';
}

interface Queues {
  scopedCount: number;
  due: QueueWord[];
  fresh: QueueWord[];
  mistakes: QueueWord[];
}

/** The minimum a queue needs: id for planning, plus fields used to order by term. */
type QueueWord = { id: string; term: string; normalizedTerm: string; tags?: string[] };

/**
 * Collects the due / new / weak queues for the selected decks.
 *
 * Performance note: this used to call `words.toArray()`, loading all ~14.9k full
 * word records (definitions, phonetics, examples…) on every deck-selection
 * change. That cost 5–10 s per click and blocked the main thread. Now:
 *   - `deckWords` is read once and filtered in memory (small: id/deckId/wordId),
 *   - only the scoped word ids are fetched, and only the ordering fields,
 *   - full Word rows are loaded later for just the cards actually planned.
 *
 * `hydrate` is used by `startSession` to build the real plan; the preview path
 * skips it entirely because it only needs counts.
 */
async function collectQueues(
  database: WordFlowDB,
  deckIds: string[],
  now: number,
  order: WordOrder = 'alphabetical',
  seed = 'wordflow',
): Promise<Queues & { idsByQueue: { due: string[]; fresh: string[]; mistakes: string[] } }> {
  // 1) Which words belong to the selected decks (tiny rows, indexed by deckId).
  const deckWordRows =
    deckIds.length === 0
      ? await database.deckWords.toArray()
      : await database.deckWords.where('deckId').anyOf(deckIds).toArray();
  const allowed = new Set(deckWordRows.map((link) => link.wordId));
  const scopedCount = allowed.size;

  // 2) Only the ids + sort keys for those words, not whole records.
  const scopedIds = [...allowed];
  const states = await database.userWordStates.toArray();
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));

  // 3) Fetch minimal word rows in chunks to keep each transaction small.
  const words: QueueWord[] = [];
  const CHUNK = 2000;
  for (let i = 0; i < scopedIds.length; i += CHUNK) {
    const slice = scopedIds.slice(i, i + CHUNK);
    const rows = await database.words.bulkGet(slice);
    for (const row of rows) {
      if (row) words.push({ id: row.id, term: row.term, normalizedTerm: row.normalizedTerm });
    }
  }

  const due: QueueWord[] = [];
  const fresh: QueueWord[] = [];
  const mistakes: QueueWord[] = [];
  for (const word of words) {
    const state = stateByWord.get(word.id);
    if (isUnstudied(state)) {
      fresh.push(word);
      continue;
    }
    if (state && state.nextReviewAt !== null && state.nextReviewAt <= now) due.push(word);
    // "Weak" = explicitly in the error book or manually starred for extra practice.
    if (state?.isInErrorBook || state?.isStarred) mistakes.push(word);
  }

  const lapseByWord = new Map(states.map((s) => [s.wordId, s.lapseCount]));
  const fuzzyByWord = new Map(states.map((s) => [s.wordId, s.fuzzyStreak]));
  void seed;

  // Due cards stay earliest-first (that is the scheduler's order); the learner's
  // ordering choice applies to the new-word queue.
  due.sort(
    (a, b) =>
      (stateByWord.get(a.id)?.nextReviewAt ?? 0) - (stateByWord.get(b.id)?.nextReviewAt ?? 0),
  );
  const orderedFresh = orderWords(fresh, order, seed, { lapseByWord, fuzzyByWord });
  mistakes.sort((a, b) => {
    const sa = stateByWord.get(a.id);
    const sb = stateByWord.get(b.id);
    const dueA = (sa?.nextReviewAt ?? 0) <= now ? 0 : 1;
    const dueB = (sb?.nextReviewAt ?? 0) <= now ? 0 : 1;
    if (dueA !== dueB) return dueA - dueB;
    return (sb?.lapseCount ?? 0) - (sa?.lapseCount ?? 0);
  });

  return {
    scopedCount,
    due,
    fresh: orderedFresh,
    mistakes,
    idsByQueue: {
      due: due.map((w) => w.id),
      fresh: orderedFresh.map((w) => w.id),
      mistakes: mistakes.map((w) => w.id),
    },
  };
}

/**
 * Loads full Word rows for a set of ids.
 *
 * `startSession` and `previewStudyPlan` only need ids and counts, so they never
 * call this. The study screen loads the cards it is about to show, one at a
 * time — that keeps deck switching fast even with a 14.9k-word pool.
 */
export async function loadWordsByIds(
  ids: string[],
  database: WordFlowDB = db,
): Promise<Map<string, Word>> {
  const rows = await database.words.bulkGet(ids);
  const map = new Map<string, Word>();
  for (const row of rows) if (row) map.set(row.id, row);
  return map;
}

export interface PlanOptions {
  mode: StartMode;
  deckIds: string[];
  settings: AppSettings;
  now: number;
  timeBudgetMinutes?: number;
  /** Overrides settings.wordOrder for this session. */
  wordOrder?: WordOrder;
  /** Seed for the `random` order (kept stable when resuming). */
  seed?: string;
  database?: WordFlowDB;
}

/**
 * Dry-run of the session planner so the setup screen can show exactly how many
 * reviews/new words will be queued — no session row is written.
 */
export async function previewStudyPlan(options: PlanOptions): Promise<PlanPreview> {
  const database = options.database ?? db;
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const timeBudget = options.timeBudgetMinutes ?? settings.timeBudgetMinutes;
  const { scopedCount, due, fresh, mistakes } = await collectQueues(
    database,
    options.deckIds,
    options.now,
    options.wordOrder ?? settings.wordOrder,
    options.seed,
  );

  if (scopedCount === 0) {
    return {
      due: 0,
      fresh: 0,
      mistakes: 0,
      plannedNew: 0,
      plannedReview: 0,
      estimatedMinutes: 0,
      pressure: false,
      reason: 'no-words',
    };
  }

  if (options.mode === 'mistakes') {
    const plannedReview = Math.min(mistakes.length, settings.dailyReviewLimit || mistakes.length);
    return {
      due: due.length,
      fresh: fresh.length,
      mistakes: mistakes.length,
      plannedNew: 0,
      plannedReview,
      estimatedMinutes: Math.ceil((plannedReview * 20) / 60),
      pressure: false,
      reason: mistakes.length === 0 ? 'no-mistakes' : undefined,
    };
  }

  const plan = buildSessionPlan({
    dueWordIds: options.mode === 'new' ? [] : due.map((w) => w.id),
    newWordIds: options.mode === 'review' ? [] : fresh.map((w) => w.id),
    dailyReviewLimit: settings.dailyReviewLimit,
    dailyNewLimit: settings.dailyNewLimit,
    timeBudgetMinutes: timeBudget,
    now: options.now,
  });

  const total = plan.items.length;
  const reason =
    total > 0
      ? undefined
      : options.mode === 'review'
        ? 'no-due'
        : options.mode === 'new'
          ? 'no-new'
          : 'no-due';

  return {
    due: due.length,
    fresh: fresh.length,
    mistakes: mistakes.length,
    plannedNew: plan.plannedNew,
    plannedReview: plan.plannedReview,
    estimatedMinutes: Math.max(1, Math.ceil((total * 20) / 60)),
    pressure: plan.pressure,
    reason,
  };
}

export async function startSession(options: PlanOptions & { reviewMode?: ReviewMode }): Promise<StartResult> {
  const database = options.database ?? db;
  const settings = options.settings ?? DEFAULT_SETTINGS;
  const timeBudget = options.timeBudgetMinutes ?? settings.timeBudgetMinutes;
  const reviewMode = options.reviewMode ?? settings.reviewMode;
  const sessionId = `s-${options.now}-${Math.random().toString(36).slice(2, 8)}`;
  const { scopedCount, due, fresh, mistakes } = await collectQueues(
    database,
    options.deckIds,
    options.now,
    options.wordOrder ?? settings.wordOrder,
    // Seed with the session id so `random` stays fixed for this session.
    options.seed ?? sessionId,
  );

  if (scopedCount === 0) {
    return {
      session: null,
      reason: 'no-words',
      counts: { due: 0, fresh: 0, mistakes: 0, plannedNew: 0, plannedReview: 0 },
    };
  }

  if (options.mode === 'mistakes') {
    if (mistakes.length === 0) {
      return {
        session: null,
        reason: 'no-mistakes',
        counts: { due: due.length, fresh: fresh.length, mistakes: 0, plannedNew: 0, plannedReview: 0 },
      };
    }
    const plan = mistakes
      .slice(0, settings.dailyReviewLimit || mistakes.length)
      .map((word) => ({ wordId: word.id, kind: 'review' as const, dueAt: null }));
    const session = createSession({
      id: sessionId,
      plan,
      mode: 'mistakes',
      reviewMode,
      deckIds: options.deckIds,
      now: options.now,
    });
    await database.sessions.put(session);
    return {
      session,
      counts: {
        due: due.length,
        fresh: fresh.length,
        mistakes: mistakes.length,
        plannedNew: 0,
        plannedReview: plan.length,
      },
    };
  }

  const plan = buildSessionPlan({
    dueWordIds: options.mode === 'new' ? [] : due.map((w) => w.id),
    newWordIds: options.mode === 'review' ? [] : fresh.map((w) => w.id),
    dailyReviewLimit: settings.dailyReviewLimit,
    dailyNewLimit: settings.dailyNewLimit,
    timeBudgetMinutes: timeBudget,
    now: options.now,
  });

  if (plan.items.length === 0) {
    const reason =
      options.mode === 'review' ? 'no-due' : options.mode === 'new' ? 'no-new' : 'no-due';
    return {
      session: null,
      reason,
      counts: {
        due: due.length,
        fresh: fresh.length,
        mistakes: mistakes.length,
        plannedNew: 0,
        plannedReview: 0,
      },
    };
  }

  const session = createSession({
    id: sessionId,
    plan: interleavePlan(plan.items),
    mode: options.mode,
    reviewMode,
    deckIds: options.deckIds,
    now: options.now,
  });
  await database.sessions.put(session);
  return {
    session,
    pressure: plan.pressure,
    counts: {
      due: due.length,
      fresh: fresh.length,
      mistakes: mistakes.length,
      plannedNew: plan.plannedNew,
      plannedReview: plan.plannedReview,
    },
  };
}

export async function findResumableSession(
  now: number,
  database: WordFlowDB = db,
): Promise<StudySession | undefined> {
  const sessions = await database.sessions.toArray();
  const twelveHours = 12 * 60 * 60 * 1000;
  return sessions
    .filter(
      (s) => (s.status === 'active' || s.status === 'paused') && now - s.updatedAt < twelveHours,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt)[0];
}
