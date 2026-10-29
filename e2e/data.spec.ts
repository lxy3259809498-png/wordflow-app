import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

/**
 * Data-management E2E: CSV import (preview → confirm → undo), JSON backup and
 * restore with a corrupt file, and PWA offline boot.
 */

// Terms chosen to be absent from the bundled ECDICT vocabulary, so this test
// keeps exercising "new word" rather than "already in library". (serendipity
// and resilient used to work here until the full word lists shipped.)
const CSV = `term,phonetic,partOfSpeech,definitions,exampleEn,exampleZh,tags,source,licenseNote
zyzzyva,/ˈzɪzɪvə/,n.,"一种甲虫",The zyzzyva is a weevil.,zyzzyva 是一种象甲。,进阶,测试词表,CC0
quizzify,/ˈkwɪzɪfaɪ/,v.,"使困惑",Do not quizzify the class.,别把全班弄糊涂。,进阶,测试词表,CC0
abandon,/əˈbændən/,v.,放弃,They abandoned it.,他们放弃了。,重复词,测试词表,CC0
bad123,/,v.,非法词,Example here.,例句。,非法,测试词表,CC0
`;

test.describe('import and backup', () => {
  test('CSV import previews errors and duplicates, then imports and undoes', async ({ page }) => {
    await page.goto('/decks');
    await expect(page.getByRole('heading', { name: '词书中心', exact: true })).toBeVisible();

    // First deck card's import button (labelled "导入到 <deck name>").
    const importButtons = page.getByRole('button', { name: /^导入到/ });
    await expect(importButtons.first()).toBeVisible();

    const fileChooserPromise = page.waitForEvent('filechooser');
    await importButtons.first().click();
    const chooser = await fileChooserPromise;
    await chooser.setFiles({
      name: 'test-words.csv',
      mimeType: 'text/csv',
      buffer: Buffer.from(CSV, 'utf8'),
    });

    const dialog = page.getByRole('dialog', { name: '导入预览' });
    await expect(dialog).toBeVisible();
    // 2 valid rows, 1 in-database duplicate, 1 invalid term.
    await expect(dialog.getByText('有效 2 行')).toBeVisible();
    await expect(dialog.getByText('错误行', { exact: true })).toBeVisible();
    await expect(dialog.getByText('重复词', { exact: true })).toBeVisible();
    await expect(dialog.getByText('重复词将被跳过：abandon')).toBeVisible();
    await expect(dialog.getByText('单词包含无效字符：bad123')).toBeVisible();

    await dialog.getByRole('button', { name: '确认导入 2 词' }).click();
    await expect(page.getByText('导入完成')).toBeVisible();

    // The new words are queryable once the deck word list is expanded.
    await page.getByRole('button', { name: '查看单词' }).first().click();
    await expect(page.getByText('zyzzyva').first()).toBeVisible();

    // Undo the batch and verify the words disappear again.
    page.on('dialog', (d) => void d.accept());
    await page.getByRole('button', { name: '撤销' }).first().click();
    await expect(page.getByText('已撤销导入', { exact: true })).toBeVisible();
    await expect(page.getByText('zyzzyva')).toHaveCount(0);
  });

  test('JSON backup exports, validates and restores; corrupt files change nothing', async ({ page }) => {
    // Create some real study data first (the setup screen is the entry point now).
    await page.goto('/study');
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForURL(/\/study\/s-/);
    await page.getByRole('button', { name: /显示答案/ }).click();
    await page.getByRole('button', { name: /^认识/ }).click();
    await expect(page.getByText('显示答案')).toBeVisible();

    await page.goto('/settings');
    await page.getByRole('tab', { name: '数据与备份' }).click();

    const [download] = await Promise.all([
      page.waitForEvent('download'),
      page.getByRole('button', { name: /导出 JSON 备份/ }).click(),
    ]);
    const path = await download.path();
    expect(path).toBeTruthy();
    const raw = readFileSync(path!, 'utf8');
    const backup = JSON.parse(raw) as { meta: { app: string }; reviewLogs: unknown[] };
    expect(backup.meta.app).toBe('WordFlow');
    expect(backup.reviewLogs.length).toBeGreaterThan(0);

    // Corrupt input: validation must fail and must not touch existing data.
    await page.getByLabel('或粘贴备份 JSON').fill('{"meta": {"app": "WordFlow"}}');
    await page.getByRole('button', { name: '预览校验' }).click();
    await expect(page.getByText('校验失败，现有数据不会被修改')).toBeVisible();
    await expect(page.getByRole('button', { name: '覆盖恢复' })).toBeDisabled();

    // Valid input: restore through the file picker (a full backup is too large to
    // paste into a controlled textarea quickly, and this is the real user path).
    const restoreChooser = page.waitForEvent('filechooser');
    await page.getByRole('button', { name: /选择备份文件/ }).click();
    (await restoreChooser).setFiles({
      name: 'backup.json',
      mimeType: 'application/json',
      buffer: Buffer.from(raw, 'utf8'),
    });
    await expect(page.getByText('校验通过，可以恢复')).toBeVisible();
    await page.getByRole('button', { name: '覆盖恢复' }).click();
    await expect(page.getByText('恢复完成')).toBeVisible();

    // Study data survived the round trip.
    await page.goto('/stats');
    await expect(page.getByText('累计学习（去重）')).toBeVisible();
  });
});

test.describe('PWA', () => {
  test('registers a service worker and boots offline', async ({ page, context, browserName }) => {
    test.skip(browserName !== 'chromium', 'service workers are only exercised in chromium here');
    await page.goto('/');
    const registered = await page.evaluate(async () => {
      if (!('serviceWorker' in navigator)) return false;
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration) return false;
      await navigator.serviceWorker.ready;
      return true;
    });
    expect(registered).toBe(true);

    // Warm the cache with a second navigation, then go offline.
    await page.goto('/decks');
    await expect(page.getByRole('heading', { name: '词书中心', exact: true })).toBeVisible();
    await context.setOffline(true);
    await page.reload();
    await expect(page.getByRole('heading', { name: '词书中心', exact: true })).toBeVisible();
    await expect(page.getByText('离线模式')).toBeVisible();
    await context.setOffline(false);
  });

  test('exposes an installable web app manifest with icons', async ({ page }) => {
    await page.goto('/');
    const manifestHref = await page.getAttribute('link[rel="manifest"]', 'href');
    expect(manifestHref).toBe('/manifest.webmanifest');
    const response = await page.request.get('/manifest.webmanifest');
    expect(response.ok()).toBe(true);
    const manifest = await response.json();
    expect(manifest.short_name).toBe('WordFlow');
    expect(manifest.display).toBe('standalone');
    const sizes = manifest.icons.map((icon: { sizes: string }) => icon.sizes);
    expect(sizes).toContain('192x192');
    expect(sizes).toContain('512x512');
    const iconResponse = await page.request.get('/icons/icon-192.png');
    expect(iconResponse.ok()).toBe(true);
    expect(iconResponse.headers()['content-type']).toContain('image/png');
  });
});
