/**
 * v1.8.3：ゲーム名の表記（サグラダファミリア）と、利用可能を示す緑色のバッジの削除（ホーム・ゲームの選択）。
 * PC・タブレット・スマートフォン（と、PC の中で Surface 相当 1368×912）で確かめます。
 */
import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-game')).toBeVisible();
}

/** カードの中に収まり、横にはみ出さないこと。矢印はカードの右下 */
async function cardsFit(page: Page, selector: string, arrow: boolean) {
  const r = await page.evaluate(
    ([sel, withArrow]) => {
      const cards = Array.from(document.querySelectorAll(sel as string)).map((c) => {
        const b = c.getBoundingClientRect();
        const a = c.querySelector('.home-mode-arrow')?.getBoundingClientRect();
        const kids = Array.from(c.querySelectorAll('*')).map((k) => k.getBoundingClientRect()).filter((k) => k.width > 0);
        return {
          inside: kids.every((k) => k.left >= b.left - 1 && k.right <= b.right + 1 && k.bottom <= b.bottom + 1),
          arrowRight: withArrow ? !!a && b.right - a.right < 40 && b.bottom - a.bottom < 40 : true,
        };
      });
      return { cards, overflow: document.documentElement.scrollWidth - innerWidth };
    },
    [selector, arrow] as const,
  );
  expect(r.cards.length).toBeGreaterThan(0);
  for (const c of r.cards) expect(c).toEqual({ inside: true, arrowRight: true });
  expect(r.overflow).toBeLessThanOrEqual(1);
}

test.describe('v1.8.3：ゲーム名の表記と利用可能のバッジ', () => {
  test('ホーム：緑色のバッジ（練習できます・遊べます）がなく、説明文・矢印・移動はそのまま。ゲーム名は「サグラダファミリアを完成させよ」', async ({ page }, info) => {
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await guest(page);
    const modes = page.locator('.home-modes');
    await expect(modes.locator('.badge')).toHaveCount(0);
    await expect(modes.getByText('練習できます', { exact: true })).toHaveCount(0);
    await expect(modes.getByText('遊べます', { exact: true })).toHaveCount(0);
    // 説明文の中の「練習できます」は残す
    await expect(modes).toContainText('3・5・10分、または25・50問で練習できます。');
    await expect(page.getByTestId('home-game')).toContainText('サグラダファミリアを完成させよ');
    await expect(page.locator('body')).not.toContainText('サクラダ');
    await expect(modes.locator('.home-mode-arrow')).toHaveCount(3);
    await cardsFit(page, '.home-mode', true);
    // 各カードから、これまでどおり各モードへ
    await page.getByRole('button', { name: /タイピングモード/ }).click();
    await expect(page).toHaveURL(/#\/typing/);
    await page.goto('./#/home');
    await page.getByTestId('home-exam').click();
    await expect(page).toHaveURL(/#\/exam/);
    await page.goto('./#/home');
    await page.getByTestId('home-game').click();
    await expect(page).toHaveURL(/#\/game$/);
  });

  test('ゲームの選択：各ゲームの緑色のバッジ（遊べます）がなく、画像・タイトル・説明・押したときの動きはそのまま', async ({ page }, info) => {
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await guest(page);
    await page.getByTestId('home-game').click();
    const cards = page.locator('[data-testid^="game-card-"]');
    await expect(cards).toHaveCount(3);
    await expect(cards.locator('.badge')).toHaveCount(0);
    await expect(page.getByText('遊べます', { exact: true })).toHaveCount(0);
    await expect(page.getByTestId('game-card-sakurada-familia')).toContainText('サグラダファミリアを完成させよ');
    await expect(page.locator('body')).not.toContainText('サクラダ');
    for (const id of ['sakurada-familia', 'sakura-garden', 'bowie-bomb']) {
      const img = page.getByTestId(`game-card-${id}`).locator('img');
      await expect.poll(() => img.evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    }
    await cardsFit(page, '.game-card', false);
    // 押すと、これまでどおりそのゲームへ（ゲーム内のタイトルも「サグラダ」）
    await page.getByTestId('game-card-sakurada-familia').click();
    await expect(page.getByRole('heading', { name: 'サグラダファミリアを完成させよ' })).toBeVisible();
    await page.goto('./#/game');
    await page.getByTestId('game-card-sakura-garden').click();
    await expect(page).toHaveURL(/#\/game\/garden/);
  });
});
