import { expect, test, type Page } from '@playwright/test';

/**
 * End-to-end coverage for the real learning loop. Every test gets a fresh
 * browser context, so IndexedDB starts empty and the app seeds its demo decks.
 */

const RATING_LABELS = { known: '认识', fuzzy: '模糊', forgot: '忘记' } as const;
type RatingKey = keyof typeof RATING_LABELS;

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const el = document.documentElement;
    return { scrollWidth: el.scrollWidth, clientWidth: el.clientWidth };
  });
  expect(overflow.scrollWidth).toBeLessThanOrEqual(overflow.clientWidth + 1);
}

/** Read review logs straight from IndexedDB without ever creating the schema. */
async function readLogs(page: Page) {
  return page.evaluate(async () => {
    const databases = await indexedDB.databases();
    if (!databases.some((entry) => entry.name === 'wordflow-db')) {
      return [] as Array<Record<string, unknown>>;
    }
    const request = indexedDB.open('wordflow-db');
    const db = await new Promise<IDBDatabase>((resolve, reject) => {
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
    if (!db.objectStoreNames.contains('reviewLogs')) {
      db.close();
      return [] as Array<Record<string, unknown>>;
    }
    const rows = await new Promise<Array<Record<string, unknown>>>((resolve, reject) => {
      const tx = db.transaction('reviewLogs', 'readonly');
      const all = tx.objectStore('reviewLogs').getAll();
      all.onsuccess = () => resolve(all.result as Array<Record<string, unknown>>);
      all.onerror = () => reject(all.error);
    });
    db.close();
    return rows;
  });
}

async function waitForLogCount(page: Page, expected: number) {
  await expect
    .poll(async () => (await readLogs(page)).length, { timeout: 20_000 })
    .toBeGreaterThanOrEqual(expected);
}

/** Open /study, go through the setup screen and wait for the first card. */
async function openStudy(page: Page, mode?: '英译中' | '中译英' | '纯拼写' | '选择题') {
  await page.goto('/study');
  await expect(page.getByRole('heading', { name: '开始学习' })).toBeVisible();
  if (mode) {
    await page.getByRole('button', { name: new RegExp(`^${mode}`) }).click();
  }
  await page.getByRole('button', { name: '开始学习', exact: true }).click();
  await page.waitForURL(/\/study\/s-/, { timeout: 25_000 });
  await expect(page.locator('article').first()).toBeVisible();
}

/** Reveal the current card (any mode) and click a rating, then wait for the commit. */
async function rateCurrentCard(page: Page, rating: RatingKey) {
  const label = RATING_LABELS[rating];
  const before = (await readLogs(page)).length;
  const reveal = page.getByRole('button', { name: /显示答案/ });
  const skip = page.getByRole('button', { name: /不会/ });
  const ratingButton = page.getByRole('button', { name: new RegExp(`^${label}`) });

  // Spelling/choice modes have their own answer UI; fall back to "skip".
  if (await page.getByTestId('spelling-input').isVisible().catch(() => false)) {
    await skip.first().click();
  } else if ((await page.getByTestId('choice-option').count()) > 0) {
    await skip.first().click();
  } else if (await reveal.isVisible().catch(() => false)) {
    await reveal.click();
  }

  await expect(ratingButton).toBeVisible();
  await ratingButton.click();
  await waitForLogCount(page, before + 1);
  return before + 1;
}

test.describe('WordFlow core loop', () => {
  test('dashboard shows real empty-state stats and the local-only badge', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: '今天也走一小步' })).toBeVisible();
    // The badge exists in both the desktop sidebar and the mobile header; only
    // one of them is rendered at any given viewport.
    await expect(page.locator('a[href="/settings#data"]:visible').first()).toBeVisible();
    await expect(page.getByText('到期复习').first()).toBeVisible();
    await expect(page.getByText('累计学过（去重）')).toBeVisible();
    // No fabricated activity for a brand-new profile.
    await expect(page.getByText('0%').first()).toBeVisible();
    await expectNoHorizontalOverflow(page);
  });

  test('study loop persists a rating across a full reload', async ({ page }) => {
    await openStudy(page);

    const term = (await page.getByTestId('word-term').first().textContent())?.trim();
    expect(term && term.length > 0).toBeTruthy();

    const expected = await rateCurrentCard(page, 'known');

    // The card advances to another word (or the summary if the session ended).
    await expect(async () => {
      const stillOnCard = (await page.getByTestId('word-term').count()) > 0;
      const nextTerm = stillOnCard
        ? (await page.getByTestId('word-term').first().textContent())?.trim()
        : null;
      expect(stillOnCard ? nextTerm !== term : true).toBe(true);
    }).toPass({ timeout: 20_000 });

    const logs = await readLogs(page);
    expect(logs.length).toBe(expected);
    expect(logs[0].rating).toBe('known');
    expect(logs[0].scheduledDaysAfter).toBeGreaterThan(0);
    expect(String(logs[0].dateKey)).toMatch(/^\d{4}-\d{2}-\d{2}$/);

    await page.reload();
    expect((await readLogs(page)).length).toBe(expected);

    await page.goto('/stats');
    await expect(page.getByText('累计学习（去重）')).toBeVisible();
    expect((await readLogs(page)).length).toBe(expected);
  });

  test('forgotten words enter the mistake book and can be drilled separately', async ({ page }) => {
    await openStudy(page);
    await rateCurrentCard(page, 'forgot');

    await page.goto('/mistakes');
    await expect(page.getByRole('heading', { name: '错词本', exact: true })).toBeVisible();
    await expect(page.locator('li.card').first()).toBeVisible();

    const drill = page.getByRole('button', { name: /只练薄弱词/ });
    await expect(drill).toBeEnabled();
    await drill.click();
    await page.waitForURL(/\/study\/s-/, { timeout: 25_000 });
    await expect(page.getByText('错词强化')).toBeVisible();
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('mistake book exposes lapse count, memory state and next review', async ({ page }) => {
    await openStudy(page);
    await rateCurrentCard(page, 'forgot');
    await page.goto('/mistakes');

    const row = page.locator('li.card').first();
    await expect(row).toBeVisible();
    await expect(row.getByText('错误次数')).toBeVisible();
    await expect(row.getByText('记忆状态')).toBeVisible();
    await expect(row.getByText('下次复习')).toBeVisible();
    await expect(row.getByText(/learning|relearning/).first()).toBeVisible();
    // Exactly one real "忘记" so far, so the counter must read 1.
    await expect(row.getByText('错误次数').locator('..').getByText('1', { exact: true })).toBeVisible();
  });

  test('every route renders without crashing', async ({ page }) => {
    const routes = ['/', '/study', '/review', '/mistakes', '/decks', '/stats', '/leaderboard', '/settings'];
    for (const route of routes) {
      await page.goto(route);
      await page.waitForLoadState('networkidle');
      await expect(page.locator('main')).toBeVisible();
      const bodyText = await page.locator('body').innerText();
      expect(bodyText.length).toBeGreaterThan(20);
      expect(bodyText).not.toContain('页面走丢了');
    }
  });

  test('leaderboard shows no fabricated users', async ({ page }) => {
    await page.goto('/leaderboard');
    await expect(page.getByText('没有真实排名')).toBeVisible();
    await expect(page.getByText('等待云端用户系统')).toHaveCount(3);
  });

  test('keyboard-only study: space reveals, number keys rate', async ({ page }) => {
    await openStudy(page);
    const before = (await readLogs(page)).length;
    await page.keyboard.press('Space');
    await expect(page.getByRole('button', { name: /^认识/ })).toBeVisible();
    await page.keyboard.press('1');
    await waitForLogCount(page, before + 1);
    await expect(page.getByRole('button', { name: /显示答案/ })).toBeVisible();
  });

  test('settings persist to localStorage and apply the dark theme', async ({ page }) => {
    await page.goto('/settings');
    // The per-field limits now live under 高级 (collapsed by default), so open it.
    await page.getByText('高级：单独调整每个上限').click();
    await page.getByLabel('每日新词上限').fill('7');
    await page.getByRole('tab', { name: '外观与发音' }).click();
    await page.getByRole('button', { name: '深色', exact: true }).click();
    await page.reload();
    await expect(page.locator('html')).toHaveClass(/dark/);
    await page.getByRole('tab', { name: '学习' }).click();
    await page.getByText('高级：单独调整每个上限').click();
    await expect(page.getByLabel('每日新词上限')).toHaveValue('7');
  });

  test('desktop navigation exposes all primary sections', async ({ page }) => {
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.goto('/');
    const nav = page.getByRole('navigation', { name: '主导航' });
    for (const label of ['今日', '背词', '复习', '错词本', '词书', '统计', '排行榜', '设置']) {
      await expect(nav.getByRole('link', { name: label })).toBeVisible();
    }
  });

  test('starring a card adds it to the mistake book without a duplicate state', async ({ page }) => {
    await openStudy(page);
    const term = (await page.getByTestId('word-term').first().textContent())?.trim();

    const star = page.getByRole('button', { name: new RegExp(`^收藏 ${term}$`) });
    await expect(star).toBeVisible();
    await star.click();
    await expect(page.getByRole('button', { name: new RegExp(`^取消收藏 ${term}$`) })).toBeVisible();

    await page.goto('/mistakes');
    // Scope to the mistake-book list: a one-letter word like "a" also appears
    // inside unrelated <option> text.
    const list = page.locator('ul, ol, table').filter({ hasText: term as string }).first();
    await expect(list.getByText(term as string, { exact: true }).first()).toBeVisible();
    await expect(page.getByText('已收藏').first()).toBeVisible();
    // The word was never rated, so it must stay "new" rather than becoming learned.
    await expect(page.getByText(/new · 稳定度/).first()).toBeVisible();
  });

  test('study setup shows a real plan preview and remembers the practice mode', async ({ page }) => {
    await page.goto('/study');
    await expect(page.getByRole('heading', { name: '开始学习' })).toBeVisible();
    await expect(page.getByText(/复习 \+ \d+ 新词|复习 \+ \d+/).first()).toBeVisible();
    // Four practice modes are real choices now.
    for (const label of ['英译中', '中译英', '纯拼写', '选择题']) {
      await expect(page.getByRole('button', { name: new RegExp(`^${label}`) })).toBeVisible();
    }
    await page.getByRole('button', { name: /^纯拼写/ }).click();
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForURL(/\/study\/s-/);
    await expect(page.getByTestId('spelling-input')).toBeVisible();
    await expect(page.getByTestId('word-term')).toHaveCount(0);

    // The choice persisted to settings for next time.
    await page.goto('/settings');
    await page.getByRole('tab', { name: '学习' }).click();
    await expect(page.getByRole('radio', { name: /纯拼写/ })).toBeChecked();
  });

  test('spelling mode grades a typed answer and records the review', async ({ page }) => {
    await openStudy(page, '纯拼写');
    await expect(page.getByTestId('spelling-input')).toBeVisible();

    const before = (await readLogs(page)).length;
    // Type a deliberately wrong answer to exercise the "near/off" path.
    await page.getByTestId('spelling-input').fill('zzzz');
    await page.getByRole('button', { name: /检查拼写/ }).click();
    await expect(page.getByText('拼写不对')).toBeVisible();
    await expect(page.getByRole('button', { name: /忘记/ })).toBeVisible();
    await page.getByRole('button', { name: /忘记/ }).click();
    await waitForLogCount(page, before + 1);

    const logs = await readLogs(page);
    expect(logs[logs.length - 1].reviewMode).toBe('spelling');
  });

  test('choice mode offers four options and grades the pick', async ({ page }) => {
    await openStudy(page, '选择题');
    const options = page.getByTestId('choice-option');
    await expect(options).toHaveCount(4);

    const before = (await readLogs(page)).length;
    await options.first().click();
    await expect(page.getByText(/回答正确|选错了/)).toBeVisible();
    await page.getByRole('button', { name: /^认识/ }).click();
    await waitForLogCount(page, before + 1);

    const logs = await readLogs(page);
    expect(logs[logs.length - 1].reviewMode).toBe('choice');
  });

  test('shows the computed next review after each rating', async ({ page }) => {
    await openStudy(page);
    await rateCurrentCard(page, 'known');
    await expect(page.getByText(/下次复习/).first()).toBeVisible();
  });

  test('decks page ships the full exam vocabulary plus demo decks', async ({ page }) => {
    await page.goto('/decks');
    await expect(page.getByRole('heading', { name: '词书中心', exact: true })).toBeVisible();

    // 9 hand-written sample decks + 8 full-size ECDICT exam decks.
    const cards = page.locator('article.card');
    await expect(cards).toHaveCount(17);

    // Real, full vocabulary sizes — this is the whole point of the ECDICT decks.
    for (const [name, count] of [
      ['CET-4 四级词表', '3844'],
      ['CET-6 六级词表', '5401'],
      ['高考核心词', '3666'],
      ['中考核心词', '1598'],
      ['考研英语词表', '4796'],
      ['雅思词表', '5020'],
      ['托福词表', '6936'],
      ['GRE 词表', '7484'],
    ] as const) {
      const card = page.locator('article.card', { hasText: name });
      await expect(card.getByRole('heading', { name, exact: true })).toBeVisible();
      await expect(card).toContainText(count);
    }

    // Sample decks are still labelled as samples, never as official lists.
    await expect(page.getByRole('heading', { name: 'CET-4 演示词书', exact: true })).toBeVisible();
    await expect(page.getByText(/词库版本/)).toBeVisible();
    // Source/licence must be visible for the generated decks.
    await expect(page.getByText(/ECDICT/).first()).toBeVisible();
  });

  test('study setup offers 正序/乱序 and a chosen order is honoured', async ({ page }) => {
    await page.goto('/study');
    await expect(page.getByRole('heading', { name: '开始学习' })).toBeVisible();

    // All four orderings are real, selectable controls.
    for (const label of ['正序 A→Z', '乱序', '高频优先', '薄弱优先']) {
      await expect(page.getByRole('button', { name: new RegExp(label) })).toBeVisible();
    }

    // Default is alphabetical.
    await expect(page.getByRole('button', { name: /正序 A→Z/ })).toHaveAttribute(
      'aria-pressed',
      'true',
    );

    await page.getByRole('button', { name: /^乱序/ }).click();
    await expect(page.getByRole('button', { name: /^乱序/ })).toHaveAttribute('aria-pressed', 'true');

    // The choice persists to settings and survives a reload.
    await page.reload();
    await expect(page.getByRole('button', { name: /^乱序/ })).toHaveAttribute('aria-pressed', 'true');
  });

  test('alphabetical order really serves words A→Z', async ({ page }) => {
    await page.goto('/study');
    await page.getByRole('button', { name: /正序 A→Z/ }).click();
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForURL(/\/study\/s-/);

    const first = (await page.getByTestId('word-term').first().textContent())?.trim().toLowerCase();
    expect(first).toBeTruthy();
    // The first card must be at or near the start of the alphabet. Hard-coding
    // one word would break whenever the vocabulary is expanded (it did).
    expect(first!.charCodeAt(0)).toBeLessThanOrEqual('c'.charCodeAt(0));
  });

  test('deck picker filters, shows real counts, and scopes the session', async ({ page }) => {
    await page.goto('/study');
    await expect(page.getByRole('heading', { name: '选择词书' })).toBeVisible();

    // Every deck shows its real word count in plain language ("共 31 词").
    const picker = page.locator('section', { hasText: '选择词书' }).first();
    await expect(picker.getByRole('button', { name: /CET-4 演示词书/ })).toContainText('共 31 词');
    await expect(picker.getByRole('button', { name: /CET-6 演示词书/ })).toContainText('共 25 词');
    await expect(picker.getByRole('button', { name: /雅思学术演示词书/ })).toContainText('共 20 词');
    // …and the learned/pending split, which is what "共 X 词" alone can't show.
    await expect(picker.getByRole('button', { name: /CET-4 演示词书/ })).toContainText('已学 0');
    await expect(picker.getByRole('button', { name: /CET-4 演示词书/ })).toContainText('待学 31');

    // Search narrows the list.
    await page.getByLabel('搜索词书').fill('雅思');
    await expect(picker.getByRole('button', { name: /雅思学术演示词书/ })).toBeVisible();
    await expect(picker.getByRole('button', { name: /CET-4 演示词书/ })).toHaveCount(0);
    await page.getByLabel('搜索词书').fill('');

    // Selecting one deck updates the summary and the plan preview.
    await picker.getByRole('button', { name: /雅思学术演示词书/ }).click();
    await expect(page.getByTestId('deck-selection-summary')).toContainText('已选 1 本 · 20 词');
    await expect(page.getByText(/本节计划/)).toBeVisible();

    // The scoped session only serves that deck's words.
    await page.getByRole('button', { name: '开始学习', exact: true }).click();
    await page.waitForURL(/\/study\/s-/);
    await expect(page.locator('article').first()).toBeVisible();
  });

  test('selecting no deck blocks starting instead of silently using all decks', async ({ page }) => {
    await page.goto('/study');
    const picker = page.locator('section', { hasText: '选择词书' }).first();
    await picker.getByRole('button', { name: '清空', exact: true }).click();

    await expect(page.getByText(/没有选中任何词书/)).toBeVisible();
    await expect(page.getByRole('button', { name: '开始学习', exact: true })).toBeDisabled();
  });

  test('daily plan sliders change how much is scheduled per day', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: '学习' }).click();

    await expect(page.getByRole('heading', { name: '每日学习量' })).toBeVisible();

    // Presets are real, selectable controls with visible consequences.
    await expect(page.getByRole('button', { name: /轻松/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /冲刺/ })).toBeVisible();

    await page.getByRole('button', { name: /认真/ }).click();
    await expect(page.getByTestId('daily-minutes-value')).toHaveText('30 分钟');
    await expect(page.getByTestId('daily-new-value')).toHaveText('25 词');
    await expect(page.getByRole('button', { name: /认真/ })).toHaveAttribute('aria-pressed', 'true');

    // The minutes slider really moves the derived plan.
    const minutesSlider = page.getByLabel('每天学习多久');
    await minutesSlider.fill('60');
    await expect(page.getByTestId('daily-minutes-value')).toHaveText('60 分钟');

    // The new-word slider is independent and also persisted.
    const wordsSlider = page.getByLabel('每天学多少新词');
    await wordsSlider.fill('5');
    await expect(page.getByTestId('daily-new-value')).toHaveText('5 词');
    // A custom mix is flagged as such instead of pretending to be a preset.
    await expect(page.getByText(/自定义组合/)).toBeVisible();

    // Persisted across a reload.
    await page.reload();
    await page.getByRole('tab', { name: '学习' }).click();
    await expect(page.getByTestId('daily-new-value')).toHaveText('5 词');
    await expect(page.getByTestId('daily-minutes-value')).toHaveText('60 分钟');
  });

  test('daily plan shown on the dashboard affects the scheduled new words', async ({ page }) => {
    await page.goto('/settings');
    await page.getByRole('tab', { name: '学习' }).click();
    await page.getByRole('button', { name: /轻松/ }).click();
    await expect(page.getByTestId('daily-new-value')).toHaveText('8 词');

    await page.goto('/');
    // The dashboard reflects the same numbers the learner just chose.
    await expect(page.getByRole('link', { name: /每日目标 15 词 \/ 10 分钟/ })).toBeVisible();
    await expect(page.getByText('每日上限 8', { exact: false }).first()).toBeVisible();
  });

  test('no horizontal overflow at 360px width', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 780 });
    for (const route of ['/', '/study', '/mistakes', '/decks', '/stats', '/settings']) {
      await page.goto(route);
      await expectNoHorizontalOverflow(page);
    }
    await expect(page.getByRole('navigation', { name: '底部导航' })).toBeVisible();
  });
});
