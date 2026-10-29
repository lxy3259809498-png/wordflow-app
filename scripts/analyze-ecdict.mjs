// One-off analysis: how many words does ECDICT actually have per exam tag?
// Run with: node scripts/analyze-ecdict.mjs
import fs from 'node:fs';

const CSV = '.cache/ecdict.csv';

/** Minimal RFC4180 CSV row parser (handles quotes, embedded newlines in fields). */
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
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ',') {
      row.push(field);
      field = '';
    } else if (c === '\n') {
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else if (c !== '\r') {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

const text = fs.readFileSync(CSV, 'utf8');
const rows = parseCsv(text);
const header = rows[0];
const idx = Object.fromEntries(header.map((h, i) => [h, i]));
console.log('columns:', header.join(','));

const tagCounts = {};
const byTag = {};
let withTag = 0;
let withPhonetic = 0;
let withTranslation = 0;

for (let i = 1; i < rows.length; i += 1) {
  const r = rows[i];
  if (!r || r.length < header.length) continue;
  const word = r[idx.word];
  if (!word || !/^[a-zA-Z][a-zA-Z' -]*$/.test(word)) continue;
  if (r[idx.phonetic]) withPhonetic += 1;
  if (r[idx.translation]) withTranslation += 1;
  const tag = r[idx.tag] || '';
  if (!tag) continue;
  withTag += 1;
  for (const t of tag.split(/\s+/).filter(Boolean)) {
    tagCounts[t] = (tagCounts[t] || 0) + 1;
    (byTag[t] ||= []).push(word);
  }
}

console.log('total usable rows:', rows.length - 1);
console.log('with phonetic:', withPhonetic);
console.log('with translation:', withTranslation);
console.log('with exam tag:', withTag);
console.log('--- tag counts ---');
Object.entries(tagCounts)
  .sort((a, b) => b[1] - a[1])
  .forEach(([t, n]) => console.log(`${t.padEnd(10)} ${n}`));

// Sanity sample for the tags we care about.
for (const tag of ['zk', 'gk', 'cet4', 'cet6', 'ky', 'ielts', 'toefl', 'gre']) {
  const list = byTag[tag] ?? [];
  console.log(`\n[${tag}] n=${list.length} first5=${list.slice(0, 5).join(', ')}`);
}
