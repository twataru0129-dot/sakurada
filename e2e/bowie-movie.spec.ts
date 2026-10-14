/**
 * ボウイの爆弾遊戯：クリアのスペシャルムービー（v1.9.0）。
 * 勝利が決まった直後、クリアのダンスの前に、添付の動画を先頭から1回。そのあとダンス → VICTORY → 絶望 → 勝利の戦績。
 * テストの Chromium は H.264 の MP4 を再生できないため、同じ映像・音声の WebM（2番目の候補）が再生されます。
 * Web Audio の再生（音源の長さ・始まり）を記録して、ムービーの間にほかの音が鳴らないことを確かめます。
 */
import { expect, test, type Page } from '@playwright/test';

const DEV = 'sakura-type:bowie-dev';
type Rec = { d: number; s: number };
/** 読み込んだ長さ：クリアの曲 約5.9秒、VICTORY・敗北のセリフ */
const CLEAR = 5.9;
const near = (d: number, want: number, tol = 0.15) => Math.abs(d - want) < tol;

async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __a: Rec[]; __t0: number; __ended: number[] };
    w.__a = [];
    w.__ended = [];
    w.__t0 = performance.now();
    // 動画の実際の終わり（ended）の時刻
    document.addEventListener('ended', (e) => e.target instanceof HTMLVideoElement && w.__ended.push(performance.now() - w.__t0), true);
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const src = create.call(this);
      const start = src.start.bind(src);
      src.start = (...args: Parameters<typeof src.start>) => {
        w.__a.push({ d: src.buffer?.duration ?? 0, s: performance.now() - w.__t0 });
        start(...args);
      };
      return src;
    };
  });
}
const recs = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[] }).__a);
const now = (page: Page) => page.evaluate(() => performance.now() - (window as unknown as { __t0: number }).__t0);

async function setup(page: Page, dev: Record<string, unknown> = { perStage: 1, timeScale: 0.3 }) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
  await page.goto('./#/game/bowie');
  if ((await page.getByTestId('bowie-mute').textContent())?.includes('OFF')) await page.getByTestId('bowie-mute').click();
}
async function solve(page: Page) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 30_000 });
  await page.keyboard.type((await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '');
}
/** 全問（各段階1問）を解除して勝ちます */
async function win(page: Page) {
  await page.getByTestId('bowie-start').click();
  for (let i = 0; i < 4; i++) await solve(page);
}
const video = (page: Page) => page.getByTestId('bowie-movie-video');
const vstate = (page: Page) =>
  video(page).evaluate((v: HTMLVideoElement) => ({ t: v.currentTime, paused: v.paused, ended: v.ended, loop: v.loop, muted: v.muted, volume: v.volume, src: v.currentSrc, w: v.videoWidth, h: v.videoHeight, dur: v.duration }));

