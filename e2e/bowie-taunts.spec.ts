import { expect, test } from '@playwright/test';

test('10種類すべての煽り画像が読み込まれ、毎回笑い声が1回鳴る。表示中は固定で、再挑戦で選び直す', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  test.setTimeout(120_000);
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.evaluate(() => sessionStorage.setItem('sakura-type:bowie-dev', JSON.stringify({ perStage: 1, timeScale: 0.1 })));
  await page.goto('./#/game/bowie');
  if ((await page.getByTestId('bowie-mute').textContent())?.includes('OFF')) await page.getByTestId('bowie-mute').click();
  // 本物の音声をデコード・再生し、音源の長さから笑い声の再生回数を確認します。
  await page.evaluate(() => {
    const w = window as unknown as { __sounds: number[]; __random: typeof Math.random };
    w.__sounds = [];
    w.__random = Math.random;
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function () {
      const source = create.call(this);
      const start = source.start.bind(source);
      source.start = (...args: Parameters<typeof source.start>) => {
        w.__sounds.push(source.buffer?.duration ?? 0);
        start(...args);
      };
      return source;
    };
  });
  for (let i = 0; i < 10; i++) {
    await page.evaluate(() => {
      const w = window as unknown as { __random: typeof Math.random };
      Math.random = w.__random;
    });
    if (i === 0) await page.getByTestId('bowie-start').click();
    else await page.getByTestId('bowie-retry').click();
    await page.evaluate((index) => { Math.random = () => (index + 0.5) / 10; }, i);
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-kind', 'lose', { timeout: 10_000 });
    // 01は通常の演出、02〜10はスキップでも笑い声が出ることを確認。
    if (i > 0) await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 10_000 });
    const taunt = page.getByTestId('bowie-taunt');
    const id = String(i + 1).padStart(2, '0');
    await expect(taunt).toHaveAttribute('data-taunt-id', id);
    await expect(taunt).toHaveAttribute('src', new RegExp(`game_over_${id}`));
    await expect.poll(() => taunt.evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1672)).toBe(true);
    await expect.poll(() => page.evaluate(() => (window as unknown as { __sounds: number[] }).__sounds.filter((d) => Math.abs(d - 4.45) < 0.1).length)).toBe(i + 1);
    await page.waitForTimeout(150);
    await expect(taunt).toHaveAttribute('data-taunt-id', id);
    await expect(page.getByTestId('bowie-final-score')).toHaveText('0');
  }
  await page.getByTestId('bowie-home').click();
  await expect(page.getByTestId('bowie-result')).toHaveCount(0);
});
