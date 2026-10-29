import type { Word } from '@/lib/types';

/** Build a complete Word for tests; only override what the test cares about. */
export function makeTestWord(overrides: Partial<Word> & Pick<Word, 'id' | 'term'>): Word {
  const phonetic = overrides.phonetic ?? '/test/';
  return {
    normalizedTerm: overrides.term.trim().toLowerCase(),
    phonetic,
    phoneticUS: phonetic,
    phoneticUK: phonetic,
    partOfSpeech: 'n.',
    definitions: ['测试释义'],
    examples: [],
    translations: [],
    audioUS: null,
    audioUK: null,
    tags: [],
    source: 'test',
    licenseNote: 'CC0',
    mnemonic: null,
    createdAt: 0,
    updatedAt: 0,
    ...overrides,
  };
}
