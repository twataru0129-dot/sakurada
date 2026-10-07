/**
 * v1.3.1 のゲーム画面の配置の E2E テスト：
 * 画像と問題文の枠が同じ大きさで並ぶこと、キーボードが中央にあり指のガイドがすぐ下にあること、
 * 表示上の改行で判定・残り文字数が変わらないこと、別の打ち方でも次の文字・キー・指が連動すること、
 * 表示するキーに過不足がないこと、スマートフォンでタップ入力できること。
 */
import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-game')).toBeVisible();
}
async function startCourse(page: Page, course: '標準コース' | '短縮コース', opts: { touch?: boolean } = {}) {
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-sakurada-familia').click();
  await page.getByRole('radio', { name: new RegExp(course) }).check();
  if (opts.touch) await page.getByRole('radio', { name: '画面のキーをタップ' }).check();
  await page.getByTestId('game-start').click();
  await expect(page.getByTestId('game-go')).toBeVisible();
}
const guideText = async (page: Page) => (await page.getByTestId('game-romaji').getAttribute('data-remaining')) ?? '';
const leftCount = async (page: Page) => Number(((await page.getByTestId('gauge-left').textContent()) ?? '').replace(/[^0-9]/g, ''));

/** 次の文字・光っているキー・「次のキー」の表示がそろっていること */
async function expectInSync(page: Page) {
  const next = (await page.locator('.game-romaji .romaji-next').textContent())!;
  expect(next).toHaveLength(1);
  expect(await guideText(page)).toMatch(new RegExp(`^${next.replace(/[.\\-]/g, '\\$&')}`));
  await expect(page.locator('.gkb .key.target')).toHaveCount(1);
  await expect(page.locator('.gkb .key.target')).toHaveAttribute('data-key', next);
  await expect(page.getByTestId('next-key')).toHaveText(next === '-' ? 'ー（-）' : next.toUpperCase());
  await expect(page.getByTestId('finger')).not.toHaveText('—');
}

