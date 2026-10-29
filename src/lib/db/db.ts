import Dexie, { type Table } from 'dexie';
import type {
  AchievementRecord,
  AiExamplePayload,
  DailyStats,
  Deck,
  DeckWord,
  ImportBatch,
  ReviewLog,
  StudySession,
  UserWordState,
  Word,
} from '@/lib/types';

/**
 * IndexedDB schema. Migration rules:
 *  - never reuse a version number and never drop a table without a migration.
 *  - adding fields is free (IndexedDB is schema-less per row); only new *indexes*
 *    need a version bump.
 *  - v2: phonetic/audio fields + source/licence indexes. Existing rows are
 *    back-filled in place via `upgrade` — user states/logs are never touched.
 */
export const DB_NAME = 'wordflow-db';
export const DB_VERSION = 2;

export interface MetaRecord {
  key: string;
  value: unknown;
}

export class WordFlowDB extends Dexie {
  words!: Table<Word, string>;
  decks!: Table<Deck, string>;
  deckWords!: Table<DeckWord, string>;
  userWordStates!: Table<UserWordState, string>;
  reviewLogs!: Table<ReviewLog, string>;
  sessions!: Table<StudySession, string>;
  dailyStats!: Table<DailyStats, string>;
  achievements!: Table<AchievementRecord, string>;
  importBatches!: Table<ImportBatch, string>;
  aiExamples!: Table<AiExamplePayload, string>;
  meta!: Table<MetaRecord, string>;

  constructor(name = DB_NAME) {
    super(name);

    this.version(1).stores({
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

    this.version(2)
      .stores({
        // Same stores; new indexes only. `*tags` enables multi-entry tag search.
        words: 'id, &normalizedTerm, term, source, *tags',
        decks: 'id, examType, name, isDemo',
        deckWords: 'id, deckId, wordId, &[deckId+wordId]',
        userWordStates: 'id, &wordId, state, nextReviewAt, isInErrorBook, isStarred, deckId',
        reviewLogs: 'id, &eventId, wordId, sessionId, reviewedAt, dateKey, rating',
        sessions: 'id, status, updatedAt',
        dailyStats: '&dateKey',
        achievements: 'id, &code',
        importBatches: 'id, deckId, createdAt',
        aiExamples: 'wordId',
        meta: 'key',
      })
      .upgrade(async (tx) => {
        // Back-fill the new word fields for rows created before v2.
        await tx
          .table<Word>('words')
          .toCollection()
          .modify((word) => {
            const legacy = (word as Partial<Word>).phonetic ?? '';
            if (typeof word.phoneticUS !== 'string') {
              word.phoneticUS = legacy;
            }
            if (typeof word.phoneticUK !== 'string') {
              word.phoneticUK = legacy;
            }
            if (!Array.isArray(word.translations)) word.translations = [];
            if (word.audioUS === undefined) word.audioUS = null;
            if (word.audioUK === undefined) word.audioUK = null;
            if (!Array.isArray(word.examples)) word.examples = [];
            if (!Array.isArray(word.tags)) word.tags = [];
          });
        // Decks get an explicit demo flag so the catalogue can tell them apart.
        await tx
          .table<Deck>('decks')
          .toCollection()
          .modify((deck) => {
            if (deck.isDemo === undefined) {
              deck.isDemo = typeof deck.id === 'string' && deck.id.startsWith('deck-');
            }
          });
      });
  }
}

export const db = new WordFlowDB();

export async function wipeDatabase(database: WordFlowDB = db): Promise<void> {
  await database.transaction('rw', database.tables, async () => {
    await Promise.all(database.tables.map((table) => table.clear()));
  });
}

export async function readMeta<T>(key: string, fallback: T, database: WordFlowDB = db): Promise<T> {
  const row = await database.meta.get(key);
  return row ? (row.value as T) : fallback;
}

export async function writeMeta(
  key: string,
  value: unknown,
  database: WordFlowDB = db,
): Promise<void> {
  await database.meta.put({ key, value });
}
