import { describe, expect, it } from 'vitest';
import { parseCsv, parseWordCsv, parseWordJson, wordsToCsv } from '@/lib/import/wordImport';

const CSV = `term,phonetic,partOfSpeech,definitions,exampleEn,exampleZh,tags,source,licenseNote
abandon,/əˈbændən/,v.,"放弃，抛弃;离弃",They abandoned the plan.,他们放弃了计划。,高频;动词,Test,CC0
benefit,/ˈbenɪfɪt/,n.,"益处;受益",Regular review helps.,规律复习有帮助。,高频,Test,CC0
`;

describe('CSV parsing', () => {
  it('handles quoted fields, commas and Chinese punctuation', () => {
    const rows = parseCsv(CSV);
    expect(rows).toHaveLength(3);
    expect(rows[1][3]).toBe('放弃，抛弃;离弃');
  });

  it('parses a valid file into rows with definitions and examples', () => {
    const result = parseWordCsv(CSV);
    expect(result.errors).toHaveLength(0);
    expect(result.rows).toHaveLength(2);
    expect(result.rows[0]).toMatchObject({
      term: 'abandon',
      phonetic: '/əˈbændən/',
      partOfSpeech: 'v.',
      definitions: ['放弃，抛弃', '离弃'],
      exampleEn: 'They abandoned the plan.',
      tags: ['高频', '动词'],
    });
  });

  it('reports missing terms and missing definitions with line numbers', () => {
    const result = parseWordCsv(
      'term,definitions\n,缺释义\nabandon,\nok,释义\n',
    );
    expect(result.errors.map((e) => e.line)).toEqual([2, 3]);
    expect(result.errors[0].message).toContain('单词为空');
    expect(result.errors[1].message).toContain('缺少中文释义');
    expect(result.rows).toHaveLength(1);
  });

  it('rejects invalid characters in the term column', () => {
    const result = parseWordCsv('term,definitions\nabc123,释义\n');
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toContain('无效字符');
  });

  it('flags duplicates inside the file and against existing words', () => {
    const result = parseWordCsv(
      'term,definitions\nabandon,放弃\nAbandon,又一遍\nbenefit,益处\n',
      { existingTerms: new Set(['benefit']) },
    );
    expect(result.rows.map((r) => r.term)).toEqual(['abandon']);
    expect(result.duplicates).toEqual([
      { term: 'Abandon', reason: 'in-file' },
      { term: 'benefit', reason: 'existing' },
    ]);
  });

  it('requires examples and translations to be paired', () => {
    const result = parseWordCsv('term,definitions,exampleEn,exampleZh\nabandon,放弃,Only English,\n');
    expect(result.rows).toHaveLength(0);
    expect(result.errors[0].message).toContain('成对');
  });

  it('rejects files without a term header', () => {
    const result = parseWordCsv('word_x,definitions\nfoo,bar\n');
    expect(result.errors[0].message).toContain('term');
  });
});

describe('JSON parsing', () => {
  it('accepts a bare array and a { words: [] } wrapper', () => {
    const body = JSON.stringify([
      { term: 'abandon', definitions: ['放弃'], examples: [{ en: 'They abandoned it.', zh: '他们放弃了它。' }] },
    ]);
    expect(parseWordJson(body).rows).toHaveLength(1);
    expect(parseWordJson(JSON.stringify({ words: JSON.parse(body) })).rows).toHaveLength(1);
  });

  it('reports structural errors without throwing', () => {
    expect(parseWordJson('{not json').errors[0].message).toContain('JSON 解析失败');
    expect(parseWordJson('{"foo": 1}').errors[0].message).toContain('数组');
  });

  it('validates each entry', () => {
    const result = parseWordJson(
      JSON.stringify([{ definitions: ['无单词'] }, { term: 'ok', definitions: [] }, { term: 'fine', definitions: ['好'] }]),
    );
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(2);
  });
});

describe('CSV export', () => {
  it('round-trips through the parser', () => {
    const csv = wordsToCsv([
      {
        term: 'abandon',
        phonetic: '/əˈbændən/',
        partOfSpeech: 'v.',
        definitions: ['放弃', '抛弃'],
        examples: [{ en: 'They said, "go".', zh: '他们说“走”。' }],
        tags: ['高频'],
        source: 'Test',
        licenseNote: 'CC0',
      },
    ]);
    const parsed = parseWordCsv(csv.replace(/^\uFEFF/, ''));
    expect(parsed.errors).toHaveLength(0);
    expect(parsed.rows[0].definitions).toEqual(['放弃', '抛弃']);
    expect(parsed.rows[0].exampleEn).toBe('They said, "go".');
  });
});
