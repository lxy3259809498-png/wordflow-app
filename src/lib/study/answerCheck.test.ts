import { describe, expect, it } from 'vitest';
import {
  buildChoiceOptions,
  checkSpelling,
  editDistance,
  normalizeAnswer,
} from '@/lib/study/answerCheck';
import { makeTestWord } from '@/test/factories';
import type { Word } from '@/lib/types';

function word(id: string, term: string, definitions: string[]): Word {
  return makeTestWord({
    id,
    term,
    definitions,
    phonetic: '/test/',
    partOfSpeech: 'n.',
  });
}

describe('normalizeAnswer', () => {
  it('ignores case, outer spaces and trailing punctuation', () => {
    expect(normalizeAnswer('  Abandon. ')).toBe('abandon');
    expect(normalizeAnswer('Abandon!')).toBe('abandon');
  });

  it('normalises curly apostrophes and inner spacing', () => {
    expect(normalizeAnswer('don’t')).toBe("don't");
    expect(normalizeAnswer('take   off')).toBe('take off');
  });
});

describe('checkSpelling', () => {
  it('accepts the exact term regardless of case', () => {
    const result = checkSpelling('Abandon', 'abandon');
    expect(result.correct).toBe(true);
    expect(result.closeness).toBe('exact');
  });

  it('rejects a typo but reports it as near', () => {
    const result = checkSpelling('abandan', 'abandon');
    expect(result.correct).toBe(false);
    expect(result.closeness).toBe('near');
    expect(result.expected).toBe('abandon');
  });

  it('reports a completely different word as off', () => {
    const result = checkSpelling('banana', 'abandon');
    expect(result.correct).toBe(false);
    expect(result.closeness).toBe('off');
  });

  it('treats an empty answer as incorrect rather than a pass', () => {
    expect(checkSpelling('   ', 'abandon')).toEqual({
      correct: false,
      expected: 'abandon',
      closeness: 'off',
    });
  });

  it('computes edit distance correctly', () => {
    expect(editDistance('abandon', 'abandon')).toBe(0);
    expect(editDistance('abandan', 'abandon')).toBe(1);
    expect(editDistance('', 'abc')).toBe(3);
  });
});

describe('buildChoiceOptions', () => {
  const target = word('w1', 'abandon', ['放弃，抛弃']);
  const pool = [
    target,
    word('w2', 'benefit', ['益处，好处']),
    word('w3', 'capacity', ['容量，能力']),
    word('w4', 'decline', ['下降，衰退']),
    word('w5', 'efficient', ['高效的']),
    word('w6', 'duplicate', ['放弃，抛弃']), // duplicate meaning must be skipped
  ];

  it('returns four options with exactly one correct answer', () => {
    const options = buildChoiceOptions(target, pool);
    expect(options).toHaveLength(4);
    expect(options.filter((option) => option.correct)).toHaveLength(1);
    expect(options.find((option) => option.correct)?.definition).toBe('放弃，抛弃');
  });

  it('never repeats a definition across options', () => {
    const definitions = buildChoiceOptions(target, pool).map((option) => option.definition);
    expect(new Set(definitions).size).toBe(definitions.length);
  });

  it('is deterministic for the same word', () => {
    const a = buildChoiceOptions(target, pool).map((o) => o.definition);
    const b = buildChoiceOptions(target, pool).map((o) => o.definition);
    expect(a).toEqual(b);
  });

  it('degrades gracefully when the pool is too small', () => {
    const options = buildChoiceOptions(target, [target]);
    expect(options).toHaveLength(1);
    expect(options[0].correct).toBe(true);
  });
});
