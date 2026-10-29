// Builds real, full-size decks from ECDICT (MIT licensed, github.com/skywind3000/ECDICT).
// Run: node scripts/build-decks.mjs
//
// Output: src/lib/db/seedDecks.generated.ts
//
// We keep only fields the app uses and drop anything that would look like a
// fabricated claim: no invented audio URLs, no rewritten definitions.
import fs from 'node:fs';

const CSV = '.cache/ecdict.csv';
const OUT = 'src/lib/db/seedDecks.generated.ts';

/** Decks we generate, in display order. */
const DECKS = [
  { tag: 'zk', id: 'zk-core', name: '中考核心词', examType: 'JUNIOR', note: '初中毕业与中考' },
  { tag: 'gk', id: 'gk-core', name: '高考核心词', examType: 'GAOKAO', note: '高中与高考' },
  { tag: 'cet4', id: 'cet4-full', name: 'CET-4 四级词表', examType: 'CET4', note: '大学英语四级' },
  { tag: 'cet6', id: 'cet6-full', name: 'CET-6 六级词表', examType: 'CET6', note: '大学英语六级' },
  { tag: 'ky', id: 'kaoyan-full', name: '考研英语词表', examType: 'KAOYAN', note: '考研英语一/二' },
  { tag: 'ielts', id: 'ielts-full', name: '雅思词表', examType: 'IELTS', note: 'IELTS Academic' },
  { tag: 'toefl', id: 'toefl-full', name: '托福词表', examType: 'TOEFL', note: 'TOEFL iBT' },
  { tag: 'gre', id: 'gre-full', name: 'GRE 词表', examType: 'GRE', note: 'GRE General' },
];

function parseCsv(text) {
  const rows = [];
  let row = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else inQuotes = false;
      } else field += c;
      continue;
    }
    if (c === '"') inQuotes = true;
    else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') field += c;
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

/** ECDICT phonetic uses "ә" (Cyrillic) for schwa; normalise to IPA "ə". */
function fixPhonetic(raw) {
  if (!raw) return '';
  let p = raw
    .replace(/ә/g, 'ə')
    .replace(/ɑ/g, 'ɑː')
    .replace(/ɔ/g, 'ɔː')
    .replace(/ә:/g, 'əː')
    .replace(/\s+/g, ' ')
    .trim();
  // ECDICT often writes stress as a trailing apostrophe (ә'bændәn).
  p = p.replace(/'/g, 'ˈ');
  if (!p.startsWith('/')) p = `/${p}`;
  if (!p.endsWith('/')) p = `${p}/`;
  return p;
}

/**
 * ECDICT translations are "pos. 释义1, 释义2\npos2. 释义3".
 * Split into definitions + part of speech without inventing content.
 */
function splitTranslation(translation) {
  // ECDICT sometimes embeds literal "\n" inside a field.
  const lines = String(translation || '')
    .replace(/\\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  const definitions = [];
  const posSet = new Set();
  for (const line of lines) {
    // Drop domain jargon lines entirely: "[计] ...", "[医] ...", "[经] ...".
    if (/^\[[^\]]+\]/.test(line)) continue;
    const m = line.match(/^([a-z]+\.)+/i);
    let body = line;
    if (m) {
      body = line.slice(m[0].length).trim();
      for (const pos of m[0].split(/(?<=\.)/)) {
        const clean = pos.trim();
        if (clean) posSet.add(clean);
      }
    }
    for (const part of body.split(/[,;，；]/)) {
      let item = part.trim();
      if (!item) continue;
      // Strip inline domain markers and leftover verb prefixes.
      item = item.replace(/\[[^\]]*\]/g, '').replace(/^[a-z]+\.\s*/i, '').trim();
      if (!item) continue;
      if (/^[a-zA-Z\s.']+$/.test(item)) continue;
      if (item.length > 30) continue;
      if (/[\\/]/.test(item)) continue;
      definitions.push(item);
    }
  }
  const uniqueDefs = [...new Set(definitions)].slice(0, 4);
  return {
    definitions: uniqueDefs,
    partOfSpeech: [...posSet].slice(0, 2).join(' ') || 'n.',
  };
}

/** Cross-deck canonical key: words differing only by case share one entry. */
function canonicalKey(term) {
  return term.trim().toLowerCase();
}

const text = fs.readFileSync(CSV, 'utf8');
const rows = parseCsv(text);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));

// One global pool: `words.normalizedTerm` is a unique index in IndexedDB, and
// ~8.7k terms appear in several exam lists. The app links one Word to many
// decks through deckWords, so we must not emit the same term twice.
const pool = new Map();
const deckTerms = new Map(DECKS.map((d) => [d.tag, []]));

