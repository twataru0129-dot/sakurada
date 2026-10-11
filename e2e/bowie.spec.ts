/**
 * ゲーム「ボウイの爆弾遊戯」の E2E テスト。
 * 出題数・時間を短くするときは、開発用の設定（sessionStorage）を使います（通常の画面には何も出ません）。
 */
import { expect, test, type Page } from '@playwright/test';

const DEV = 'sakura-type:bowie-dev';
/** ゲームの選択からの幕（タイトルコール）が消えて、ゲーム画面が操作できるようになるまで待ちます */
const curtainGone = (page: Page) => expect(page.getByTestId('bowie-curtain')).toHaveCount(0, { timeout: 15_000 });
async function open(page: Page, dev?: { perStage?: number; timeScale?: number; ids?: string[] }) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  // ゲストを始めるときに一時データが消えるため、入ったあとに設定します
  if (dev) await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-bowie-bomb').click();
  await expect(page.getByTestId('bowie-title')).toBeVisible();
  await curtainGone(page);
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
    await curtainGone(page);
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

/** 幕の段階・音声・画面の切り替えを、時刻つきで記録します（ページの中で動かします） */
async function installLog(page: Page) {
  await page.evaluate(() => {
    const w = window as unknown as { __log: [number, string][]; __last: string; __media: HTMLMediaElement[]; __curtains: number };
    w.__log = [];
    w.__media = [];
    w.__curtains = 0;
    const t0 = performance.now();
    const log = (s: string) => w.__log.push([performance.now() - t0, s]);
    new MutationObserver((list) => {
      for (const m of list) for (const n of Array.from(m.addedNodes)) if ((n as HTMLElement).dataset?.testid === 'bowie-curtain') w.__curtains++;
      const c = document.querySelector<HTMLElement>('[data-testid="bowie-curtain"]');
      const k = c ? `${c.dataset.phase}/${c.dataset.audio}` : 'none';
      if (w.__last !== k) {
        w.__last = k;
        log(k);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
    window.addEventListener('hashchange', () => log(`hash ${location.hash}`));
    const play = HTMLMediaElement.prototype.play;
    HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
      log('play');
      w.__media.push(this);
      this.addEventListener('ended', () => log('ended'));
      return play.call(this);
    };
  });
}
type Log = [number, string][];
const getLog = (page: Page) => page.evaluate(() => (window as unknown as { __log: Log }).__log);
const phasesOf = (log: Log) => log.filter(([, s]) => !s.startsWith('hash') && s !== 'play' && s !== 'ended').map(([, s]) => s.split('/')[0]).filter((p, i, a) => p !== a[i - 1]);
const timeOf = (log: Log, pred: (s: string) => boolean) => log.find(([, s]) => pred(s))?.[0] ?? NaN;
async function soundOn(page: Page) {
  await page.goto('./#/game/bowie');
  if ((await page.getByTestId('bowie-mute').textContent())?.includes('OFF')) await page.getByTestId('bowie-mute').click();
  await expect(page.getByTestId('bowie-mute')).toContainText('ON');
  await page.goto('./#/game');
}
async function guestSelect(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
}

test.describe('ボウイの爆弾遊戯：タイトルコールと画面の切り替え', () => {
  test('選択 → タイトルコールと同時に白 → 画面全体（ヘッダーも）が白 → 音声の終わりで黒 → 黒からゲーム画面。表示後は開始待ちで、幕の間のキーは持ち越さない（1368×912）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.setViewportSize({ width: 1368, height: 912 });
    await guestSelect(page);
    await page.goto('./#/game/bowie');
    await expect(page.getByTestId('bowie-mute')).toContainText('ON');
    await page.goto('./#/game');
    await installLog(page);
    await page.getByTestId('game-card-bowie-bomb').click();
    const curtain = page.getByTestId('bowie-curtain');
    await expect(curtain).toHaveAttribute('data-phase', 'white');
    await page.waitForTimeout(600);
    // 白：表示画面の四隅まで覆い、不透明。下ではゲーム画面に切り替わっている（選択画面は残っていない）
    const corners = await page.evaluate(() =>
      [[0, 0], [innerWidth - 1, 0], [0, innerHeight - 1], [innerWidth - 1, innerHeight - 1], [innerWidth / 2, 10]].map(([x, y]) => (document.elementFromPoint(x!, y!) as HTMLElement | null)?.dataset?.testid),
    );
    expect(corners).toEqual(Array(5).fill('bowie-curtain'));
    const box = (await curtain.boundingBox())!;
    expect([box.x, box.y, box.width, box.height]).toEqual([0, 0, 1368, 912]);
    expect(await curtain.evaluate((e) => [getComputedStyle(e).opacity, getComputedStyle(e).backgroundColor])).toEqual(['1', 'rgb(255, 255, 255)']);
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await expect(page.locator('[data-testid^="game-card-"]')).toHaveCount(0);
    await expect(page.getByTestId('bowie-title')).toBeAttached();
    await expect(curtain).toHaveAttribute('data-audio', /playing|ended/);
    // 幕の間のキー（スペース・英字・Enter）は、どこにも渡らない
    await page.keyboard.press(' ');
    await page.keyboard.type('abc');
    await page.keyboard.press('Enter');
    await curtainGone(page);
    const log = await getLog(page);
    expect(phasesOf(log)).toEqual(['white', 'black', 'hold', 'reveal', 'none']);
    expect(log.filter(([, s]) => s === 'play')).toHaveLength(1);
    // 黒へ移るのは音声の本当の終わり（ended）のとき
    const ended = timeOf(log, (s) => s === 'ended');
    const black = timeOf(log, (s) => s.startsWith('black'));
    expect(Math.abs(black - ended)).toBeLessThan(120);
    expect(black - timeOf(log, (s) => s.startsWith('white'))).toBeGreaterThan(3000);
    // 白になってからゲーム画面へ切り替え（1回だけ）
    const hashes = log.filter(([, s]) => s.startsWith('hash'));
    expect(hashes.map(([, s]) => s)).toEqual(['hash #/game/bowie']);
    expect(hashes[0]![0]).toBeGreaterThanOrEqual(300);
    expect(hashes[0]![0]).toBeLessThan(black);
    // 黒（0.35秒）→ 黒のまま（0.15秒）→ ゲーム画面へ（0.4秒）
    const hold = timeOf(log, (s) => s.startsWith('hold'));
    const reveal = timeOf(log, (s) => s.startsWith('reveal'));
    const none = timeOf(log, (s) => s === 'none');
    expect(hold - black).toBeGreaterThanOrEqual(330);
    expect(reveal - hold).toBeGreaterThanOrEqual(130);
    expect(none - reveal).toBeGreaterThanOrEqual(380);
    // 開始待ち（ゲームは始まっていない）。スペースで始まる
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await expect(page.getByTestId('bowie-start')).toBeVisible();
    expect(await page.locator('.bowie-title-logo').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/game\/bowie\/play/);
    await expect(page.getByTestId('bowie-banner')).toContainText('第1段階');
  });

  test('ミュートのときは音を鳴らさず、音声の長さで進む。キーでの決定でも同じ。連打しても演出・遷移は1回。ポインターを重ねるだけでは始まらない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guestSelect(page);
    await page.goto('./#/game/bowie');
    await page.getByTestId('bowie-mute').click();
    await expect(page.getByTestId('bowie-mute')).toContainText('OFF');
    await page.goto('./#/game');
    await installLog(page);
    const card = page.getByTestId('game-card-bowie-bomb');
    await card.hover();
    await card.focus();
    await page.waitForTimeout(500);
    await expect(page.getByTestId('bowie-curtain')).toHaveCount(0);
    // キーで決定し、続けて Enter・クリックを連打
    await page.keyboard.press('Enter');
    await expect(page.getByTestId('bowie-curtain')).toHaveAttribute('data-audio', 'muted');
    for (let i = 0; i < 4; i++) await page.keyboard.press('Enter');
    await page.mouse.click(300, 300);
    await page.mouse.dblclick(500, 400);
    await curtainGone(page);
    const log = await getLog(page);
    expect(phasesOf(log)).toEqual(['white', 'black', 'hold', 'reveal', 'none']);
    expect(log.filter(([, s]) => s === 'play')).toHaveLength(0);
    expect(await page.evaluate(() => (window as unknown as { __curtains: number }).__curtains)).toBe(1);
    expect(log.filter(([, s]) => s.startsWith('hash')).map(([, s]) => s)).toEqual(['hash #/game/bowie']);
    // 音声の長さ（3.864秒）のあいだ白のまま
    expect(timeOf(log, (s) => s.startsWith('black')) - timeOf(log, (s) => s.startsWith('white'))).toBeGreaterThanOrEqual(3800);
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await expect(page.getByTestId('bowie-start')).toBeVisible();
  });

  test('音声の読み込みの失敗・再生の拒否でも、白や黒のまま止まらずにゲーム画面が出る', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guestSelect(page);
    await soundOn(page);
    await page.route('**/*title_call*', (r) => r.abort());
    await installLog(page);
    await page.getByTestId('game-card-bowie-bomb').click();
    await expect(page.getByTestId('bowie-curtain')).toHaveAttribute('data-audio', 'failed', { timeout: 3000 });
    await curtainGone(page);
    await expect(page.getByTestId('bowie-start')).toBeVisible();
    expect(phasesOf(await getLog(page))).toEqual(['white', 'black', 'hold', 'reveal', 'none']);
    // 再生の拒否
    await page.unroute('**/*title_call*');
    await page.goto('./#/game');
    await page.evaluate(() => {
      HTMLMediaElement.prototype.play = () => Promise.reject(new DOMException('blocked', 'NotAllowedError'));
    });
    await page.getByTestId('game-card-bowie-bomb').click();
    await expect(page.getByTestId('bowie-curtain')).toHaveAttribute('data-audio', 'failed');
    await curtainGone(page);
    await expect(page.getByTestId('bowie-start')).toBeVisible();
  });

  test('演出の途中で別の画面へ移ると、音・タイマー・幕をすべて止める。選択画面へ戻って選び直すと、改めて1回だけ演出する', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guestSelect(page);
    await soundOn(page);
    await installLog(page);
    // ゲーム画面へ切り替わったあと（白の間）にブラウザの「戻る」
    await page.getByTestId('game-card-bowie-bomb').click();
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await page.waitForTimeout(300);
    await page.goBack();
    await expect(page).toHaveURL(/#\/game$/);
    await expect(page.getByTestId('bowie-curtain')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __media: HTMLMediaElement[] }).__media.every((m) => m.paused))).toBe(true);
    // 選択画面は操作できる
    await expect(page.getByTestId('game-card-bowie-bomb')).toBeVisible();
    // 切り替わる前（選んだ直後）にホームへ移った場合も、あとからゲーム画面へ移らない
    await page.getByTestId('game-card-bowie-bomb').click();
    await page.evaluate(() => (location.hash = '#/home'));
    await page.waitForTimeout(1200);
    await expect(page).toHaveURL(/#\/home$/);
    await expect(page.getByTestId('bowie-curtain')).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __media: HTMLMediaElement[] }).__media.every((m) => m.paused))).toBe(true);
    // 選び直すと、もう一度最初から1回だけ
    await page.evaluate(() => {
      const w = window as unknown as { __log: Log; __curtains: number };
      w.__log.length = 0;
      w.__curtains = 0;
    });
    await page.goto('./#/game');
    await page.getByTestId('game-card-bowie-bomb').click();
    await curtainGone(page);
    const log = await getLog(page);
    expect(phasesOf(log)).toEqual(['white', 'black', 'hold', 'reveal', 'none']);
    expect(log.filter(([, s]) => s === 'play')).toHaveLength(1);
    expect(await page.evaluate(() => (window as unknown as { __curtains: number }).__curtains)).toBe(1);
    await expect(page.getByTestId('bowie-start')).toBeVisible();
  });
});

