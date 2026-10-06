import { expect, test, type Page } from '@playwright/test';

/** 練習の設定画面まで進めます */
async function openSetup(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: 'ゲストで練習' }).click();
  await page.getByRole('button', { name: /タイピングモード/ }).click();
}

async function startPractice(page: Page, kind: 'A' | 'B', method: string | RegExp, minutes = '3分') {
  await openSetup(page);
  await page.getByLabel(kind === 'A' ? 'A．ローマ字入力' : 'B．文章入力〈変換あり〉').check();
  await page.getByLabel(minutes).check();
  await page.getByLabel(method).check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
}

async function stat(page: Page, label: string): Promise<number> {
  const t = await page.locator('.practice-stats .stat', { hasText: label }).locator('b').textContent();
  return Number(t);
}

test.describe('入口・アイコン・サブディレクトリ', () => {
  test('サブディレクトリでもアイコン・マニフェスト・ロゴが読み込める', async ({ page, request }) => {
    await page.goto('./');
    await expect(page.getByRole('heading', { name: '桜打 — SAKURA TYPE' })).toBeVisible();
    for (const href of await page.locator('link[rel~="icon"], link[rel="apple-touch-icon"], link[rel="manifest"]').evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href))) {
      const res = await request.get(href);
      expect(res.status(), href).toBe(200);
    }
    const manifest = await (await request.get('manifest.webmanifest')).json();
    expect(manifest.name).toBe('桜打 — SAKURA TYPE');
    expect(manifest.short_name).toBe('桜打');
    for (const icon of manifest.icons) expect((await request.get(icon.src)).status()).toBe(200);
    expect(manifest.icons.filter((i: { purpose: string }) => i.purpose === 'maskable').map((i: { src: string }) => i.src)).toEqual([
      'icons/icon-maskable-192.png',
      'icons/icon-maskable-512.png',
    ]);
    const logo = page.locator('img.entry-logo');
    await expect(logo).toBeVisible();
    expect(await logo.evaluate((img: HTMLImageElement) => img.naturalWidth)).toBeGreaterThan(0);
  });

  test('クラウド未設定ではログインを実装済みのように見せない', async ({ page }) => {
    await page.goto('./');
    await expect(page.getByRole('button', { name: 'ログインして練習' })).toBeDisabled();
    await expect(page.getByText('ログイン機能は準備中です。ゲストで練習できます。')).toBeVisible();
  });

  test('バージョン表示がほかの要素と重ならず、横スクロールが出ない', async ({ page }) => {
    await openSetup(page);
    const v = await page.locator('.app-header .version').boundingBox();
    expect(v).not.toBeNull();
    for (const sel of ['.app-header .brand', '.app-header .btn-logout', '.app-header .who']) {
      const b = await page.locator(sel).boundingBox();
      if (!b || !v) continue;
      const overlap = v.x < b.x + b.width && b.x < v.x + v.width && v.y < b.y + b.height && b.y < v.y + v.height;
      expect(overlap, sel).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await expect(page.locator('.app-header .version')).toHaveText('v1.2.0');
  });

  test('3つのモードが使える（v1.2.0：② ゲームモード）', async ({ page }) => {
    await page.goto('./');
    await page.getByRole('button', { name: 'ゲストで練習' }).click();
    await expect(page.getByRole('button', { name: /タイピングモード/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /ゲームモード/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /検定モード/ })).toBeEnabled();
    await expect(page.getByText('準備中')).toHaveCount(0);
  });
});

test.describe('ローマ字入力', () => {
  test('ガイドどおりに打つと次の問題へ進み、ミスは位置を進めない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone', 'スマートフォンは画面タップのテストで確認します');
    await startPractice(page, 'A', '実物のキーボード');
    await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
    // わざと間違える（読みに q は出てこない位置が多いが、念のため次のキーと違う文字を選ぶ）
    const first = (await page.locator('.romaji-next').textContent())!;
    const wrong = first === 'z' ? 'x' : 'z';
    await page.keyboard.press(wrong);
    expect(await stat(page, 'ミス')).toBe(1);
    expect((await page.locator('.romaji-next').textContent())!).toBe(first);
    await expect(page.locator('.feedback')).toContainText('× ミス');
    // Shift などの修飾キーはミスにしない
    await page.keyboard.press('Shift');
    await page.keyboard.press('Control');
    expect(await stat(page, 'ミス')).toBe(1);
    for (let n = 0; n < 3; n++) {
      const rest = ((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? '');
      await page.keyboard.type(rest);
    }
    expect(await stat(page, '完成')).toBe(3);
    expect(await stat(page, 'ミス')).toBe(1);
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();
    await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
    await expect(page.getByText('途中で終わったため')).toBeVisible();
    await expect(page.getByText('参考ランク')).toBeVisible();
    await expect(page.getByText('✓ この端末・ブラウザに記録しました（ゲスト）')).toBeVisible();
  });

  test('時間切れ（3分）で結果に進み、標準問題の完走は正式ランク', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await page.clock.install();
    await startPractice(page, 'A', '実物のキーボード');
    await expect(page.locator('.romaji-next')).toBeVisible();
    const rest = ((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? '');
    await page.keyboard.type(rest);
    await page.clock.runFor(180_000);
    await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
    await expect(page.getByText('正式ランク')).toBeVisible();
    const speed = Number(await page.locator('.kv > div', { hasText: '1分あたりの速さ' }).locator('.v').evaluate((e) => e.firstChild?.textContent));
    const correct = Number(await page.locator('.kv > div', { hasText: '正しく打ったキー' }).locator('.v').textContent());
    expect(speed).toBeCloseTo(Math.floor((correct / 3) * 10) / 10, 1);
    await expect(page.getByText('打／分（正しい打鍵数）')).toBeVisible();
  });

  test('入力ゼロは正確率「—」・未判定', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await page.clock.install();
    await startPractice(page, 'A', '実物のキーボード');
    await expect(page.locator('.romaji-next')).toBeVisible();
    await page.clock.runFor(180_000);
    await expect(page.getByRole('heading', { name: '練習の結果' })).toBeVisible();
    await expect(page.locator('.kv > div', { hasText: '正確率' }).locator('.v')).toHaveText('—');
    await expect(page.locator('.rank-big')).toHaveText('未判定');
  });

  test('画面タップ：キーはボタンで、押してもソフトウェアキーボード用の入力欄にフォーカスしない', async ({ page }) => {
    await startPractice(page, 'A', '画面のキーをタップ');
    await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
    const next = (await page.locator('.romaji-next').textContent())!;
    const label = next === '-' ? '-' : next.toUpperCase();
    await page.locator('button.key', { hasText: new RegExp(`^${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`) }).first().dispatchEvent('pointerdown');
    expect(await stat(page, '正しく打ったキー')).toBe(1);
    const active = await page.evaluate(() => document.activeElement?.tagName);
    expect(['BODY', 'HTML']).toContain(active);
    expect(await page.locator('input, textarea').count()).toBe(0);
    // 画面タップの練習中は、実物のキーボードの入力は記録に使わない
    const before = await stat(page, '正しく打ったキー');
    await page.keyboard.press((await page.locator('.romaji-next').textContent())!);
    expect(await stat(page, '正しく打ったキー')).toBe(before);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  });
});

