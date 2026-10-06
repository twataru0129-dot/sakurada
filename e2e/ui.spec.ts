/**
 * v1.0.1 の画面改善の確認：入口画面、ローマ字ガイドの表示、問題切り替え時の状態リセット、Surface 相当の画面での見え方。
 */
import { expect, test, type Page } from '@playwright/test';

async function setup(page: Page, opts: { romajiGuide?: boolean; method?: string } = {}) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).click();
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('A．ローマ字入力').check();
  await page.getByLabel(opts.method ?? '実物のキーボード').check();
  if (opts.romajiGuide === false) await page.getByLabel(/ローマ字ガイド/).uncheck();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.locator('.problem-romaji')).toBeVisible({ timeout: 6000 });
}

const remainingGuide = async (page: Page) =>
  ((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? '');

test.describe('入口画面', () => {
  test('タイトル・ひとこと・大きな選択カード・折りたたみの説明', async ({ page }, info) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: '桜打 — SAKURA TYPE' })).toBeVisible();
    await expect(page.getByText('自分のペースで、タイピングを練習しよう')).toBeVisible();
    const guest = page.getByRole('button', { name: /ゲストで練習/ });
    await expect(guest).toContainText('登録なしですぐ練習');
    await expect(page.getByRole('button', { name: /ログインして練習/ })).toContainText('記録を保存して成長を確認');
    await expect(page.getByRole('button', { name: /ログインして練習/ })).toBeDisabled();
    await expect(page.getByText('ゲストの記録は保存されません。')).toBeVisible();
    // 注意は短く表示、詳しい説明は折りたたみ（内容は残っている）
    await expect(page.locator('.entry-cautions')).toContainText('本名・住所・電話番号などは入力しないでください。');
    const details = page.locator('details', { hasText: '使い方・記録と個人情報について' });
    await expect(details.getByText('保存しないもの：打った文章そのもの、1つ1つのキー操作。')).toBeHidden();
    await details.locator('summary').click();
    await expect(details.getByText('保存しないもの：打った文章そのもの、1つ1つのキー操作。')).toBeVisible();
    const admin = page.locator('details', { hasText: '先生・管理者向けの設定案内' });
    await admin.locator('summary').click();
    await expect(admin.getByRole('link', { name: /初回導入手順/ })).toHaveAttribute('href', /docs\/setup\.md$/);
    const logo = await page.locator('img.entry-logo').boundingBox();
    if (info.project.name === 'pc') {
      expect(logo!.width).toBeGreaterThanOrEqual(220);
      const card = await guest.boundingBox();
      expect(card!.width).toBeGreaterThan(400);
      expect(card!.height).toBeGreaterThanOrEqual(140);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test.describe('ローマ字ガイド', () => {
  test('ガイドON：入力済み・次の文字・残りが文字で表示され、キーと指のガイドが判定と同じキーを示す', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'スマートフォンは画面タップで確認');
    await setup(page);
    const next = page.locator('.romaji-next');
    await expect(next).toBeVisible();
    const first = (await next.textContent())!;
    expect(first).toMatch(/^[a-z\-,.!?]$/);
    const box = (await next.boundingBox())!;
    expect(box.width).toBeGreaterThan(12);
    // 次の文字は枠ではなく、色と下線で示す（色だけに頼らない）
    const st = await next.evaluate((e) => ({ border: getComputedStyle(e).borderTopWidth, deco: getComputedStyle(e).textDecorationLine, bg: getComputedStyle(e).backgroundColor, pad: getComputedStyle(e).paddingLeft }));
    expect(st.border).toBe('0px');
    expect(st.deco).toContain('underline');
    expect(st.bg).toBe('rgba(0, 0, 0, 0)');
    expect(st.pad).toBe('0px');
    const label = first === '-' ? 'ー（-）' : first.toUpperCase();
    await expect(page.getByTestId('next-key')).toHaveText(label);
    await expect(page.getByTestId('finger')).not.toHaveText('—');
    await expect(page.locator('.kb .key.target').first()).toBeVisible();
    // 1文字打つと、入力済みに移り、次の文字・ガイドが連動して変わる
    const guide = await remainingGuide(page);
    await page.keyboard.press(first);
    await expect(page.locator('.romaji-typed')).toHaveText(first);
    const second = guide[1];
    if (second) {
      await expect(next).toHaveText(second);
      await expect(page.getByTestId('next-key')).toHaveText(second === '-' ? 'ー（-）' : second.toUpperCase());
    }
  });

  test('ガイドOFF：赤い枠だけが出ず、OFF であることを文字で示す（キーボードガイドは別に表示）', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await setup(page, { romajiGuide: false });
    await expect(page.locator('.romaji-next')).toHaveCount(0);
    await expect(page.getByText('（ローマ字ガイドは OFF です）')).toBeVisible();
    await expect(page.locator('.kb .key.target')).toHaveCount(1);
  });

  test('画面タップでもガイドが表示され、押したキーが判定される', async ({ page }) => {
    await setup(page, { method: '画面のキーをタップ' });
    await expect(page.locator('.romaji-next')).toBeVisible();
    await expect(page.locator('button.key.target').first()).toBeVisible();
    await page.locator('button.key.target').first().dispatchEvent('pointerdown');
    await expect.poll(async () => (await page.locator('.romaji-typed').textContent())?.length).toBe(1);
  });
});

test.describe('問題の切り替え', () => {
  test('完了するとすぐ次の問題へ進み、前の問題の入力・ミス表示・完了表示が残らない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await setup(page);
    const first = (await page.locator('.romaji-next').textContent())!;
    await page.keyboard.press(first === 'z' ? 'x' : 'z'); // ミスを1回
    await expect(page.locator('.kana-miss')).toHaveCount(1);
    const prevSeq = await page.locator('.problem-romaji').getAttribute('data-seq');
    await page.keyboard.type(await remainingGuide(page));
    await expect(page.locator('.problem-romaji')).not.toHaveAttribute('data-seq', prevSeq!);
    await expect(page.locator('.practice-stats .stat', { hasText: '完成' }).locator('b')).toHaveText('1');
    await expect(page.getByText(/できました/)).toHaveCount(0);
    await expect(page.locator('.kana-miss')).toHaveCount(0);
    await expect(page.locator('.kana-done')).toHaveCount(0);
    await expect(page.locator('.romaji-typed')).toHaveText('');
    await expect(page.locator('.feedback')).toHaveText('');
    // 読み上げ用の通知は画面には見えない
    const live = page.locator('.sr-only[role="status"]');
    await expect(live).toContainText('1問完成');
    expect((await live.boundingBox())!.width).toBeLessThanOrEqual(1);
    // すぐ次の問題を打てる
    const next = (await page.locator('.romaji-next').textContent())!;
    await page.keyboard.press(next);
    await expect(page.locator('.romaji-typed')).toHaveText(next);
  });
});

test('Surface 相当（1368×800）で問題とガイドがスクロールなしで見える', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  await page.setViewportSize({ width: 1368, height: 800 });
  await setup(page);
  const bottom = await page.locator('.guides').evaluate((e) => e.getBoundingClientRect().bottom);
  const h = await page.evaluate(() => window.innerHeight);
  expect(bottom).toBeLessThanOrEqual(h);
  await page.screenshot({ path: 'test-results/shots/surface-romaji.png' });
});
