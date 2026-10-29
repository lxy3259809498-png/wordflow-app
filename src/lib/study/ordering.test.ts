import { describe, expect, it } from 'vitest';
import { hashSeed, orderWords, type WordOrder } from '@/lib/study/ordering';
import { makeTestWord } from '@/test/factories';

const words = [
  makeTestWord({ id: 'w1', term: 'zebra', tags: ['高频'] }),
  makeTestWord({ id: 'w2', term: 'apple', tags: [] }),
  makeTestWord({ id: 'w3', term: 'Mango', tags: ['高频'] }),
  makeTestWord({ id: 'w4', term: 'banana', tags: [] }),
];

const terms = (list: { term: string }[]) => list.map((w) => w.term);

describe('orderWords', () => {
  it('sorts A→Z case-insensitively for the default order', () => {
    expect(terms(orderWords(words, 'alphabetical'))).toEqual([
      'apple',
      'banana',
      'Mango',
      'zebra',
    ]);
  });

  it('does not mutate the input array', () => {
    const original = terms(words);
    orderWords(words, 'alphabetical');
    expect(terms(words)).toEqual(original);
  });

  it('produces a deterministic shuffle for the same seed', () => {
    const a = terms(orderWords(words, 'random', 'session-1'));
    const b = terms(orderWords(words, 'random', 'session-1'));
    expect(a).toEqual(b);
    // …and still contains every word exactly once.
    expect([...a].sort()).toEqual([...terms(words)].sort());
  });

  it('shuffles differently for a different seed', () => {
    const a = terms(orderWords(words, 'random', 'session-1'));
    const b = terms(orderWords(words, 'random', 'session-2'));
    expect(a).not.toEqual(b);
  });

  it('puts 高频 words first in frequency order', () => {
    const ordered = orderWords(words, 'frequency');
    const firstTwo = ordered.slice(0, 2).map((w) => w.tags.includes('高频'));
    expect(firstTwo).toEqual([true, true]);
  });

  it('puts weakest words first in mistakes order', () => {
    const ordered = orderWords(words, 'mistakes', 's', {
      lapseByWord: new Map([
        ['w2', 5],
        ['w4', 1],
      ]),
      fuzzyByWord: new Map([['w3', 3]]),
    });
    // w2 has the highest weight (5 lapses × 2).
    expect(ordered[0].term).toBe('apple');
    // w3 (3 fuzzy) outranks the untouched words.
    expect(ordered[1].term).toBe('Mango');
  });

  it('returns the same array for an unknown order', () => {
    const ordered = orderWords(words, 'nope' as WordOrder);
    expect(terms(ordered)).toEqual(terms(words));
  });

  it('hashes the same string consistently', () => {
    expect(hashSeed('abc')).toBe(hashSeed('abc'));
    expect(hashSeed('abc')).not.toBe(hashSeed('abd'));
  });
});
