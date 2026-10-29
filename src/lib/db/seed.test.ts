import { describe, expect, it } from 'vitest';
import { DEMO_DECKS, DEMO_WORD_COUNT, getDemoWords } from '@/lib/db/seed';
import { EXTRA_DECK_SEEDS } from '@/lib/db/seedExtra';

/**
 * Guards against the two ways a hand-written seed file breaks a database:
 * duplicate word ids, and duplicate normalized terms (which would violate the
 * unique index on `words.normalizedTerm`).
 */
describe('demo seed integrity', () => {
  const demo = getDemoWords();
  const allWords = demo.flatMap((entry) => entry.words);

  it('ships several decks, not just two', () => {
    expect(demo.length).toBeGreaterThanOrEqual(8);
    expect(demo.length).toBe(EXTRA_DECK_SEEDS.length + DEMO_DECKS.length);
  });

  it('has a meaningful amount of vocabulary', () => {
    expect(DEMO_WORD_COUNT).toBe(allWords.length);
    expect(DEMO_WORD_COUNT).toBeGreaterThanOrEqual(190);
  });

  it('uses unique word ids', () => {
    const ids = allWords.map((word) => word.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('never duplicates a normalized term across decks', () => {
    const seen = new Map<string, string>();
    for (const entry of demo) {
      for (const word of entry.words) {
        const previous = seen.get(word.normalizedTerm);
        expect(previous, `"${word.term}" 同时出现在 ${previous} 和 ${entry.deck.name}`).toBeUndefined();
        seen.set(word.normalizedTerm, entry.deck.name);
      }
    }
  });

  it('gives every word the fields the UI needs', () => {
    for (const word of allWords) {
      expect(word.term.trim().length).toBeGreaterThan(0);
      expect(word.normalizedTerm).toBe(word.term.trim().toLowerCase());
      expect(word.definitions.length).toBeGreaterThan(0);
      expect(word.definitions[0].trim().length).toBeGreaterThan(0);
      expect(word.partOfSpeech.trim().length).toBeGreaterThan(0);
      expect(word.licenseNote.length).toBeGreaterThan(0);
      expect(word.source.length).toBeGreaterThan(0);
    }
  });

  it('ships example sentences with translations for every word', () => {
    for (const word of allWords) {
      expect(word.examples.length).toBeGreaterThan(0);
      expect(word.examples[0].en.trim().length).toBeGreaterThan(8);
      expect(word.examples[0].zh.trim().length).toBeGreaterThan(1);
    }
  });

  it('marks every demo deck as demo content with a licence note', () => {
    for (const entry of demo) {
      expect(entry.deck.isDemo).toBe(true);
      expect(entry.deck.licenseNote.length).toBeGreaterThan(0);
      expect(entry.deck.name).toContain('演示');
      expect(entry.words.length).toBeGreaterThanOrEqual(20);
    }
  });

  it('covers the promised deck categories', () => {
    const types = demo.map((entry) => entry.deck.examType);
    for (const expected of ['CET4', 'CET6', 'GAOKAO', 'KAOYAN', 'IELTS', 'TOEFL', 'BUSINESS', 'DAILY', 'TECH']) {
      expect(types).toContain(expected);
    }
  });

  it('keeps word ids stable across calls so re-seeding stays idempotent', () => {
    const again = getDemoWords().flatMap((entry) => entry.words.map((word) => word.id));
    expect(again).toEqual(allWords.map((word) => word.id));
  });
});