test.describe('ボウイの爆弾遊戯：このモードのローマ字（「ん」は NN、「づ」は DU・ZU）', () => {
  test('語末・母音・Y音の前の「ん」は NN。N 1回・N\' では解除されない。「づ」は ZU でも解除でき、表示も追従する', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(90_000);
    // 各段階の最初の問題：じゅもん（語末）・はんいこうげき（母音の前）・しんおおさかえき（母音の前）・文章30（「づ」と「ん」）
    await open(page, { perStage: 1, ids: ['word_1_016', 'word_2_081', 'word_3_042', 'sentence_030'] });
    await page.getByTestId('bowie-start').click();
    const text = page.getByTestId('bowie-text');
    const romaji = page.getByTestId('bowie-romaji');
    // 1問目：じゅもん → JUMONN
    await expect(text).toBeVisible({ timeout: 8000 });
    await expect(page.getByTestId('bowie-panel')).toContainText('じゅもん');
    expect(await guide(page)).toBe('jumonn');
    await expect(romaji).toContainText('JUMONN');
    await page.keyboard.type('jumon');
    // N 1回では解除されない（入力の途中。残りは N）
    await page.waitForTimeout(200);
    await expect(text).toBeVisible();
    await expect(page.getByTestId('bowie-progress')).toHaveText('1 / 4');
    expect(await guide(page)).toBe('n');
    expect((await page.locator('.bowie-romaji .r-done').allTextContents()).join('')).toBe('JUMON');
    await page.keyboard.press("'");
    await expect(page.getByTestId('bowie-panel')).toHaveClass(/typo-/);
    await expect(text).toBeVisible();
    await page.keyboard.press('n');
    await expect(page.getByTestId('bowie-wait')).toBeVisible();
    await expect(page.getByTestId('bowie-score')).not.toHaveText('0');
    // 2問目：はんいこうげき → HANNIKOUGEKI（HANI では進まない）
    await expect(text).toBeVisible({ timeout: 8000 });
    expect(await guide(page)).toBe('hannikougeki');
    await page.keyboard.type('han');
    await page.keyboard.press('i');
    await expect(page.getByTestId('bowie-panel')).toHaveClass(/typo-/);
    expect(await guide(page)).toBe('nikougeki');
    await page.keyboard.type('nikougeki');
    await expect(page.getByTestId('bowie-wait')).toBeVisible();
    // 3問目：しんおおさかえき → SHINNOOSAKAEKI
    await expect(text).toBeVisible({ timeout: 8000 });
    const g3 = await guide(page);
    expect(g3.startsWith('shinno')).toBe(true);
    await page.keyboard.type('shin');
    await page.keyboard.press('o');
    expect(await guide(page)).toBe(g3.slice(4));
    await page.keyboard.type(g3.slice(4));
    await expect(page.getByTestId('bowie-wait')).toBeVisible();
    // 4問目（文章）：「たづな」を ZU で打つと、表示も ZU に変わって進む。「ん」はすべて NN
    await expect(text).toBeVisible({ timeout: 8000 });
    const g4 = await guide(page);
    expect(g4).toContain('taduna');
    expect(g4).toContain('jibunnnoun');
    await expect(romaji).toContainText('TADUNA');
    const at = g4.indexOf('taduna') + 2;
    await page.keyboard.type(g4.slice(0, at) + 'z');
    expect(await guide(page)).toBe(g4.slice(at + 1));
    await expect(romaji).toContainText('TAZ');
    // 区切り（まとまり）ごとの表示をつなぐと、入力済み＋残りと一致する
    const shownAll = (await page.locator('.bowie-romaji').allTextContents()).join('').replace(/\s/g, '');
    expect(shownAll).toBe((g4.slice(0, at) + 'z' + g4.slice(at + 1)).toUpperCase());
    await page.keyboard.type(g4.slice(at + 1));
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-kind', 'win', { timeout: 10_000 });
  });
});
