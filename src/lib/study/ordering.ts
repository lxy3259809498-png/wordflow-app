import type { Word } from '@/lib/types';

/**
 * Card ordering for study sessions.
 * - `alphabetical`: deterministic A→Z, good for reviewing a whole book.
 * - `random`: shuffled once per session and persisted in the session plan, so
 *   resuming a session does not reshuffle (and never repeats a card).
 * - `frequency`: words marked 高频 first (demo data and imports both use tags).
 * - `mistakes`: weakest words first (more lapses, more fuzzy ratings).
 */
export type WordOrder = 'alphabetical' | 'random' | 'frequency' | 'mistakes';

export const ORDER_LABELS: Record<WordOrder, { label: string; hint: string }> = {
  alphabetical: { label: '正序 A→Z', hint: '按字母顺序，便于系统过一遍词书' },
  random: { label: '乱序', hint: '每节随机打乱，避免只记住位置' },
  frequency: { label: '高频优先', hint: '带「高频」标签的词先学' },
  mistakes: { label: '薄弱优先', hint: '遗忘次数多、连续模糊的词先练' },
};

export interface OrderContext {
  /** Lapse count per wordId, for `mistakes`. */
  lapseByWord?: Map<string, number>;
  fuzzyByWord?: Map<string, number>;
}

const collator = new Intl.Collator('en', { sensitivity: 'base' });

/** Deterministic shuffle (mulberry32) — same seed → same order. */
function seededShuffle<T>(items: T[], seed: number): T[] {
  let state = seed >>> 0 || 1;
  const random = () => {
    state += 0x6d2b79f5;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function hashSeed(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/**
 * Apply an ordering to words. `seed` makes `random` reproducible; pass a stable
 * value (e.g. the session id) so resuming keeps the same sequence.
 */
export function orderWords(
  words: Word[],
  order: WordOrder,
  seed = 'wordflow',
  context: OrderContext = {},
): Word[] {
  switch (order) {
    case 'alphabetical':
      return [...words].sort((a, b) => collator.compare(a.term, b.term));
    case 'random':
      return seededShuffle(words, hashSeed(seed));
    case 'frequency': {
      const score = (word: Word) =>
        (word.tags.includes('高频') ? 0 : 1) + (word.tags.length > 1 ? 0 : 0.5);
      return [...words].sort(
        (a, b) => score(a) - score(b) || collator.compare(a.term, b.term),
      );
    }
    case 'mistakes': {
      const weight = (word: Word) =>
        (context.lapseByWord?.get(word.id) ?? 0) * 2 +
        (context.fuzzyByWord?.get(word.id) ?? 0);
      return [...words].sort(
        (a, b) => weight(b) - weight(a) || collator.compare(a.term, b.term),
      );
    }
    default:
      return words;
  }
}
