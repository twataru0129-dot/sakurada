/**
 * v1.0.3 練習の記録・成長グラフ（ゲスト：この端末に保存）
 */
import { expect, test, type Page } from '@playwright/test';

const KEY = 'sakura-type:guest-history';

interface Seed {
  speed: number;
  accuracy?: number | null;
  finished?: boolean;
  minutes?: 3 | 5 | 10;
  targetCount?: 25 | 50;
  kind?: 'romaji' | 'sentence';
  inputMethod?: 'keyboard' | 'touch';
  romajiStyle?: 'hepburn' | 'kunrei';
}

/** 保存形式どおりの記録を作ります（日時は i 分ずつ新しくなります） */
function makeRecords(seeds: Seed[]) {
  return seeds.map((s, i) => {
    const count = s.targetCount !== undefined;
    return {
      id: `seed-${i}`,
      startedAt: new Date(Date.UTC(2026, 8, 1, 0, i)).toISOString(),
      kind: s.kind ?? 'romaji',
      inputMethod: s.inputMethod ?? 'keyboard',
      endMode: count ? 'count' : 'time',
      minutes: count ? null : (s.minutes ?? 3),
      targetCount: count ? s.targetCount : null,
      setType: 'standard',
      theme: 'all',
      difficulty: 'mixed',
      questionSetVersion: 'qs-2026.10',
      romajiStyle: s.romajiStyle ?? 'hepburn',
      correct: Math.round(s.speed * 3),
      miss: 5,
      accuracy: s.accuracy === undefined ? 95 : s.accuracy,
      speed: s.speed,
      completedQuestions: count ? s.targetCount : 12,
      elapsedMs: s.finished === false ? 60_000 : 180_000,
      rank: 'E',
      rankVersion: 'rank-v1',
      official: !count && s.finished !== false,
      finished: s.finished !== false,
    };
  });
}

async function seed(page: Page, value: unknown) {
  await page.addInitScript(
    ([k, v]) => {
      if (!sessionStorage.getItem('seeded')) {
        localStorage.setItem(k as string, typeof v === 'string' ? v : JSON.stringify(v));
        sessionStorage.setItem('seeded', '1');
      }
    },
    [KEY, value],
  );
}

async function openHistoryAsGuest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).click();
  await page.getByRole('button', { name: '練習の記録' }).click();
  await expect(page.getByRole('heading', { name: '練習の記録' })).toBeVisible();
}

