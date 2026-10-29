import type { Word } from '@/lib/types';

/** Normalise typed answers: case, spacing, curly apostrophes, trailing punctuation. */
export function normalizeAnswer(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/[’‘]/g, "'")
    .replace(/\s+/g, ' ')
    .replace(/[.,;:!?]+$/g, '');
}

export interface SpellingCheck {
  correct: boolean;
  expected: string;
  /** Distance-based hint: `near` means a small typo, `off` means wrong word. */
  closeness: 'exact' | 'near' | 'off';
}

/** Levenshtein distance, capped for short words. */
export function editDistance(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length) return b.length;
  if (!b.length) return a.length;
  let previous = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= b.length; j += 1) {
      current[j] = Math.min(
        previous[j] + 1,
        current[j - 1] + 1,
        previous[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    previous = current;
  }
  return previous[b.length];
}

/**
 * Spelling is judged against the term only. A near miss (≤1 edit for short
 * words, ≤2 for longer ones) is reported as `near` so the UI can be encouraging
 * without ever counting a typo as fully correct.
 */
export function checkSpelling(input: string, term: string): SpellingCheck {
  const expected = term.trim();
  const typed = normalizeAnswer(input);
  const target = normalizeAnswer(term);
  if (!typed) return { correct: false, expected, closeness: 'off' };
  if (typed === target) return { correct: true, expected, closeness: 'exact' };
  const distance = editDistance(typed, target);
  const tolerance = target.length <= 4 ? 1 : target.length <= 8 ? 1 : 2;
  return { correct: false, expected, closeness: distance <= tolerance ? 'near' : 'off' };
}

export interface ChoiceOption {
  definition: string;
  correct: boolean;
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Deterministic shuffle so a card's options don't jump on every re-render. */
function seededShuffle<T>(items: T[], seed: string): T[] {
  const out = [...items];
  let state = hashString(seed) || 1;
  for (let i = out.length - 1; i > 0; i -= 1) {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    const j = state % (i + 1);
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Build 4 options: the real meaning plus distinct distractors from other words.
 * Falls back to fewer options when the pool is tiny, and never duplicates a
 * definition.
 */
export function buildChoiceOptions(
  word: Word,
  pool: Word[],
  desired = 4,
): ChoiceOption[] {
  const correct = word.definitions[0];
  const seen = new Set([correct.trim()]);
  const distractors: string[] = [];
  for (const candidate of seededShuffle(pool, word.id)) {
    if (candidate.id === word.id) continue;
    const definition = candidate.definitions[0]?.trim();
    if (!definition || seen.has(definition)) continue;
    seen.add(definition);
    distractors.push(definition);
    if (distractors.length >= desired - 1) break;
  }
  const options = [
    { definition: correct, correct: true },
    ...distractors.map((definition) => ({ definition, correct: false })),
  ];
  return seededShuffle(options, `${word.id}:options`);
}
