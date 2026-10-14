/**
 * ボウイの爆弾遊戯：勝敗の演出から戦績の画面へ（v1.7.0）。成績の集計・勝利のランク・敗北の戦績。
 * 出題数・時間は開発用の設定で短くします（短縮のクリアは80点未満のため、ランクは最下位のウォリアーを表示します）。
 */
import { expect, test, type Page } from '@playwright/test';

/** クリアのスペシャルムービー（v1.9.0）を「ムービーをスキップ」で飛ばします（そのあとはダンスから。ムービー自体は bowie-movie.spec.ts で確かめます） */
async function skipMovie(page: Page) {
  await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'movie', { timeout: 20_000 });
  await page.getByTestId('bowie-movie-skip').click();
}


const DEV = 'sakura-type:bowie-dev';
type Rec = { d: number; s: number; e: number | null; loop: boolean };
type Mark = [number, string];
const D = { clear: 5.9, victory: 2.98, lossLine: 2.01, defeat: 4.28, laugh: 4.49, cry: 3.55, hit: 3.37, explosion: 1.28 };
const near = (d: number, want: number, tol = 0.12) => Math.abs(d - want) < tol;
const RANKS = ['ウォリアー', 'エリート', 'マスター', 'グランドマスター', 'エピック', 'レジェンド', 'ミシック', 'Gミシック', 'Hミシック', 'Iミシック'];

async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __a: Rec[]; __m: Mark[]; __ctx: AudioContext[]; __lr?: string };
    w.__a = [];
    w.__m = [];
    w.__ctx = [];
    const t0 = performance.now();
    const AC = window.AudioContext;
    const Wrapped = function (this: unknown, opts?: AudioContextOptions) {
      const c = new AC(opts);
      w.__ctx.push(c);
      return c;
    } as unknown as typeof AudioContext;
    Wrapped.prototype = AC.prototype;
    window.AudioContext = Wrapped;
    const create = AC.prototype.createBufferSource;
    AC.prototype.createBufferSource = function (this: AudioContext) {
      const src = create.call(this);
      const start = src.start.bind(src);
      src.start = (...args: Parameters<typeof src.start>) => {
        const r: Rec = { d: src.buffer?.duration ?? 0, s: performance.now() - t0, e: null, loop: src.loop };
        w.__a.push(r);
        src.addEventListener('ended', () => (r.e = performance.now() - t0));
        start(...args);
      };
      return src;
    };
    new MutationObserver(() => {
      const r = document.querySelector<HTMLElement>('[data-testid="bowie-result"]');
      const k = r ? `result-${r.dataset.step}` : 'no-result';
      if (w.__lr !== k) {
        w.__lr = k;
        w.__m.push([performance.now() - t0, k]);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}
const recs = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[] }).__a);
const marks = (page: Page) => page.evaluate(() => (window as unknown as { __m: Mark[] }).__m);
const at = (m: Mark[], k: string) => m.find(([, x]) => x === k)?.[0] ?? NaN;
const guide = async (page: Page) => (await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '';
/** 1問を解除します（mistype 回だけ先にミスタイプ）。正しく打ったキーの数を返します */
async function solve(page: Page, mistype = 0) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < mistype; i++) await page.keyboard.press(';');
  const g = await guide(page);
  await page.keyboard.type(g);
  return g.length;
}
async function guest(page: Page, dev: Record<string, unknown>, opts: { mute?: boolean } = {}) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
  await page.goto('./#/game/bowie');
  if (opts.mute) await page.getByTestId('bowie-mute').click();
  await expect(page.getByTestId('bowie-mute')).toContainText(opts.mute ? 'OFF' : 'ON');
}
const accuracy = (c: number, m: number) => (c + m > 0 ? (Math.round((c / (c + m)) * 1000) / 10).toFixed(1) : '—');

