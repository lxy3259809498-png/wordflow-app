import { db, type WordFlowDB } from '@/lib/db/db';
import type { Deck, DeckWord, UserWordState, Word } from '@/lib/types';
import { isMastered } from '@/lib/data/repository';

/** Overview numbers for one deck, all derived from real rows. */
export interface DeckOverview {
  deckId: string;
  total: number;
  learned: number;
  unlearned: number;
  mastered: number;
  dueNow: number;
  missingAudio: number;
  missingPhonetic: number;
  missingDefinition: number;
  missingExample: number;
  importedAt: number | null;
}

export interface DeckStatsInput {
  decks: Deck[];
  words: Word[];
  deckWords: DeckWord[];
  states: UserWordState[];
  now: number;
}

export function hasAudio(word: Word): boolean {
  return Boolean(word.audioUS || word.audioUK);
}

export function hasPhonetic(word: Word): boolean {
  return Boolean(word.phoneticUS || word.phoneticUK || word.phonetic);
}

export function hasDefinition(word: Word): boolean {
  return Array.isArray(word.definitions) && word.definitions.some((d) => d.trim().length > 0);
}

export function hasExample(word: Word): boolean {
  return Array.isArray(word.examples) && word.examples.some((e) => e.en.trim().length > 0);
}

/** Per-deck overview + quality counters. Pure function so it is unit-testable. */
export function computeDeckOverviews(input: DeckStatsInput): DeckOverview[] {
  const wordById = new Map(input.words.map((word) => [word.id, word]));
  const stateByWord = new Map(input.states.map((state) => [state.wordId, state]));

  return input.decks.map((deck) => {
    const links = input.deckWords.filter((link) => link.deckId === deck.id);
    const words = links
      .map((link) => wordById.get(link.wordId))
      .filter((word): word is Word => Boolean(word));

    let learned = 0;
    let mastered = 0;
    let dueNow = 0;
    for (const word of words) {
      const state = stateByWord.get(word.id);
      if (state?.lastReviewedAt) learned += 1;
      if (isMastered(state)) mastered += 1;
      if (state?.nextReviewAt !== null && state?.nextReviewAt !== undefined && state.nextReviewAt <= input.now) {
        dueNow += 1;
      }
    }

    return {
      deckId: deck.id,
      total: words.length,
      learned,
      unlearned: words.length - learned,
      mastered,
      dueNow,
      missingAudio: words.filter((word) => !hasAudio(word)).length,
      missingPhonetic: words.filter((word) => !hasPhonetic(word)).length,
      missingDefinition: words.filter((word) => !hasDefinition(word)).length,
      missingExample: words.filter((word) => !hasExample(word)).length,
      importedAt: deck.updatedAt ?? deck.createdAt ?? null,
    };
  });
}

export interface WordQualityIssue {
  wordId: string;
  term: string;
  issues: string[];
}

/**
 * Data-quality report used by the deck page and by import previews:
 * duplicates, empty definitions, malformed phonetic, missing audio/examples,
 * suspicious characters.
 */
export function checkWordQuality(words: Word[]): {
  total: number;
  duplicates: { term: string; count: number }[];
  issues: WordQualityIssue[];
  withIssues: number;
} {
  const byNormalized = new Map<string, number>();
  for (const word of words) {
    const key = word.normalizedTerm || word.term.trim().toLowerCase();
    byNormalized.set(key, (byNormalized.get(key) ?? 0) + 1);
  }
  const duplicates = [...byNormalized.entries()]
    .filter(([, count]) => count > 1)
    .map(([term, count]) => ({ term, count }));

  const issues: WordQualityIssue[] = [];
  for (const word of words) {
    const problems: string[] = [];
    if (!hasDefinition(word)) problems.push('缺少释义');
    if (!hasPhonetic(word)) problems.push('缺少音标');
    if (!hasAudio(word)) problems.push('缺少录音（将使用系统语音）');
    if (!hasExample(word)) problems.push('缺少例句');
    if (word.phoneticUS && !/^\/?.+\/?$/.test(word.phoneticUS)) problems.push('音标格式异常');
    if (/[^\x20-\x7E\u00C0-\u024F\u0250-\u02FF\u2018\u2019\u2013\u2014]/.test(word.term)) {
      problems.push('单词含异常字符');
    }
    if (problems.length > 0) {
      issues.push({ wordId: word.id, term: word.term, issues: problems });
    }
  }

  return {
    total: words.length,
    duplicates,
    issues,
    withIssues: issues.length,
  };
}

export async function loadDeckOverviews(
  now: number,
  database: WordFlowDB = db,
): Promise<{ decks: Deck[]; overviews: DeckOverview[] }> {
  const [decks, words, deckWords, states] = await Promise.all([
    database.decks.toArray(),
    database.words.toArray(),
    database.deckWords.toArray(),
    database.userWordStates.toArray(),
  ]);
  return {
    decks: decks.sort((a, b) => a.createdAt - b.createdAt),
    overviews: computeDeckOverviews({ decks, words, deckWords, states, now }),
  };
}
