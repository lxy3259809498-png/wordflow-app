import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import Dexie from 'dexie';
import { WordFlowDB } from '@/lib/db/db';

/**
 * v1 → v2 migration. The critical guarantee: user tables (states, logs,
 * sessions, stats) must survive untouched while new word fields are back-filled.
 */

let counter = 0;
let dbName: string;

/** Build a v1-shaped database with exactly the old schema and old row shapes. */
async function createV1Database(name: string) {
  const v1 = new Dexie(name);
  v1.version(1).stores({
    words: 'id, &normalizedTerm, term',
    decks: 'id, examType, name',
    deckWords: 'id, deckId, wordId, &[deckId+wordId]',
    userWordStates: 'id, &wordId, state, nextReviewAt, isInErrorBook, isStarred, deckId',
    reviewLogs: 'id, &eventId, wordId, sessionId, reviewedAt, dateKey, rating',
    sessions: 'id, status, updatedAt',
    dailyStats: '&dateKey',
    achievements: 'id, &code',
    importBatches: 'id, deckId, createdAt',
    aiExamples: 'wordId',
    meta: 'key',
  });
  await v1.open();

  await v1.table('words').put({
    id: 'cet4-001',
    term: 'abandon',
    normalizedTerm: 'abandon',
    phonetic: '/əˈbændən/',
    partOfSpeech: 'v.',
    definitions: ['放弃'],
    examples: [{ en: 'They abandoned it.', zh: '他们放弃了。' }],
    tags: ['高频'],
    source: 'demo',
    licenseNote: 'CC BY 4.0',
    mnemonic: null,
    createdAt: 1000,
    updatedAt: 1000,
  });
  await v1.table('decks').put({
    id: 'deck-cet4-demo',
    name: 'CET-4 演示词书',
    examType: 'CET4',
    description: 'demo',
    source: 'demo',
    licenseNote: 'CC BY 4.0',
    createdAt: 1000,
    updatedAt: 1000,
  });
  await v1.table('deckWords').put({
    id: 'deck-cet4-demo:cet4-001',
    deckId: 'deck-cet4-demo',
    wordId: 'cet4-001',
    createdAt: 1000,
  });
  await v1.table('userWordStates').put({
    id: 'state-1',
    wordId: 'cet4-001',
    deckId: 'deck-cet4-demo',
    state: 'review',
    difficulty: 5.2,
    stability: 42.1,
    scheduledDays: 42,
    lastReviewedAt: 1700000000000,
    nextReviewAt: 1703600000000,
    repetitionCount: 7,
    lapseCount: 2,
    correctCount: 5,
    estimatedRecall: 0.91,
    fuzzyStreak: 0,
    isStarred: true,
    isInErrorBook: true,
    algorithmVersion: 'wf-fsrs-4.5-lite',
    createdAt: 1600000000000,
    updatedAt: 1700000000000,
  });
  await v1.table('reviewLogs').put({
    id: 'log-1',
    eventId: 'evt-1',
    wordId: 'cet4-001',
    sessionId: 's-1',
    rating: 'known',
    reviewMode: 'en-zh',
    reviewedAt: 1700000000000,
    dateKey: '2023-11-15',
    elapsedMs: 3000,
    scheduledDaysBefore: 1,
    scheduledDaysAfter: 42,
    stateBefore: 'review',
    stateAfter: 'review',
    wasCorrect: true,
    algorithmVersion: 'wf-fsrs-4.5-lite',
  });
  await v1.table('sessions').put({
    id: 's-1',
    startedAt: 1699999000000,
    endedAt: null,
    status: 'active',
    mode: 'mixed',
    reviewMode: 'en-zh',
    deckIds: [],
    plannedNewCount: 1,
    plannedReviewCount: 0,
    plan: [],
    sequence: ['cet4-001'],
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
    updatedAt: 1700000000000,
  });
  await v1.table('dailyStats').put({
    dateKey: '2023-11-15',
    studiedCount: 1,
    reviewedCount: 0,
    newCount: 1,
    correctCount: 1,
    fuzzyCount: 0,
    forgotCount: 0,
    durationSeconds: 30,
    goalCompleted: false,
    xpEarned: 7,
    updatedAt: 1700000000000,
  });
  await v1.table('meta').put({ key: 'seeded', value: true });
  v1.close();
}

beforeEach(() => {
  counter += 1;
  dbName = `wordflow-migrate-${counter}`;
});

afterEach(async () => {
  await Dexie.delete(dbName);
});

describe('IndexedDB v1 → v2 migration', () => {
  it('preserves every user row while back-filling new word fields', async () => {
    await createV1Database(dbName);

    // Open with the current (v2) schema — Dexie runs the upgrade.
    const upgraded = new WordFlowDB(dbName);
    await upgraded.open();

    // User data is byte-for-byte intact.
    const state = await upgraded.userWordStates.get('state-1');
    expect(state).toMatchObject({
      state: 'review',
      stability: 42.1,
      difficulty: 5.2,
      repetitionCount: 7,
      lapseCount: 2,
      isStarred: true,
      isInErrorBook: true,
      nextReviewAt: 1703600000000,
    });

    const logs = await upgraded.reviewLogs.toArray();
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ eventId: 'evt-1', rating: 'known', dateKey: '2023-11-15' });

    const sessions = await upgraded.sessions.toArray();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].status).toBe('active');

    expect(await upgraded.dailyStats.get('2023-11-15')).toMatchObject({ xpEarned: 7 });

    // Word rows gained the new fields.
    const word = await upgraded.words.get('cet4-001');
    expect(word?.phonetic).toBe('/əˈbændən/');
    expect(word?.phoneticUS).toBe('/əˈbændən/');
    expect(word?.phoneticUK).toBe('/əˈbændən/');
    expect(word?.audioUS).toBeNull();
    expect(word?.audioUK).toBeNull();
    expect(word?.translations).toEqual([]);

    // Deck rows gained the demo flag.
    const deck = await upgraded.decks.get('deck-cet4-demo');
    expect(deck?.isDemo).toBe(true);

    upgraded.close();
  });

  it('keeps the unique normalizedTerm index working after migration', async () => {
    await createV1Database(dbName);
    const upgraded = new WordFlowDB(dbName);
    await upgraded.open();

    await expect(
      upgraded.words.add({
        id: 'dupe',
        term: 'Abandon',
        normalizedTerm: 'abandon',
        phonetic: '',
        phoneticUS: '',
        phoneticUK: '',
        partOfSpeech: 'v.',
        definitions: ['重复'],
        examples: [],
        translations: [],
        audioUS: null,
        audioUK: null,
        tags: [],
        source: 'x',
        licenseNote: 'x',
        mnemonic: null,
        createdAt: 0,
        updatedAt: 0,
      }),
    ).rejects.toThrow();

    upgraded.close();
  });

  it('is idempotent: reopening an upgraded database is a no-op', async () => {
    await createV1Database(dbName);
    const first = new WordFlowDB(dbName);
    await first.open();
    first.close();

    const second = new WordFlowDB(dbName);
    await second.open();
    expect(await second.words.count()).toBe(1);
    expect(await second.userWordStates.count()).toBe(1);
    const word = await second.words.get('cet4-001');
    // Back-fill must not overwrite with an empty value on the second open.
    expect(word?.phoneticUS).toBe('/əˈbændən/');
    second.close();
  });
});
