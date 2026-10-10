/**
 * ゲーム「ボウイの爆弾遊戯」の E2E テスト。
 * 出題数・時間を短くするときは、開発用の設定（sessionStorage）を使います（通常の画面には何も出ません）。
 */
import { expect, test, type Page } from '@playwright/test';

const DEV = 'sakura-type:bowie-dev';
async function open(page: Page, dev?: { perStage?: number; timeScale?: number }) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  // ゲストを始めるときに一時データが消えるため、入ったあとに設定します
  if (dev) await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-bowie-bomb').click();
  await expect(page.getByTestId('bowie-title')).toBeVisible();
}
const guide = async (page: Page) => (await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '';
const num = async (page: Page, id: string) => Number(((await page.getByTestId(id).textContent()) ?? '').replace(/[^0-9].*$/, '').replace(/[^0-9]/g, ''));
async function solveNext(page: Page) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.type(await guide(page));
}

test.describe('ボウイの爆弾遊戯', () => {
  test('ゲームの一覧にアイコンと正式タイトルがあり、タイトルに正式ロゴ・遊び方・開始がある。スペースでも始まる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.getByTestId('home-game').click();
    const card = page.getByTestId('game-card-bowie-bomb');
    await expect(card).toContainText('ボウイの爆弾遊戯');
    expect(await card.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await card.click();
    const logo = page.locator('.bowie-title-logo');
    expect(await logo.evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    for (const t of ['表示された文字を入力して解除', '早く解除するほど高得点', '減点はありません', 'その場で終了', '全80問を解除すれば勝利']) await expect(page.getByTestId('bowie-title')).toContainText(t);
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/game\/bowie\/play/);
    await expect(page.getByTestId('bowie-banner')).toContainText('第1段階');
  });

  test('爆弾が手を離れてから問題が出る。解除すると得点（1〜10点）と進行が増え、すぐ次の投球へ。ミスは減点なしで入力も進まない。投球中のキーはためない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await open(page);
    await page.getByTestId('bowie-start').click();
    // 投球の前（段階の表示・投球中）は問題を出さず、キーもためない
    await expect(page.getByTestId('bowie-wait')).toBeVisible();
    await page.keyboard.type('abc');
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 5000 });
    const g = await guide(page);
    expect(g.length).toBeGreaterThan(3);
    // ミス：入力は進まず、減点もない
    await page.keyboard.press(';');
    await expect(page.getByTestId('bowie-panel')).toHaveClass(/typo-/);
    expect(await guide(page)).toBe(g);
    // 大文字（Shift つき）でも入力できる
    await page.keyboard.press(`Shift+${g[0]!.toUpperCase()}`);
    await page.keyboard.type(g.slice(1));
    await expect(page.getByTestId('bowie-wait')).toBeVisible();
    const score = await num(page, 'bowie-score');
    expect(score).toBeGreaterThanOrEqual(1);
    expect(score).toBeLessThanOrEqual(10);
    // 次の問題では、前の最後のキーが入っていない
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('bowie-progress')).toHaveText('2 / 80');
    expect((await guide(page)).length).toBeGreaterThan(3);
    await expect(page.locator('.bowie-romaji .r-done')).toHaveCount(0);
  });

  test('各段階の半分を解除するとカットイン（全面・右から左）。カットインの間は爆弾も入力も止まり、全問解除で勝利。ハイスコアを保存し、再挑戦で初期化', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await open(page, { perStage: 2 });
    await page.evaluate(() => {
      const w = window as unknown as { __cutins: number };
      w.__cutins = 0;
      new MutationObserver((list) => {
        for (const m of list) for (const n of Array.from(m.addedNodes)) if ((n as HTMLElement).dataset?.testid === 'bowie-cutin') w.__cutins++;
      }).observe(document.body, { childList: true, subtree: true });
    });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 8; i++) {
      await solveNext(page);
      if (i % 2 === 0) {
        const cut = page.getByTestId('bowie-cutin');
        await expect(cut).toBeVisible();
        const box = (await cut.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(page.viewportSize()!.width - 1);
        expect(box.height).toBeGreaterThanOrEqual(page.viewportSize()!.height - 1);
        await expect(page.getByTestId('bowie-bomb')).toBeHidden();
        await page.keyboard.type('zzz');
        await expect(cut).toBeHidden({ timeout: 5000 });
      }
    }
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-kind', 'win');
    await expect(result).toContainText('全問クリア');
    expect(await page.evaluate(() => (window as unknown as { __cutins: number }).__cutins)).toBe(4);
    const final = await num(page, 'bowie-final-score');
    expect(final).toBeGreaterThan(0);
    expect(final).toBeLessThanOrEqual(6 * 10 + 2 * 20);
    await expect(page.getByTestId('bowie-solved')).toHaveText('8');
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'despair');
    await expect(page.getByTestId('bowie-result-best')).toContainText(String(final));
    // 再挑戦：得点・進行・表示を初期化し、問題を選び直す
    await page.getByTestId('bowie-retry').click();
    await expect(page.getByTestId('bowie-result')).toHaveCount(0);
    await expect(page.getByTestId('bowie-score')).toHaveText('0');
    await expect(page.getByTestId('bowie-cutin')).toHaveCount(0);
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 5000 });
    await expect(page.getByTestId('bowie-progress')).toHaveText('1 / 8');
    // ハイスコアは再読み込みしても残る
    await page.reload();
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.goto('./#/game/bowie');
    await expect(page.getByTestId('bowie-best')).toContainText(String(final));
  });

  test('被弾：入力が終わり、ゲームオーバーの画像と実際の得点・再挑戦・ホームを表示。演出は飛ばせる。ホームへ戻ると何も残らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await open(page, { perStage: 2, timeScale: 0.2 });
    await page.getByTestId('bowie-start').click();
    await expect(page.getByTestId('bowie-text')).toBeVisible();
    const result = page.getByTestId('bowie-result');
    await expect(result).toBeVisible({ timeout: 10_000 });
    await expect(result).toHaveAttribute('data-kind', 'lose');
    await expect(page.getByTestId('bowie-hero')).toBeAttached();
    await expect(page.getByTestId('bowie-final-score')).toHaveText('0');
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'taunt');
    expect(await result.locator('img').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
    await page.getByTestId('bowie-home').click();
    await expect(page).toHaveURL(/#\/home/);
    await page.keyboard.type('abc');
    await expect(page.getByTestId('bowie-result')).toHaveCount(0);
  });

  test('一時停止（Esc・ボタン）の間は爆弾が止まり、再開はカウントのあと。ウィンドウから離れると自動で一時停止', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await open(page);
    await page.getByTestId('bowie-start').click();
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(400);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bowie-paused')).toBeVisible();
    const p1 = Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'));
    await page.waitForTimeout(1500);
    const p2 = Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'));
    expect(Math.abs(p2 - p1)).toBeLessThan(0.02);
    await page.keyboard.type('xyz');
    await page.getByTestId('bowie-resume').click();
    await expect(page.getByTestId('bowie-countdown')).toBeVisible();
    await expect(page.getByTestId('bowie-paused')).toBeHidden({ timeout: 4000 });
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-phase', 'flying');
    await page.waitForTimeout(300);
    const p3 = Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'));
    expect(p3).toBeGreaterThan(p2);
    expect(p3 - p2).toBeLessThan(0.2);
    // ウィンドウから離れたとき
    await page.evaluate(() => window.dispatchEvent(new Event('blur')));
    await expect(page.getByTestId('bowie-paused')).toBeVisible();
  });

  for (const [w, h] of [[1368, 912], [1280, 720]] as const) {
    test(`${w}×${h}：ロゴ・得点・段階・進行・一時停止・ステージ・入力の欄が画面に収まり、文字が大きい`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pc');
      await page.setViewportSize({ width: w, height: h });
      await open(page);
      await page.getByTestId('bowie-start').click();
      await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 5000 });
      for (const id of ['bowie-score', 'bowie-stage', 'bowie-progress', 'bowie-pause', 'bowie-text', 'bowie-romaji', 'bowie-hero', 'bowie-villain']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.y + b.height, id).toBeLessThanOrEqual(h + 0.5);
        expect(b.x + b.width, id).toBeLessThanOrEqual(w + 0.5);
      }
      // キャラクターは入力の欄に重ならない
      const panel = (await page.getByTestId('bowie-panel').boundingBox())!;
      for (const id of ['bowie-hero', 'bowie-villain']) expect((await page.getByTestId(id).boundingBox())!.y + (await page.getByTestId(id).boundingBox())!.height, id).toBeLessThanOrEqual(panel.y + 1);
      const fs = await page.locator('.bowie-romaji').first().evaluate((e) => parseFloat(getComputedStyle(e).fontSize));
      expect(fs).toBeGreaterThanOrEqual(26);
      const sc = await page.evaluate(() => [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth]);
      expect(sc[0]).toBeLessThanOrEqual(sc[1]!);
      expect(sc[2]).toBeLessThanOrEqual(sc[3]!);
    });
  }
});