async function practiceOnce(page: Page, opts: { count?: 25 } = {}) {
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('実物のキーボード').check();
  if (opts.count) {
    await page.getByLabel('問題数で練習').check();
    await page.getByLabel('25問').check();
  }
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await page.keyboard.type(((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? ''));
  await page.getByRole('button', { name: '途中で終わる' }).click();
  await page.getByRole('button', { name: '終わる' }).click();
  await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
}

const pcOnly = (name: string) => test.skip(name === 'phone', 'スマートフォンは別のテストで確認します');

test.describe('ゲストの記録の保存', () => {
  test('練習の記録が自動で保存され、再読み込みやブラウザの再起動後も残る', async ({ page, browser }, info) => {
    pcOnly(info.project.name);
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page);
    await expect(page.getByText('✓ この端末・ブラウザに記録しました（ゲスト）')).toBeVisible();
    await expect(page.getByText('共用端末では、ほかの人の記録も表示される場合があります。').first()).toBeVisible();
    await page.getByRole('button', { name: 'ホームへ' }).click();
    await practiceOnce(page, { count: 25 });
    // 再読み込み
    await page.reload();
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('history-source')).toContainText('ゲスト：この端末・ブラウザに保存した記録');
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    await expect(page.getByTestId('history-row').first()).toContainText('25問');
    await expect(page.getByTestId('history-row').nth(1)).toContainText('3分');
    await expect(page.getByTestId('history-row').first()).toContainText('途中終了');
    // ブラウザの再起動（保存データを引き継いだ新しいブラウザ）
    const state = await page.context().storageState();
    const ctx = await browser.newContext({ storageState: state, viewport: { width: 1366, height: 820 } });
    const p2 = await ctx.newPage();
    await openHistoryAsGuest(p2);
    await expect(p2.getByTestId('history-row')).toHaveCount(2);
    await ctx.close();
  });

  test('記録の内容（日時・条件・数値・お手本）が保存される', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page);
    const rec = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).records[0], KEY);
    expect(rec).toMatchObject({ kind: 'romaji', inputMethod: 'keyboard', endMode: 'time', minutes: 3, targetCount: null, setType: 'standard', romajiStyle: 'hepburn', finished: false, official: false });
    for (const k of ['id', 'startedAt', 'correct', 'speed', 'miss', 'completedQuestions', 'elapsedMs', 'rank', 'rankVersion', 'questionSetVersion', 'theme', 'difficulty']) expect(rec).toHaveProperty(k);
    expect(rec).not.toHaveProperty('missDetails');
    expect(JSON.stringify(rec)).not.toMatch(/password|token/i);
  });

  test('開始待ちの画面を離れただけでは記録を作らない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await page.getByRole('button', { name: /タイピングモード/ }).click();
    await page.getByLabel('実物のキーボード').check();
    await page.getByRole('button', { name: '練習をはじめる' }).click();
    await page.goto('./#/home');
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test('保存できない環境では「記録しました」と表示しない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.addInitScript(() => {
      Storage.prototype.setItem = function () {
        throw new DOMException('quota', 'QuotaExceededError');
      };
    });
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page);
    await expect(page.getByText('× この端末に記録できませんでした')).toBeVisible();
    await expect(page.getByText('✓ この端末・ブラウザに記録しました（ゲスト）')).toHaveCount(0);
  });

  test('100件の上限：101件目で一番古い記録から入れ替わる。一覧は20件ずつ', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, { version: 1, records: makeRecords([...Array(100)].map((_, i) => ({ speed: 100 + i }))).reverse() });
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page);
    const ids = await page.evaluate((k) => JSON.parse(localStorage.getItem(k)!).records.map((r: { id: string }) => r.id), KEY);
    expect(ids).toHaveLength(100);
    expect(ids).not.toContain('seed-0');
    expect(ids).toContain('seed-1');
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(20);
    await expect(page.getByText('100件中 20件を表示')).toBeVisible();
    await page.getByRole('button', { name: /もっと見る/ }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(40);
  });

  test('ゲストの記録をすべて削除（確認あり）。ほかのデータには触れない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, { version: 1, records: makeRecords([{ speed: 100 }, { speed: 110 }]) });
    await page.addInitScript(() => localStorage.setItem('other-app-setting', 'keep'));
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    page.once('dialog', (d) => d.dismiss());
    await page.getByRole('button', { name: 'ゲストの記録をすべて削除' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(2);
    page.once('dialog', (d) => d.accept());
    await page.getByRole('button', { name: 'ゲストの記録をすべて削除' }).click();
    await expect(page.getByTestId('history-empty')).toHaveText('練習すると、ここに記録が残ります。');
    expect(await page.evaluate(() => localStorage.getItem('other-app-setting'))).toBe('keep');
    expect(await page.evaluate((k) => localStorage.getItem(k), KEY)).toBeNull();
  });

  test('壊れたデータでも止まらず、次の練習から保存できる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, '{this is broken');
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('history-empty')).toBeVisible();
    await expect(page.getByText(/読み込めなかった記録が1件/)).toBeVisible();
    await page.getByRole('button', { name: /ホームにもどる/ }).click();
    await practiceOnce(page);
    await expect(page.getByText('✓ この端末・ブラウザに記録しました（ゲスト）')).toBeVisible();
  });

  test('古い形（版なし・終了条件なし）の記録も読み込める', async ({ page }, info) => {
    pcOnly(info.project.name);
    const old = makeRecords([{ speed: 120 }]).map((r) => {
      const o: Record<string, unknown> = { ...r };
      delete o.endMode;
      delete o.targetCount;
      delete o.romajiStyle;
      return o;
    });
    await seed(page, old);
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row')).toContainText('3分');
  });
});

