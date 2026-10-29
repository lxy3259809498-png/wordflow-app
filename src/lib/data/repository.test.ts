import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WordFlowDB } from '@/lib/db/db';
import {
  applyImport,
  commitReview,
  createCustomDeck,
  deckStats,
  evaluateAchievements,
  exportBackup,
  getAchievements,
  getReviewLogsForWord,
  listImportBatches,
  restoreBackup,
  setErrorBook,
  undoImport,
} from '@/lib/data/repository';
import { createSession } from '@/lib/study/session';
import { parseWordCsv } from '@/lib/import/wordImport';
import { makeTestWord } from '@/test/factories';
import type { Deck, ReviewLog, StudySession, UserWordState, Word } from '@/lib/types';
import { toDateKey } from '@/lib/time';

const T0 = Date.UTC(2026, 4, 1, 9, 0, 0); // 2026-05-01
let counter = 0;
let database: WordFlowDB;

function makeWord(id: string, term: string): Word {
  return makeTestWord({
    id,
    term,
    phonetic: '/test/',
    partOfSpeech: 'n.',
    definitions: ['测试释义'],
    examples: [{ en: `Example with ${term}.`, zh: '例句。' }],
    tags: ['test'],
    source: 'test',
    licenseNote: 'CC0',
    createdAt: T0,
    updatedAt: T0,
  });
}

function makeDeck(id: string): Deck {
  return {
    id,
    name: `Deck ${id}`,
    examType: 'custom',
    description: 'test deck',
    source: 'test',
    licenseNote: 'CC0',
    createdAt: T0,
    updatedAt: T0,
  };
}

async function seedWords(words: Word[], deck = makeDeck('deck-1')) {
  await database.decks.put(deck);
  await database.words.bulkPut(words);
  await database.deckWords.bulkPut(
    words.map((word) => ({ id: `link-${word.id}`, deckId: deck.id, wordId: word.id, createdAt: T0 })),
  );
  return deck;
}

function makeStudySession(planIds: string[], id = 'session-1'): StudySession {
  return createSession({
    id,
    plan: planIds.map((wordId) => ({ wordId, kind: 'new' as const, dueAt: null })),
    mode: 'mixed',
    reviewMode: 'en-zh',
    deckIds: ['deck-1'],
    now: T0,
  });
}

async function review(
  session: StudySession,
  word: Word,
  rating: ReviewLog['rating'],
  eventId: string,
  now = T0,
): Promise<StudySession> {
  const next: StudySession = {
    ...session,
    cursor: session.cursor + 1,
    mainIndex: session.mainIndex + 1,
    completedWordIds: [...new Set([...session.completedWordIds, word.id])],
  };
  await commitReview({
    session,
    word,
    rating,
    reviewMode: 'en-zh',
    eventId,
    elapsedMs: 4200,
    now,
    nextSession: next,
    database,
  });
  return next;
}

