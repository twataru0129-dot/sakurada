/**
 * ゲームモード「サクラダファミリアを完成させよ」（v1.2.0）の E2E テスト（ゲスト）。
 * ログイン利用者のクラウド保存は cloud.spec.ts（Supabase の通信をモックで再現）で確かめます。
 */
import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-game')).toBeVisible();
}

async function openIntro(page: Page) {
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-sakurada-familia').click();
  await expect(page.getByRole('heading', { name: 'サクラダファミリアを完成させよ' })).toBeVisible();
}

async function startCourse(page: Page, course: '標準コース' | '短縮コース', opts: { touch?: boolean; kunrei?: boolean } = {}) {
  await openIntro(page);
  await page.getByRole('radio', { name: new RegExp(course) }).check();
  if (opts.touch) await page.getByRole('radio', { name: '画面のキーをタップ' }).check();
  if (opts.kunrei) await page.getByRole('radio', { name: /訓令式/ }).check();
  await page.getByTestId('game-start').click();
  await expect(page.getByTestId('game-go')).toBeVisible();
}

/** いまの文のガイド（ローマ字）を返します */
const guideText = async (page: Page) => ((await page.locator('.game-romaji .romaji-next').textContent()) ?? '') + ((await page.locator('.game-romaji .romaji-rest').textContent()) ?? '');

/** 物語を最後までガイドどおりに打ちます（1文ずつ） */
async function typeAll(page: Page, onSentence?: () => Promise<void>) {
  for (let i = 0; i < 100; i++) {
    if (!(await page.locator('.game-romaji .romaji-next').count())) break;
    await onSentence?.();
    await page.keyboard.type(await guideText(page));
  }
}

const gaugeNow = async (page: Page) => Number(await page.getByTestId('gauge-bar').getAttribute('aria-valuenow'));
const leftChars = async (page: Page) => Number((await page.getByTestId('gauge-left').locator('strong').textContent()) ?? '-1');

const guestGames = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('sakura-type:guest-game-history:v1');
    return raw ? (JSON.parse(raw).records as Array<Record<string, unknown>>) : [];
  });

