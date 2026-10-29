import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/lib/db/db';
import { isMastered } from '@/lib/data/repository';
import type {
  DailyStats,
  Deck,
  DeckWord,
  ReviewLog,
  StudySession,
  UserWordState,
  Word,
} from '@/lib/types';

export interface WordflowSnapshot {
  decks: Deck[];
  words: Word[];
  deckWords: DeckWord[];
  states: UserWordState[];
  logs: ReviewLog[];
  sessions: StudySession[];
  stats: DailyStats[];
}

export function useSnapshot(): WordflowSnapshot | undefined {
  return useLiveQuery(async () => {
    const [decks, words, deckWords, states, logs, sessions, stats] = await Promise.all([
      db.decks.toArray(),
      db.words.toArray(),
      db.deckWords.toArray(),
      db.userWordStates.toArray(),
      db.reviewLogs.toArray(),
      db.sessions.toArray(),
      db.dailyStats.toArray(),
    ]);
    return { decks, words, deckWords, states, logs, sessions, stats };
  }, []);
}

export interface DeckSummary {
  deck: Deck;
  total: number;
  learned: number;
  mastered: number;
  percent: number;
}

export function wordsOfDeck(snapshot: WordflowSnapshot, deckId: string): Word[] {
  const ids = new Set(
    snapshot.deckWords.filter((link) => link.deckId === deckId).map((link) => link.wordId),
  );
  return snapshot.words.filter((word) => ids.has(word.id));
}

export function summariseDecks(snapshot: WordflowSnapshot): DeckSummary[] {
  const stateByWord = new Map(snapshot.states.map((s) => [s.wordId, s]));
  return snapshot.decks.map((deck) => {
    const wordIds = new Set(
      snapshot.deckWords.filter((link) => link.deckId === deck.id).map((link) => link.wordId),
    );
    let learned = 0;
    let mastered = 0;
    for (const id of wordIds) {
      const state = stateByWord.get(id);
      // A star/error-book flag can exist before the first review; only a real
      // review makes the word "learned".
      if (state?.lastReviewedAt) learned += 1;
      if (isMastered(state)) mastered += 1;
    }
    return {
      deck,
      total: wordIds.size,
      learned,
      mastered,
      percent: wordIds.size === 0 ? 0 : Math.round((learned / wordIds.size) * 100),
    };
  });
}