test.describe('文章入力〈変換あり〉（IME を CDP で再現）', () => {
  test('変換中はミスにせず、誤変換の確定は文字数分のミス、修正すると次へ進む', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await startPractice(page, 'B', '実物のキーボード');
    const box = page.locator('#sentence-input');
    await expect(box).toBeVisible({ timeout: 6000 });
    const target = ((await page.locator('.model-box').textContent()) ?? '').replace(/↵/g, '');
    const cdp = await page.context().newCDPSession(page);
    await box.focus();
    // 変換中（未確定）の文字は判定しない
    await cdp.send('Input.imeSetComposition', { text: 'あいうえお', selectionStart: 5, selectionEnd: 5 });
    expect(await stat(page, 'ミス')).toBe(0);
    // 先頭2文字を誤って確定
    const wrong = [...target.slice(0, 2)].map((c) => (c === '■' ? '□' : '■')).join('');
    await cdp.send('Input.insertText', { text: wrong });
    await expect.poll(() => stat(page, 'ミス')).toBe(2);
    await expect(page.locator('.ch-ng')).toHaveCount(2);
    // そのまま正しい続きを入力しても、同じ誤りは重複して数えない
    await cdp.send('Input.insertText', { text: target.slice(2, 4) });
    await page.waitForTimeout(50);
    expect(await stat(page, 'ミス')).toBe(2);
    // 全部消して（削除はミスにしない）、正しく入力すると次の問題へ
    await box.fill('');
    await box.dispatchEvent('input');
    expect(await stat(page, 'ミス')).toBe(2);
    const parts = target.split('\n');
    for (let i = 0; i < parts.length; i++) {
      await cdp.send('Input.imeSetComposition', { text: 'かり', selectionStart: 2, selectionEnd: 2 });
      await cdp.send('Input.insertText', { text: parts[i]! });
      if (i < parts.length - 1) {
        await page.waitForTimeout(80);
        await page.keyboard.press('Enter');
      }
    }
    await expect.poll(() => stat(page, '完成')).toBe(1);
    expect(await stat(page, 'ミス')).toBe(2);
    await expect(box).toHaveValue('');
  });

  test('見本に改行がない位置の Enter は入力されず、問題もスキップされない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await startPractice(page, 'B', '実物のキーボード');
    const box = page.locator('#sentence-input');
    await expect(box).toBeVisible({ timeout: 6000 });
    await box.focus();
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await expect(box).toHaveValue('');
    expect(await stat(page, 'ミス')).toBe(0);
    expect(await stat(page, '完成')).toBe(0);
  });
});

test.describe('終了とデータの消去', () => {
  test('ゲストを終了すると入口に戻り、結果が残らない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await startPractice(page, 'A', '実物のキーボード');
    await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
    await page.keyboard.type(((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? ''));
    await page.getByRole('button', { name: '途中で終わる' }).click();
    await page.getByRole('button', { name: '終わる' }).click();
    await page.getByRole('button', { name: 'ゲストを終了' }).click();
    await expect(page.getByRole('button', { name: 'ゲストで練習' })).toBeVisible();
    await page.goto('./#/result');
    await expect(page.getByRole('heading', { name: '練習の結果' })).toHaveCount(0);
    // ゲストの練習記録（v1.0.3 から端末に保存）だけが残り、ほかの一時データは残らない
    const stored = await page.evaluate(() => ({ l: Object.keys(localStorage), s: Object.keys(sessionStorage).length }));
    expect(stored).toEqual({ l: ['sakura-type:guest-history'], s: 0 });
  });
});

test('画面のスクリーンショット（目視確認用）', async ({ page }, info) => {
  await page.goto('./');
  await page.screenshot({ path: `test-results/shots/${info.project.name}-entry.png`, fullPage: true });
  await page.getByRole('button', { name: 'ゲストで練習' }).click();
  await page.screenshot({ path: `test-results/shots/${info.project.name}-home.png`, fullPage: true });
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel(info.project.name === 'pc' ? '実物のキーボード' : '画面のキーをタップ').check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
  await page.screenshot({ path: `test-results/shots/${info.project.name}-romaji.png`, fullPage: true });
});