test.describe('ボウイの爆弾遊戯：勝利の演出と勝利の戦績', () => {
  test('ダンス → VICTORY の画像（画面全体・点数やボタンなし）と VICTORY の音声 → ボウイの絶望と敗北のセリフ → 勝利の戦績。成績は実際の値（ミスタイプ・正確率）、ランクはエンブレムと一覧で同じ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await guest(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    let correct = 0;
    let miss = 0;
    for (let i = 0; i < 4; i++) {
      correct += await solve(page, i % 2 === 0 ? 1 : 0);
      miss += i % 2 === 0 ? 1 : 0;
    }
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 10_000 });
    // VICTORY の画像：画面全体に縦横比を保って表示。点数・再挑戦のボタンは重ねない
    const victory = page.getByTestId('bowie-victory');
    await expect(victory).toHaveAttribute('src', /bowie_victory_screen/);
    await expect.poll(() => victory.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth === 1672)).toBe(true);
    expect(await victory.evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
    await expect(page.getByTestId('bowie-final-score')).toHaveCount(0);
    await expect(page.getByTestId('bowie-retry')).toHaveCount(0);
    await expect(result).toHaveAttribute('data-step', 'despair', { timeout: 6000 });
    await expect(page.getByTestId('bowie-despair')).toBeVisible();
    await expect(page.getByTestId('bowie-retry')).toHaveCount(0);
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 6000 });
    // 音の順番：クリアの曲 → VICTORY → 敗北のセリフ → 戦績（それぞれ1回）
    const a = await recs(page);
    const m = await marks(page);
    const one = (want: number) => {
      const l = a.filter((r) => near(r.d, want) && !r.loop);
      expect(l, `sound ${want}`).toHaveLength(1);
      return l[0]!;
    };
    const clear = one(D.clear);
    const vic = one(D.victory);
    const loss = one(D.lossLine);
    expect(Math.abs(vic.s - at(m, 'result-victory'))).toBeLessThan(150);
    expect(vic.s).toBeGreaterThanOrEqual(clear.e! - 30);
    expect(loss.s).toBeGreaterThanOrEqual(vic.e! - 30);
    expect(at(m, 'result-stats')).toBeGreaterThanOrEqual(loss.e! - 30);
    // 戦績：実際の成績
    await expect(page.getByRole('heading', { name: 'VICTORY' })).toBeVisible();
    await expect(result).toContainText('全4問クリア！');
    await expect(page.getByTestId('bowie-solved')).toHaveText('4');
    await expect(page.getByTestId('bowie-mistypes')).toHaveText(String(miss));
    await expect(page.getByTestId('bowie-accuracy')).toHaveText(accuracy(correct, miss));
    const score = Number(await page.getByTestId('bowie-final-score').textContent());
    expect(score).toBeGreaterThan(0);
    await expect(page.getByTestId('bowie-new-record')).toBeVisible();
    // ランク：短縮のクリア（80点未満）なので最下位。大きなエンブレムと一覧の「あなたのランク」が同じ
    const big = page.getByTestId('bowie-rank');
    await expect(big).toHaveAttribute('data-rank', 'rank_01_warrior');
    await expect(big.locator('img')).toHaveAttribute('alt', '獲得したランク：ウォリアー');
    const items = page.locator('[data-testid="bowie-rank-list"] li');
    await expect(items).toHaveCount(10);
    expect(await items.locator('.brs-rank-name').allTextContents()).toEqual(RANKS);
    await expect(page.locator('[data-testid="bowie-rank-list"] li[data-mine="true"]')).toHaveCount(1);
    await expect(page.locator('[data-testid="bowie-rank-list"] li[data-mine="true"]')).toHaveAttribute('data-rank', 'rank_01_warrior');
    await expect(page.locator('[data-testid="bowie-rank-list"] li[data-mine="true"] .brs-yours')).toHaveText('あなたのランク');
    // エンブレムの画像（獲得したもの・一覧の10個）がすべて読み込まれている
    expect(await big.locator('img').evaluate((i: HTMLImageElement) => i.complete && i.naturalWidth > 0)).toBe(true);
    await expect.poll(() => items.locator('img').evaluateAll((l) => l.every((i) => (i as HTMLImageElement).complete && (i as HTMLImageElement).naturalWidth > 0))).toBe(true);
    // 戦績は操作するまでそのまま（音も新しく鳴らない）
    await page.waitForTimeout(1500);
    await expect(result).toHaveAttribute('data-step', 'stats');
    expect((await recs(page)).length).toBe(a.length);
    // 再挑戦：成績は0から（負けると敗北の戦績。最初のキー入力は0回 → 正確率は「—」）
    await page.getByTestId('bowie-retry').click();
    await expect(result).toHaveCount(0);
    await expect(page.getByTestId('bowie-score')).toHaveText('0');
  });
});