for (let i = 1; i < rows.length; i += 1) {
  const r = rows[i];
  if (!r || r.length < header.length) continue;
  const word = (r[idx.word] || '').trim();
  if (!word || !/^[a-zA-Z][a-zA-Z' -]*$/.test(word)) continue;
  if (word.includes(' ')) continue; // keep single words: cleaner study cards
  const translation = r[idx.translation] || '';
  if (!translation.trim()) continue; // a word with no Chinese meaning is useless here

  const tag = r[idx.tag] || '';
  if (!tag) continue;
  const frq = Number(r[idx.frq]) || 0;
  const bnc = Number(r[idx.bnc]) || 0;
  const key = canonicalKey(word);

  if (!pool.has(key)) {
    pool.set(key, {
      term: word,
      phonetic: fixPhonetic(r[idx.phonetic]),
      translation,
      frq,
      bnc,
    });
  } else {
    // Keep the most frequent spelling/variant as the canonical row.
    const existing = pool.get(key);
    const betterFrq = frq > 0 && (existing.frq === 0 || frq < existing.frq);
    if (betterFrq) {
      existing.term = word;
      existing.frq = frq;
      if (!existing.phonetic) existing.phonetic = fixPhonetic(r[idx.phonetic]);
    }
  }

  for (const t of tag.split(/\s+/).filter(Boolean)) {
    const list = deckTerms.get(t);
    if (list) list.push(key);
  }
}

const decksOut = [];
let totalWords = 0;
const seenInPool = new Set();

for (const deck of DECKS) {
  const keys = [...new Set(deckTerms.get(deck.tag) ?? [])];
  // Sort by real corpus frequency (frq desc), then BNC rank, then A→Z.
  keys.sort((ka, kb) => {
    const a = pool.get(ka);
    const b = pool.get(kb);
    const fa = a.frq > 0 ? a.frq : Number.MAX_SAFE_INTEGER;
    const fb = b.frq > 0 ? b.frq : Number.MAX_SAFE_INTEGER;
    if (fa !== fb) return fa - fb;
    const ba = a.bnc > 0 ? a.bnc : Number.MAX_SAFE_INTEGER;
    const bb = b.bnc > 0 ? b.bnc : Number.MAX_SAFE_INTEGER;
    if (ba !== bb) return ba - bb;
    return a.term.localeCompare(b.term);
  });

  const words = keys
    .map((key) => {
      const item = pool.get(key);
      const { definitions, partOfSpeech } = splitTranslation(item.translation);
      return {
        term: item.term,
        phonetic: item.phonetic,
        partOfSpeech,
        definitions,
      };
    })
    // A card with no usable Chinese meaning teaches nothing.
    .filter((word) => word.definitions.length > 0);

  for (const word of words) seenInPool.add(canonicalKey(word.term));

  totalWords += words.length;
  decksOut.push({ ...deck, count: words.length, words });
  console.log(`${deck.id.padEnd(14)} ${String(words.length).padStart(5)} words`);
}

console.log(`unique terms across all decks: ${seenInPool.size}`);

const banner = `// AUTO-GENERATED by scripts/build-decks.mjs — do not edit by hand.
// Source: ECDICT (https://github.com/skywind3000/ECDICT), MIT License.
// Word lists are derived from ECDICT exam tags; definitions come from its
// Chinese translations. No audio URLs are generated (TTS/online audio is used).
// Regenerate: download ecdict.csv to .cache/ then run the script.
`;

// Each deck becomes its own module so the app can load one book on demand
// instead of shipping ~5 MB of word data in the entry bundle.
fs.mkdirSync('src/lib/db/decks', { recursive: true });

const indexEntries = [];
for (const deck of decksOut) {
  const fileName = `src/lib/db/decks/${deck.id}.ts`;
  // Only emit the declared fields; `tag` is a build-time detail.
  const payload = {
    id: deck.id,
    name: deck.name,
    examType: deck.examType,
    note: deck.note,
    count: deck.count,
    words: deck.words,
  };
  const fileBody = `${banner}
import type { GeneratedDeck } from '../seedDecks.generated';

export const DECK: GeneratedDeck = ${JSON.stringify(payload)};
`;
  fs.writeFileSync(fileName, fileBody, 'utf8');
  indexEntries.push({
    id: deck.id,
    name: deck.name,
    examType: deck.examType,
    note: deck.note,
    count: deck.count,
  });
}

const indexBody = `${banner}
export interface GeneratedWord {
  term: string;
  phonetic: string;
  partOfSpeech: string;
  definitions: string[];
}

export interface GeneratedDeck {
  id: string;
  name: string;
  examType: string;
  note: string;
  count: number;
  words: GeneratedWord[];
}

export interface DeckIndexEntry {
  id: string;
  name: string;
  examType: string;
  note: string;
  count: number;
}

export const GENERATED_SOURCE = 'ECDICT';
export const GENERATED_LICENSE = 'MIT';
export const GENERATED_VERSION = '2026.10';
export const GENERATED_WORD_TOTAL = ${totalWords};

/** Metadata only — safe to import eagerly. */
export const GENERATED_DECK_INDEX: DeckIndexEntry[] = ${JSON.stringify(indexEntries)};

/**
 * Loads one deck's words on demand. Vite turns each import() into its own chunk,
 * so opening the app does not download every word list.
 */
export async function loadGeneratedDeck(id: string): Promise<GeneratedDeck | null> {
  switch (id) {
${decksOut
  .map(
    (deck) =>
      `    case '${deck.id}':\n      return (await import('./decks/${deck.id}')).DECK;`,
  )
  .join('\n')}
    default:
      return null;
  }
}
`;

fs.writeFileSync(OUT, indexBody, 'utf8');
console.log(`\nwrote ${OUT} + ${decksOut.length} deck modules`);
console.log(`total words: ${totalWords}`);
