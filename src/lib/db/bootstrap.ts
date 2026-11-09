import { db, type WordFlowDB } from '@/lib/db/db';
import { loadGeneratedDecks } from '@/lib/db/seed';
import { ALGORITHM_VERSION } from '@/lib/scheduler';

/**
 * Seed-content version. Bump when new decks/words ship: existing databases then
 * receive only the decks they don't have yet, so user data (states, logs,
 * imports) is never touched or duplicated.
 *
 * v3 = full-size ECDICT exam decks (中考/高考/四级/六级/考研/雅思/托福/GRE).
 * v4 = removed the nine hand-written sample decks that shipped in v1–v3.
 */
export const SEED_VERSION = 4;

/**
 * The sample decks that earlier versions wrote into the database. Their only
 * source was hand-written demo data, so on upgrade they are deleted — but only
 * the decks, never a word the learner has actually reviewed.
 */
export const LEGACY_DEMO_DECK_IDS = [
  'deck-cet4-demo',
  'deck-cet6-demo',
  'deck-gaokao-demo',
  'deck-kaoyan-demo',
  'deck-ielts-demo',
  'deck-toefl-demo',
  'deck-business-demo',
  'deck-daily-demo',
  'deck-tech-demo',
] as const;

export interface SeedResult {
  decksAdded: number;
  wordsAdded: number;
  /** Legacy sample decks removed from an existing database. */
  decksRemoved?: number;
  /** Orphaned demo words deleted together with those decks. */
  wordsRemoved?: number;
}

/**
 * Deletes the old hand-written sample decks from an existing database.
 *
 * Safety rules (this must never cost the learner a memory record):
 *  - a word that has any review log, or an existing memory state, is kept even
 *    if it only belonged to a removed demo deck;
 *  - a word still linked from another deck is kept;
 *  - only words with no review history, no state and no remaining link go away.
 */
export async function removeLegacyDemoDecks(
  database: WordFlowDB = db,
): Promise<{ decksRemoved: number; wordsRemoved: number }> {
  const legacyIds = new Set<string>(LEGACY_DEMO_DECK_IDS);

  return database.transaction(
    'rw',
    [
      database.decks,
      database.words,
      database.deckWords,
      database.reviewLogs,
      database.userWordStates,
      database.meta,
    ],
    async () => {
      const decks = await database.decks.toArray();
      // `isDemo` alone is not enough: a v1 database has the field missing, and a
      // v2 migration may have mis-flagged ECDICT decks. Match the known ids.
      const targets = decks.filter((deck) => legacyIds.has(deck.id));
      if (targets.length === 0) return { decksRemoved: 0, wordsRemoved: 0 };

      const targetIds = new Set(targets.map((deck) => deck.id));
      const links = await database.deckWords.toArray();
      const removedLinks = links.filter((link) => targetIds.has(link.deckId));
      const wordIds = [...new Set(removedLinks.map((link) => link.wordId))];

      await database.deckWords.bulkDelete(removedLinks.map((link) => link.id));
      await database.decks.bulkDelete([...targetIds]);

      const remainingLinks = links.filter((link) => !targetIds.has(link.deckId));
      const stillLinked = new Set(remainingLinks.map((link) => link.wordId));

      const studied = new Set<string>();
      const wordIdSet = new Set(wordIds);
      await database.reviewLogs.each((log) => {
        if (wordIdSet.has(log.wordId)) studied.add(log.wordId);
      });
      // `userWordStates` is keyed by its own id, so look up the `wordId` index
      // rather than bulkGet (which would use the primary key and miss every row).
      const states = await database.userWordStates.where('wordId').anyOf(wordIds).toArray();
      states.forEach((state) => studied.add(state.wordId));

      const orphaned = wordIds.filter((id) => !studied.has(id) && !stillLinked.has(id));
      if (orphaned.length > 0) {
        await database.words.bulkDelete(orphaned);
        const orphanedStates = await database.userWordStates
          .where('wordId')
          .anyOf(orphaned)
          .toArray();
        if (orphanedStates.length > 0) {
          await database.userWordStates.bulkDelete(orphanedStates.map((state) => state.id));
        }
      }

      // Keep the tombstone list in sync so a v3 seed pass can't resurrect them.
      const row = await database.meta.get('removedDemoDecks');
      const current = new Set(Array.isArray(row?.value) ? (row.value as string[]) : []);
      targetIds.forEach((id) => current.add(id));
      await database.meta.put({ key: 'removedDemoDecks', value: [...current] });

      return { decksRemoved: targetIds.size, wordsRemoved: orphaned.length };
    },
  );
}

/**
 * Idempotent seeding of the built-in vocabulary. With `onlyMissing` (the
 * migration path) a deck that the user already has — or deleted on purpose — is
 * left alone.
 */
