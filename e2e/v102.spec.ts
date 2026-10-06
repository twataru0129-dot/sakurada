/**
 * v1.0.2 の確認：開始待ち（スペースキー／スタートボタン）、問題表示の簡素化、ミスした問題の詳細、
 * ローマ字のお手本（ヘボン式・訓令式）、問題数で練習（25問・50問）。
 */
import { expect, test, type Page } from '@playwright/test';

interface Opts {
  kind?: 'A' | 'B';
  method?: string;
  count?: 25 | 50;
  style?: 'ヘボン式' | '訓令式';
  start?: boolean;
}

async function setup(page: Page, o: Opts = {}) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).click();
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel(o.kind === 'B' ? 'B．文章入力〈変換あり〉' : 'A．ローマ字入力').check();
  await page.getByLabel(o.method ?? '実物のキーボード').check();
  if (o.style) await page.getByLabel(new RegExp(`^${o.style}`)).check();
  if (o.count) {
    await page.getByLabel('問題数で練習').check();
    await page.getByLabel(`${o.count}問`).check();
  }
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await expect(page.getByText('準備ができたら、スペースキーを押してスタート')).toBeVisible();
  if (o.start !== false) await page.getByRole('button', { name: 'スタート' }).click();
}

const stat = async (page: Page, label: string) =>
  Number(await page.locator('.practice-stats .stat', { hasText: label }).locator('b').textContent());
const guide = async (page: Page) =>
  ((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? '');
/** いまの問題をガイドどおりに最後まで打ちます */
async function completeCurrent(page: Page) {
  await page.keyboard.type(await guide(page));
}
const wrongFor = (c: string) => (c === 'z' ? 'x' : 'z');
const pcOnly = (name: string) => test.skip(name === 'phone', 'スマートフォンは画面タップで別に確認します');

test.describe('開始待ち', () => {
  test('待っている間は時間が減らず、スペースキーで開始する（開始のスペースは入力に数えない）', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.clock.install();
    await setup(page, { start: false });
    await expect(page.locator('.problem-romaji')).toHaveCount(0);
    await page.clock.runFor(15_000);
    await expect(page.locator('.timer')).toHaveText('残り 3:00');
    const scrollBefore = await page.evaluate(() => window.scrollY);
    // 長押し（くり返し）しても二重に開始しない
    await page.keyboard.down(' ');
    await page.keyboard.down(' ');
    await page.keyboard.up(' ');
    await expect(page.locator('.problem-romaji')).toBeVisible();
    expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);
    expect(await stat(page, '正しく打ったキー')).toBe(0);
    expect(await stat(page, 'ミス')).toBe(0);
    await expect(page.locator('.romaji-typed')).toHaveText('');
    await expect(page.locator('.problem-romaji')).toHaveAttribute('data-seq', '0');
    await page.clock.runFor(2_000);
    await expect(page.locator('.timer')).toHaveText('残り 2:58');
  });

  test('スタートボタンで開始できる（連打しても1回だけ）', async ({ page }) => {
    await setup(page, { start: false, method: '画面のキーをタップ' });
    const btn = page.getByRole('button', { name: 'スタート' });
    await btn.click();
    await expect(page.locator('.problem-romaji')).toBeVisible();
    await expect(btn).toHaveCount(0);
    expect(await stat(page, '正しく打ったキー')).toBe(0);
  });

  test('IME 変換中・修飾キー付きのスペースでは開始しない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { start: false });
    await page.keyboard.press('Control+Space');
    await page.keyboard.press('Shift+Space');
    await expect(page.locator('.problem-romaji')).toHaveCount(0);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', code: 'Space', isComposing: true, bubbles: true })));
    await expect(page.locator('.problem-romaji')).toHaveCount(0);
    await page.keyboard.press(' ');
    await expect(page.locator('.problem-romaji')).toBeVisible();
  });

  test('待っている間に画面を離れても記録は作られない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { start: false });
    await page.goto('./#/home');
    await expect(page.getByText('まだ練習していません。')).toBeVisible();
  });

  test('文章入力：スペースで開始すると入力欄にフォーカスが移り、開始のスペースは入らない。開始後はスペースを入力できる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { kind: 'B', start: false });
    await page.keyboard.press(' ');
    const box = page.locator('#sentence-input');
    await expect(box).toBeFocused();
    await expect(box).toHaveValue('');
    expect(await stat(page, 'ミス')).toBe(0);
    await page.keyboard.press(' ');
    await expect(box).toHaveValue(' ');
  });

  test('「同じ条件でもう一度」でも開始待ちに戻る', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();
    await page.getByRole('button', { name: '同じ条件でもう一度' }).click();
    await expect(page.getByText('準備ができたら、スペースキーを押してスタート')).toBeVisible();
    await expect(page.getByText('日本語入力はオフ（半角英数）にしてください。')).toBeVisible();
    await expect(page.locator('.problem-romaji')).toHaveCount(0);
  });
});

