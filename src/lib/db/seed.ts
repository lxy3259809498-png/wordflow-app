import type { Deck, Word } from '@/lib/types';
import {
  GENERATED_DECK_INDEX,
  loadGeneratedDeck,
  type GeneratedDeck,
} from '@/lib/db/seedDecks.generated';

export { GENERATED_DECK_INDEX };

// ---------------------------------------------------------------------------
// Built-in vocabulary = the eight full-size exam decks generated from ECDICT
// (MIT). Real sizes: 中考 1.6k, 高考 3.7k, 四级 3.8k, 六级 5.4k, 考研 4.8k,
// 雅思 5.0k, 托福 6.9k, GRE 7.5k. Each deck lives in its own module and is
// loaded on demand so the entry bundle stays small.
//
// There are no hand-written sample decks any more: they were removed because a
// 20-word "demo deck" next to a 5,000-word real deck only ever confused the
// word counts. Nothing here is invented — every entry comes from ECDICT.
// ---------------------------------------------------------------------------

/** Converts one generated deck into the Deck/Word rows the DB stores. */
export function buildGeneratedDeckRows(deck: GeneratedDeck): { deck: Deck; words: Word[] } {
  const now = Date.now();
  const deckRow: Deck = {
    id: `deck-${deck.id}`,
    name: deck.name,
    examType: deck.examType as Deck['examType'],
    description: `${deck.count} 词 · ${deck.note}。词表与释义来自 ECDICT（MIT 许可）的考试标签，不是官方考纲全集。`,
    source: 'ECDICT (github.com/skywind3000/ECDICT)',
    licenseNote: 'MIT License — 词表与中文释义源自 ECDICT，可自由使用与再分发。',
    isDemo: false,
    dataVersion: '2026.10',
    createdAt: now,
    updatedAt: now,
  };
  const words: Word[] = deck.words.map((word, index) => ({
    // Stable ids so re-seeding updates instead of duplicating.
    id: `${deck.id}-${String(index + 1).padStart(5, '0')}`,
    term: word.term,
    normalizedTerm: word.term.trim().toLowerCase(),
    phonetic: word.phonetic,
    phoneticUS: word.phonetic,
    phoneticUK: word.phonetic,
    partOfSpeech: word.partOfSpeech,
    definitions: word.definitions,
    examples: [],
    translations: [],
    // No recorded audio is bundled; the app uses online dictionary audio or TTS.
    audioUS: null,
    audioUK: null,
    tags: [],
    source: 'ECDICT',
    licenseNote: 'MIT License — ECDICT',
    mnemonic: null,
    createdAt: now,
    updatedAt: now,
  }));
  return { deck: deckRow, words };
}

/**
 * Loads every generated deck. Only call this from the seeding path — it pulls
 * in all word lists, which is why the app otherwise imports the index alone.
 *
 * Important: `words.normalizedTerm` is globally unique, and 8.7k of these terms
 * appear in more than one exam list (e.g. "abandon" is in 四级 and 六级). So the
 * result is a shared word pool plus per-deck links — exactly the model the app
 * already uses for user imports. Words are NOT duplicated per deck.
 */
export async function loadGeneratedDecks(): Promise<{
  decks: Deck[];
  words: Word[];
  links: { id: string; deckId: string; wordId: string; createdAt: number }[];
}> {
  const decks: Deck[] = [];
  const wordPool = new Map<string, Word>();
  const links: { id: string; deckId: string; wordId: string; createdAt: number }[] = [];

  for (const entry of GENERATED_DECK_INDEX) {
    const full = await loadGeneratedDeck(entry.id);
    if (!full) continue;
    const { deck } = buildGeneratedDeckRows(full);
    decks.push(deck);
    const now = Date.now();

    full.words.forEach((word, index) => {
      const key = word.term.trim().toLowerCase();
      let row = wordPool.get(key);
      if (!row) {
        row = {
          id: `w-${key}`,
          term: word.term,
          normalizedTerm: key,
          phonetic: word.phonetic,
          phoneticUS: word.phonetic,
          phoneticUK: word.phonetic,
          partOfSpeech: word.partOfSpeech,
          definitions: word.definitions,
          examples: [],
          translations: [],
          audioUS: null,
          audioUK: null,
          tags: [],
          source: 'ECDICT',
          licenseNote: 'MIT License — ECDICT',
          mnemonic: null,
          createdAt: now,
          updatedAt: now,
        };
        wordPool.set(key, row);
      }
      links.push({
        id: `${deck.id}:${row.id}`,
        deckId: deck.id,
        wordId: row.id,
        createdAt: now + index,
      });
    });
  }

  return { decks, words: [...wordPool.values()], links };
}
