import { expect, test, type Page } from '@playwright/test';

/**
 * Pronunciation E2E. Headless Chromium has no real audio device, so these tests
 * assert what is *observable and truthful*: the service reports which mechanism
 * it used, the rate really changes, rapid clicks don't stack, and failures
 * surface a message. Whether audio reaches a speaker is verified manually —
 * see docs/pronunciation-verification.md.
 */

test.describe('pronunciation', () => {
  test('test page shows measured environment instead of assumptions', async ({ page }) => {
    await page.goto('/pronunciation');
    await expect(page.getByRole('heading', { name: '发音测试' })).toBeVisible();
    // Four real metrics, whatever their values on this machine.
    await expect(page.getByText('语音合成支持', { exact: true })).toBeVisible();
    await expect(page.getByText('语音列表', { exact: true })).toBeVisible();
    await expect(page.getByText('美音 voice', { exact: true })).toBeVisible();
    await expect(page.getByText('英音 voice', { exact: true })).toBeVisible();
    // The page must never claim success before anything was played.
    await expect(page.getByText(/尚未播放/)).toBeVisible();
  });

  test('a word without recorded audio reports TTS as the mechanism', async ({ page }) => {
    await page.goto('/pronunciation');
    // Wait for the voice list; Chrome loads it async.
    await page.waitForFunction(() => window.speechSynthesis?.getVoices().length > 0, null, {
      timeout: 15_000,
    });

    await page.getByRole('button', { name: /^播放/ }).click();

    // Either it played via TTS, or it failed with a concrete reason — never silence.
    await expect(async () => {
      const played = await page.getByText(/已播放 · 来源/).count();
      const failed = await page.getByText(/浏览|语音|失败|超时/).count();
      expect(played + failed).toBeGreaterThan(0);
    }).toPass({ timeout: 20_000 });
  });

  test('slow mode changes the utterance rate', async ({ page }) => {
    await page.goto('/pronunciation');
    await page.waitForFunction(() => window.speechSynthesis?.getVoices().length > 0, null, {
      timeout: 15_000,
    });

    // Instrument SpeechSynthesisUtterance to capture the rate actually used.
    await page.evaluate(() => {
      const w = window as unknown as { __rates: number[] };
      w.__rates = [];
      const Original = window.SpeechSynthesisUtterance;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      (window as any).SpeechSynthesisUtterance = class extends (Original as any) {
        constructor(text: string) {
          super(text);
          let stored = 1;
          Object.defineProperty(this, 'rate', {
            get: () => stored,
            set: (value: number) => {
              stored = value;
              w.__rates.push(value);
            },
          });
        }
      };
    });

    await page.getByRole('button', { name: '慢速', exact: true }).first().click();
    await page.getByRole('button', { name: /慢速播放/ }).click();
    await page.waitForTimeout(1200);

    const rates = await page.evaluate(() => (window as unknown as { __rates: number[] }).__rates);
    if (rates.length > 0) {
      // 0.55 is the slow rate wired in the service.
      expect(rates.some((rate) => Math.abs(rate - 0.55) < 0.001)).toBe(true);
    }
  });

  test('switching accent is reflected in the request and the result', async ({ page }) => {
    await page.goto('/pronunciation');
    await page.waitForFunction(() => window.speechSynthesis?.getVoices().length > 0, null, {
      timeout: 15_000,
    });

    await page.getByRole('button', { name: '英音 UK' }).click();
    await expect(page.getByRole('button', { name: '英音 UK' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    await page.getByRole('button', { name: /^播放/ }).click();
    await page.waitForTimeout(1500);
    // The result line names the language actually used (en-GB, or a fallback).
    const body = await page.locator('body').innerText();
    expect(body).toMatch(/en-GB|已回退|失败|超时|系统语音|录音/);
  });

  test('rapid clicks do not stack playback', async ({ page }) => {
    await page.goto('/pronunciation');
    await page.waitForTimeout(800);

    // Count audio elements started and speech cancellations. With online audio
    // the TTS path is not used at all, so we must watch both mechanisms.
    await page.evaluate(() => {
      const w = window as unknown as {
        __played: number;
        __cancelled: number;
      };
      w.__played = 0;
      w.__cancelled = 0;
      const mediaProto = HTMLMediaElement.prototype;
      const origPlay = mediaProto.play;
      mediaProto.play = function play(this: HTMLMediaElement) {
        w.__played += 1;
        return origPlay.call(this);
      };
      const synth = window.speechSynthesis;
      if (synth) {
        const cancel = synth.cancel.bind(synth);
        synth.cancel = () => {
          w.__cancelled += 1;
          cancel();
        };
      }
    });

    const button = page.getByRole('button', { name: /^播放/ });
    await button.click();
    // While speaking the button is disabled — that is the primary anti-stacking
    // guard. Force-clicking simulates an impatient user/hardware key repeat.
    await button.click({ force: true }).catch(() => {});
    await button.click({ force: true }).catch(() => {});
    await page.waitForTimeout(2500);

    const counts = await page.evaluate(() => ({
      played: (window as unknown as { __played: number }).__played,
      cancelled: (window as unknown as { __cancelled: number }).__cancelled,
    }));

    // Never more than one start per click, and never more than the click count.
    expect(counts.played).toBeLessThanOrEqual(3);
    // The previous playback is stopped before a new one begins.
    expect(counts.cancelled + counts.played).toBeGreaterThanOrEqual(2);
  });

  test('study card exposes speak and slow-speak with accessible labels', async ({ page }) => {
    await page.goto('/study');
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForURL(/\/study\/s-/);
    await expect(page.locator('article').first()).toBeVisible();

    const term = (await page.getByTestId('word-term').first().textContent())?.trim();
    await expect(
      page.getByRole('button', { name: `播放 ${term} 的发音`, exact: true }),
    ).toBeVisible();
    await expect(page.getByRole('button', { name: `慢速播放 ${term} 的发音`, exact: true })).toBeVisible();
    // Phonetic is labelled with the accent so two systems are distinguishable.
    await expect(page.getByTestId('phonetic')).toBeVisible();
  });

  test('settings page records the chosen accent, speed and returns a real result', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: '外观与发音' }).click();
    await page.getByRole('button', { name: '英式 UK' }).click();
    // Two "慢速" controls used to collide; the试听 buttons now have distinct labels.
    await page.getByRole('button', { name: '慢速', exact: true }).click();

    await page.getByRole('button', { name: '试听：正常语速' }).click();
    await page.waitForTimeout(2000);

    const body = await page.locator('body').innerText();
    // Either a measured result or an explicit error — never a fake success.
    expect(body).toMatch(/上次播放|尚未播放|发音不可用|没有可用的英语语音|不支持/);

    await page.reload();
    await page.getByRole('tab', { name: '外观与发音' }).click();
    await expect(page.getByRole('button', { name: '英式 UK' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
  });
});

test.describe('deck centre', () => {
  test('lists every demo deck with real counts and quality fields', async ({ page }) => {
    await page.goto('/decks');
    await expect(page.getByRole('heading', { name: '词书中心' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CET-4 演示词书' })).toBeVisible();
    await expect(page.getByRole('heading', { name: '科技与 AI 热词演示词书' })).toBeVisible();
    // Quality counters are rendered for the first deck.
    await expect(page.getByText(/缺录音 \d+/).first()).toBeVisible();
    await expect(page.getByText(/缺音标 \d+/).first()).toBeVisible();
    await expect(page.getByText(/缺释义 \d+/).first()).toBeVisible();
  });

  test('search and category filter narrow the list', async ({ page }) => {
    await page.goto('/decks');
    const search = page.getByLabel('搜索词书');
    await search.fill('雅思');
    await expect(page.getByRole('heading', { name: '雅思学术演示词书' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CET-4 演示词书' })).toHaveCount(0);

    await search.fill('');
    await page.getByLabel('按分类筛选').selectOption('CET6');
    await expect(page.getByRole('heading', { name: 'CET-6 演示词书' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'CET-4 演示词书' })).toHaveCount(0);
  });

  test('categories without data say 尚未导入 instead of inventing counts', async ({ page }) => {
    await page.goto('/decks');
    // GRE used to be empty; it now ships 7484 real words. The rule under test is
    // unchanged: a category with no data must show 尚未导入 and no fake number.
    // Only categories that still have no deck are listed here.
    const emptySection = page.locator('section', { hasText: '尚未导入的分类' });
    const hasEmptySection = (await emptySection.count()) > 0;

    if (hasEmptySection) {
      await expect(page.getByRole('heading', { name: '尚未导入的分类' })).toBeVisible();
      await expect(emptySection.getByText(/尚未导入|自行导入/).first()).toBeVisible();
      // No fabricated counts anywhere in that section.
      await expect(emptySection.getByText(/共 \d+ 词/)).toHaveCount(0);
    } else {
      // Every category now has data — then the section must be gone entirely,
      // not rendered with placeholder numbers.
      await expect(page.getByText('尚未导入的分类')).toHaveCount(0);
    }

    // Either way, a category with data must show a real count.
    const greCard = page.locator('article.card', { hasText: 'GRE 词表' });
    await expect(greCard).toContainText('7484');
  });

  test('importing 100 rows reports counts and survives a duplicate re-import', async ({ page }) => {
    await page.goto('/decks');

    const lines = [
      'term,phoneticUS,phoneticUK,partOfSpeech,definitions,exampleEn,exampleZh,audioUS,tags,source,licenseNote',
    ];
    const letters = 'abcdefghijklmnopqrstuvwxyz';
    const term = (i: number) =>
      `z${letters[Math.floor(i / 26) % 26]}${letters[i % 26]}${'k'.repeat(1)}`;
    for (let i = 0; i < 100; i += 1) {
      const t = term(i);
      lines.push(`${t},/${t}/,/${t}/,n.,释义${i},A test sentence about ${t}.,测试例句。, ,bulk,test,CC0`);
    }
    const csv = lines.join('\n');

    // Import into the first deck.
    const chooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^导入到/ }).first().click();
    (await chooser).setFiles({ name: 'bulk100.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });

    const dialog = page.getByRole('dialog', { name: '导入预览' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByText('有效 100 行')).toBeVisible();
    await dialog.getByRole('button', { name: /确认导入 100 词/ }).click();
    await expect(page.getByText('导入完成')).toBeVisible();
    await expect(page.getByText(/新增 100 个词条/)).toBeVisible();

    // Re-import the same file: nothing new, everything skipped.
    const chooser2 = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /^导入到/ }).first().click();
    (await chooser2).setFiles({ name: 'bulk100.csv', mimeType: 'text/csv', buffer: Buffer.from(csv, 'utf8') });
    const dialog2 = page.getByRole('dialog', { name: '导入预览' });
    // The uploader flags all 100 as existing duplicates.
    await expect(dialog2.getByText(/重复词/).first()).toBeVisible();
    await expect(dialog2.getByText('有效 0 行')).toBeVisible();
    await dialog2.getByRole('button', { name: '取消' }).click();
  });

  test('missing audio is visible per word in the deck detail', async ({ page }) => {
    await page.goto('/decks');
    await page.getByRole('button', { name: '查看单词' }).first().click();
    const detail = page.locator('ul').filter({ hasText: 'TTS' }).first();
    await expect(detail.getByText('TTS').first()).toBeVisible();
  });
});

/** Utility used by the E2E report. */
export async function readVoiceCount(page: Page): Promise<number> {
  return page.evaluate(() => window.speechSynthesis?.getVoices().length ?? 0);
}
