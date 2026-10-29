import { db, type WordFlowDB } from '@/lib/db/db';
import { getDemoWords } from '@/lib/db/seed';
import {
  ALGORITHM_VERSION,
  DEFAULT_ALGORITHM_CONFIG,
  isDueToday,
  schedule,
  shouldEnterErrorBook,
} from '@/lib/scheduler';
import { computeDailyStats, emptyDailyStats } from '@/lib/stats';
import type {
  AchievementRecord,
  AiExamplePayload,
  DailyStats,
  Deck,
  DeckWord,
  ImportBatch,
  ReviewLog,
  ReviewMode,
  StudySession,
  UserWordState,
  Word,
} from '@/lib/types';
import { toDateKey } from '@/lib/time';
import type { ParsedWordRow } from '@/lib/import/wordImport';
import { validateBackup, type BackupDocument, type BackupRow } from '@/lib/data/backup';

/**
 * Repository boundary. The UI only talks to this interface, so a future
 * `CloudDataProvider` (REST/GraphQL + auth) can be dropped in without touching
 * the pages. `LocalDataProvider` is the phase-1 IndexedDB implementation.
 */
export interface NewDeckInput {
  name: string;
  examType: Deck['examType'];
  description: string;
  source: string;
  licenseNote: string;
}

export interface DataProvider {
  initialize(): Promise<void>;
  listDecks(): Promise<Deck[]>;
  listWordsByDeck(deckId: string): Promise<Word[]>;
  createDeck(input: NewDeckInput): Promise<Deck>;
}

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;

export const MASTERED_STABILITY_DAYS = 21;

export interface DeckProgress {
  deck: Deck;
  total: number;
  learned: number;
  mastered: number;
  dueToday: number;
  percent: number;
}

export type StateMap = Map<string, UserWordState>;

export function isMastered(state: UserWordState | undefined): boolean {
  if (!state) return false;
  return state.state === 'review' && state.stability >= MASTERED_STABILITY_DAYS;
}

/**
 * A state row can exist before the first review (star / error-book flag).
 * Such a word still counts as "not yet learned" so it stays in the new queue.
 */
export function isUnstudied(state: UserWordState | undefined): boolean {
  return !state || (state.lastReviewedAt === null && state.nextReviewAt === null);
}

export class LocalDataProvider implements DataProvider {
  constructor(private readonly database: WordFlowDB = db) {}

  async initialize(): Promise<void> {
    const meta = await this.database.meta.get('seeded');
    if (meta?.value === true) return;
    const demo = getDemoWords();
    await this.database.transaction(
      'rw',
      [this.database.decks, this.database.words, this.database.deckWords, this.database.meta],
      async () => {
        for (const { deck, words } of demo) {
          await this.database.decks.put(deck);
          await this.database.words.bulkPut(words);
          await this.database.deckWords.bulkPut(
            words.map((word) => ({
              id: `${deck.id}:${word.id}`,
              deckId: deck.id,
              wordId: word.id,
              createdAt: deck.createdAt,
            })),
          );
        }
        await this.database.meta.put({ key: 'seeded', value: true });
        await this.database.meta.put({ key: 'algorithmVersion', value: ALGORITHM_VERSION });
      },
    );
  }

  async listDecks(): Promise<Deck[]> {
    const decks = await this.database.decks.toArray();
    return decks.sort((a, b) => a.createdAt - b.createdAt);
  }

  async listWordsByDeck(deckId: string): Promise<Word[]> {
    const links = await this.database.deckWords.where('deckId').equals(deckId).toArray();
    const words = await this.database.words.bulkGet(links.map((link) => link.wordId));
    return words.filter((w): w is Word => Boolean(w));
  }

  async createDeck(input: NewDeckInput): Promise<Deck> {
    return createCustomDeck(input, Date.now(), this.database);
  }
}

/**
 * Commit one rating. Everything happens in a single Dexie transaction:
 * idempotency guard → state update → log → session → daily stats → achievements.
 */
export interface CommitReviewInput {
  session: StudySession;
  word: Word;
  rating: ReviewLog['rating'];
  reviewMode: ReviewMode;
  eventId: string;
  elapsedMs: number;
  now: number;
  /** Session object already advanced by the caller (cursor, short queue). */
  nextSession: StudySession;
  /** Daily word goal from settings, used for the `goalCompleted` flag. */
  dailyGoalCount?: number;
  /** Daily minutes goal; either goal being met marks the day complete. */
  dailyGoalMinutes?: number;
  database?: WordFlowDB;
}

