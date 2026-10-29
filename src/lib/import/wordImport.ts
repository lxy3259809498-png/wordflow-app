import type { ExamType } from '@/lib/types';

export interface ParsedWordRow {
  term: string;
  phonetic: string;
  phoneticUS: string;
  phoneticUK: string;
  partOfSpeech: string;
  definitions: string[];
  translations: string[];
  exampleEn: string;
  exampleZh: string;
  audioUS: string | null;
  audioUK: string | null;
  tags: string[];
  source: string;
  licenseNote: string;
  mnemonic: string | null;
}

export interface RowError {
  /** 1-based line number as seen in the original file (including the header). */
  line: number;
  term: string;
  message: string;
}

export interface ImportPreview {
  format: 'csv' | 'json';
  deck: { name: string; examType: ExamType };
  rows: ParsedWordRow[];
  errors: RowError[];
  /** Terms already present in the database or repeated inside the file. */
  duplicates: { term: string; reason: 'in-file' | 'existing' }[];
  totalRows: number;
}

/** RFC4180-ish parser: supports quoted fields, escaped quotes and CRLF. */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = '';
  };
  const pushRow = () => {
    pushField();
    if (row.some((cell) => cell.trim() !== '')) rows.push(row);
    row = [];
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];
    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === ',') {
      pushField();
    } else if (char === '\n') {
      pushRow();
    } else if (char === '\r') {
      if (text[i + 1] === '\n') i += 1;
      pushRow();
    } else {
      field += char;
    }
  }
  if (field !== '' || row.length > 0) pushRow();
  return rows;
}

const HEADER_ALIASES: Record<string, keyof ParsedWordRow | 'examples'> = {
  term: 'term',
  word: 'term',
  english: 'term',
  单词: 'term',
  phonetic: 'phonetic',
  音标: 'phonetic',
  phoneticus: 'phoneticUS',
  美音: 'phoneticUS',
  phoneticeu: 'phoneticUS',
  phoneticuk: 'phoneticUK',
  英音: 'phoneticUK',
  phonetice: 'phoneticUK',
  partofspeech: 'partOfSpeech',
  pos: 'partOfSpeech',
  词性: 'partOfSpeech',
  definitions: 'definitions',
  definition: 'definitions',
  meaning: 'definitions',
  释义: 'definitions',
  中文释义: 'definitions',
  translations: 'translations',
  翻译: 'translations',
  example: 'examples',
  exampleen: 'examples',
  例句: 'examples',
  examplezh: 'exampleZh',
  例句翻译: 'exampleZh',
  audious: 'audioUS',
  audioUs: 'audioUS',
  美音音频: 'audioUS',
  audiouk: 'audioUK',
  英音音频: 'audioUK',
  tags: 'tags',
  标签: 'tags',
  source: 'source',
  来源: 'source',
  licensenote: 'licenseNote',
  授权说明: 'licenseNote',
  mnemonic: 'mnemonic',
  记忆提示: 'mnemonic',
};

const normalizeHeader = (value: string): string => value.trim().toLowerCase().replace(/[\s_-]/g, '');

/**
 * Only accept absolute http(s) URLs or relative /path assets. Anything else is
 * treated as "no audio" rather than being passed through as a broken source.
 */
export function sanitizeAudioUrl(value: string): string | null {
  const trimmed = value.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith('/')) return trimmed;
  try {
    const url = new URL(trimmed);
    if (url.protocol === 'http:' || url.protocol === 'https:') return url.toString();
  } catch {
    return null;
  }
  return null;
}

export interface ParseOptions {
  /** Existing normalized terms, used to flag duplicates. */
  existingTerms?: Set<string>;
  sourceLabel?: string;
}

