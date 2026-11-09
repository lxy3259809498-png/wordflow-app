import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WordFlowDB } from '@/lib/db/db';
import {
  LEGACY_DEMO_DECK_IDS,
  SEED_VERSION,
  prepareDb,
  removeLegacyDemoDecks,
  seedDemoData,
} from '@/lib/db/bootstrap';
import { GENERATED_DECK_INDEX } from '@/lib/db/seedDecks.generated';
import { deleteDeck } from '@/lib/data/repository';
import { makeTestWord } from '@/test/factories';

let counter = 0;
let database: WordFlowDB;

beforeEach(async () => {
  counter += 1;
  database = new WordFlowDB(`wordflow-seed-${counter}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

describe('built-in vocabulary seeding', () => {
  it('seeds only the eight ECDICT decks on a fresh install', async () => {
    const result = await prepareDb(database);
    const expectedDecks = GENERATED_DECK_INDEX.length;
    expect(result.decksAdded).toBe(expectedDecks);
    // `wordsAdded` counts unique Word rows (the pool), not deck links.
    expect(result.wordsAdded).toBeGreaterThan(14000);

    expect(await database.decks.count()).toBe(expectedDecks);
    // Words are deduplicated globally; deck links are not.
    expect(await database.words.count()).toBeGreaterThan(14000);
    expect(await database.deckWords.count()).toBeGreaterThan(38000);

    // No hand-written demo deck survives in a fresh install.
    const decks = await database.decks.toArray();
    expect(decks.filter((deck) => deck.isDemo)).toHaveLength(0);
    expect(decks.map((deck) => deck.id).sort()).toEqual(
      GENERATED_DECK_INDEX.map((entry) => `deck-${entry.id}`).sort(),
    );

    const meta = await database.meta.get('seeded');
    expect(meta?.value).toBe(true);
    const version = await database.meta.get('seedVersion');
    expect(version?.value).toBe(SEED_VERSION);
  });

  it('is idempotent: running twice does not duplicate anything', async () => {
    await prepareDb(database);
    const before = {
      decks: await database.decks.count(),
      words: await database.words.count(),
      links: await database.deckWords.count(),
    };

    await prepareDb(database);
    expect(await database.decks.count()).toBe(before.decks);
    expect(await database.words.count()).toBe(before.words);
    expect(await database.deckWords.count()).toBe(before.links);
  });

  it('upgrades an old install by adding the missing decks and deleting old demo decks', async () => {
    // Simulate the previous release: two hand-written demo decks, seedVersion 1,
    // plus a learner's own progress that must survive the migration.
    const demoWord = makeTestWord({ id: 'cet4-001', term: 'abandon', normalizedTerm: 'abandon' });
    const demoDeckId = 'deck-cet4-demo';
    await database.decks.put({
      id: demoDeckId,
      name: 'CET-4 演示词书',
      examType: 'CET4',
      description: 'old sample deck',
      source: 'demo',
      licenseNote: 'demo',
      isDemo: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await database.words.put(demoWord);
    await database.deckWords.put({
      id: `${demoDeckId}:${demoWord.id}`,
      deckId: demoDeckId,
      wordId: demoWord.id,
      createdAt: 1,
    });
    await database.meta.put({ key: 'seeded', value: true });
    await database.meta.put({ key: 'seedVersion', value: 1 });

    await database.userWordStates.put({
      id: 'state-1',
      wordId: demoWord.id,
      deckId: demoDeckId,
      state: 'review',
      difficulty: 4,
      stability: 12,
      scheduledDays: 12,
      lastReviewedAt: 1000,
      nextReviewAt: 2000,
      repetitionCount: 3,
      lapseCount: 1,
      correctCount: 2,
      estimatedRecall: 0.9,
      fuzzyStreak: 0,
      isStarred: true,
      isInErrorBook: true,
      algorithmVersion: 'wf-fsrs-4.5-lite',
      createdAt: 1000,
      updatedAt: 1000,
    });

    const result = await prepareDb(database);
    expect(result.decksRemoved).toBe(1);
    expect(result.decksAdded).toBe(GENERATED_DECK_INDEX.length);

    // The old demo deck is gone; the eight real decks arrived.
    expect(await database.decks.get(demoDeckId)).toBeUndefined();
    expect(await database.decks.count()).toBe(GENERATED_DECK_INDEX.length);
    expect(await database.words.count()).toBeGreaterThan(14000);
    expect(await database.deckWords.count()).toBeGreaterThan(38000);

    // The learner's progress is untouched, and so is the word it points at.
    const state = await database.userWordStates.get('state-1');
    expect(state?.stability).toBe(12);
    expect(state?.isStarred).toBe(true);
    expect(await database.userWordStates.count()).toBe(1);
    expect(await database.words.get(demoWord.id)).toBeTruthy();

    const version = await database.meta.get('seedVersion');
    expect(version?.value).toBe(SEED_VERSION);
  });

  it('removes legacy demo decks without touching reviewed words', async () => {
    const studied = makeTestWord({ id: 'w-studied', term: 'abandon', normalizedTerm: 'abandon' });
    const unstudied = makeTestWord({ id: 'w-unstudied', term: 'zebra', normalizedTerm: 'zebra' });
    await database.decks.put({
      id: LEGACY_DEMO_DECK_IDS[0],
      name: 'CET-4 演示词书',
      examType: 'CET4',
      description: '',
      source: 'demo',
      licenseNote: 'demo',
      isDemo: true,
      createdAt: 1,
      updatedAt: 1,
    });
    await database.words.bulkPut([studied, unstudied]);
    await database.deckWords.bulkPut([
      {
        id: `${LEGACY_DEMO_DECK_IDS[0]}:${studied.id}`,
        deckId: LEGACY_DEMO_DECK_IDS[0],
        wordId: studied.id,
        createdAt: 1,
      },
      {
        id: `${LEGACY_DEMO_DECK_IDS[0]}:${unstudied.id}`,
        deckId: LEGACY_DEMO_DECK_IDS[0],
        wordId: unstudied.id,
        createdAt: 2,
      },
    ]);
    await database.reviewLogs.put({
      id: 'log-1',
      eventId: 'evt-1',
      wordId: studied.id,
      sessionId: 's-1',
      rating: 'known',
      reviewMode: 'en-zh',
      reviewedAt: 1000,
      dateKey: '1970-01-01',
      elapsedMs: 1200,
      scheduledDaysBefore: 0,
      scheduledDaysAfter: 1,
      stateBefore: 'new',
      stateAfter: 'learning',
      wasCorrect: true,
      algorithmVersion: 'wf-fsrs-4.5-lite',
    });

    const result = await removeLegacyDemoDecks(database);
    expect(result.decksRemoved).toBe(1);
    expect(result.wordsRemoved).toBe(1);

    expect(await database.decks.count()).toBe(0);
    // The reviewed word stays (its log would otherwise dangle)…
    expect(await database.words.get(studied.id)).toBeTruthy();
    // …the unreviewed one is cleaned up.
    expect(await database.words.get(unstudied.id)).toBeUndefined();
    expect(await database.reviewLogs.count()).toBe(1);
  });

  it('does not resurrect a built-in deck the user deleted', async () => {
    // A synthetic bundled deck keeps this test fast: deleting a real 3,800-word
    // deck through fake-indexeddb takes minutes (it maintains a compound index
    // per row), while the tombstone logic under test is identical.
    const deckId = `deck-${GENERATED_DECK_INDEX[0].id}`;
    await database.decks.put({
      id: deckId,
      name: 'placeholder',
      examType: GENERATED_DECK_INDEX[0].examType as never,
      description: '',
      source: 'ECDICT',
      licenseNote: 'MIT',
      isDemo: false,
      createdAt: 1,
      updatedAt: 1,
    });
    await database.meta.put({ key: 'seeded', value: true });
    await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });

    const result = await deleteDeck(deckId, Date.now(), database);
    expect(result.ok).toBe(true);

    const seed = await seedDemoData(database, { onlyMissing: true });
    // The other seven decks are legitimately missing, so they are seeded…
    expect(seed.decksAdded).toBe(GENERATED_DECK_INDEX.length - 1);
    // …but the deleted one stays deleted: the tombstone wins over "missing".
    expect(await database.decks.get(deckId)).toBeUndefined();
  }, 60000);
});