test.describe('ボウイの爆弾遊戯：敗北の演出と敗北の戦績', () => {
  test('被弾の声 → DEFEAT → 煽りの画像1枚と笑い声 → 主人公の鳴き声 → 敗北の戦績。ランクは付けず、クリアまでの残りを表示', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(90_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await guest(page, { perStage: 2, timeScale: 0.4 });
    await page.getByTestId('bowie-start').click();
    const correct = await solve(page, 2);
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 30_000 });
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 8000 });
    const tauntId = await page.getByTestId('bowie-taunt').getAttribute('data-taunt-id');
    await page.waitForTimeout(5000);
    // 鳴き声の間も同じ煽りの画像
    await expect(page.getByTestId('bowie-taunt')).toHaveAttribute('data-taunt-id', tauntId!);
    await expect(page.getByTestId('bowie-taunt')).toHaveCount(1);
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 8000 });
    const a = await recs(page);
    const m = await marks(page);
    const one = (want: number, tol = 0.12) => {
      const l = a.filter((r) => near(r.d, want, tol) && !r.loop);
      expect(l, `sound ${want}`).toHaveLength(1);
      return l[0]!;
    };
    const hit = one(D.hit);
    // 爆発（1.28秒）は、解除の音（1.2秒）と取り違えないよう近い長さだけで探します
    const ex = one(D.explosion, 0.05);
    const defeat = one(D.defeat);
    const laugh = one(D.laugh);
    const cry = one(D.cry);
    expect(Math.abs(ex.s - hit.s)).toBeLessThan(60);
    expect(defeat.s).toBeGreaterThanOrEqual(Math.max(hit.e!, ex.e!) - 30);
    expect(laugh.s).toBeGreaterThanOrEqual(defeat.e! - 30);
    expect(cry.s).toBeGreaterThanOrEqual(laugh.e! - 30);
    expect(at(m, 'result-stats')).toBeGreaterThanOrEqual(cry.e! - 30);
    // 敗北の戦績：DEFEAT・成績・残り。ランクは一切なし。DEFEAT の音声・笑い声は鳴らし直さない
    await expect(page.getByRole('heading', { name: 'DEFEAT' })).toBeVisible();
    await expect(page.getByTestId('bowie-solved')).toHaveText('1');
    await expect(result).toContainText('/ 8');
    await expect(page.getByTestId('bowie-mistypes')).toHaveText('2');
    await expect(page.getByTestId('bowie-accuracy')).toHaveText(accuracy(correct, 2));
    await expect(page.getByTestId('bowie-remaining')).toHaveText('クリアまで あと7問');
    await expect(page.getByTestId('bowie-rank')).toHaveCount(0);
    await expect(page.getByTestId('bowie-rank-list')).toHaveCount(0);
    await expect(result).not.toContainText('あなたのランク');
    await page.waitForTimeout(1500);
    expect((await recs(page)).length).toBe(a.length);
    // ゲーム選択へ：ゲームの選択の画面（#/game）に戻り、音の仕組みごと閉じる
    await page.getByTestId('bowie-select').click();
    await expect(page).toHaveURL(/#\/game$/);
    await expect(page.locator('[data-testid^="game-card-"]').first()).toBeVisible();
    expect(await page.evaluate(() => (window as unknown as { __ctx: AudioContext[] }).__ctx.every((c) => c.state === 'closed'))).toBe(true);
  });

  test('キーを1回も打たずに負けると、正確率は「—」（NaN・Infinity を出さない）。再挑戦は0から', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await guest(page, { perStage: 2, timeScale: 0.2 }, { mute: true });
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    for (let i = 0; i < 4 && (await result.getAttribute('data-step').catch(() => null)) !== 'stats'; i++) {
      await expect(page.getByTestId('bowie-skip')).toBeVisible({ timeout: 20_000 });
      await page.getByTestId('bowie-skip').click();
      await page.waitForTimeout(150);
    }
    await expect(result).toHaveAttribute('data-step', 'stats');
    await expect(page.getByTestId('bowie-accuracy')).toHaveText('—');
    await expect(page.getByTestId('bowie-mistypes')).toHaveText('0');
    await expect(result).not.toContainText(/NaN|Infinity/);
    await expect(page.getByTestId('bowie-new-record')).toHaveCount(0);
    // 再挑戦：1問をミス1回で解除してから負ける → その回の成績だけ
    await page.getByTestId('bowie-retry').click();
    const c = await solve(page, 1);
    await expect(result).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 4 && (await result.getAttribute('data-step')) !== 'stats'; i++) {
      await page.getByTestId('bowie-skip').click();
      await page.waitForTimeout(150);
    }
    await expect(page.getByTestId('bowie-mistypes')).toHaveText('1');
    await expect(page.getByTestId('bowie-accuracy')).toHaveText(accuracy(c, 1));
  });
});