export async function seedDemoData(
  database: WordFlowDB = db,
  options: { onlyMissing?: boolean } = {},
): Promise<SeedResult> {
  const generated = await loadGeneratedDecks();

  const existingDecks = new Set((await database.decks.toArray()).map((d) => d.id));
  // Decks the learner deleted on purpose must not come back on the next upgrade.
  const tombstones = (await database.meta.get('removedDemoDecks'))?.value;
  const removed = new Set(Array.isArray(tombstones) ? (tombstones as string[]) : []);
  const keep = (deckId: string) =>
    !options.onlyMissing || (!existingDecks.has(deckId) && !removed.has(deckId));

  const generatedDecks = generated.decks.filter((deck) => keep(deck.id));
  const generatedDeckIds = new Set(generatedDecks.map((deck) => deck.id));

  if (generatedDecks.length === 0) {
    return { decksAdded: 0, wordsAdded: 0 };
  }

  let wordsAdded = 0;
  const CHUNK = 1500;

  // 1) The shared word pool. `words.normalizedTerm` is globally unique, so a
  //    term already present (user import, or a demo word kept for its history)
  //    is skipped here and re-linked below.
  const taken = new Set((await database.words.toArray()).map((word) => word.normalizedTerm));
  const poolWords = generated.words.filter((word) => !taken.has(word.normalizedTerm));
  const poolIds = new Set(poolWords.map((word) => word.id));

  for (let i = 0; i < poolWords.length; i += CHUNK) {
    const slice = poolWords.slice(i, i + CHUNK);
    await database.transaction('rw', [database.words], async () => {
      await database.words.bulkPut(slice);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  wordsAdded += poolWords.length;

  // 2) Deck rows.
  await database.transaction('rw', [database.decks], async () => {
    await database.decks.bulkPut(generatedDecks);
  });

  // 3) Links. Only link words that actually exist; a duplicate term links to the
  //    row that already owns it, so the deck still shows the right word count.
  const byNormalized = new Map(
    (await database.words.toArray()).map((word) => [word.normalizedTerm, word.id]),
  );
  const links = generated.links
    .filter((link) => generatedDeckIds.has(link.deckId))
    .map((link) => {
      const existing = byNormalized.get(link.wordId.replace(/^w-/, ''));
      return existing ? { ...link, wordId: existing } : poolIds.has(link.wordId) ? link : null;
    })
    .filter(
      (link): link is { id: string; deckId: string; wordId: string; createdAt: number } =>
        Boolean(link),
    );

  for (let i = 0; i < links.length; i += CHUNK) {
    const slice = links.slice(i, i + CHUNK);
    await database.transaction('rw', [database.deckWords], async () => {
      await database.deckWords.bulkPut(slice);
    });
    await new Promise((resolve) => setTimeout(resolve, 0));
  }

  await database.meta.bulkPut([
    { key: 'seeded', value: true },
    { key: 'seedVersion', value: SEED_VERSION },
    { key: 'algorithmVersion', value: ALGORITHM_VERSION },
  ]);

  return { decksAdded: generatedDecks.length, wordsAdded };
}

/**
 * Records that a demo deck was deleted by the user, so future seed upgrades
 * don't silently re-add it.
 */
export async function markDemoDeckRemoved(
  deckId: string,
  database: WordFlowDB = db,
): Promise<void> {
  const row = await database.meta.get('removedDemoDecks');
  const current = Array.isArray(row?.value) ? (row.value as string[]) : [];
  if (current.includes(deckId)) return;
  await database.meta.put({ key: 'removedDemoDecks', value: [...current, deckId] });
}

/**
 * Runs before React mounts: seeds the built-in vocabulary on first run, and
 * upgrades an existing install without wiping anything.
 */
export async function prepareDb(database: WordFlowDB = db): Promise<SeedResult> {
  try {
    const seeded = await database.meta.get('seeded');
    if (seeded?.value !== true) {
      return await seedDemoData(database);
    }

    const versionRow = await database.meta.get('seedVersion');
    const version = typeof versionRow?.value === 'number' ? versionRow.value : 1;
    if (version < SEED_VERSION) {
      // v4 dropped the hand-written sample decks.
      const cleanup = await removeLegacyDemoDecks(database);
      const result = await seedDemoData(database, { onlyMissing: true });
      await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });
      return { ...result, ...cleanup };
    }

    const algorithm = await database.meta.get('algorithmVersion');
    if (!algorithm) await database.meta.put({ key: 'algorithmVersion', value: ALGORITHM_VERSION });
    return { decksAdded: 0, wordsAdded: 0 };
  } catch (error) {
    console.error('[WordFlow] database bootstrap failed', error);
    return { decksAdded: 0, wordsAdded: 0 };
  }
}
