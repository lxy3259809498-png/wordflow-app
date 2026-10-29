import { describe, expect, it } from 'vitest';
import { parseWordCsv } from '@/lib/import/wordImport';
import { validateAiPayload, type AiService } from '@/lib/ai/aiService';
import { normaliseSettings, DEFAULT_SETTINGS } from '@/lib/settings/settings';

const csv = 'term,definitions\nabandon,放弃\n';

describe('AI payload validation', () => {
  it('accepts a well-formed payload for the requested word', () => {
    const result = validateAiPayload(
      {
        wordId: 'w1',
        sentence: 'They decided to abandon the old plan.',
        sentenceZh: '他们决定放弃旧计划。',
        mnemonic: 'a band on stage → give up',
        generatedAt: 1,
        provider: 'proxy',
      },
      'w1',
    );
    expect(result.ok).toBe(true);
  });

  it('rejects a payload about a different word (misalignment)', () => {
    const result = validateAiPayload(
      { wordId: 'w2', sentence: 'A completely different sentence.', sentenceZh: '不同的句子。' },
      'w1',
    );
    expect(result).toEqual({ ok: false, message: '返回的单词 ID 不匹配' });
  });

  it('rejects empty or non-English sentences', () => {
    expect(
      validateAiPayload({ wordId: 'w1', sentence: '短', sentenceZh: '短', mnemonic: '' }, 'w1').ok,
    ).toBe(false);
    expect(
      validateAiPayload({ wordId: 'w1', sentence: '中文句子没有英文', sentenceZh: '中文。', mnemonic: '' }, 'w1').ok,
    ).toBe(false);
  });

  it('has a typed interface so a real backend can be swapped in', () => {
    const stub: AiService = {
      id: 'stub',
      isConfigured: () => false,
      generate: async () => ({ ok: false, code: 'unconfigured', message: 'not configured' }),
    };
    expect(stub.isConfigured()).toBe(false);
  });
});

describe('settings normalisation', () => {
  it('falls back to defaults for a corrupt object', () => {
    expect(normaliseSettings(null)).toEqual(DEFAULT_SETTINGS);
    expect(normaliseSettings('nonsense')).toEqual(DEFAULT_SETTINGS);
  });

  it('clamps out-of-range numbers instead of trusting localStorage', () => {
    const settings = normaliseSettings({ dailyNewLimit: 9999, dailyGoalCount: -3, timeBudgetMinutes: 'abc' });
    expect(settings.dailyNewLimit).toBe(100);
    expect(settings.dailyGoalCount).toBe(1);
    expect(settings.timeBudgetMinutes).toBe(DEFAULT_SETTINGS.timeBudgetMinutes);
  });

  it('keeps only known enum values', () => {
    const settings = normaliseSettings({ theme: 'neon', accentColor: 'pink', reviewMode: 'telepathy' });
    expect(settings.theme).toBe('system');
    expect(settings.accentColor).toBe('indigo');
    expect(settings.reviewMode).toBe('en-zh');
  });

  it('ignores a malformed algorithm config', () => {
    const settings = normaliseSettings({ algorithmConfig: { weights: [1, 2, 3] } });
    expect(settings.algorithmConfig.weights).toHaveLength(19);
  });
});

describe('import pipeline sanity', () => {
  it('accepts the bundled sample template format', () => {
    const sample = `term,phonetic,partOfSpeech,definitions,exampleEn,exampleZh,tags,source,licenseNote
abandon,/əˈbændən/,v.,"放弃，抛弃;离弃",They had to abandon the plan.,他们不得不放弃计划。,高频,WordFlow demo,CC BY 4.0
`;
    const result = parseWordCsv(sample);
    expect(result.rows).toHaveLength(1);
    expect(result.errors).toHaveLength(0);
  });

  it('reports every problem row rather than throwing', () => {
    // One row has an invalid term, one has no definitions; the valid row survives.
    const text = `${csv}123,释义\norphan,\n`;
    const result = parseWordCsv(text);
    expect(result.errors).toHaveLength(2);
    expect(result.rows).toHaveLength(1);
  });
});
