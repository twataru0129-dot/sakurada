/**
 * v1.4.1 入口とホーム（モード選択）の配置：画面の幅を使い、ロゴ・文字・カードを大きく表示する。
 */
import { expect, test, type Page } from '@playwright/test';

const box = async (page: Page, sel: string) => (await page.locator(sel).first().boundingBox())!;
const fontPx = (page: Page, sel: string) => page.locator(sel).first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
const noHorizontalScroll = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test.describe('入口とホームの配置（PC・Surface）', () => {
  for (const [w, h] of [[1920, 1080], [1368, 912], [1368, 800], [1280, 720]] as const) {
    test(`${w}×${h}：幅を広く使い、ロゴ・タイトル・開始カード・モードカードが大きく、主な操作が画面に見える`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pc');
      await page.setViewportSize({ width: w, height: h });
      await page.goto('./');
      // 入口：内容の幅は画面の約8割以上（最大1500px）、ロゴとタイトルは横並び
      const main = await box(page, '.entry-main');
      expect(main.width).toBeGreaterThanOrEqual(Math.min(1500, w * 0.8) - 1);
      expect(main.width).toBeLessThanOrEqual(1500.5);
      const logo = await box(page, 'img.entry-logo');
      expect(logo.width).toBeGreaterThanOrEqual(160);
      expect(logo.width).toBeLessThanOrEqual(300.5);
      expect(Math.abs(logo.width - logo.height)).toBeLessThan(1);
      const title = await box(page, '.entry-title');
      expect(title.x).toBeGreaterThan(logo.x + logo.width - 1);
      expect(await fontPx(page, '.entry-title')).toBeGreaterThanOrEqual(42);
      expect(await fontPx(page, '.entry-tagline')).toBeGreaterThanOrEqual(22);
      const guest = await box(page, '.choice-card-primary');
      const login = await box(page, '.choice-card:not(.choice-card-primary)');
      expect(Math.abs(guest.y - login.y)).toBeLessThan(1);
      expect(guest.width).toBeGreaterThan(450);
      expect(await fontPx(page, '.choice-card-title')).toBeGreaterThanOrEqual(28);
      expect(await fontPx(page, '.choice-card-desc')).toBeGreaterThanOrEqual(18);
      // 2枚の開始カードは画面の中に見える
      expect(guest.y + guest.height).toBeLessThanOrEqual(h);
      // 押せないログインのカードには矢印を出さず「準備中」と表示する
      await expect(page.getByRole('button', { name: /ログインして練習/ })).toBeDisabled();
      await expect(page.locator('.choice-card:disabled .choice-card-arrow')).toHaveCount(0);
      await expect(page.locator('.choice-card:disabled')).toContainText('準備中');
      expect(await noHorizontalScroll(page)).toBe(true);

      // ホーム：ロゴは140px以上、モードカード3枚が横並びで同じ高さ
      await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
      await expect(page.getByRole('heading', { name: 'ゲストで練習中' })).toBeVisible();
      const home = await box(page, '.home-main');
      expect(home.width).toBeGreaterThanOrEqual(Math.min(1500, w * 0.8) - 1);
      const hl = await box(page, '.home-hero img');
      expect(hl.width).toBeGreaterThanOrEqual(140);
      expect(hl.width).toBeLessThanOrEqual(180.5);
      const cards = await page.locator('.home-mode').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
      expect(cards).toHaveLength(3);
      expect(new Set(cards.map((c) => Math.round(c.y))).size).toBe(1);
      expect(new Set(cards.map((c) => Math.round(c.height))).size).toBe(1);
      for (let i = 1; i < 3; i++) {
        const gap = cards[i]!.x - (cards[i - 1]!.x + cards[i - 1]!.width);
        expect(gap).toBeGreaterThanOrEqual(15.5);
        expect(gap).toBeLessThanOrEqual(24.5);
      }
      expect(await fontPx(page, '.home-mode .title')).toBeGreaterThanOrEqual(24);
      expect(await fontPx(page, '.home-mode-desc')).toBeGreaterThanOrEqual(18);
      // モードカードは画面の中に見える
      expect(cards[0]!.y + cards[0]!.height).toBeLessThanOrEqual(h);
      // 設定のチェックボックスは大きく、ラベルを押しても切り替わる
      const cb = await box(page, '.home-settings .switch input');
      expect(cb.width).toBeGreaterThanOrEqual(26);
      const sound = page.locator('.home-settings .switch', { hasText: '音' });
      await expect(sound).toContainText('OFF');
      await sound.locator('span').first().click();
      await expect(sound).toContainText('ON');
      // 未練習の「今回の練習」は設定の欄より高くならない（大きな空白を作らない）
      const recent = await box(page, 'section[aria-labelledby="recent-title"]');
      const settings = await box(page, 'section[aria-labelledby="settings-title"]');
      expect(recent.height).toBeLessThanOrEqual(settings.height + 1);
      await expect(page.getByRole('button', { name: '練習の記録' })).toBeVisible();
      expect(await noHorizontalScroll(page)).toBe(true);
    });
  }

  test('ホームのカードは最新の内容（ゲームモードは2つのゲーム）で、各画面へ移動できる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await expect(page.getByRole('button', { name: /タイピングモード/ })).toContainText('25・50問');
    await expect(page.getByTestId('home-game')).toContainText('桜を育てて庭を作ったり');
    await expect(page.getByTestId('home-game')).toContainText('サクラダファミリアを完成させよ');
    await expect(page.getByTestId('home-game')).toContainText('桜ガーデン');
    await expect(page.getByTestId('home-exam')).toContainText('A4の用紙');
    await page.getByTestId('home-game').click();
    await expect(page.locator('[data-testid^="game-card-"]')).toHaveCount(2);
    await page.goto('./#/home');
    await page.getByTestId('home-exam').click();
    await expect(page).toHaveURL(/#\/exam/);
    await page.goto('./#/home');
    await page.getByRole('button', { name: /タイピングモード/ }).click();
    await expect(page).toHaveURL(/#\/typing/);
    await page.goto('./#/home');
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page).toHaveURL(/#\/history/);
  });

  test('入口とホームの変更は、練習画面などの共通の main の幅に影響しない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.setViewportSize({ width: 1920, height: 1080 });
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.getByRole('button', { name: /タイピングモード/ }).click();
    await expect(page).toHaveURL(/#\/typing/);
    await expect(page.locator('main')).toBeVisible();
    expect((await box(page, 'main')).width).toBeLessThanOrEqual(1180.5);
    await page.getByRole('button', { name: /ホームにもどる/ }).first().click();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page).toHaveURL(/#\/history/);
    await expect(page.locator('main')).toBeVisible();
    expect((await box(page, 'main')).width).toBeLessThanOrEqual(1180.5);
  });
});

test.describe('入口とホームの配置（スマートフォン）', () => {
  test('縦に並べ、横にはみ出さない。ロゴは小さめで縦横比を保つ', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await page.goto('./');
    const logo = await box(page, 'img.entry-logo');
    const title = await box(page, '.entry-title');
    expect(title.y).toBeGreaterThan(logo.y + logo.height - 1);
    expect(Math.abs(logo.width - logo.height)).toBeLessThan(1);
    const guest = await box(page, '.choice-card-primary');
    const login = await box(page, '.choice-card:not(.choice-card-primary)');
    expect(login.y).toBeGreaterThan(guest.y + guest.height - 1);
    expect(await noHorizontalScroll(page)).toBe(true);
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    const cards = await page.locator('.home-mode').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON() as DOMRect));
    expect(cards[1]!.y).toBeGreaterThan(cards[0]!.y + cards[0]!.height - 1);
    expect((await box(page, '.home-hero img')).width).toBeLessThanOrEqual(96.5);
    expect(await noHorizontalScroll(page)).toBe(true);
  });
});
