import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { WordFlowDB } from '@/lib/db/db';
import {
  applyImport,
  commitReview,
  createCustomDeck,
  deleteDeck,
  listImportBatches,
  undoImport,
} from '@/lib/data/repository';
import { createSession } from '@/lib/study/session';
import { parseWordCsv, sanitizeAudioUrl } from '@/lib/import/wordImport';
import { computeDeckOverviews, checkWordQuality } from '@/lib/decks/stats';
import type { StudySession, UserWordState } from '@/lib/types';

const T0 = Date.UTC(2026, 4, 1, 9, 0, 0);
let counter = 0;
let database: WordFlowDB;

beforeEach(async () => {
  counter += 1;
  database = new WordFlowDB(`wordflow-import-${counter}`);
  await database.open();
});

afterEach(async () => {
  await database.delete();
});

/**
 * Deterministic pseudo-words made only of letters (the parser rejects digits).
 * Fixed 3-letter radix-26 suffix guarantees uniqueness up to 17576 items.
 */
function pseudoTerm(index: number): string {
  const letters = 'abcdefghijklmnopqrstuvwxyz';
  const a = Math.floor(index / 676) % 26;
  const b = Math.floor(index / 26) % 26;
  const c = index % 26;
  return `w${letters[a]}${letters[b]}${letters[c]}`;
}

/** Generates N unique, realistic-shaped CSV rows. */
function buildCsv(count: number, options: { duplicateEvery?: number } = {}): string {
  const lines = [
    'term,phoneticUS,phoneticUK,partOfSpeech,definitions,exampleEn,exampleZh,audioUS,audioUK,tags,source,licenseNote',
  ];
  for (let i = 0; i < count; i += 1) {
    const term = pseudoTerm(i);
    const audio = i % 5 === 0 ? `https://audio.example.com/${term}.mp3` : '';
    lines.push(
      `${term},/${term}/,/${term}/,n.,释义${i},Example sentence with ${term}.,例句${i}。,${audio},,tag${i % 3},import-test,CC0`,
    );
    if (options.duplicateEvery && i % options.duplicateEvery === 0) {
      lines.push(`${term},/${term}/,/${term}/,n.,释义重复${i},Example sentence with ${term}.,例句${i}。,,,dup,import-test,CC0`);
    }
  }
  return lines.join('\n');
}

async function newDeck(name = 'Big deck') {
  return createCustomDeck(
    { name, examType: 'CET4', description: 'd', source: 'self', licenseNote: 'CC0' },
    T0,
    database,
  );
}

describe('bulk import — 100 rows', () => {
  it('imports 100 rows, reports counts, and keeps every field', async () => {
    const parsed = parseWordCsv(buildCsv(100));
    expect(parsed.rows).toHaveLength(100);

    const deck = await newDeck();
    const progress: number[] = [];
    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'big.csv',
      now: T0,
      batchSize: 25,
      onProgress: (p) => progress.push(p.done),
      database,
    });

    expect(result.createdWords).toBe(100);
    expect(result.linkedWords).toBe(100);
    expect(result.skipped).toBe(0);
    // Batched: 100 rows / 25 per batch = 4 progress callbacks.
    expect(progress).toEqual([25, 50, 75, 100]);

    expect(await database.words.count()).toBe(100);
    expect(await database.deckWords.count()).toBe(100);

    const withAudio = await database.words.filter((w) => Boolean(w.audioUS)).count();
    expect(withAudio).toBe(20); // every 5th row
    const word0 = await database.words.where('normalizedTerm').equals('waaa').first();
    expect(word0?.phoneticUS).toBe('/waaa/');
    expect(word0?.audioUS).toBe('https://audio.example.com/waaa.mp3');
  });

  it('reports duplicates inside the file and skips them', async () => {
    const parsed = parseWordCsv(buildCsv(20, { duplicateEvery: 5 }));
    // 20 unique + 4 duplicates appended.
    expect(parsed.duplicates.length).toBe(4);
    expect(parsed.rows).toHaveLength(20);

    const deck = await newDeck();
    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'dupes.csv',
      now: T0,
      database,
    });
    expect(result.createdWords).toBe(20);
    expect(await database.words.count()).toBe(20);
  });

  it('re-importing the same file creates no duplicates and keeps study progress', async () => {
    const deck = await newDeck();
    const parsed = parseWordCsv(buildCsv(30));
    const first = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'a.csv',
      now: T0,
      database,
    });
    expect(first.createdWords).toBe(30);

    // Study one word so there is progress to protect.
    const word = await database.words.where('normalizedTerm').equals('waab').first();
    const session = createSession({
      id: 's-1',
      plan: [{ wordId: word!.id, kind: 'new', dueAt: null }],
      mode: 'mixed',
      reviewMode: 'en-zh',
      deckIds: [deck.id],
      now: T0,
    });
    const next: StudySession = { ...session, cursor: 1, mainIndex: 1 };
    await commitReview({
      session,
      word: word!,
      rating: 'known',
      reviewMode: 'en-zh',
      eventId: 'evt-1',
      elapsedMs: 2000,
      now: T0,
      nextSession: next,
      database,
    });
    const stateBefore: UserWordState | undefined = await database.userWordStates
      .where('wordId')
      .equals(word!.id)
      .first();
    expect(stateBefore?.stability).toBeGreaterThan(0);

    // Re-import the identical file.
    const second = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'a.csv',
      now: T0 + 1000,
      database,
    });
    expect(second.createdWords).toBe(0);
    expect(second.skipped).toBe(30);
    expect(second.reusedWords).toBe(30);

    expect(await database.words.count()).toBe(30);
    expect(await database.deckWords.count()).toBe(30);

    const stateAfter = await database.userWordStates.where('wordId').equals(word!.id).first();
    expect(stateAfter?.stability).toBe(stateBefore?.stability);
    expect(stateAfter?.nextReviewAt).toBe(stateBefore?.nextReviewAt);
    expect(stateAfter?.repetitionCount).toBe(1);
  });

  it('shares one Word and one memory state across two decks', async () => {
    const deckA = await newDeck('Deck A');
    const deckB = await newDeck('Deck B');
    const parsed = parseWordCsv(buildCsv(10));

    await applyImport({ deckId: deckA.id, rows: parsed.rows, fileName: 'a.csv', now: T0, database });
    const second = await applyImport({
      deckId: deckB.id,
      rows: parsed.rows,
      fileName: 'b.csv',
      now: T0,
      database,
    });

    expect(second.createdWords).toBe(0);
    expect(second.linkedWords).toBe(10);
    expect(await database.words.count()).toBe(10);
    expect(await database.deckWords.count()).toBe(20);
  });
});