test.describe('v1.3.1 ゲーム画面の配置', () => {
  test('画像と問題文の枠が同じ大きさで上下をそろえて並び、キーボードは中央、指のガイドはすぐ下', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.setViewportSize({ width: 1366, height: 768 });
    await guest(page);
    await startCourse(page, '標準コース');
    await page.getByTestId('game-go').click();
    const [img, txt] = await Promise.all([page.locator('.game-panel-image').boundingBox(), page.getByTestId('game-sentence').boundingBox()]);
    expect(Math.abs(img!.width - txt!.width)).toBeLessThanOrEqual(1);
    expect(Math.abs(img!.height - txt!.height)).toBeLessThanOrEqual(1);
    expect(Math.abs(img!.y - txt!.y)).toBeLessThanOrEqual(1);
    expect(img!.x).toBeLessThan(txt!.x);
    // 横幅を広く使う（左右の余白が小さい）
    expect(img!.x).toBeLessThanOrEqual(40);
    expect(1366 - (txt!.x + txt!.width)).toBeLessThanOrEqual(40);
    // キーボードは2つの枠の下、全体が中央
    const kb = (await page.locator('.gkb').boundingBox())!;
    expect(kb.y).toBeGreaterThanOrEqual(txt!.y + txt!.height);
    const vw = await page.evaluate(() => document.documentElement.clientWidth);
    expect(Math.abs(kb.x - (vw - (kb.x + kb.width)))).toBeLessThanOrEqual(2);
    // 指のガイドはキーボードのすぐ下で、中央
    const hands = (await page.locator('.game-hands .hands').boundingBox())!;
    expect(hands.y).toBeGreaterThanOrEqual(kb.y + kb.height - 0.5);
    expect(hands.y - (kb.y + kb.height)).toBeLessThanOrEqual(20);
    expect(Math.abs(hands.x + hands.width / 2 - vw / 2)).toBeLessThanOrEqual(30);
    // 画像は縦横比のまま（引き伸ばし・切り取りなし）
    const ratio = await page.getByTestId('building').evaluate((el) => {
      const im = el.querySelector('img');
      if (!im || !im.naturalWidth) return null;
      const r = im.getBoundingClientRect();
      return [r.width / r.height, im.naturalWidth / im.naturalHeight, getComputedStyle(im).objectFit];
    });
    if (ratio) expect(Math.abs((ratio[0] as number) - (ratio[1] as number)) < 0.02 || ratio[2] === 'contain').toBe(true);
  });

  test('表示するキーは英字26文字と , . - / だけで、重複も欠けもなく、段のずれを保つ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    const keys = await page.locator('.gkb [data-key]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.key!));
    const want = [...'abcdefghijklmnopqrstuvwxyz', ',', '.', '-', '/'];
    expect(keys).toHaveLength(want.length);
    expect(new Set(keys)).toEqual(new Set(want));
    await expect(page.locator('.gkb')).not.toContainText(/Shift|Enter|BS|Space|スペース/);
    const x = async (k: string) => (await page.locator(`.gkb [data-key="${k}"]`).boundingBox())!;
    const [q, a, z, w] = await Promise.all([x('q'), x('a'), x('z'), x('w')]);
    const unit = w.x - q.x;
    expect(a.x - q.x).toBeCloseTo(unit * 0.25, 0);
    expect(z.x - a.x).toBeCloseTo(unit * 0.5, 0);
    expect(a.y).toBeGreaterThan(q.y);
    expect(z.y).toBeGreaterThan(a.y);
    // F・J はホームポジションの印つき
    await expect(page.locator('.gkb [data-key="f"]')).toHaveClass(/home/);
    await expect(page.locator('.gkb [data-key="j"]')).toHaveClass(/home/);
    // 実物のキーボードの操作（一時停止）は今までどおり
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('game-resume')).toBeVisible();
  });

  test('表示上の改行は判定・残り文字数を変えず、読みとローマ字の行数がそろう', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '標準コース');
    await page.getByTestId('game-go').click();
    for (let s = 0; s < 4; s++) {
      const kanaLines = await page.locator('[data-testid="game-kana"] .game-line').count();
      await expect(page.locator('[data-testid="game-romaji"] .game-line')).toHaveCount(kanaLines);
      const before = await leftCount(page);
      const guide = await guideText(page);
      // 行の境目をまたいで打っても、Enter・スペースなしで進む
      await page.keyboard.type(guide.slice(0, -1));
      await expectInSync(page);
      expect(await leftCount(page)).toBeLessThan(before);
      await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
      await page.keyboard.type(guide.slice(-1));
    }
  });

  test('別の打ち方（si・tu など）でも、次の文字・キー・指の案内が連動する', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '標準コース');
    await page.getByTestId('game-go').click();
    let tried = 0;
    for (let step = 0; step < 3000 && tried < 3; step++) {
      const g = await guideText(page);
      if (!g) break;
      const m = /^(shi|chi|tsu|ji)/.exec(g);
      if (m) {
        const alt = { shi: 'si', chi: 'ti', tsu: 'tu', ji: 'zi' }[m[1] as 'shi' | 'chi' | 'tsu' | 'ji'];
        await page.keyboard.press(alt[0]!);
        await expectInSync(page);
        await page.keyboard.press(alt[1]!);
        await expectInSync(page);
        // 打った文字（si など）がそのまま入力済みとして表示される
        await expect(page.locator('.game-romaji .romaji-typed').last()).toHaveText(new RegExp(`${alt}$`));
        await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
        tried++;
      } else {
        await page.keyboard.press(g[0]!);
      }
    }
    expect(tried).toBeGreaterThan(0);
  });

  test('ガイドの設定：キーボードガイド OFF でキーを光らせず、指のガイド OFF で手の図を出さない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await page.getByTestId('home-game').click();
    await page.getByTestId('game-card-sakurada-familia').click();
    await page.getByRole('radio', { name: /短縮コース/ }).check();
    await page.getByRole('checkbox', { name: /キーボードガイド/ }).uncheck();
    await page.getByRole('checkbox', { name: /指のガイド/ }).uncheck();
    await page.getByTestId('game-start').click();
    await page.getByTestId('game-go').click();
    await expect(page.locator('.gkb .key.target')).toHaveCount(0);
    await expect(page.locator('.game-hands')).toHaveCount(0);
  });
});

test.describe('v1.3.1 スマートフォン', () => {
  test('縦長の画面：縦に並び、横にはみ出さず、画面のキーをタップして進める', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await guest(page);
    await startCourse(page, '短縮コース', { touch: true });
    await page.getByTestId('game-go').click();
    const vw = page.viewportSize()!.width;
    const img = (await page.locator('.game-panel-image').boundingBox())!;
    const txt = (await page.getByTestId('game-sentence').boundingBox())!;
    const kb = (await page.locator('.gkb').boundingBox())!;
    expect(txt.y).toBeGreaterThanOrEqual(img.y + img.height - 0.5);
    expect(kb.y).toBeGreaterThanOrEqual(txt.y + txt.height - 0.5);
    expect(kb.x).toBeGreaterThanOrEqual(0);
    expect(kb.x + kb.width).toBeLessThanOrEqual(vw + 0.5);
    const key = (await page.locator('.gkb [data-key="q"]').boundingBox())!;
    expect(key.height).toBeGreaterThanOrEqual(28);
    const before = await leftCount(page);
    for (let i = 0; i < 6; i++) {
      const next = (await page.locator('.game-romaji .romaji-next').textContent())!;
      await page.locator(`.gkb [data-key="${next}"]`).click();
    }
    expect(await leftCount(page)).toBeLessThan(before);
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });
});
