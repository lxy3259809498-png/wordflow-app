import { db, type WordFlowDB } from '@/lib/db/db';
import { getDemoWords, loadGeneratedDecks } from '@/lib/db/seed';
import { ALGORITHM_VERSION } from '@/lib/scheduler';

/**
 * Seed-content version. Bump when new decks/words ship: existing databases then
 * receive only the decks they don't have yet, so user data (states, logs,
 * imports) is never touched or duplicated.
 *
 * v3 = full-size ECDICT exam decks (中考/高考/四级/六级/考研/雅思/托福/GRE).
 */
export const SEED_VERSION = 3;

export interface SeedResult {
  decksAdded: number;
  wordsAdded: number;
}

/**
 * Idempotent seeding. With `onlyMissing` (the migration path) a deck that the
 * user already has — or deleted on purpose — is left alone.
 */
export async function seedDemoData(
  database: WordFlowDB = db,
  options: { onlyMissing?: boolean } = {},
): Promise<SeedResult> {
  // Hand-written sample decks (with examples/mnemonics)…
  const demo = getDemoWords();
  // …plus the full-size ECDICT decks, which share one deduplicated word pool.
  const generated = await loadGeneratedDecks();

  const existingDecks = new Set((await database.decks.toArray()).map((d) => d.id));
  // Decks the learner deleted on purpose must not come back on the next upgrade.
  const tombstones = (await database.meta.get('removedDemoDecks'))?.value;
  const removed = new Set(Array.isArray(tombstones) ? (tombstones as string[]) : []);
  const keep = (deckId: string) =>
    !options.onlyMissing || (!existingDecks.has(deckId) && !removed.has(deckId));

  const demoTargets = demo.filter((entry) => keep(entry.deck.id));
  const generatedDecks = generated.decks.filter((deck) => keep(deck.id));
  const generatedDeckIds = new Set(generatedDecks.map((deck) => deck.id));

  if (demoTargets.length === 0 && generatedDecks.length === 0) {
    return { decksAdded: 0, wordsAdded: 0 };
  }

  let wordsAdded = 0;

  // 1) Hand-written decks (small).
  for (const { deck, words } of demoTargets) {
    await database.transaction(
      'rw',
      [database.decks, database.words, database.deckWords],
      async () => {
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
      },
    );
    wordsAdded += words.length;
  }

  // 2) Generated decks: write the shared word pool once, then the links.
  if (generatedDecks.length > 0) {
    const CHUNK = 1500;
    // `words.normalizedTerm` is unique. A hand-written sample word ("abandon")
    // can already occupy a term that the generated pool also contains, so skip
    // those instead of failing the whole transaction.
    const taken = new Set(
      (await database.words.toArray()).map((word) => word.normalizedTerm),
    );
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

    const deckRows = generatedDecks;
    await database.transaction('rw', [database.decks], async () => {
      await database.decks.bulkPut(deckRows);
    });

    // Only link words that actually exist. A duplicate term links to the row
    // that already owns it, so the deck still shows the right word count.
    const byNormalized = new Map(
      (await database.words.toArray()).map((word) => [word.normalizedTerm, word.id]),
    );
    const links = generated.links
      .filter((link) => generatedDeckIds.has(link.deckId))
      .map((link) => {
        const existing = byNormalized.get(link.wordId.replace(/^w-/, ''));
        return existing ? { ...link, wordId: existing } : poolIds.has(link.wordId) ? link : null;
      })
      .filter((link): link is { id: string; deckId: string; wordId: string; createdAt: number } =>
        Boolean(link),
      );

    for (let i = 0; i < links.length; i += CHUNK) {
      const slice = links.slice(i, i + CHUNK);
      await database.transaction('rw', [database.deckWords], async () => {
        await database.deckWords.bulkPut(slice);
      });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  await database.meta.bulkPut([
    { key: 'seeded', value: true },
    { key: 'seedVersion', value: SEED_VERSION },
    { key: 'algorithmVersion', value: ALGORITHM_VERSION },
  ]);

  return {
    decksAdded: demoTargets.length + generatedDecks.length,
    wordsAdded,
  };
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
 * Runs before React mounts: seeds demo decks on first run, and upgrades an
 * existing install to the latest demo-content version without wiping anything.
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
      const result = await seedDemoData(database, { onlyMissing: true });
      await database.meta.put({ key: 'seedVersion', value: SEED_VERSION });
      return result;
    }

    const algorithm = await database.meta.get('algorithmVersion');
    if (!algorithm) await database.meta.put({ key: 'algorithmVersion', value: ALGORITHM_VERSION });
    return { decksAdded: 0, wordsAdded: 0 };
  } catch (error) {
    console.error('[WordFlow] database bootstrap failed', error);
    return { decksAdded: 0, wordsAdded: 0 };
  }
}