export function parseWordCsv(text: string, options: ParseOptions = {}): {
  rows: ParsedWordRow[];
  errors: RowError[];
  duplicates: ImportPreview['duplicates'];
  totalRows: number;
} {
  const table = parseCsv(text.replace(/^\uFEFF/, ''));
  if (table.length === 0) return { rows: [], errors: [], duplicates: [], totalRows: 0 };

  const header = table[0].map((cell) => HEADER_ALIASES[normalizeHeader(cell)] ?? null);
  const rows: ParsedWordRow[] = [];
  const errors: RowError[] = [];
  const duplicates: ImportPreview['duplicates'] = [];
  const seen = new Set<string>();

  if (!header.includes('term')) {
    errors.push({ line: 1, term: '', message: '表头缺少 term/单词 列' });
    return { rows, errors, duplicates, totalRows: Math.max(0, table.length - 1) };
  }

  const read = (cells: string[], key: keyof ParsedWordRow | 'examples'): string => {
    const index = header.indexOf(key);
    return index === -1 ? '' : (cells[index] ?? '').trim();
  };

  for (let i = 1; i < table.length; i += 1) {
    const cells = table[i];
    const line = i + 1;
    const term = read(cells, 'term');
    if (!term) {
      errors.push({ line, term: '', message: '单词为空' });
      continue;
    }
    if (!/^[a-zA-Z][a-zA-Z' -]*$/.test(term)) {
      errors.push({ line, term, message: `单词包含无效字符：${term}` });
      continue;
    }
    const definitions = read(cells, 'definitions')
      .split(/[;；|]/)
      .map((d) => d.trim())
      .filter(Boolean);
    if (definitions.length === 0) {
      errors.push({ line, term, message: '缺少中文释义' });
      continue;
    }
    const normalized = term.trim().toLowerCase();
    if (seen.has(normalized)) {
      duplicates.push({ term, reason: 'in-file' });
      continue;
    }
    if (options.existingTerms?.has(normalized)) {
      duplicates.push({ term, reason: 'existing' });
      continue;
    }
    seen.add(normalized);

    const exampleEn = read(cells, 'examples');
    const exampleZh = read(cells, 'exampleZh');
    if ((exampleEn && !exampleZh) || (!exampleEn && exampleZh)) {
      errors.push({ line, term, message: '例句与例句翻译必须成对出现' });
      continue;
    }

    rows.push({
      term,
      phonetic: read(cells, 'phonetic'),
      phoneticUS: read(cells, 'phoneticUS') || read(cells, 'phonetic'),
      phoneticUK: read(cells, 'phoneticUK') || read(cells, 'phonetic'),
      partOfSpeech: read(cells, 'partOfSpeech'),
      definitions,
      translations: read(cells, 'translations')
        .split(/[;；|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      exampleEn,
      exampleZh,
      audioUS: sanitizeAudioUrl(read(cells, 'audioUS')),
      audioUK: sanitizeAudioUrl(read(cells, 'audioUK')),
      tags: read(cells, 'tags')
        .split(/[;；,，|]/)
        .map((t) => t.trim())
        .filter(Boolean),
      source: read(cells, 'source') || options.sourceLabel || 'User import',
      licenseNote: read(cells, 'licenseNote') || '用户自行导入，请确认拥有使用权',
      mnemonic: read(cells, 'mnemonic') || null,
    });
  }

  return { rows, errors, duplicates, totalRows: Math.max(0, table.length - 1) };
}

export function parseWordJson(text: string, options: ParseOptions = {}): {
  rows: ParsedWordRow[];
  errors: RowError[];
  duplicates: ImportPreview['duplicates'];
  totalRows: number;
} {
  const rows: ParsedWordRow[] = [];
  const errors: RowError[] = [];
  const duplicates: ImportPreview['duplicates'] = [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    errors.push({ line: 0, term: '', message: `JSON 解析失败：${(error as Error).message}` });
    return { rows, errors, duplicates, totalRows: 0 };
  }

  const list = Array.isArray(parsed)
    ? parsed
    : Array.isArray((parsed as { words?: unknown[] }).words)
      ? ((parsed as { words: unknown[] }).words as unknown[])
      : null;
  if (!list) {
    errors.push({ line: 0, term: '', message: 'JSON 顶层必须是数组或 { "words": [...] }' });
    return { rows, errors, duplicates, totalRows: 0 };
  }

  const seen = new Set<string>();
  list.forEach((item, index) => {
    const line = index + 1;
    if (!item || typeof item !== 'object') {
      errors.push({ line, term: '', message: '条目不是对象' });
      return;
    }
    const record = item as Record<string, unknown>;
    const term = typeof record.term === 'string' ? record.term.trim() : '';
    if (!term) {
      errors.push({ line, term: '', message: '单词为空' });
      return;
    }
    if (!/^[a-zA-Z][a-zA-Z' -]*$/.test(term)) {
      errors.push({ line, term, message: `单词包含无效字符：${term}` });
      return;
    }
    const rawDefinitions = record.definitions ?? record.definition ?? record.meaning;
    const definitions = Array.isArray(rawDefinitions)
      ? rawDefinitions.map((d) => String(d).trim()).filter(Boolean)
      : typeof rawDefinitions === 'string'
        ? rawDefinitions
            .split(/[;；|]/)
            .map((d) => d.trim())
            .filter(Boolean)
        : [];
    if (definitions.length === 0) {
      errors.push({ line, term, message: '缺少中文释义' });
      return;
    }
    const normalized = term.toLowerCase();
    if (seen.has(normalized)) {
      duplicates.push({ term, reason: 'in-file' });
      return;
    }
    if (options.existingTerms?.has(normalized)) {
      duplicates.push({ term, reason: 'existing' });
      return;
    }
    seen.add(normalized);

    const examplesRaw = record.examples;
    const firstExample =
      Array.isArray(examplesRaw) && examplesRaw.length > 0 && typeof examplesRaw[0] === 'object'
        ? (examplesRaw[0] as Record<string, unknown>)
        : null;
    const exampleEn =
      firstExample && typeof firstExample.en === 'string' ? firstExample.en.trim() : '';
    const exampleZh =
      firstExample && typeof firstExample.zh === 'string' ? firstExample.zh.trim() : '';
    if ((exampleEn && !exampleZh) || (!exampleEn && exampleZh)) {
      errors.push({ line, term, message: '例句与例句翻译必须成对出现' });
      return;
    }

    const tags = Array.isArray(record.tags)
      ? record.tags.map((t) => String(t).trim()).filter(Boolean)
      : typeof record.tags === 'string'
        ? record.tags
            .split(/[;；,，|]/)
            .map((t) => t.trim())
            .filter(Boolean)
        : [];

    rows.push({
      term,
      phonetic: typeof record.phonetic === 'string' ? record.phonetic.trim() : '',
      phoneticUS:
        (typeof record.phoneticUS === 'string' && record.phoneticUS.trim()) ||
        (typeof record.phonetic === 'string' ? record.phonetic.trim() : ''),
      phoneticUK:
        (typeof record.phoneticUK === 'string' && record.phoneticUK.trim()) ||
        (typeof record.phonetic === 'string' ? record.phonetic.trim() : ''),
      partOfSpeech: typeof record.partOfSpeech === 'string' ? record.partOfSpeech.trim() : '',
      definitions,
      translations: Array.isArray(record.translations)
        ? record.translations.map((t) => String(t).trim()).filter(Boolean)
        : typeof record.translations === 'string'
          ? record.translations
              .split(/[;；|]/)
              .map((t) => t.trim())
              .filter(Boolean)
          : [],
      exampleEn,
      exampleZh,
      audioUS: sanitizeAudioUrl(typeof record.audioUS === 'string' ? record.audioUS : ''),
      audioUK: sanitizeAudioUrl(typeof record.audioUK === 'string' ? record.audioUK : ''),
      tags,
      source:
        typeof record.source === 'string' && record.source.trim()
          ? record.source.trim()
          : 'User import',
      licenseNote:
        typeof record.licenseNote === 'string' && record.licenseNote.trim()
          ? record.licenseNote.trim()
          : '用户自行导入，请确认拥有使用权',
      mnemonic:
        typeof record.mnemonic === 'string' && record.mnemonic.trim()
          ? record.mnemonic.trim()
          : null,
    });
  });

  return { rows, errors, duplicates, totalRows: list.length };
}

export function wordsToCsv(
  words: {
    term: string;
    phonetic: string;
    phoneticUS?: string;
    phoneticUK?: string;
    partOfSpeech: string;
    definitions: string[];
    translations?: string[];
    examples: { en: string; zh: string }[];
    audioUS?: string | null;
    audioUK?: string | null;
    tags: string[];
    source: string;
    licenseNote: string;
  }[],
): string {
  const escape = (value: string): string =>
    /[",\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value;
  const header = [
    'term',
    'phoneticUS',
    'phoneticUK',
    'partOfSpeech',
    'definitions',
    'translations',
    'exampleEn',
    'exampleZh',
    'audioUS',
    'audioUK',
    'tags',
    'source',
    'licenseNote',
  ];
  const lines = [header.join(',')];
  for (const word of words) {
    lines.push(
      [
        word.term,
        word.phoneticUS ?? word.phonetic,
        word.phoneticUK ?? word.phonetic,
        word.partOfSpeech,
        word.definitions.join('; '),
        (word.translations ?? []).join('; '),
        word.examples[0]?.en ?? '',
        word.examples[0]?.zh ?? '',
        word.audioUS ?? '',
        word.audioUK ?? '',
        word.tags.join('; '),
        word.source,
        word.licenseNote,
      ]
        .map(escape)
        .join(','),
    );
  }
  return `${lines.join('\n')}\n`;
}