export interface CommitReviewResult {
  duplicate: boolean;
  state: UserWordState;
  log: ReviewLog | null;
  stats: DailyStats;
}

export async function commitReview(input: CommitReviewInput): Promise<CommitReviewResult> {
  const { session, word, rating, eventId, now, nextSession } = input;
  const database = input.database ?? db;
  const dateKey = toDateKey(now);

  return database.transaction(
    'rw',
    [
      database.userWordStates,
      database.reviewLogs,
      database.sessions,
      database.dailyStats,
      database.achievements,
      database.words,
      database.meta,
    ],
    async () => {
      const existingLog = await database.reviewLogs.where('eventId').equals(eventId).first();
      const currentState =
        (await database.userWordStates.where('wordId').equals(word.id).first()) ?? undefined;

      if (existingLog) {
        const statsRow = await database.dailyStats.get(existingLog.dateKey);
        return {
          duplicate: true,
          state: currentState ?? blankState(word.id, now),
          log: null,
          stats: statsRow ?? emptyDailyStats(existingLog.dateKey, now),
        };
      }

      const before = currentState ?? null;
      const result = schedule({
        state: before,
        rating,
        now,
        config: { ...DEFAULT_ALGORITHM_CONFIG },
      });

      const fuzzyStreak = rating === 'fuzzy' ? (before?.fuzzyStreak ?? 0) + 1 : 0;
      const errorBook = shouldEnterErrorBook(
        { lapseCount: before?.lapseCount ?? 0, fuzzyStreak: before?.fuzzyStreak ?? 0 },
        rating,
        fuzzyStreak,
      );
      const state: UserWordState = {
        ...(before ?? blankState(word.id, now)),
        id: before?.id ?? uid('state'),
        wordId: word.id,
        state: result.state,
        difficulty: result.difficulty,
        stability: result.stability,
        scheduledDays: result.scheduledDays,
        lastReviewedAt: now,
        nextReviewAt: result.nextReviewAt,
        repetitionCount: result.repetitionCount,
        lapseCount: result.lapseCount,
        correctCount: result.correctCount,
        estimatedRecall: result.estimatedRecall,
        fuzzyStreak,
        isInErrorBook: before?.isInErrorBook === true ? true : errorBook,
        algorithmVersion: result.algorithmVersion,
        updatedAt: now,
      };
      await database.userWordStates.put(state);

      const log: ReviewLog = {
        id: uid('log'),
        eventId,
        wordId: word.id,
        sessionId: session.id,
        rating,
        reviewMode: input.reviewMode,
        reviewedAt: now,
        dateKey,
        elapsedMs: Math.max(0, Math.round(input.elapsedMs)),
        scheduledDaysBefore: before?.scheduledDays ?? 0,
        scheduledDaysAfter: result.scheduledDays,
        stateBefore: before?.state ?? 'new',
        stateAfter: result.state,
        wasCorrect: rating === 'known',
        algorithmVersion: result.algorithmVersion,
      };
      await database.reviewLogs.add(log);

      const completed = nextSession.completedWordIds.includes(word.id)
        ? nextSession.completedWordIds
        : [...nextSession.completedWordIds, word.id];

      const savedSession: StudySession = {
        ...nextSession,
        completedWordIds: completed,
        endedAt: nextSession.status === 'completed' ? now : null,
        updatedAt: now,
      };
      await database.sessions.put(savedSession);

      const stats = await recomputeDailyStats(database, dateKey, now, {
        goalCount: input.dailyGoalCount,
        goalMinutes: input.dailyGoalMinutes,
      });
      await evaluateAchievements(database, now);

      return { duplicate: false, state, log, stats };
    },
  );
}

function blankState(wordId: string, now: number): UserWordState {
  return {
    id: uid('state'),
    wordId,
    deckId: null,
    state: 'new',
    difficulty: 0,
    stability: 0,
    scheduledDays: 0,
    lastReviewedAt: null,
    nextReviewAt: null,
    repetitionCount: 0,
    lapseCount: 0,
    correctCount: 0,
    estimatedRecall: 0,
    fuzzyStreak: 0,
    isStarred: false,
    isInErrorBook: false,
    algorithmVersion: ALGORITHM_VERSION,
    createdAt: now,
    updatedAt: now,
  };
}