test.describe('ボウイの爆弾遊戯：演出を飛ばす・連打・音なし・画面を離れる', () => {
  test('勝利の演出で「演出を飛ばす」を連打しても、必ず戦績へ。VICTORY は鳴らさず、敗北のセリフは多くても1回。あとから音や画面の切り替えは起きない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(90_000);
    await record(page);
    await guest(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    const skip = page.getByTestId('bowie-skip');
    for (let i = 0; i < 5; i++) await skip.click({ timeout: 1000 }).catch(() => undefined);
    await expect(result).toHaveAttribute('data-step', 'stats');
    await page.waitForTimeout(6500);
    await expect(result).toHaveAttribute('data-step', 'stats');
    const a = await recs(page);
    expect(a.filter((r) => near(r.d, D.victory, 0.1))).toHaveLength(0);
    expect(a.filter((r) => near(r.d, D.lossLine, 0.1)).length).toBeLessThanOrEqual(1);
    expect(a.filter((r) => near(r.d, D.clear))).toHaveLength(1);
    expect(a.filter((r) => r.e === null && !r.loop)).toHaveLength(0);
  });

  test('敗北の演出で「演出を飛ばす」を連打しても、必ず戦績へ。笑い声・鳴き声は多くても各1回で、あとから鳴らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await guest(page, { perStage: 2, timeScale: 0.2 });
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 30_000 });
    const skip = page.getByTestId('bowie-skip');
    for (let i = 0; i < 5; i++) await skip.click({ timeout: 1000 }).catch(() => undefined);
    await expect(result).toHaveAttribute('data-step', 'stats');
    await page.waitForTimeout(6000);
    await expect(result).toHaveAttribute('data-step', 'stats');
    const a = await recs(page);
    expect(a.filter((r) => near(r.d, D.laugh)).length).toBeLessThanOrEqual(1);
    expect(a.filter((r) => near(r.d, D.cry)).length).toBeLessThanOrEqual(1);
    expect(a.filter((r) => near(r.d, D.defeat))).toHaveLength(1);
    expect(a.filter((r) => r.e === null && !r.loop)).toHaveLength(0);
  });

  test('音を OFF：勝利・敗北とも、各音の長さだけ演出を見せてから戦績へ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await record(page);
    await guest(page, { perStage: 1 }, { mute: true });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    // 音 OFF でもムービー（約15秒・ミュート）は最後まで流れてから、ダンス以降へ
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 45_000 });
    let m = await marks(page);
    expect(at(m, 'result-victory') - at(m, 'result-dance')).toBeGreaterThanOrEqual(5700);
    expect(at(m, 'result-despair') - at(m, 'result-victory')).toBeGreaterThanOrEqual(2800);
    expect(at(m, 'result-stats') - at(m, 'result-despair')).toBeGreaterThanOrEqual(1850);
    await page.getByTestId('bowie-retry').click();
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 40_000 });
    m = await marks(page);
    const k = (name: string) => m.filter(([, x]) => x === name).at(-1)![0];
    expect(k('result-taunt') - k('result-defeat')).toBeGreaterThanOrEqual(4100);
    expect(k('result-stats') - k('result-taunt')).toBeGreaterThanOrEqual(4300 + 3400);
  });

  test('音声の読み込みに失敗しても、勝利の戦績まで進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await page.route('**/*.mp3', (r) => r.abort());
    await record(page);
    await guest(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    // ムービー（動画は読み込めます）のあと、音声なしでも戦績まで
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'stats', { timeout: 45_000 });
    await expect(page.getByTestId('bowie-rank')).toBeVisible();
  });

  test('VICTORY の途中でホームへ移ると、音も演出も止まり、あとから戦績に切り替わらない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await guest(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 10_000 });
    await page.goto('./#/home');
    await page.waitForTimeout(4500);
    await expect(result).toHaveCount(0);
    expect(await page.evaluate(() => (window as unknown as { __ctx: AudioContext[] }).__ctx.every((c) => c.state === 'closed'))).toBe(true);
    expect((await marks(page)).some(([, k]) => k === 'result-stats')).toBe(false);
  });
});

test.describe('ボウイの爆弾遊戯：戦績の画面の大きさ', () => {
  test('勝利・敗北の戦績：数値・画像・ボタン・全10ランクが見切れず、横にはみ出さない（広い画面は10個1列、中くらいは5個2段）', async ({ page }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await guest(page, { perStage: 1 }, { mute: true });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    for (let i = 0; i < 4 && (await result.getAttribute('data-step')) !== 'stats'; i++) {
      await page.getByTestId('bowie-skip').click();
      await page.waitForTimeout(150);
    }
    await expect(result).toHaveAttribute('data-step', 'stats');
    const vp = page.viewportSize()!;
    const noHorizontal = () => page.evaluate(() => {
      const el = document.querySelector('.bowie-result.step-stats')!;
      return el.scrollWidth <= el.clientWidth + 1 && document.documentElement.scrollWidth <= innerWidth + 1;
    });
    expect(await noHorizontal()).toBe(true);
    const visible = async (sel: string) => {
      const l = page.locator(sel);
      await l.scrollIntoViewIfNeeded();
      const b = (await l.boundingBox())!;
      expect(b.x, sel).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.width, sel).toBeGreaterThan(20);
    };
    for (const id of ['bowie-final-score', 'bowie-solved', 'bowie-mistypes', 'bowie-accuracy', 'bowie-rank', 'bowie-retry', 'bowie-select']) await visible(`[data-testid="${id}"]`);
    const items = page.locator('[data-testid="bowie-rank-list"] li');
    for (let i = 0; i < 10; i++) await visible(`[data-testid="bowie-rank-list"] li:nth-child(${i + 1})`);
    // （自分のランクは少し大きく表示するため、動きを含まない位置で行を数えます）
    const ys = await items.evaluateAll((l) => l.map((e) => (e as HTMLElement).offsetTop));
    const rows = new Set(ys).size;
    if (vp.width >= 1100) expect(rows).toBe(1);
    else if (vp.width >= 521) expect(rows).toBe(2);
    // 並びは低い順のまま
    expect(await items.locator('.brs-rank-name').allTextContents()).toEqual(RANKS);
    // 一覧の名前は読める大きさ
    expect(await items.first().locator('.brs-rank-name').evaluate((e) => parseFloat(getComputedStyle(e).fontSize))).toBeGreaterThanOrEqual(12);
    await page.screenshot({ path: test.info().outputPath(`victory-stats-${info.project.name}.png`), fullPage: true });
    // 敗北の戦績
    await page.getByTestId('bowie-retry').click();
    await expect(result).toBeVisible({ timeout: 20_000 });
    for (let i = 0; i < 4 && (await result.getAttribute('data-step')) !== 'stats'; i++) {
      await page.getByTestId('bowie-skip').click();
      await page.waitForTimeout(150);
    }
    await expect(result).toHaveAttribute('data-step', 'stats');
    expect(await noHorizontal()).toBe(true);
    for (const id of ['bowie-final-score', 'bowie-solved', 'bowie-mistypes', 'bowie-accuracy', 'bowie-remaining', 'bowie-retry', 'bowie-select']) await visible(`[data-testid="${id}"]`);
    await page.screenshot({ path: test.info().outputPath(`defeat-stats-${info.project.name}.png`), fullPage: true });
  });
});