describe('import batching + undo', () => {
  it('undo removes only the batch and restores the previous state', async () => {
    const deck = await newDeck();
    const parsed = parseWordCsv(buildCsv(50));
    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'undo.csv',
      now: T0,
      database,
    });
    expect(await database.words.count()).toBe(50);

    const undo = await undoImport(result.batchId, T0, database);
    expect(undo.ok).toBe(true);
    expect(await database.words.count()).toBe(0);
    expect(await database.deckWords.count()).toBe(0);
    expect(await listImportBatches(database)).toHaveLength(0);
  });

  it('refuses to undo once a word has review history', async () => {
    const deck = await newDeck();
    const parsed = parseWordCsv(buildCsv(5));
    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'undo2.csv',
      now: T0,
      database,
    });

    const word = await database.words.where('normalizedTerm').equals('waaa').first();
    const session = createSession({
      id: 's-2',
      plan: [{ wordId: word!.id, kind: 'new', dueAt: null }],
      mode: 'mixed',
      reviewMode: 'en-zh',
      deckIds: [deck.id],
      now: T0,
    });
    await commitReview({
      session,
      word: word!,
      rating: 'known',
      reviewMode: 'en-zh',
      eventId: 'evt-2',
      elapsedMs: 1000,
      now: T0,
      nextSession: { ...session, cursor: 1, mainIndex: 1 },
      database,
    });

    const undo = await undoImport(result.batchId, T0, database);
    expect(undo.ok).toBe(false);
    expect(undo.message).toContain('学习记录');
    expect(await database.words.count()).toBe(5);
  });

  it('records batch metadata so imports can be listed and traced', async () => {
    const deck = await newDeck();
    const parsed = parseWordCsv(buildCsv(3));
    const result = await applyImport({
      deckId: deck.id,
      rows: parsed.rows,
      fileName: 'trace.csv',
      now: T0,
      database,
    });
    const batches = await listImportBatches(database);
    expect(batches[0]).toMatchObject({
      id: result.batchId,
      deckId: deck.id,
      fileName: 'trace.csv',
      createdAt: T0,
    });
    expect(batches[0].createdWordIds).toHaveLength(3);
  });
});

describe('audio URL sanitising', () => {
  it('accepts http(s) and site-relative paths only', () => {
    expect(sanitizeAudioUrl('https://cdn.example.com/a.mp3')).toBe('https://cdn.example.com/a.mp3');
    expect(sanitizeAudioUrl('/audio/a.mp3')).toBe('/audio/a.mp3');
    expect(sanitizeAudioUrl('javascript:alert(1)')).toBeNull();
    expect(sanitizeAudioUrl('not a url')).toBeNull();
    expect(sanitizeAudioUrl('ftp://x/a.mp3')).toBeNull();
    expect(sanitizeAudioUrl('')).toBeNull();
  });

  it('drops invalid audio columns instead of storing them', async () => {
    const parsed = parseWordCsv(
      'term,definitions,audioUS,audioUK\nabandon,放弃,javascript:alert(1),/audio/uk.mp3\n',
    );
    expect(parsed.rows[0].audioUS).toBeNull();
    expect(parsed.rows[0].audioUK).toBe('/audio/uk.mp3');
  });
});