/** Rebuild one day from raw logs + sessions, so stats can never drift or double count. */
export async function recomputeDailyStats(
  database: WordFlowDB,
  dateKey: string,
  now: number,
  goals: { goalCount?: number; goalMinutes?: number } = {},
): Promise<DailyStats> {
  const goalCount = Math.max(1, goals.goalCount ?? 20);
  const goalMinutes = Math.max(0, goals.goalMinutes ?? 0);
  const logs = await database.reviewLogs.where('dateKey').equals(dateKey).toArray();
  const sessions = await database.sessions.toArray();
  const studiedUnique = new Set(logs.map((l) => l.wordId)).size;
  const seconds = sessions
    .filter((s) => toDateKey(s.startedAt) === dateKey)
    .reduce((sum, s) => sum + (s.durationSeconds || 0), 0);
  const completedByWords = studiedUnique >= goalCount;
  const completedByTime = goalMinutes > 0 && seconds >= goalMinutes * 60;
  const stats = computeDailyStats(dateKey, logs, sessions, completedByWords || completedByTime, now);
  await database.dailyStats.put(stats);
  return stats;
}

export interface AchievementDefinition {
  code: string;
  name: string;
  description: string;
  target: number;
  metric: 'studied' | 'streak' | 'mastered' | 'mistakes' | 'days';
}

export const ACHIEVEMENTS: AchievementDefinition[] = [
  { code: 'first-step', name: '第一步', description: '完成第一个单词的复习', target: 1, metric: 'studied' },
  { code: 'fifty-words', name: '五十词', description: '累计学习 50 个不同单词', target: 50, metric: 'studied' },
  { code: 'streak-3', name: '三日不辍', description: '连续学习 3 天', target: 3, metric: 'streak' },
  { code: 'streak-7', name: '一周节奏', description: '连续学习 7 天', target: 7, metric: 'streak' },
  { code: 'streak-30', name: '月度坚持', description: '连续学习 30 天', target: 30, metric: 'streak' },
  { code: 'mastered-20', name: '二十稳记', description: '20 个单词进入长期记忆', target: 20, metric: 'mastered' },
  { code: 'mistake-hunter', name: '错词猎人', description: '错词本累计收录 10 个单词', target: 10, metric: 'mistakes' },
];

export async function evaluateAchievements(database: WordFlowDB, now: number): Promise<void> {
  const [states, logs, stats] = await Promise.all([
    database.userWordStates.toArray(),
    database.reviewLogs.toArray(),
    database.dailyStats.toArray(),
  ]);
  const metrics: Record<AchievementDefinition['metric'], number> = {
    studied: new Set(logs.map((l) => l.wordId)).size,
    streak: currentStreakFromStats(stats),
    mastered: states.filter((s) => isMastered(s)).length,
    mistakes: states.filter((s) => s.isInErrorBook).length,
    days: stats.filter((s) => s.studiedCount > 0).length,
  };

  for (const definition of ACHIEVEMENTS) {
    const existing = await database.achievements.where('code').equals(definition.code).first();
    const progress = Math.min(definition.target, metrics[definition.metric]);
    const unlockedAt = existing?.unlockedAt ?? (progress >= definition.target ? now : null);
    const record: AchievementRecord = {
      id: existing?.id ?? uid('ach'),
      code: definition.code,
      name: definition.name,
      description: definition.description,
      progress,
      unlockedAt,
    };
    await database.achievements.put(record);
  }
}