test.describe('ゲームモード', () => {
  test('ホームの「② ゲームモード」→ ゲームの選択（遊べるゲームだけ）→ 紹介（完成イメージとルール）', async ({ page }) => {
    await guest(page);
    await expect(page.getByTestId('home-game')).toContainText('② ゲームモード');
    await expect(page.getByRole('button', { name: /検定モード/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /タイピングモード/ })).toBeEnabled();
    await page.getByTestId('home-game').click();
    await expect(page.locator('[data-testid^="game-card-"]')).toHaveCount(1);
    await page.getByTestId('game-card-sakurada-familia').click();
    for (const t of ['正しく打つと工事が進む', 'ミス1回で記録に5秒加算', '最後まで打つと完成']) await expect(page.getByText(t)).toBeVisible();
    await expect(page.getByRole('radio', { name: /標準コース/ })).toBeChecked();
    await expect(page.getByText(/AI で作成したイメージ/)).toBeVisible();
  });

  test('画像はサブディレクトリ（/sakurada/）でも6枚とも読み込める', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.goto('/sakurada/');
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await startCourse(page, '短縮コース');
    const imgs = page.getByTestId('building').locator('img');
    await expect(imgs).toHaveCount(6);
    await expect
      .poll(() => imgs.evaluateAll((list) => list.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth === 1536)))
      .toBe(true);
    const srcs = await imgs.evaluateAll((list) => list.map((i) => (i as HTMLImageElement).src));
    for (const s of srcs) expect(s).toContain('/sakurada/assets/');
  });

  test('短縮コース：0％から始まり、工程が後戻りせず進み、最後の1打鍵で100％・残り0文字・完成。ミスでは進まない', async ({ page }) => {
    await guest(page);
    await startCourse(page, '短縮コース', { touch: false });
    expect(await gaugeNow(page)).toBe(0);
    const total = await leftChars(page);
    expect(total).toBeGreaterThan(0);
    await expect(page.getByTestId('gauge-stage')).toContainText('準備');
    await page.getByTestId('game-go').click();
    // ミス：＋5秒、進み具合と残りは変わらない
    await page.keyboard.press('q');
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 1回（＋5秒）');
    expect(await gaugeNow(page)).toBe(0);
    expect(await leftChars(page)).toBe(total);
    let lastPct = 0;
    let lastStage = 0;
    const stages = new Set<number>();
    for (let i = 0; i < 200; i++) {
      if (!(await page.locator('.game-romaji .romaji-next').count())) break;
      const key = (await page.locator('.game-romaji .romaji-next').textContent())!;
      const remaining = await guideText(page);
      if (remaining.length === 1 && (await page.getByTestId('game-text').textContent())?.includes('完成。')) {
        // 最後の1打鍵の前は、まだ完成していない
        expect(await gaugeNow(page)).toBeLessThan(100);
        expect(await page.getByTestId('building').getAttribute('data-stage')).not.toBe('5');
      }
      await page.keyboard.press(key);
      // 最後の1打鍵で結果の画面に移ります
      if (page.url().includes('/result') || !(await page.locator('.game-main').count())) break;
      const snapshot = await page
        .evaluate(() => ({
          pct: Number(document.querySelector('[data-testid="gauge-bar"]')?.getAttribute('aria-valuenow') ?? 'NaN'),
          st: Number(document.querySelector('[data-testid="building"]')?.getAttribute('data-stage') ?? 'NaN'),
        }))
        .catch(() => null);
      if (!snapshot || Number.isNaN(snapshot.pct)) break;
      const { pct, st } = snapshot;
      expect(pct).toBeGreaterThanOrEqual(lastPct);
      expect(st).toBeGreaterThanOrEqual(lastStage);
      expect(pct).toBeLessThanOrEqual(100);
      lastPct = pct;
      lastStage = st;
      stages.add(st);
    }
    expect([...stages]).toEqual(expect.arrayContaining([1, 2, 3, 4]));
    await expect(page).toHaveURL(/#\/game\/sakurada\/result/);
    await expect(page.getByTestId('game-complete-title')).toContainText('あなたのサクラダファミリアが完成！');
    await expect(page.getByTestId('building')).toHaveAttribute('data-stage', '5');
    await expect(page.getByTestId('miss-count')).toContainText('1');
    await expect(page.getByTestId('penalty-time')).toContainText('5');
    await expect(page.getByText('初めての完成！')).toBeVisible();
    // 終わったあとのキーでは何も変わらない
    await page.keyboard.type('abcdefg');
    const recs = await guestGames(page);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ courseId: 'short', missCount: 1, finished: true, pauseCount: 0, gameId: 'sakurada-familia', ruleVersion: 'sakurada-rule-v1' });
    expect(recs[0]!.completedReadingCharacters).toBe(recs[0]!.totalReadingCharacters);
    expect(recs[0]!.totalReadingCharacters).toBe(total);
  });

  test('ミス6回・入力3分 → 記録3分30秒・西暦1987年（時間切れはない）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    for (let i = 0; i < 6; i++) await page.keyboard.press('q');
    await page.clock.runFor(180_000);
    await expect(page.getByTestId('game-time')).toContainText('3分00秒');
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 6回（＋30秒）');
    await typeAll(page);
    await expect(page.getByTestId('record-time')).toHaveText('3分30秒');
    await expect(page.getByTestId('elapsed-time')).toHaveText('3分00秒');
    await expect(page.getByTestId('penalty-time')).toContainText('30');
    await expect(page.getByTestId('game-complete-title')).toHaveText('西暦1987年、あなたのサクラダファミリアが完成！');
    await expect(page.getByText('ゲーム内の完成年です', { exact: false })).toBeVisible();
  });

  test('長い時間がかかっても失敗にならず、ゲームオーバーもない（20分台 → 2482年以降）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    // 15分間まったく操作がないと、安全のための自動ログアウトが働くため、途中で文字ではないキー（ミスにならない）を押します
    await page.clock.runFor(600_000);
    await page.keyboard.press('Shift');
    await page.clock.runFor(600_000);
    await page.keyboard.press('Shift');
    await expect(page).toHaveURL(/#\/game\/sakurada\/play/);
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
    await typeAll(page);
    await expect(page.getByTestId('game-complete-title')).toHaveText(/西暦24[89]\d年、あなたのサクラダファミリアが完成！/);
  });

  test('一時停止の間は時間が進まず入力も受け付けない。一時停止の回数を記録する', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await page.clock.runFor(10_000);
    await page.getByTestId('game-pause').click();
    await page.clock.runFor(120_000);
    await page.keyboard.type('qqqq');
    await page.getByTestId('game-resume').click();
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
    await typeAll(page);
    await expect(page.getByTestId('elapsed-time')).toHaveText('10秒');
    await expect(page.getByText('一時停止 1回')).toBeVisible();
    const recs = await guestGames(page);
    expect(recs[0]).toMatchObject({ pauseCount: 1 });
    // 一時停止の120秒は含めない（入力にかかった実時間の分だけ 10秒より少し長い）
    expect(recs[0]!.elapsedMs as number).toBeGreaterThanOrEqual(10_000);
    expect(recs[0]!.elapsedMs as number).toBeLessThan(15_000);
  });

  test('開始のスペースは、ボタンを操作しているときは奪わない。開始のキー・修飾キー・IME・Enter はミスにしない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '短縮コース');
    // 「やめる」ボタンにフォーカスしてスペース → ボタンの操作（確認が出る）で、ゲームは始まらない
    await page.getByRole('button', { name: 'やめる' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('heading', { name: 'ゲームをやめますか？' })).toBeVisible();
    await page.getByRole('button', { name: '続ける' }).click();
    await expect(page.getByTestId('game-go')).toBeVisible();
    // ページの上でスペース → 開始
    await page.locator('.game-sentence').click();
    await page.keyboard.press('Space');
    await expect(page.getByTestId('game-pause')).toBeVisible();
    for (const k of ['Shift', 'Enter', 'Tab', 'ArrowLeft', 'Control+a', 'Alt+x', 'Meta+c', 'Space', 'F2']) await page.keyboard.press(k);
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Process', keyCode: 229, isComposing: true, bubbles: true })));
    await page.evaluate(() => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', repeat: true, bubbles: true })));
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
    expect(await gaugeNow(page)).toBe(0);
    // 文字の選択や画面のクリックでも状態は壊れない
    await page.getByTestId('game-text').dblclick();
    await page.keyboard.type(await guideText(page));
    expect(await gaugeNow(page)).toBeGreaterThan(0);
  });

  test('標準コース（訓令式のお手本）を最後まで入力でき、1回の終了で1件だけ保存。再読み込み後も記録と自己ベストが残る', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await guest(page);
    await startCourse(page, '標準コース', { kunrei: true });
    await expect(page.getByTestId('gauge-left')).toContainText(/9[5-7]\d/);
    await page.keyboard.press('Space');
    await typeAll(page);
    await expect(page.getByTestId('game-save-state')).toContainText('この端末・ブラウザに記録しました');
    expect(await guestGames(page)).toHaveLength(1);
    const first = (await guestGames(page))[0]!;
    expect(first).toMatchObject({ courseId: 'standard', romajiStyle: 'kunrei', missCount: 0 });
    // 再読み込み
    await page.reload();
    await guest(page);
    await page.getByRole('button', { name: '練習の記録' }).click();
    await page.getByTestId('tab-game').click();
    await expect(page.getByTestId('game-history-row')).toHaveCount(1);
    await expect(page.getByTestId('game-history-row')).toContainText('標準コース');
    const bests = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura-type:guest-game-bests:v1')!).records.length);
    expect(bests).toBe(1);
    // ほかの記録（タイピング）には混ざらない
    await page.getByTestId('tab-typing').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('2回目は前回・自己ベストと比べる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    // 同じ物語になるよう、乱数を固定します
    await page.evaluate(() => {
      crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T) => {
        if (a instanceof Uint32Array) a[0] = 0;
        return a;
      };
    });
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await page.clock.runFor(30_000);
    await typeAll(page);
    await expect(page.getByText('初めての完成！')).toBeVisible();
    await page.getByTestId('game-again').click();
    await page.getByTestId('game-go').click();
    await page.clock.runFor(20_000);
    await typeAll(page);
    // 入力にかかる実時間の分だけ少し変わるため、約10秒の改善を確かめます
    await expect(page.getByTestId('cmp-prev')).toContainText(/前回より(9|10|11)\.\d秒早く完成しました。/);
    await expect(page.getByTestId('cmp-prev')).toContainText('5年早く');
    await expect(page.getByTestId('cmp-best')).toBeVisible();
  });

  test('画像を読み込めないときも、工程名・ゲージを表示して遊べる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.route('**/*.webp', (r) => r.abort());
    await guest(page);
    await startCourse(page, '短縮コース');
    await expect(page.getByTestId('building-fallback')).toContainText('再読み込み');
    await expect(page.getByTestId('building-fallback')).toContainText('準備');
    await expect(page.getByTestId('gauge-bar')).toBeVisible();
  });

  test('Surface 相当（1366×768）：建物・ゲージ・残り文字数・入力する文・次のキーがスクロールなしで見える', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.setViewportSize({ width: 1366, height: 768 });
    await guest(page);
    await startCourse(page, '標準コース');
    await page.getByTestId('game-go').click();
    for (const id of ['building', 'gauge-bar', 'gauge-left', 'gauge-stage', 'game-text', 'game-romaji']) {
      const box = (await page.getByTestId(id).boundingBox())!;
      expect(box.y + box.height, id).toBeLessThanOrEqual(768);
    }
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('スマートフォン：画面のキーをタップして遊べ、横にはみ出さない', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await guest(page);
    await startCourse(page, '短縮コース', { touch: true });
    await page.getByTestId('game-go').click();
    const key = (await page.locator('.game-romaji .romaji-next').textContent())!;
    await page.locator('.kb').getByRole('button', { name: new RegExp(`^${key.toUpperCase()}`) }).first().click();
    expect(await gaugeNow(page)).toBeGreaterThanOrEqual(0);
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 0回');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    for (const id of ['building', 'gauge-bar', 'gauge-left', 'game-text']) await expect(page.getByTestId(id)).toBeVisible();
  });

  test('ゲストのゲームの記録の削除は、ゲームの記録と自己ベストだけを消す', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await typeAll(page);
    await page.getByRole('button', { name: 'ゲームの記録' }).click();
    await expect(page.getByTestId('game-history-row')).toHaveCount(1);
    await page.evaluate(() => localStorage.setItem('sakura-type:guest-history', '{"version":1,"records":[]}'));
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('game-history-clear').click();
    await expect(page.getByTestId('game-history-empty')).toBeVisible();
    const keys = await page.evaluate(() => Object.keys(localStorage));
    expect(keys).toContain('sakura-type:guest-history');
    expect(keys).not.toContain('sakura-type:guest-game-history:v1');
    expect(keys).not.toContain('sakura-type:guest-game-bests:v1');
  });
});