test.describe('問題表示', () => {
  test('読み・問題・ローマ字の順で中央に並び、枠がない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    const kana = (await page.locator('.problem-kana').boundingBox())!;
    const text = (await page.locator('.problem-text').boundingBox())!;
    const roma = (await page.locator('.romaji-line').boundingBox())!;
    expect(kana.y).toBeLessThan(text.y);
    expect(text.y).toBeLessThan(roma.y);
    const sizes = await page.evaluate(() =>
      ['.problem-kana', '.problem-text', '.romaji-line'].map((s) => parseFloat(getComputedStyle(document.querySelector(s)!).fontSize)),
    );
    expect(sizes[1]).toBeGreaterThan(sizes[0]!);
    expect(sizes[1]).toBeGreaterThan(sizes[2]!);
    expect(await page.locator('.problem-romaji').evaluate((e) => getComputedStyle(e).textAlign)).toBe('center');
    // 読みに枠がない
    expect(await page.locator('.kana-unit').first().evaluate((e) => [getComputedStyle(e).outlineStyle, getComputedStyle(e).backgroundColor])).toEqual(['none', 'rgba(0, 0, 0, 0)']);
    // 強調が移っても行の高さ・文字の位置が変わらない
    const before = (await page.locator('.romaji-line').boundingBox())!;
    const startX = (await page.locator('.romaji-line').evaluate((e) => e.getBoundingClientRect().left));
    await page.keyboard.press((await page.locator('.romaji-next').textContent())!);
    const after = (await page.locator('.romaji-line').boundingBox())!;
    expect(after.height).toBe(before.height);
    const width = await page.locator('.romaji-line').evaluate((e) => {
      const r = document.createRange();
      r.selectNodeContents(e);
      return r.getBoundingClientRect().width;
    });
    expect(startX).toBeGreaterThanOrEqual(0);
    expect(width).toBeGreaterThan(0);
  });

  test('ガイドOFF：空の枠を出さない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await page.getByRole('button', { name: /タイピングモード/ }).click();
    await page.getByLabel('実物のキーボード').check();
    await page.getByLabel(/ローマ字ガイド/).uncheck();
    await page.getByRole('button', { name: '練習をはじめる' }).click();
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('.romaji-next')).toHaveCount(0);
    await expect(page.getByText('（ローマ字ガイドは OFF です）')).toBeVisible();
  });
});

test.describe('ローマ字のお手本', () => {
  test('訓令式を選ぶとガイドが訓令式になり、ヘボン式の打ち方も正解になる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { style: '訓令式' });
    for (let i = 0; i < 12; i++) {
      const g = await guide(page);
      expect(g, g).not.toMatch(/sh|ch|ts|j/);
      await page.keyboard.type(g);
    }
    expect(await stat(page, 'ミス')).toBe(0);
  });

  test('ヘボン式（既定）のガイド', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    for (let i = 0; i < 12; i++) {
      const g = await guide(page);
      expect(g, g).not.toMatch(/si|ti(?!e)|tu|zi|sy|ty|zy/);
      await page.keyboard.type(g);
    }
  });
});

test.describe('ミスした問題の詳細', () => {
  test('ミスがなければ詳細の欄は表示しない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    await completeCurrent(page);
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();
    await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
    await expect(page.getByText('ミスした問題の詳細')).toHaveCount(0);
    await expect(page.locator('.miss-details')).toHaveCount(0);
  });

  test('ミスした位置・押したキー・回数が出題回ごとに表示され、入力途中の問題も含まれる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    // 1問目：2文字目の位置で同じ誤りを2回
    const text1 = (await page.locator('.problem-text').textContent())!;
    const g1 = await guide(page);
    await page.keyboard.press(g1[0]!);
    const bad = wrongFor(g1[1]!);
    await page.keyboard.press(bad);
    await page.keyboard.press(bad);
    await page.keyboard.type(g1.slice(1));
    // 2問目：ミスなしで完成
    await completeCurrent(page);
    // 3問目：最初の位置でミスしたまま途中終了
    const text3 = (await page.locator('.problem-text').textContent())!;
    const g3 = await guide(page);
    await page.keyboard.press(wrongFor(g3[0]!));
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();

    const items = page.getByTestId('miss-item');
    await expect(items).toHaveCount(2);
    const first = items.nth(0);
    await expect(first).toContainText('1問目');
    await expect(first).toContainText(text1);
    await expect(first.getByTestId('miss-count')).toHaveText('2回');
    await expect(first.getByTestId('miss-keys')).toHaveText(bad);
    await expect(first.getByTestId('miss-explain')).toContainText(`${g1[1]} の位置で ${bad} を押した（2回）`);
    await expect(first.getByTestId('miss-path')).toHaveText(new RegExp(`^${g1[0]}${g1[1]}×2`));
    expect(await first.locator('.path-miss').evaluate((e) => getComputedStyle(e).textDecorationLine)).toContain('underline');
    await expect(first).toContainText('正確率');
    await expect(first).not.toContainText('入力途中');
    const third = items.nth(1);
    await expect(third).toContainText('3問目');
    await expect(third).toContainText(text3);
    await expect(third).toContainText('入力途中');
    await expect(third.getByTestId('miss-count')).toHaveText('1回');
    // 操作ボタンが使える
    await expect(page.getByRole('button', { name: '同じ条件でもう一度' })).toBeInViewport();
  });

  test('別の正しい打ち方（shi と si など）はミスにしない', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page);
    // ガイドの sh / ch / ts を、別の正しい表記（s / t / t）で打つ
    for (let i = 0; i < 15; i++) {
      const g = await guide(page);
      await page.keyboard.type(g.replace(/^shi/, 'si').replace(/^chi/, 'ti').replace(/^tsu/, 'tu'));
    }
    expect(await stat(page, 'ミス')).toBe(0);
  });

  test('時間切れのときもミスした入力途中の問題が表示される', async ({ page }, info) => {
    pcOnly(info.project.name);
    await page.clock.install();
    await setup(page);
    const g = await guide(page);
    await page.keyboard.press(wrongFor(g[0]!));
    await page.clock.runFor(181_000);
    await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
    await expect(page.getByTestId('miss-item')).toHaveCount(1);
    await expect(page.getByTestId('miss-item')).toContainText('入力途中');
  });
});