beforeEach(async () => {
  counter += 1;
  database = new WordFlowDB(`wordflow-test-${counter}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('local repository — review commits', () => {
  it('persists state, log, session and daily stats for one rating', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const session = makeStudySession(['w1']);
    await review(session, word, 'known', 'evt-1');

    const state = await database.userWordStates.where('wordId').equals('w1').first();
    expect(state?.state).toBe('review');
    expect(state?.nextReviewAt).toBeGreaterThan(T0);
    expect(state?.repetitionCount).toBe(1);

    const logs = await database.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({
      wordId: 'w1',
      rating: 'known',
      dateKey: toDateKey(T0),
      stateBefore: 'new',
      wasCorrect: true,
      scheduledDaysBefore: 0,
    });
    expect(logs[0].scheduledDaysAfter).toBeGreaterThan(0);

    const saved = await database.sessions.get('session-1');
    expect(saved?.completedWordIds).toContain('w1');

    const stats = await database.dailyStats.get(toDateKey(T0));
    expect(stats?.studiedCount).toBe(1);
    expect(stats?.newCount).toBe(1);
    expect(stats?.correctCount).toBe(1);
    expect(stats?.xpEarned).toBeGreaterThan(0);
  });

  it('is idempotent: replaying the same event id does not double count', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const session = makeStudySession(['w1']);
    const next = await review(session, word, 'known', 'evt-1');

    const firstStats = await database.dailyStats.get(toDateKey(T0));
    const repeat = await commitReview({
      session,
      word,
      rating: 'forgot',
      reviewMode: 'en-zh',
      eventId: 'evt-1',
      elapsedMs: 1000,
      now: T0 + 30_000,
      nextSession: next,
      database,
    });

    expect(repeat.duplicate).toBe(true);
    expect(await database.reviewLogs.count()).toBe(1);
    const stats = await database.dailyStats.get(toDateKey(T0));
    expect(stats?.xpEarned).toBe(firstStats?.xpEarned);
    expect(stats?.forgotCount).toBe(0);
  });

  it('keeps a single memory state per word even after repeated reviews', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    let session = makeStudySession(['w1', 'w1']);
    session = await review(session, word, 'forgot', 'evt-1', T0);
    await review(session, word, 'known', 'evt-2', T0 + 60_000);

    const states = await database.userWordStates.where('wordId').equals('w1').toArray();
    expect(states).toHaveLength(1);
    const logs = await getReviewLogsForWord('w1', database);
    expect(logs).toHaveLength(2);
    expect(logs[0].rating).toBe('known');
  });

  it('adds forgotten words to the error book and keeps them there', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    let session = makeStudySession(['w1']);
    session = await review(session, word, 'forgot', 'evt-1');
    let state = await database.userWordStates.where('wordId').equals('w1').first();
    expect(state?.isInErrorBook).toBe(true);
    expect(state?.lapseCount).toBe(1);

    await review(session, word, 'known', 'evt-2', T0 + 86_400_000);
    state = await database.userWordStates.where('wordId').equals('w1').first();
    expect(state?.isInErrorBook).toBe(true);
    expect(state?.state).toBe('review');
  });

  it('counts studied/reviewed correctly in the same day', async () => {
    const words = [makeWord('w1', 'abandon'), makeWord('w2', 'benefit')];
    await seedWords(words);
    let session = makeStudySession(['w1', 'w2']);
    session = await review(session, words[0], 'known', 'evt-1');
    session = await review(session, words[1], 'fuzzy', 'evt-2');
    await review(session, words[1], 'known', 'evt-3', T0 + 600_000);

    const stats = await database.dailyStats.get(toDateKey(T0));
    expect(stats?.studiedCount).toBe(2);
    expect(stats?.newCount).toBe(2);
    expect(stats?.reviewedCount).toBe(1);
    expect(stats?.correctCount).toBe(2);
    expect(stats?.fuzzyCount).toBe(1);
  });

  it('unlocks achievements from real activity only once', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const session = makeStudySession(['w1']);
    await review(session, word, 'known', 'evt-1');
    await evaluateAchievements(database, T0);
    const first = await getAchievements(database);
    const step = first.find((a) => a.code === 'first-step');
    expect(step?.unlockedAt).toBe(T0);

    await evaluateAchievements(database, T0 + 500_000);
    const second = await getAchievements(database);
    expect(second.find((a) => a.code === 'first-step')?.unlockedAt).toBe(T0);
    expect(second.find((a) => a.code === 'fifty-words')?.progress).toBe(1);
  });
});

describe('deck membership + import', () => {
  it('shares one memory state across two decks containing the same word', async () => {
    const word = makeWord('w1', 'abandon');
    const deckA = makeDeck('deck-a');
    const deckB = makeDeck('deck-b');
    await database.decks.bulkPut([deckA, deckB]);
    await database.words.put(word);
    await database.deckWords.bulkPut([
      { id: 'link-a', deckId: 'deck-a', wordId: 'w1', createdAt: T0 },
      { id: 'link-b', deckId: 'deck-b', wordId: 'w1', createdAt: T0 },
    ]);
    const session = makeStudySession(['w1']);
    await review(session, word, 'known', 'evt-1');

    const states = await database.userWordStates.toArray();
    expect(states).toHaveLength(1);
    const stats = await deckStats(T0, database);
    expect(stats.find((s) => s.deckId === 'deck-a')?.learned).toBe(1);
    expect(stats.find((s) => s.deckId === 'deck-b')?.learned).toBe(1);
  });

  it('imports valid rows and skips duplicates without creating a second state', async () => {
    const deck = await createCustomDeck(
      { name: 'My list', examType: 'CET4', description: 'd', source: 'self', licenseNote: 'CC0' },
      T0,
      database,
    );
    const parsed = parseWordCsv(
      [
        'term,phonetic,partOfSpeech,definitions,exampleEn,exampleZh,tags,source,licenseNote',
        'abandon,/x/,v.,放弃,They abandoned it.,他们放弃了。,高频,self,CC0',
        'abandon,/x/,v.,放弃,They abandoned it.,他们放弃了。,高频,self,CC0',
      ].join('\n'),
      { existingTerms: new Set() },
    );
    expect(parsed.duplicates).toHaveLength(1);

    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'list.csv',
      now: T0,
      database,
    });
    expect(result.createdWords).toBe(1);
    expect(result.linkedWords).toBe(1);

    // Re-importing the same word into another deck must not duplicate the word.
    const deck2 = await createCustomDeck(
      { name: 'Second', examType: 'CET6', description: 'd', source: 'self', licenseNote: 'CC0' },
      T0,
      database,
    );
    await applyImport({
      deckId: deck2.id,
      rows: parsed.rows,
      fileName: 'list2.csv',
      now: T0,
      database,
    });
    expect(await database.words.count()).toBe(1);
    expect(await database.deckWords.count()).toBe(2);

    const word = await database.words.toCollection().first();
    const session = makeStudySession([word!.id]);
    await review(session, word!, 'known', 'evt-1');
    expect(await database.userWordStates.count()).toBe(1);
  });

  it('undoes an import and refuses once the words were studied', async () => {
    const deck = await createCustomDeck(
      { name: 'Undoable', examType: 'custom', description: 'd', source: 'self', licenseNote: 'CC0' },
      T0,
      database,
    );
    const parsed = parseWordCsv(
      'term,definitions\nabandon,放弃\nbenefit,益处\n',
    );
    const { batchId } = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'undo.csv',
      now: T0,
      database,
    });
    expect(await database.words.count()).toBe(2);

    const ok = await undoImport(batchId, T0, database);
    expect(ok.ok).toBe(true);
    expect(await database.words.count()).toBe(0);
    expect(await database.deckWords.count()).toBe(0);

    const { batchId: secondBatch } = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'undo2.csv',
      now: T0,
      database,
    });
    const word = await database.words.where('normalizedTerm').equals('abandon').first();
    const session = makeStudySession([word!.id]);
    await review(session, word!, 'known', 'evt-1');
    const refused = await undoImport(secondBatch, T0, database);
    expect(refused.ok).toBe(false);
    expect(refused.message).toContain('学习记录');
    expect((await listImportBatches(database)).length).toBe(1);
  });

  it('stores source and license metadata on imported words', async () => {
    const deck = await createCustomDeck(
      { name: 'Meta', examType: 'custom', description: 'd', source: 'self', licenseNote: 'CC0' },
      T0,
      database,
    );
    const parsed = parseWordCsv(
      'term,definitions,source,licenseNote\nabandon,放弃,学校讲义,内部授权\n',
    );
    await applyImport({ deckId: deck.id, rows: parsed.rows, fileName: 'meta.csv', now: T0, database });
    const word = await database.words.toCollection().first();
    expect(word?.source).toBe('学校讲义');
    expect(word?.licenseNote).toBe('内部授权');
  });
});

describe('manual flags', () => {
  it('creates a state row when starring a never-studied word', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    await setErrorBook('w1', true, T0, database);
    const state: UserWordState | undefined = await database.userWordStates
      .where('wordId')
      .equals('w1')
      .first();
    expect(state?.isInErrorBook).toBe(true);
    expect(state?.state).toBe('new');
  });
});

describe('backup and restore', () => {
  it('exports every table and restores them into a fresh database', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const session = makeStudySession(['w1']);
    await review(session, word, 'known', 'evt-1');

    const backup = await exportBackup(T0, database);
    expect(backup.words).toHaveLength(1);
    expect(backup.reviewLogs).toHaveLength(1);
    expect(backup.meta.app).toBe('WordFlow');

    const raw = JSON.stringify(backup);
    counter += 1;
    const fresh = new WordFlowDB(`wordflow-restore-${counter}`);
    await fresh.open();
    const result = await restoreBackup(raw, T0, fresh);
    expect(result.ok).toBe(true);
    expect(await fresh.words.count()).toBe(1);
    expect(await fresh.reviewLogs.count()).toBe(1);
    const restored = await fresh.userWordStates.where('wordId').equals('w1').first();
    expect(restored?.state).toBe('review');
    await fresh.delete();
  });

  it('leaves existing data untouched when the file is corrupt', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const before = await database.words.count();

    const result = await restoreBackup('{"meta": {"app": "WordFlow"}}', T0, database);
    expect(result.ok).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(await database.words.count()).toBe(before);
  });

  it('rejects a backup with two states for the same word', async () => {
    const word = makeWord('w1', 'abandon');
    await seedWords([word]);
    const backup = await exportBackup(T0, database);
    const duplicateState = { ...(await database.userWordStates.toArray())[0] };
    const tampered = {
      ...backup,
      userWordStates: [
        {
          id: 's1',
          wordId: 'w1',
          state: 'review',
          stability: 1,
          difficulty: 1,
          scheduledDays: 1,
          nextReviewAt: T0,
          repetitionCount: 1,
          lapseCount: 0,
          correctCount: 1,
          estimatedRecall: 0.9,
          isStarred: false,
          isInErrorBook: false,
          fuzzyStreak: 0,
          algorithmVersion: 'x',
          createdAt: T0,
          updatedAt: T0,
        },
        {
          ...duplicateState,
          id: 's2',
          wordId: 'w1',
        },
      ],
      words: backup.words,
      decks: backup.decks,
      deckWords: [],
      reviewLogs: [],
      sessions: [],
      dailyStats: [],
      achievements: [],
      aiExamples: [],
      importBatches: [],
    };
    const result = await restoreBackup(JSON.stringify(tampered), T0, database);
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toContain('重复记忆状态');
  });
});
