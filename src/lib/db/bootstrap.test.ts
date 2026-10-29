import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { WordFlowDB } from '@/lib/db/db';
import { SEED_VERSION, prepareDb, seedDemoData } from '@/lib/db/bootstrap';
import { getDemoWords } from '@/lib/db/seed';
import { GENERATED_DECK_INDEX } from '@/lib/db/seedDecks.generated';
import { deleteDeck } from '@/lib/data/repository';

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

describe('demo seeding + migration', () => {
  it('seeds every deck (sample + full exam lists) on a fresh install', async () => {
    const result = await prepareDb(database);
    const expectedDecks = getDemoWords().length + GENERATED_DECK_INDEX.length;
    expect(result.decksAdded).toBe(expectedDecks);
    // `wordsAdded` counts unique Word rows (the pool), not deck links.
    expect(result.wordsAdded).toBeGreaterThan(14000);

    expect(await database.decks.count()).toBe(expectedDecks);
    // Words are deduplicated globally; deck links are not.
    expect(await database.words.count()).toBeGreaterThan(14000);
    expect(await database.deckWords.count()).toBeGreaterThan(38000);

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

  it('upgrades an old install (v1, 2 decks) by adding only the missing decks', async () => {
    // Simulate the previous release: two CET decks, seedVersion 1, plus a
    // learner's own progress that must survive the migration.
    const demo = getDemoWords().slice(0, 2);
    for (const { deck, words } of demo) {
      await database.decks.put(deck);
      await database.words.bulkPut(words);
      await database.deckWords.bulkPut(
        words.map((word) => ({
          id: `${deck.id}:${word.id}`,
          deckId: deck.id,
          wordId: word.id,
          createdAt: deck.createdAt,
        })),
      );
    }
    await database.meta.put({ key: 'seeded', value: true });
    await database.meta.put({ key: 'seedVersion', value: 1 });

    const learnedWord = demo[0].words[0];
    await database.userWordStates.put({
      id: 'state-1',
      wordId: learnedWord.id,
      deckId: demo[0].deck.id,
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
    // 9 hand-written sample decks + 8 full ECDICT decks ship by default.
    const expectedDecks = getDemoWords().length + GENERATED_DECK_INDEX.length;
    expect(result.decksAdded).toBe(expectedDecks - 2);
    // Deduplicated pool: words shared with the 2 pre-existing decks are skipped.
    expect(result.wordsAdded).toBeGreaterThan(14000);

    // New decks arrived…
    expect(await database.decks.count()).toBe(expectedDecks);
    // …with the real vocabulary sizes (deduplicated word pool).
    expect(await database.words.count()).toBeGreaterThan(14000);
    expect(await database.deckWords.count()).toBeGreaterThan(38000);
    // …and the learner's progress is untouched.
    const state = await database.userWordStates.get('state-1');
    expect(state?.stability).toBe(12);
    expect(state?.isStarred).toBe(true);
    expect(await database.userWordStates.count()).toBe(1);
    const version = await database.meta.get('seedVersion');
    expect(version?.value).toBe(SEED_VERSION);
  });

  it('does not resurrect a demo deck the user deleted', async () => {
    await prepareDb(database);
    const demo = getDemoWords();
    const removed = demo[3].deck.id;

    // Deleting through the repository leaves a tombstone.
    const result = await deleteDeck(removed, Date.now(), database);
    expect(result.ok).toBe(true);
    await database.meta.put({ key: 'seedVersion', value: SEED_VERSION - 1 });

    const seed = await seedDemoData(database, { onlyMissing: true });
    expect(seed.decksAdded).toBe(0);
    expect(await database.decks.get(removed)).toBeUndefined();
  });
});