test.describe('問題数で練習', () => {
  test('25問ちょうどで終わり、最後の問題の成績とミス詳細も含まれる。再練習でも条件を引き継ぐ', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { count: 25 });
    await expect(page.locator('.timer')).toContainText('経過');
    let typed = 0;
    for (let i = 0; i < 24; i++) {
      const g = await guide(page);
      typed += g.length;
      await page.keyboard.type(g);
    }
    await expect(page.locator('.practice-stats .stat', { hasText: '完成' })).toContainText('24／25');
    // 最後の問題でミスを1回してから完成
    const last = (await page.locator('.problem-text').textContent())!;
    const g = await guide(page);
    await page.keyboard.press(wrongFor(g[0]!));
    typed += g.length;
    await page.keyboard.type(g);
    await expect(page.getByTestId('count-done')).toContainText('25問完了');
    await expect(page.locator('.kv > div', { hasText: '完成した問題' }).locator('.v')).toHaveText('25 問');
    await expect(page.locator('.kv > div', { hasText: '正しく打ったキー' }).locator('.v')).toHaveText(String(typed));
    await expect(page.locator('.kv > div', { hasText: 'ミス' }).first().locator('.v')).toHaveText('1');
    await expect(page.locator('.kv > div', { hasText: 'かかった時間' })).toBeVisible();
    await expect(page.getByText('参考ランク')).toBeVisible();
    await expect(page.getByTestId('miss-item')).toHaveCount(1);
    await expect(page.getByTestId('miss-item')).toContainText('25問目');
    await expect(page.getByTestId('miss-item')).toContainText(last);
    // 時間制の記録とは混ぜない
    await expect(page.getByText('同じ条件の前回の記録はありません')).toBeVisible();
    await page.getByRole('button', { name: '同じ条件でもう一度' }).click();
    await expect(page.getByText('準備ができたら、スペースキーを押してスタート')).toBeVisible();
    await expect(page.locator('.practice-label')).toContainText('25問');
    await page.getByRole('button', { name: 'スタート' }).click();
    await expect(page.locator('.practice-stats .stat', { hasText: '完成' })).toContainText('0／25');
  });

  test('50問ちょうどで終わる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { count: 50 });
    for (let i = 0; i < 50; i++) await completeCurrent(page);
    await expect(page.getByTestId('count-done')).toContainText('50問完了');
    await expect(page.locator('.kv > div', { hasText: '完成した問題' }).locator('.v')).toHaveText('50 問');
  });

  test('問題数制の途中終了', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { count: 25 });
    await completeCurrent(page);
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();
    await expect(page.getByText(/25問の完了としては扱いません/)).toBeVisible();
    await expect(page.getByTestId('count-done')).toHaveCount(0);
  });

  test('文章入力でも問題数で練習できる', async ({ page }, info) => {
    pcOnly(info.project.name);
    await setup(page, { kind: 'B', count: 25 });
    await expect(page.locator('#sentence-input')).toBeFocused();
    await expect(page.locator('.practice-stats .stat', { hasText: '完成' })).toContainText('0／25');
  });
});

test('スマートフォン：ミス詳細つきの結果でも横スクロールが出ない', async ({ page }, info) => {
  test.skip(info.project.name !== 'phone');
  await setup(page, { method: '画面のキーをタップ' });
  const next = (await page.locator('.romaji-next').textContent())!;
  const wrong = next === 'q' ? 'w' : 'q';
  await page.locator('button.key', { hasText: new RegExp(`^${wrong.toUpperCase()}$`) }).first().dispatchEvent('pointerdown');
  await page.getByRole('button', { name: '途中で終わる' }).click();
  await page.getByRole('button', { name: '終わる' }).click();
  await expect(page.getByTestId('miss-item')).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await page.screenshot({ path: 'test-results/shots/v102-phone-result.png', fullPage: true });
});
