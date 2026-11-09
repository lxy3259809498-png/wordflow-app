import { describe, expect, it } from 'vitest';
import { GENERATED_DECK_INDEX, loadGeneratedDecks } from '@/lib/db/seed';

/**
 * Guards the built-in vocabulary. The app ships only ECDICT decks, so the risks
 * worth testing are: a deck whose word count drifts from its index entry, a
 * duplicate normalized term in the shared pool (which would violate the unique
 * index on `words.normalizedTerm`), and a deck wrongly flagged as demo data.
 */
describe('built-in ECDICT decks', () => {
  it('ships the eight real exam decks', () => {
    const ids = GENERATED_DECK_INDEX.map((entry) => entry.id);
    expect(ids.sort()).toEqual(
      ['cet4-full', 'cet6-full', 'gk-core', 'gre-full', 'ielts-full', 'kaoyan-full', 'toefl-full', 'zk-core'].sort(),
    );
  });

  it('reports the real vocabulary size of each deck', () => {
    const expected: Record<string, number> = {
      'zk-core': 1598,
      'gk-core': 3666,
      'cet4-full': 3844,
      'cet6-full': 5401,
      'kaoyan-full': 4796,
      'ielts-full': 5020,
      'toefl-full': 6936,
      'gre-full': 7484,
    };
    for (const entry of GENERATED_DECK_INDEX) {
      expect(entry.count, `${entry.id} 的词数`).toBe(expected[entry.id]);
    }
  });

  it('builds deck rows that carry their source and licence', async () => {
    const { decks } = await loadGeneratedDecks();
    expect(decks).toHaveLength(GENERATED_DECK_INDEX.length);
    for (const deck of decks) {
      expect(deck.id.startsWith('deck-')).toBe(true);
      expect(deck.isDemo).toBe(false);
      expect(deck.source).toContain('ECDICT');
      expect(deck.licenseNote).toContain('MIT');
      expect(deck.name.trim().length).toBeGreaterThan(0);
      expect(deck.description).toContain('不是官方考纲全集');
    }
  });

  it('keeps the shared word pool deduplicated across decks', async () => {
    const { words, links } = await loadGeneratedDecks();
    const terms = words.map((word) => word.normalizedTerm);
    expect(new Set(terms).size).toBe(terms.length);
    // 8,000+ terms appear in more than one exam list, so links far outnumber words.
    expect(links.length).toBeGreaterThan(words.length);
    const linkIds = links.map((link) => link.id);
    expect(new Set(linkIds).size).toBe(linkIds.length);
  });

  it('gives every word the fields the UI needs', async () => {
    const { words } = await loadGeneratedDecks();
    for (const word of words.slice(0, 500)) {
      expect(word.term.trim().length).toBeGreaterThan(0);
      expect(word.normalizedTerm).toBe(word.term.trim().toLowerCase());
      expect(word.definitions.length).toBeGreaterThan(0);
      expect(word.definitions[0].trim().length).toBeGreaterThan(0);
      expect(word.source).toBe('ECDICT');
      expect(word.licenseNote).toContain('MIT');
    }
  });

  it('keeps word ids stable across calls so re-seeding stays idempotent', async () => {
    const first = await loadGeneratedDecks();
    const again = await loadGeneratedDecks();
    expect(again.words.map((word) => word.id)).toEqual(first.words.map((word) => word.id));
    expect(again.links.map((link) => link.id)).toEqual(first.links.map((link) => link.id));
  });
});