function currentStreakFromStats(stats: DailyStats[]): number {
  const keys = new Set(stats.filter((s) => s.studiedCount > 0).map((s) => s.dateKey));
  if (keys.size === 0) return 0;
  const today = toDateKey(Date.now());
  const cursor = new Date(today);
  let streak = 0;
  if (!keys.has(today)) cursor.setDate(cursor.getDate() - 1);
  for (let i = 0; i < 3660; i += 1) {
    const key = toDateKey(cursor.getTime());
    if (!keys.has(key)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }
  return streak;
}

export async function getAchievements(database: WordFlowDB = db): Promise<AchievementRecord[]> {
  const rows = await database.achievements.toArray();
  const order = new Map(ACHIEVEMENTS.map((a, i) => [a.code, i]));
  return rows.sort((a, b) => (order.get(a.code) ?? 99) - (order.get(b.code) ?? 99));
}

/* ------------------------------------------------------------------ */
/* Word state toggles                                                  */
/* ------------------------------------------------------------------ */

export async function setStarred(
  wordId: string,
  starred: boolean,
  now: number,
  database: WordFlowDB = db,
): Promise<void> {
  const existing = await database.userWordStates.where('wordId').equals(wordId).first();
  if (existing) {
    await database.userWordStates.update(existing.id, { isStarred: starred, updatedAt: now });
    return;
  }
  // Starring a word before it was ever studied still needs a single state row.
  const fresh = blankState(wordId, now);
  await database.userWordStates.put({ ...fresh, isStarred: starred });
}

export async function setErrorBook(
  wordId: string,
  inBook: boolean,
  now: number,
  database: WordFlowDB = db,
): Promise<void> {
  const existing = await database.userWordStates.where('wordId').equals(wordId).first();
  if (existing) {
    await database.userWordStates.update(existing.id, { isInErrorBook: inBook, updatedAt: now });
    return;
  }
  const fresh = blankState(wordId, now);
  await database.userWordStates.put({ ...fresh, isInErrorBook: inBook });
}

export async function getReviewLogsForWord(
  wordId: string,
  database: WordFlowDB = db,
): Promise<ReviewLog[]> {
  const logs = await database.reviewLogs.where('wordId').equals(wordId).toArray();
  return logs.sort((a, b) => b.reviewedAt - a.reviewedAt);
}

/* ------------------------------------------------------------------ */
/* Deck + import operations                                            */
/* ------------------------------------------------------------------ */

export async function createCustomDeck(
  input: NewDeckInput,
  now: number,
  database: WordFlowDB = db,
): Promise<Deck> {
  const deck: Deck = {
    id: uid('deck'),
    name: input.name.trim(),
    examType: input.examType,
    description: input.description.trim(),
    source: input.source.trim(),
    licenseNote: input.licenseNote.trim(),
    createdAt: now,
    updatedAt: now,
  };
  await database.decks.add(deck);
  return deck;
}

export async function existingNormalizedTerms(database: WordFlowDB = db): Promise<Set<string>> {
  const words = await database.words.toArray();
  return new Set(words.map((w) => w.normalizedTerm));
}

export interface ApplyImportInput {
  deckId: string;
  rows: ParsedWordRow[];
  fileName: string;
  now: number;
  /** Rows per transaction batch; keeps very large imports responsive. */
  batchSize?: number;
  /** Called after each batch so the UI can show real progress. */
  onProgress?: (progress: { done: number; total: number }) => void;
  database?: WordFlowDB;
}

export interface ApplyImportResult {
  batchId: string;
  createdWords: number;
  linkedWords: number;
  skipped: number;
  /** Words already present with the same term (linked, not duplicated). */
  reusedWords: number;
}

/**
 * Import is batched: each chunk runs in its own transaction so a 5k-word file
 * does not lock the database (or the UI) for seconds. Existing words are reused
 * — never re-created — which is what keeps memory states from being duplicated
 * or reset. The batch record is written last, so a failed import leaves no
 * half-registered batch behind.
 */
export async function applyImport(input: ApplyImportInput): Promise<ApplyImportResult> {
  const database = input.database ?? db;
  const batchSize = Math.max(25, input.batchSize ?? 200);
  const deck = await database.decks.get(input.deckId);
  if (!deck) throw new Error('词书不存在');

  const createdWordIds: string[] = [];
  const createdDeckWordIds: string[] = [];
  const touchedWordIds: string[] = [];
  let linkedWords = 0;
  let skipped = 0;
  let reusedWords = 0;

  for (let offset = 0; offset < input.rows.length; offset += batchSize) {
    const chunk = input.rows.slice(offset, offset + batchSize);

    await database.transaction(
      'rw',
      [database.words, database.deckWords],
      async () => {
        const terms = chunk.map((row) => row.term.trim().toLowerCase());
        const existing = await database.words.where('normalizedTerm').anyOf(terms).toArray();
        const byNormalized = new Map(existing.map((word) => [word.normalizedTerm, word]));

        const linkKeys = await database.deckWords
          .where('deckId')
          .equals(input.deckId)
          .primaryKeys();
        void linkKeys;
        const existingLinks = await database.deckWords
          .where('deckId')
          .equals(input.deckId)
          .toArray();
        const linked = new Set(existingLinks.map((link) => link.wordId));

        const newWords: Word[] = [];
        const newLinks: DeckWord[] = [];

        for (const row of chunk) {
          const normalized = row.term.trim().toLowerCase();
          let word = byNormalized.get(normalized);
          if (!word) {
            word = {
              id: uid('word'),
              term: row.term.trim(),
              normalizedTerm: normalized,
              phonetic: row.phonetic,
              phoneticUS: row.phoneticUS || row.phonetic,
              phoneticUK: row.phoneticUK || row.phonetic,
              partOfSpeech: row.partOfSpeech,
              definitions: row.definitions,
              examples: row.exampleEn ? [{ en: row.exampleEn, zh: row.exampleZh }] : [],
              translations: row.translations ?? [],
              audioUS: row.audioUS ?? null,
              audioUK: row.audioUK ?? null,
              tags: row.tags,
              source: row.source,
              licenseNote: row.licenseNote,
              mnemonic: row.mnemonic,
              createdAt: input.now,
              updatedAt: input.now,
            };
            newWords.push(word);
            byNormalized.set(normalized, word);
          } else {
            reusedWords += 1;
          }
          touchedWordIds.push(word.id);

          if (linked.has(word.id)) {
            skipped += 1;
            continue;
          }
          const link: DeckWord = {
            id: uid('dw'),
            deckId: input.deckId,
            wordId: word.id,
            createdAt: input.now,
          };
          newLinks.push(link);
          linked.add(word.id);
          createdDeckWordIds.push(link.id);
          linkedWords += 1;
        }

        if (newWords.length > 0) {
          await database.words.bulkAdd(newWords);
          createdWordIds.push(...newWords.map((word) => word.id));
        }
        if (newLinks.length > 0) {
          await database.deckWords.bulkAdd(newLinks);
        }
      },
    );

    input.onProgress?.({
      done: Math.min(offset + batchSize, input.rows.length),
      total: input.rows.length,
    });
  }

  const batchId = uid('batch');
  const batch: ImportBatch = {
    id: batchId,
    deckId: input.deckId,
    createdAt: input.now,
    wordIds: [...new Set(touchedWordIds)],
    fileName: input.fileName,
    createdWordIds,
    createdDeckWordIds,
  };
  await database.importBatches.add(batch);
  await database.decks.update(input.deckId, { updatedAt: input.now });

  return {
    batchId,
    createdWords: createdWordIds.length,
    linkedWords,
    skipped,
    reusedWords,
  };
}

export interface UndoImportResult {
  ok: boolean;
  message: string;
  removedWords: number;
  removedLinks: number;
}

/**
 * Undo removes only what the batch created. If any imported word already has
 * review history we refuse, so study progress is never silently destroyed.
 */
export async function undoImport(
  batchId: string,
  now: number,
  database: WordFlowDB = db,
): Promise<UndoImportResult> {
  void now;
  return database.transaction(
    'rw',
    [
      database.words,
      database.deckWords,
      database.importBatches,
      database.reviewLogs,
      database.userWordStates,
    ],
    async () => {
      const batch = await database.importBatches.get(batchId);
      if (!batch) return { ok: false, message: '找不到该导入批次', removedWords: 0, removedLinks: 0 };
      const logs = await database.reviewLogs.toArray();
      const studied = new Set(logs.map((l) => l.wordId));
      const studiedImported = batch.wordIds.filter((id) => studied.has(id));
      if (studiedImported.length > 0) {
        return {
          ok: false,
          message: `该批次有 ${studiedImported.length} 个单词已产生学习记录，撤销会删除学习数据，已取消。`,
          removedWords: 0,
          removedLinks: 0,
        };
      }
      const removableWords = batch.createdWordIds.filter((id) => !studied.has(id));
      await database.deckWords.bulkDelete(batch.createdDeckWordIds);
      for (const wordId of removableWords) {
        await database.deckWords.where('wordId').equals(wordId).delete();
      }
      await database.words.bulkDelete(removableWords);
      for (const wordId of removableWords) {
        const state = await database.userWordStates.where('wordId').equals(wordId).first();
        if (state) await database.userWordStates.delete(state.id);
      }
      await database.importBatches.delete(batchId);
      return {
        ok: true,
        message: `已撤销导入：删除 ${removableWords.length} 个单词、${batch.createdDeckWordIds.length} 条词书关联。`,
        removedWords: removableWords.length,
        removedLinks: batch.createdDeckWordIds.length,
      };
    },
  );
}

export async function listImportBatches(database: WordFlowDB = db): Promise<ImportBatch[]> {
  const rows = await database.importBatches.toArray();
  return rows.sort((a, b) => b.createdAt - a.createdAt);
}

/**
 * Deletes a deck and its word links. Words that only belong to this deck and
 * have no review history are removed too; studied words are kept so the
 * learner never loses progress. Demo decks are tombstoned so a future seed
 * upgrade won't re-add them.
 */
export async function deleteDeck(
  deckId: string,
  now: number,
  database: WordFlowDB = db,
): Promise<{ ok: boolean; message: string; removedWords: number }> {
  void now;
  return database.transaction(
    'rw',
    [
      database.decks,
      database.words,
      database.deckWords,
      database.reviewLogs,
      database.userWordStates,
      database.importBatches,
      database.meta,
    ],
    async () => {
      const deck = await database.decks.get(deckId);
      if (!deck) return { ok: false, message: '词书不存在', removedWords: 0 };

      const links = await database.deckWords.where('deckId').equals(deckId).toArray();
      const wordIds = links.map((link) => link.wordId);
      await database.deckWords.bulkDelete(links.map((link) => link.id));
      await database.decks.delete(deckId);

      const logs = await database.reviewLogs.toArray();
      const studied = new Set(logs.map((log) => log.wordId));
      const remainingLinks = await database.deckWords.toArray();
      const stillLinked = new Set(remainingLinks.map((link) => link.wordId));

      const orphaned = wordIds.filter((id) => !studied.has(id) && !stillLinked.has(id));
      if (orphaned.length > 0) {
        await database.words.bulkDelete(orphaned);
        for (const wordId of orphaned) {
          const state = await database.userWordStates.where('wordId').equals(wordId).first();
          if (state) await database.userWordStates.delete(state.id);
        }
      }

      if (deck.isDemo) {
        const row = await database.meta.get('removedDemoDecks');
        const current = Array.isArray(row?.value) ? (row.value as string[]) : [];
        if (!current.includes(deckId)) {
          await database.meta.put({ key: 'removedDemoDecks', value: [...current, deckId] });
        }
      }

      return {
        ok: true,
        message: `已删除「${deck.name}」，清理 ${orphaned.length} 个未学习的词条；已学过的词保留记忆记录。`,
        removedWords: orphaned.length,
      };
    },
  );
}

/* ------------------------------------------------------------------ */
/* Backup / restore                                                    */
/* ------------------------------------------------------------------ */

const asRows = (value: unknown[]): BackupRow[] => value as unknown as BackupRow[];

/**
 * Decks shipped with the app (sample + ECDICT). They are reproducible from the
 * seed, so a backup does not need to carry ~1.4万 words / 3.8万 links — that
 * made export take minutes and produced 10 MB+ files.
 */
function isBundledDeck(deckId: string): boolean {
  return (
    deckId.startsWith('deck-') ||
    deckId.startsWith('cet4-') ||
    deckId.startsWith('cet6-') ||
    deckId.startsWith('gk-') ||
    deckId.startsWith('zk-') ||
    deckId.startsWith('kaoyan-') ||
    deckId.startsWith('ielts-') ||
    deckId.startsWith('toefl-') ||
    deckId.startsWith('gre-') ||
    deckId.startsWith('biz-') ||
    deckId.startsWith('daily-') ||
    deckId.startsWith('tech-')
  );
}

export async function exportBackup(now: number, database: WordFlowDB = db): Promise<BackupDocument> {
  const [
    allDecks,
    allDeckWords,
    userWordStates,
    reviewLogs,
    sessions,
    dailyStats,
    achievements,
    aiExamples,
    importBatches,
  ] = await Promise.all([
    database.decks.toArray(),
    database.deckWords.toArray(),
    database.userWordStates.toArray(),
    database.reviewLogs.toArray(),
    database.sessions.toArray(),
    database.dailyStats.toArray(),
    database.achievements.toArray(),
    database.aiExamples.toArray(),
    database.importBatches.toArray(),
  ]);

  // Only user-owned decks travel with the backup.
  const decks = allDecks.filter((deck) => !isBundledDeck(deck.id) && !deck.isDemo);
  const customDeckIds = new Set(decks.map((deck) => deck.id));
  const deckWords = allDeckWords.filter((link) => customDeckIds.has(link.deckId));

  // Words referenced by those decks, plus any word the learner has progress on
  // (progress must never be lost, even if its deck was deleted).
  const neededWordIds = new Set(deckWords.map((link) => link.wordId));
  for (const state of userWordStates) neededWordIds.add(state.wordId);
  const words = (await database.words.bulkGet([...neededWordIds])).filter(
    (word): word is NonNullable<typeof word> => Boolean(word),
  );

  const tables = {
    words: asRows(words),
    decks: asRows(decks),
    deckWords: asRows(deckWords),
    userWordStates: asRows(userWordStates),
    reviewLogs: asRows(reviewLogs),
    sessions: asRows(sessions),
    dailyStats: asRows(dailyStats),
    achievements: asRows(achievements),
    aiExamples: asRows(aiExamples),
    importBatches: asRows(importBatches),
  };
  return {
    meta: {
      app: 'WordFlow',
      schemaVersion: 1,
      exportedAt: now,
      userId: 'local-user',
      counts: {
        words: words.length,
        decks: decks.length,
        userWordStates: userWordStates.length,
        reviewLogs: reviewLogs.length,
        sessions: sessions.length,
      },
    },
    ...tables,
  };
}

/** Validates first, then replaces everything in one transaction. */
export async function restoreBackup(
  raw: string,
  now: number,
  database: WordFlowDB = db,
): Promise<{ ok: boolean; errors: string[]; warnings: string[]; imported?: number }> {
  const validation = validateBackup(raw);
  if (!validation.ok || !validation.document) {
    return { ok: false, errors: validation.errors, warnings: validation.warnings };
  }
  const doc = validation.document;
  try {
    await database.transaction('rw', database.tables, async () => {
      await Promise.all(database.tables.map((table) => table.clear()));
      await database.words.bulkPut(doc.words as unknown as Word[]);
      await database.decks.bulkPut(doc.decks as unknown as Deck[]);
      await database.deckWords.bulkPut(doc.deckWords as unknown as DeckWord[]);
      await database.userWordStates.bulkPut(doc.userWordStates as unknown as UserWordState[]);
      await database.reviewLogs.bulkPut(doc.reviewLogs as unknown as ReviewLog[]);
      await database.sessions.bulkPut(doc.sessions as unknown as StudySession[]);
      await database.dailyStats.bulkPut(doc.dailyStats as unknown as DailyStats[]);
      await database.achievements.bulkPut(doc.achievements as unknown as AchievementRecord[]);
      if (doc.aiExamples.length) {
        await database.aiExamples.bulkPut(doc.aiExamples as unknown as AiExamplePayload[]);
      }
      if (doc.importBatches.length) {
        await database.importBatches.bulkPut(doc.importBatches as unknown as ImportBatch[]);
      }
      await database.meta.put({ key: 'seeded', value: true });
      await database.meta.put({ key: 'restoredAt', value: now });
    });
  } catch (error) {
    return {
      ok: false,
      errors: [`写入失败：${(error as Error).message}`],
      warnings: validation.warnings,
    };
  }
  return {
    ok: true,
    errors: [],
    warnings: validation.warnings,
    imported: doc.reviewLogs.length + doc.userWordStates.length,
  };
}

export async function saveAiExample(
  payload: AiExamplePayload,
  database: WordFlowDB = db,
): Promise<void> {
  await database.aiExamples.put(payload);
}

export async function getAiExamples(
  database: WordFlowDB = db,
): Promise<Map<string, AiExamplePayload>> {
  const rows = await database.aiExamples.toArray();
  return new Map(rows.map((row) => [row.wordId, row]));
}

export interface DeckStat {
  deckId: string;
  total: number;
  learned: number;
  mastered: number;
  dueToday: number;
}

export async function deckStats(now: number, database: WordFlowDB = db): Promise<DeckStat[]> {
  const [decks, links, states] = await Promise.all([
    database.decks.toArray(),
    database.deckWords.toArray(),
    database.userWordStates.toArray(),
  ]);
  const stateByWord = new Map(states.map((s) => [s.wordId, s]));
  return decks.map((deck) => {
    const wordIds = links.filter((l) => l.deckId === deck.id).map((l) => l.wordId);
    let learned = 0;
    let mastered = 0;
    let due = 0;
    for (const id of wordIds) {
      const state = stateByWord.get(id);
      if (state?.lastReviewedAt) learned += 1;
      if (isMastered(state)) mastered += 1;
      if (state?.nextReviewAt && isDueToday(state.nextReviewAt, now)) due += 1;
    }
    return { deckId: deck.id, total: wordIds.length, learned, mastered, dueToday: due };
  });
}