describe('deck overview + quality report', () => {
  it('counts real totals, learned/unlearned and missing data', async () => {
    const deck = await newDeck();
    const parsed = parseWordCsv(buildCsv(10));
    await applyImport({ deckId: deck.id, rows: parsed.rows, fileName: 'q.csv', now: T0, database });

    // Study two words.
    for (const term of ['waaa', 'waab']) {
      const word = await database.words.where('normalizedTerm').equals(term).first();
      const session = createSession({
        id: `s-${term}`,
        plan: [{ wordId: word!.id, kind: 'new', dueAt: null }],
        mode: 'mixed',
        reviewMode: 'en-zh',
        deckIds: [deck.id],
        now: T0,
      });
      await commitReview({
        session,
        word: word!,
        rating: 'known',
        reviewMode: 'en-zh',
        eventId: `evt-${term}`,
        elapsedMs: 1000,
        now: T0,
        nextSession: { ...session, cursor: 1, mainIndex: 1 },
        database,
      });
    }

    const decks = await database.decks.toArray();
    const words = await database.words.toArray();
    const deckWords = await database.deckWords.toArray();
    const states = await database.userWordStates.toArray();
    const [overview] = computeDeckOverviews({ decks, words, deckWords, states, now: T0 });

    expect(overview.total).toBe(10);
    expect(overview.learned).toBe(2);
    expect(overview.unlearned).toBe(8);
    expect(overview.mastered).toBe(0);
    // Every 5th row has audio → 2 of 10 have audio, 8 missing.
    expect(overview.missingAudio).toBe(8);
    expect(overview.missingPhonetic).toBe(0);
    expect(overview.missingDefinition).toBe(0);
    expect(overview.missingExample).toBe(0);
  });

  it('flags duplicates, empty definitions and malformed rows', () => {
    const base = {
      normalizedTerm: '',
      phonetic: '',
      phoneticUS: '',
      phoneticUK: '',
      partOfSpeech: 'n.',
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
    };
    const report = checkWordQuality([
      { ...base, id: '1', term: 'abandon', normalizedTerm: 'abandon', definitions: ['放弃'], phoneticUS: '/x/' },
      { ...base, id: '2', term: 'abandon', normalizedTerm: 'abandon', definitions: ['放弃'], phoneticUS: '/x/' },
      { ...base, id: '3', term: 'broken', normalizedTerm: 'broken', definitions: ['   '], phoneticUS: '/x/' },
      { ...base, id: '4', term: 'empty', normalizedTerm: 'empty', definitions: [], phoneticUS: '/x/' },
    ]);

    expect(report.total).toBe(4);
    expect(report.duplicates).toEqual([{ term: 'abandon', count: 2 }]);
    // Every row in this fixture lacks audio/examples, so all four carry issues…
    expect(report.withIssues).toBe(4);
    // …but the blank-definition rows are specifically flagged for 释义.
    const issuesFor = (id: string) => report.issues.find((i) => i.wordId === id)?.issues ?? [];
    expect(issuesFor('3')).toContain('缺少释义');
    expect(issuesFor('4')).toContain('缺少释义');
    expect(issuesFor('1')).not.toContain('缺少释义');
  });
});

describe('deck deletion', () => {
  it('removes unlearned words but keeps studied ones', async () => {
    const deck = await newDeck('Deletable');
    const parsed = parseWordCsv(buildCsv(6));
    await applyImport({ deckId: deck.id, rows: parsed.rows, fileName: 'd.csv', now: T0, database });

    const kept = await database.words.where('normalizedTerm').equals('waaa').first();
    const session = createSession({
      id: 's-keep',
      plan: [{ wordId: kept!.id, kind: 'new', dueAt: null }],
      mode: 'mixed',
      reviewMode: 'en-zh',
      deckIds: [deck.id],
      now: T0,
    });
    await commitReview({
      session,
      word: kept!,
      rating: 'known',
      reviewMode: 'en-zh',
      eventId: 'evt-keep',
      elapsedMs: 1000,
      now: T0,
      nextSession: { ...session, cursor: 1, mainIndex: 1 },
      database,
    });

    const result = await deleteDeck(deck.id, T0, database);
    expect(result.ok).toBe(true);
    expect(result.removedWords).toBe(5);
    expect(await database.words.count()).toBe(1);
    expect(await database.words.get(kept!.id)).toBeTruthy();
    expect(await database.userWordStates.where('wordId').equals(kept!.id).count()).toBe(1);
    expect(await database.decks.get(deck.id)).toBeUndefined();
  });
});

void vi;
