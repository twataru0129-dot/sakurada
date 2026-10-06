/**
 * GitHub Pages（https://twataru0129-dot.github.io/sakurada/）と同じ /sakurada/ 配下での確認。
 * npm run build の dist を /sakurada/ に置き、Supabase 未設定のままゲスト版が起動することを確かめます。
 */
import { expect, test } from '@playwright/test';

test.use({ baseURL: 'http://localhost:5179/sakurada/' });

test('/sakurada/ 配下で JS・CSS・アイコンが読み込まれ、ゲスト版が起動する', async ({ page, request }) => {
  const failed: string[] = [];
  page.on('response', (r) => {
    if (r.status() >= 400) failed.push(`${r.status()} ${r.url()}`);
  });
  page.on('requestfailed', (r) => failed.push(`failed ${r.url()}`));
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('./');
  const html = await (await request.get('./')).text();
  expect(html).not.toContain('/src/main.tsx');
  const assets = [...html.matchAll(/(?:src|href)="(\.\/[^"]+)"/g)].map((m) => m[1]!);
  expect(assets.some((a) => a.endsWith('.js'))).toBe(true);
  expect(assets.some((a) => a.endsWith('.css'))).toBe(true);
  for (const a of assets) {
    const res = await request.get(a);
    expect(res.status(), a).toBe(200);
    expect(res.url()).toContain('/sakurada/');
  }
  for (const icon of ['icons/favicon.ico', 'icons/favicon-32.png', 'icons/apple-touch-icon.png', 'icons/icon-192.png', 'icons/icon-512.png', 'icons/logo-320.png']) {
    expect((await request.get(icon)).status(), icon).toBe(200);
  }
  // CSS が当たっていること
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).toBe('rgb(253, 245, 247)');
  await expect(page.locator('img.entry-logo')).toBeVisible();
  expect(await page.locator('img.entry-logo').evaluate((i: HTMLImageElement) => i.naturalWidth)).toBeGreaterThan(0);
  await expect(page.getByRole('button', { name: 'ログインして練習' })).toBeDisabled();
  await page.getByRole('button', { name: 'ゲストで練習' }).click();
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('実物のキーボード').check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
  expect(failed).toEqual([]);
  expect(errors).toEqual([]);
});