test.describe('ボウイの爆弾遊戯：クリアのスペシャルムービー', () => {
  test('勝利の直後に先頭から1回（ループなし）。ムービーの間はほかの音・UI を重ねず、ended のあとにクリアの曲とダンス → VICTORY → 絶望 → 勝利の戦績。記録は1回だけ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page);
    await win(page);
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'movie', { timeout: 10_000 });
    const tMovie = await now(page);
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    const v0 = await vstate(page);
    expect(v0.loop).toBe(false);
    expect(v0.t).toBeLessThan(3);
    expect(v0.paused).toBe(false);
    // 音は「音楽」の音量（初期値20％）に合わせ、ミュートではない
    expect(v0.muted).toBe(false);
    expect(v0.volume).toBeCloseTo(0.2, 2);
    expect(v0.src).toMatch(/bowie_clear_special[-\w]*\.(mp4|webm)$/);
    expect([v0.w, v0.h]).toEqual([910, 512]);
    expect(v0.dur).toBeGreaterThan(14.5);
    expect(v0.dur).toBeLessThan(15.8);
    // 画面の真ん中は動画（得点・入力の欄・キャラクターは重ならない）。縦横比を保って全体を見せる
    const hit = await page.evaluate(() => {
      const el = document.elementFromPoint(innerWidth / 2, innerHeight / 2) as HTMLElement | null;
      const v = document.querySelector<HTMLVideoElement>('[data-testid="bowie-movie-video"]')!;
      return { id: el?.dataset.testid, fit: getComputedStyle(v).objectFit, bg: getComputedStyle(document.querySelector('[data-testid="bowie-movie"]')!).backgroundColor };
    });
    expect(hit).toEqual({ id: 'bowie-movie-video', fit: 'contain', bg: 'rgb(0, 0, 0)' });
    // 得点・入力の欄・キャラクターの位置でも、いちばん上はムービーの画面（ゲームの UI は見えない）
    const covered = await page.evaluate(() =>
      ['[data-testid="bowie-score"]', '[data-testid="bowie-panel"]', '[data-testid="bowie-hero"]', '[data-testid="bowie-villain"]'].map((sel) => {
        const r = document.querySelector(sel)!.getBoundingClientRect();
        const top = document.elementFromPoint(Math.min(innerWidth - 1, r.left + r.width / 2), Math.min(innerHeight - 1, r.top + r.height / 2));
        return !!top?.closest('[data-step="movie"]');
      }),
    );
    expect(covered).toEqual([true, true, true, true]);
    await expect(page.getByTestId('bowie-skip')).toHaveCount(0);
    await expect(page.getByTestId('bowie-movie-skip')).toBeVisible();
    // 実際の終わり（ended）まで待つ。そのあいだダンス・クリアの曲・VICTORY は始まらない
    await expect(result).toHaveAttribute('data-step', 'dance', { timeout: 25_000 });
    const ended = await page.evaluate(() => (window as unknown as { __ended: number[] }).__ended);
    expect(ended).toHaveLength(1);
    expect(ended[0]! - tMovie).toBeGreaterThan(14_000);
    const a = await recs(page);
    // ムービーの間（始まりから ended まで）は Web Audio の音を1つも鳴らさない。クリアの曲は ended のあとに1回
    expect(a.filter((r) => r.s > tMovie + 100 && r.s < ended[0]!)).toEqual([]);
    const clear = a.filter((r) => near(r.d, CLEAR));
    expect(clear).toHaveLength(1);
    expect(clear[0]!.s).toBeGreaterThanOrEqual(ended[0]!);
    expect(clear[0]!.s - ended[0]!).toBeLessThan(500);
    await expect(page.getByTestId('bowie-movie')).toHaveCount(0);
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 15_000 });
    await expect(result).toHaveAttribute('data-step', 'despair', { timeout: 15_000 });
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-rank')).toBeVisible();
    // 記録（プレイ数・クリア数）は1回だけ
    const rec = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura-type:bowie-records:v1')!).profiles.guest);
    expect(rec).toMatchObject({ plays: 1, cleared: 1 });
  });

  test('「ムービーをスキップ」：ダンスから続ける（絶望・戦績へは飛ばない）。動画は止まり、終わりの ended で次の演出が重複しない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await record(page);
    await setup(page);
    await win(page);
    const result = page.getByTestId('bowie-result');
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    await page.waitForTimeout(1500);
    // 連打しても次へ進むのは1回だけ
    const skip = page.getByTestId('bowie-movie-skip');
    await skip.click();
    await skip.click({ timeout: 500 }).catch(() => undefined);
    await expect(result).toHaveAttribute('data-step', 'dance');
    await expect(page.getByTestId('bowie-movie-video')).toHaveCount(0);
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 15_000 });
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 20_000 });
    // ムービーの本来の終わり（約15秒）を過ぎても、クリアの曲・ダンスはもう始まらない
    await page.waitForTimeout(6000);
    await expect(result).toHaveAttribute('data-step', 'stats');
    expect((await recs(page)).filter((r) => near(r.d, CLEAR))).toHaveLength(1);
  });

  test('音つきの自動再生を拒否されたら「再生する」と「スキップ」。押すと再生し、終わればダンスへ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.addInitScript(() => {
      // 1回目の play() だけ、ブラウザーの自動再生の拒否と同じ失敗にします（利用者が押した2回目は通常どおり）
      const play = HTMLMediaElement.prototype.play;
      let first = true;
      HTMLMediaElement.prototype.play = function (this: HTMLMediaElement) {
        if (first && this instanceof HTMLVideoElement) {
          first = false;
          return Promise.reject(new DOMException('blocked', 'NotAllowedError'));
        }
        return play.call(this);
      };
    });
    await setup(page);
    await win(page);
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'movie', { timeout: 10_000 });
    const btn = page.getByTestId('bowie-movie-play');
    await expect(btn).toBeVisible();
    await expect(page.getByTestId('bowie-movie-skip')).toBeVisible();
    await page.waitForTimeout(1000);
    expect((await vstate(page)).paused).toBe(true);
    await expect(result).toHaveAttribute('data-step', 'movie');
    await btn.click();
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing');
    await expect(btn).toHaveCount(0);
    await expect(result).toHaveAttribute('data-step', 'dance', { timeout: 25_000 });
  });

  test('動画を読み込めないときは、そのままクリアのダンスへ進み、戦績まで着く', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.route(/bowie_clear_special.*\.(mp4|webm)/, (r) => r.fulfill({ status: 404, body: '' }));
    await setup(page);
    await win(page);
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'dance', { timeout: 12_000 });
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 30_000 });
  });

  test('タブが見えなくなったら一時停止し、戻ると続きから。音 OFF ではミュート、音楽0では音量0のまま、最後まで進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await setup(page);
    // 音 OFF・音楽 0（設定の値はそのまま）
    await page.evaluate(() => localStorage.setItem('sakura-type:bowie-sound:v1', JSON.stringify({ version: 1, music: 0, sfx: 0.8, voice: 1 })));
    // 画面を開き直して、保存した設定を読み込みます（ゲストのまま）
    await page.evaluate(() => (location.hash = '#/home'));
    await page.evaluate(() => (location.hash = '#/game/bowie'));
    await expect(page.getByTestId('bowie-mute')).toContainText('ON');
    await page.getByTestId('bowie-mute').click();
    await expect(page.getByTestId('bowie-mute')).toContainText('OFF');
    await win(page);
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    const s0 = await vstate(page);
    expect(s0.muted).toBe(true);
    expect(s0.volume).toBe(0);
    await page.waitForTimeout(1200);
    const setVis = (state: 'hidden' | 'visible') =>
      page.evaluate((st) => {
        Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => st });
        Object.defineProperty(document, 'hidden', { configurable: true, get: () => st === 'hidden' });
        document.dispatchEvent(new Event('visibilitychange'));
      }, state);
    await setVis('hidden');
    await expect.poll(async () => (await vstate(page)).paused).toBe(true);
    const tHidden = (await vstate(page)).t;
    await page.waitForTimeout(2500);
    expect((await vstate(page)).t).toBeCloseTo(tHidden, 1);
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'movie');
    await setVis('visible');
    await expect.poll(async () => (await vstate(page)).paused).toBe(false);
    await expect.poll(async () => (await vstate(page)).t).toBeGreaterThan(tHidden + 0.3);
    expect((await vstate(page)).t).toBeLessThan(tHidden + 3);
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'dance', { timeout: 25_000 });
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'stats', { timeout: 30_000 });
    // 設定の値は変えない
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura-type:bowie-sound:v1')!).music)).toBe(0);
  });

  test('敗北ではムービーを流さない。ムービーの途中で画面を移ると動画は止まり、あとからクリアの曲やダンスは始まらない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await record(page);
    await setup(page);
    // 敗北：着弾を待ちます
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-kind', 'lose', { timeout: 20_000 });
    const steps = new Set<string>();
    for (let i = 0; i < 40 && (await result.getAttribute('data-step')) !== 'stats'; i++) {
      steps.add((await result.getAttribute('data-step')) ?? '');
      await page.waitForTimeout(300);
    }
    expect(steps.has('movie')).toBe(false);
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    // もう一度（再挑戦）勝って、ムービーの途中でゲームの選択へ
    await page.getByTestId('bowie-retry').click();
    for (let i = 0; i < 4; i++) await solve(page);
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    await page.evaluate(() => (location.hash = '#/game'));
    await expect(page.getByTestId('game-card-bowie-bomb')).toBeVisible();
    expect(await page.evaluate(() => document.querySelectorAll('video').length)).toBe(0);
    const n = (await recs(page)).length;
    await page.waitForTimeout(16_000);
    expect((await recs(page)).slice(n).filter((r) => near(r.d, CLEAR))).toHaveLength(0);
    await expect(page.getByTestId('bowie-result')).toHaveCount(0);
  });

  test('画面の大きさ（Surface 相当 1368×912・タブレット・スマホ）：動画とスキップのボタンが画面に収まり、縦横比を保つ', async ({ page }, info) => {
    test.setTimeout(120_000);
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await setup(page);
    await win(page);
    await expect(page.getByTestId('bowie-movie')).toHaveAttribute('data-state', 'playing', { timeout: 10_000 });
    const box = await page.evaluate(() => {
      const v = document.querySelector<HTMLVideoElement>('[data-testid="bowie-movie-video"]')!.getBoundingClientRect();
      const b = document.querySelector('[data-testid="bowie-movie-skip"]')!.getBoundingClientRect();
      return { v: [v.left, v.top, v.right, v.bottom], b: [b.left, b.top, b.right, b.bottom], vw: innerWidth, vh: innerHeight, sw: document.documentElement.scrollWidth };
    });
    expect(box.v[0]).toBeGreaterThanOrEqual(-1);
    expect(box.v[1]).toBeGreaterThanOrEqual(-1);
    expect(box.v[2]).toBeLessThanOrEqual(box.vw + 1);
    expect(box.v[3]).toBeLessThanOrEqual(box.vh + 1);
    expect(box.b[2]).toBeLessThanOrEqual(box.vw + 1);
    expect(box.b[3]).toBeLessThanOrEqual(box.vh + 1);
    expect(box.sw).toBeLessThanOrEqual(box.vw + 1);
    // 表示される映像（contain）の大きさ：箱の中で縦横比 910:512 を保つ
    const shown = await video(page).evaluate((v: HTMLVideoElement) => {
      const r = v.getBoundingClientRect();
      const s = Math.min(r.width / v.videoWidth, r.height / v.videoHeight);
      return { w: v.videoWidth * s, h: v.videoHeight * s, bw: r.width, bh: r.height };
    });
    expect(shown.w / shown.h).toBeCloseTo(910 / 512, 2);
    expect(shown.w).toBeLessThanOrEqual(shown.bw + 0.5);
    expect(shown.h).toBeLessThanOrEqual(shown.bh + 0.5);
    await page.getByTestId('bowie-movie-skip').click();
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'dance');
  });
});