test.describe('成長グラフ', () => {
  test('記録0件では空のグラフを出さない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('history-empty')).toHaveText('練習すると、ここに記録が残ります。');
    await expect(page.getByTestId('chart-speed')).toHaveCount(0);
  });

  test('1件では点と数値を表示し、平均や比較は作らない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, { version: 1, records: makeRecords([{ speed: 123.4 }]) });
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('chart-speed').locator('.trend-point')).toHaveCount(1);
    await expect(page.getByTestId('chart-speed')).toContainText('123.4 打／分');
    await expect(page.getByTestId('chart-speed-detail')).toContainText('速さ 123.4 打／分');
    await expect(page.getByTestId('chart-speed-ma')).toHaveCount(0);
    await expect(page.getByTestId('recent-avg')).toContainText('あと4回で表示');
    await expect(page.getByTestId('growth-wait')).toContainText('あと9回');
  });

  test('5件未満では移動平均を作らない。5件で最初の平均が出る', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, { version: 1, records: makeRecords([100, 110, 120, 130].map((speed) => ({ speed }))) });
    await openHistoryAsGuest(page);
    await expect(page.getByTestId('chart-speed-ma')).toHaveCount(0);
    await expect(page.getByTestId('recent-avg')).toContainText('あと1回で表示');
  });

  test('10件以上：同じ条件の完了記録だけで、自己ベスト・平均・最初と最近の5回を比べる（途中終了・別の条件は除く）', async ({ page }, info) => {
    pcOnly(info.project.name);
    const seeds: Seed[] = [
      ...[100, 100, 100, 100, 100].map((speed) => ({ speed, accuracy: 93 })),
      { speed: 999, finished: false }, // 途中終了：グラフ・平均・自己ベストに入れない
      { speed: 888, minutes: 5 }, // 別の条件（5分）
      { speed: 777, targetCount: 25 }, // 別の条件（25問）
      { speed: 666, inputMethod: 'touch' }, // 別の条件（画面入力）
      { speed: 555, kind: 'sentence' }, // 別の条件（文章入力）
      ...[110, 115, 120, 112.5, 105].map((speed) => ({ speed, accuracy: 95.3, romajiStyle: 'kunrei' as const })), // お手本が違っても同じ条件
    ];
    await seed(page, { version: 1, records: makeRecords(seeds) });
    await openHistoryAsGuest(page);
    // 一番新しい記録の条件（3分・実物キーボード・ローマ字）が最初に選ばれている
    await expect(page.getByTestId('cond-select')).toHaveValue(/romaji\|3\|keyboard/);
    await expect(page.getByTestId('chart-speed').locator('.trend-point')).toHaveCount(10);
    await expect(page.getByTestId('best-speed')).toContainText('120.0');
    await expect(page.getByTestId('recent-avg')).toContainText('112.5');
    await expect(page.getByTestId('growth-msgs')).toContainText('最初の5回と比べて、最近の5回は12.5打／分アップ！');
    await expect(page.getByTestId('growth-msgs')).toContainText('正確率が2.3ポイント上がりました！');
    await expect(page.getByText('直近100回の記録の中での値です')).toBeVisible();
    await expect(page.getByTestId('chart-speed-ma')).toHaveCount(1);
    await expect(page.getByTestId('chart-accuracy')).toContainText('％');
    // 点を選ぶと数値が出る
    await page.getByTestId('chart-speed').locator('.trend-point').nth(9).click();
    await expect(page.getByTestId('chart-speed-detail')).toContainText('10回目');
    await expect(page.getByTestId('chart-speed-detail')).toContainText('速さ 105.0 打／分');
    // 一覧には途中終了も残り、印がつく
    await expect(page.getByTestId('history-row').filter({ hasText: '途中終了' })).toHaveCount(1);
    // 別の条件を選び直せる
    const v = await page.getByTestId('cond-select').locator('option', { hasText: '25問' }).getAttribute('value');
    await page.getByTestId('cond-select').selectOption(v!);
    await expect(page.getByTestId('chart-speed').locator('.trend-point')).toHaveCount(1);
  });

  test('結果画面から開くと、今回と同じ条件が選ばれている', async ({ page }, info) => {
    pcOnly(info.project.name);
    await seed(page, { version: 1, records: makeRecords([{ speed: 100 }, { speed: 200, minutes: 5 }]) });
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page, { count: 25 });
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('cond-select')).toHaveValue(/romaji\|count25\|keyboard/);
    // 今回は途中終了なので、グラフには入らない
    await expect(page.getByTestId('growth-empty')).toBeVisible();
  });
});

test('スマートフォン：記録をカードで読みやすく表示し、横スクロールが出ない', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await seed(page, { version: 1, records: makeRecords([...Array(12)].map((_, i) => ({ speed: 80 + i * 3, finished: i !== 4 }))) });
  await openHistoryAsGuest(page);
  await expect(page.getByTestId('history-row').first()).toBeVisible();
  expect(await page.getByTestId('history-row').first().evaluate((e) => getComputedStyle(e).display)).toBe('block');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.getByTestId('history-row').first().getByRole('button', { name: '詳細' }).click();
  await expect(page.getByText('かかった時間').first()).toBeVisible();
  await page.screenshot({ path: 'test-results/shots/v103-phone-history.png', fullPage: true });
});

test('Surface 相当：記録の画面（スクリーンショット）', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  await page.setViewportSize({ width: 1368, height: 800 });
  const seeds: Seed[] = [...Array(14)].map((_, i) => ({ speed: 90 + i * 2 + (i % 3) * 4, accuracy: 90 + (i % 5), finished: i !== 6 }));
  await seed(page, { version: 1, records: makeRecords(seeds) });
  await openHistoryAsGuest(page);
  await page.getByTestId('chart-speed').locator('.trend-point').nth(5).click();
  await page.screenshot({ path: 'test-results/shots/v103-surface-history.png', fullPage: true });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});
