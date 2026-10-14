/**
 * ボウイの爆弾遊戯：通常の BGM・サウンド設定・解除の音・主人公の声・クリアのダンス（v1.6.0）。
 * 鳴った音は、Web Audio の再生（長さ・始まり・終わり・くり返し）を記録して確かめます。出題数・時間は開発用の設定で短くします。
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
const D = { bgm: 116.3, disarmV2: 1.2, oldDisarm: 0.6, throw: 0.78, explosion: 1.28, hit: 3.37, defeat: 4.28, laugh: 4.49, cry: 3.55, clear: 5.9, victory: 2.98, lossLine: 2.01 };
/** 読み込んだ音の長さは、登録の長さと少しずれます（MP3 の読み込みの都合） */
const near = (d: number, want: number, tol = 0.1) => Math.abs(d - want) < tol;

async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __a: Rec[]; __m: Mark[]; __ctx: AudioContext[]; __lc?: string; __lr?: string; __lh?: string };
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
    const mark = (k: string) => w.__m.push([performance.now() - t0, k]);
    new MutationObserver(() => {
      const c = document.querySelector<HTMLElement>('[data-testid="bowie-curtain"]');
      const ck = c ? `curtain-${c.dataset.phase}` : 'no-curtain';
      if (w.__lc !== ck) mark((w.__lc = ck));
      const r = document.querySelector<HTMLElement>('[data-testid="bowie-result"]');
      const rk = r ? `result-${r.dataset.step}` : 'no-result';
      if (w.__lr !== rk) mark((w.__lr = rk));
      const h = document.querySelector('[data-testid="bowie-hero"]');
      const hk = h ? `hero-${Array.from(h.classList).find((x) => x.startsWith('is-') && x !== 'is-on')}` : '';
      if (hk && w.__lh !== hk) mark((w.__lh = hk));
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}
const recs = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[] }).__a);
const marks = (page: Page) => page.evaluate(() => (window as unknown as { __m: Mark[] }).__m);
const at = (m: Mark[], k: string) => m.find(([, x]) => x === k)?.[0] ?? NaN;
const ctxState = (page: Page) => page.evaluate(() => (window as unknown as { __ctx: AudioContext[] }).__ctx.map((c) => c.state));
const bgms = (a: Rec[]) => a.filter((r) => near(r.d, D.bgm, 0.5));
const guide = async (page: Page) => (await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '';
async function solve(page: Page) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.type(await guide(page));
}
/** 「演出を飛ばす」をくり返して戦績の画面へ（v1.7.0：演出の場面には再挑戦のボタンがありません） */
async function toStats(page: Page) {
  const result = page.getByTestId('bowie-result');
  await expect(result).toBeVisible({ timeout: 20_000 });
  for (let i = 0; i < 8 && (await result.getAttribute('data-step')) !== 'stats'; i++) {
    const skip = page.getByTestId('bowie-skip');
    const movie = page.getByTestId('bowie-movie-skip');
    if (await movie.count()) await movie.click().catch(() => undefined);
    else if (await skip.count()) await skip.click().catch(() => undefined);
    await page.waitForTimeout(150);
  }
  await expect(result).toHaveAttribute('data-step', 'stats');
}
async function guest(page: Page, dev?: Record<string, unknown>) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  if (dev) await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
}
/** ゲームの選択から入ります（タイトルコールと白・黒の幕のあと、開始待ち） */
async function enter(page: Page) {
  await page.goto('./#/game');
  await page.getByTestId('game-card-bowie-bomb').click();
  await expect(page.getByTestId('bowie-curtain')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('bowie-start')).toBeVisible();
}

test.describe('ボウイの爆弾遊戯：BGM とサウンド設定', () => {
  test('BGM：タイトルコールの間は流さず、ゲーム画面が出てから開始。プレイに入っても流し直さず1つだけ。一時停止で止まり再開で続き。被弾で止まり、再挑戦で最初から1回。ホームで止まる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(90_000);
    await record(page);
    await guest(page, { perStage: 2 });
    await enter(page);
    await expect.poll(async () => bgms(await recs(page)).length, { timeout: 5000 }).toBe(1);
    let a = await recs(page);
    const m = await marks(page);
    // 幕（白・黒）の間は鳴らさず、幕が消えてから（くり返し再生）
    expect(bgms(a)[0]!.s).toBeGreaterThanOrEqual(at(m, 'curtain-reveal'));
    expect(bgms(a)[0]!.loop).toBe(true);
    // 開始してもそのまま（最初から流し直さない）
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toBeVisible();
    await expect(page.getByTestId('bowie-cutin')).toBeHidden({ timeout: 8000 });
    a = await recs(page);
    expect(bgms(a)).toHaveLength(1);
    expect(bgms(a)[0]!.e).toBeNull();
    // 一時停止：音の全体（BGM を含む）が止まり、再開すると続きから
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bowie-paused')).toBeVisible();
    await expect.poll(() => ctxState(page)).toEqual(['suspended']);
    await page.getByTestId('bowie-resume').click();
    await expect(page.getByTestId('bowie-paused')).toBeHidden({ timeout: 4000 });
    await expect.poll(() => ctxState(page)).toEqual(['running']);
    expect(bgms(await recs(page))).toHaveLength(1);
    // 被弾で BGM が止まる
    await expect(page.getByTestId('bowie-result')).toBeVisible({ timeout: 15_000 });
    await expect.poll(async () => bgms(await recs(page))[0]!.e, { timeout: 3000 }).not.toBeNull();
    await toStats(page);
    // 再挑戦：最初から1回だけ
    await page.getByTestId('bowie-retry').click();
    await expect.poll(async () => bgms(await recs(page)).length, { timeout: 5000 }).toBe(2);
    await page.waitForTimeout(800);
    a = await recs(page);
    expect(bgms(a).filter((r) => r.e === null)).toHaveLength(1);
    // ゲーム選択へ：すべて止まる
    await toStats(page);
    await page.getByTestId('bowie-select').click();
    await expect(page).toHaveURL(/#\/game$/);
    await page.waitForTimeout(500);
    expect((await recs(page)).filter((r) => r.e === null)).toHaveLength(0);
  });

  test('サウンド設定：オン・オフ、音楽・効果音・ボイスの音量（0〜100％）を別々に変えられ、この端末に保存される。「デフォルトに戻す」で初期値。一時停止中の設定ではゲームも入力も進まない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await guest(page, { perStage: 2 });
    await page.goto('./#/game/bowie');
    await page.getByTestId('bowie-sound-open').click();
    const panel = page.getByTestId('bowie-sound-settings');
    await expect(panel).toBeVisible();
    // 初期値：サウンド オン・音楽 20％・効果音 80％・ボイス 100％
    await expect(page.getByTestId('bss-on')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('bss-music-value')).toHaveText('20％');
    await expect(page.getByTestId('bss-sfx-value')).toHaveText('80％');
    await expect(page.getByTestId('bss-voice-value')).toHaveText('100％');
    await expect(page.getByTestId('bss-default')).toBeDisabled();
    // それぞれ別に変える（設定中のスペースでゲームは始まらない）
    await page.getByTestId('bss-music').fill('0');
    await page.getByTestId('bss-sfx').fill('45');
    await page.getByTestId('bss-voice').fill('70');
    await page.getByTestId('bss-voice').press('ArrowLeft');
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await expect(page.getByTestId('bss-music-value')).toHaveText('0％');
    await expect(page.getByTestId('bss-sfx-value')).toHaveText('45％');
    await expect(page.getByTestId('bss-voice-value')).toHaveText('65％');
    await page.getByTestId('bss-off').click();
    await expect(page.getByTestId('bowie-mute')).toContainText('OFF');
    await page.getByTestId('bss-close').click();
    // 端末に保存：次に開いても同じ（全体の OFF もそのまま。勝手に ON に戻さない）
    await page.goto('./#/home');
    await page.goto('./#/game/bowie');
    await page.getByTestId('bowie-sound-open').click();
    await expect(page.getByTestId('bss-music-value')).toHaveText('0％');
    await expect(page.getByTestId('bss-sfx-value')).toHaveText('45％');
    await expect(page.getByTestId('bss-voice-value')).toHaveText('65％');
    await expect(page.getByTestId('bss-off')).toHaveAttribute('aria-checked', 'true');
    expect(await page.evaluate(() => JSON.parse(localStorage.getItem('sakura-type:bowie-sound:v1') ?? 'null'))).toEqual({ version: 1, music: 0, sfx: 0.45, voice: 0.65 });
    // デフォルトに戻す：このゲームのサウンド設定だけを初期値に
    await page.getByTestId('bss-default').click();
    await expect(page.getByTestId('bss-on')).toHaveAttribute('aria-checked', 'true');
    await expect(page.getByTestId('bss-music-value')).toHaveText('20％');
    await expect(page.getByTestId('bss-sfx-value')).toHaveText('80％');
    await expect(page.getByTestId('bss-voice-value')).toHaveText('100％');
    await page.getByTestId('bss-close').click();
    // プレイ中：一時停止の画面から開く。設定中はゲームが止まり、キーを押しても入力されない
    await page.getByTestId('bowie-start').click();
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 8000 });
    await page.keyboard.press('Escape');
    await page.getByTestId('bowie-sound-open').click();
    await expect(panel).toBeVisible();
    const g = await guide(page);
    const p1 = Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'));
    await page.getByTestId('bss-sfx').focus();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.type(g.slice(0, 3));
    await page.waitForTimeout(1200);
    expect(await guide(page)).toBe(g);
    expect(Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'))).toBeCloseTo(p1, 2);
    await expect(page.getByTestId('bss-sfx-value')).toHaveText('75％');
    await page.getByTestId('bss-close').click();
    await expect(page.getByTestId('bowie-resume')).toBeVisible();
  });

  test('解除の音：新しい音（約1.2秒）が解除1回につき1回だけ。旧解除音は鳴らず、次の投球は音の終わりを待たずにすぐ始まる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    // 各段階4問：1問目の解除のあとは、カットインも段階の切り替えもなく、すぐ次の投球
    await guest(page, { perStage: 4 });
    await enter(page);
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 3000 });
    let a = await recs(page);
    const d1 = a.filter((r) => near(r.d, D.disarmV2, 0.08));
    expect(d1).toHaveLength(1);
    // 次の投球（放つ音）は、解除の音（約1.2秒）の終わりを待たずに、投げる動作（0.35秒）のあとすぐ
    const next = a.filter((r) => near(r.d, D.throw, 0.08)).find((t) => t.s > d1[0]!.s)!;
    expect(next.s - d1[0]!.s).toBeLessThan(700);
    await solve(page);
    await page.waitForTimeout(1500);
    a = await recs(page);
    expect(a.filter((r) => near(r.d, D.disarmV2, 0.08))).toHaveLength(2);
    expect(a.filter((r) => r.d > 0.5 && r.d < 0.65)).toHaveLength(0); // 旧解除音（0.6秒）は鳴らない
  });
});

test.describe('ボウイの爆弾遊戯：敗北の声・クリアのダンス', () => {
  test('被弾：BGM を止め、爆発と主人公の被弾の声が同時 → 両方が終わるまで被弾のリアクション → DEFEAT → 煽りの画像と笑い声 → 主人公の鳴き声（結果の画面のまま）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await guest(page, { perStage: 2, timeScale: 0.2 });
    await enter(page);
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 30_000 });
    await expect(page.getByTestId('bowie-taunt')).toHaveCount(1);
    // 鳴き声が終わると、敗北の戦績へ自動で進む
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 4800 + 3800 + 2000 });
    const a = await recs(page);
    const m = await marks(page);
    const one = (want: number) => {
      const list = a.filter((r) => near(r.d, want, 0.12) && !r.loop);
      expect(list, `sound ${want}`).toHaveLength(1);
      return list[0]!;
    };
    const ex = one(D.explosion);
    const hit = one(D.hit);
    const defeat = one(D.defeat);
    const laugh = one(D.laugh);
    const cry = one(D.cry);
    // 爆発と被弾の声は同時に。BGM はそこで止まる
    expect(Math.abs(ex.s - hit.s)).toBeLessThan(60);
    expect(bgms(a)[0]!.e!).toBeLessThan(hit.s + 300);
    // 被弾のリアクション（主人公の被弾の顔）は、声が終わるまで続き、そのあと DEFEAT（声と重ならない）
    expect(at(m, 'hero-is-hit')).toBeLessThanOrEqual(hit.s + 100);
    expect(defeat.s).toBeGreaterThanOrEqual(Math.max(ex.e!, hit.e!) - 30);
    expect(Math.abs(at(m, 'result-defeat') - defeat.s)).toBeLessThan(150);
    // 笑い声が終わってから主人公の鳴き声（結果の画面のまま）
    expect(laugh.s).toBeGreaterThanOrEqual(defeat.e! - 30);
    expect(cry.s).toBeGreaterThanOrEqual(laugh.e! - 30);
    expect(cry.e).not.toBeNull();
    // 煽りの画像は鳴き声の間もそのまま。鳴き声が終わってから戦績
    expect(at(m, 'result-stats')).toBeGreaterThanOrEqual(cry.e! - 30);
    expect(a.filter((r) => near(r.d, D.defeat, 0.12))).toHaveLength(1);
    await expect(page.getByTestId('bowie-final-score')).toBeVisible();
    await expect(page.getByTestId('bowie-retry')).toBeVisible();
  });

  test('敗北の演出を飛ばす：煽りの画像1枚と、笑い声 → 鳴き声を各1回。鳴き声の途中で飛ばすと戦績へ（声は止まり、あとから鳴らない）。再挑戦で音が残らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await guest(page, { perStage: 2, timeScale: 0.2 });
    await enter(page);
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 30_000 });
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'taunt');
    await page.waitForTimeout(4800 + 800);
    let a = await recs(page);
    expect(a.filter((r) => near(r.d, D.laugh, 0.12))).toHaveLength(1);
    const cry = a.filter((r) => near(r.d, D.cry, 0.12));
    expect(cry).toHaveLength(1);
    expect(cry[0]!.e).toBeNull();
    // 鳴き声の途中で飛ばす → すぐ戦績（同じ声は流し直さない）。連打しても戦績のまま
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'stats');
    await page.waitForTimeout(400);
    a = await recs(page);
    expect(a.filter((r) => near(r.d, D.cry, 0.12))[0]!.e).not.toBeNull();
    expect(a.filter((r) => near(r.d, D.cry, 0.12))).toHaveLength(1);
    expect(a.filter((r) => near(r.d, D.laugh, 0.12))).toHaveLength(1);
    expect(a.filter((r) => near(r.d, D.defeat, 0.12))).toHaveLength(1);
    // 再挑戦：結果の画面が消え、前の音は残らない
    await page.getByTestId('bowie-retry').click();
    await expect(result).toHaveCount(0);
    await page.waitForTimeout(300);
    a = await recs(page);
    expect(a.filter((r) => r.e === null && !r.loop)).toHaveLength(0);
  });

  test('全問クリア：BGM を止め、クリアの曲を1回だけ流して主人公が踊る（両手を上げた姿・下げた姿を交互に）→ 曲が終わると VICTORY → 絶望のセリフ。ダンスは飛ばせる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(90_000);
    await record(page);
    await guest(page, { perStage: 1 });
    await enter(page);
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    const dance = page.getByTestId('bowie-dance');
    await expect(dance).toBeVisible();
    // ステージの背景の上で、2枚の姿を交互に（同じ位置・同じ大きさ）
    expect(await dance.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('stage_background');
    const up = page.getByTestId('bowie-dance-up');
    const down = page.getByTestId('bowie-dance-down');
    // 同じ瞬間に測ります（踊っているため、測る時刻がずれると位置も変わります）
    const [ru, rd] = await page.evaluate(() =>
      ['bowie-dance-up', 'bowie-dance-down'].map((id) => {
        const r = document.querySelector(`[data-testid="${id}"]`)!.getBoundingClientRect();
        return [r.x, r.y, r.width, r.height].map((v) => Math.round(v));
      }),
    );
    expect(ru).toEqual(rd);
    const seen = new Set<string>();
    for (let i = 0; i < 12; i++) {
      seen.add(await up.evaluate((e) => getComputedStyle(e).opacity));
      await page.waitForTimeout(70);
    }
    expect(seen).toEqual(new Set(['0', '1']));
    // 入力・投球は終わっている
    await page.keyboard.type('abc');
    await expect(page.getByTestId('bowie-text')).toHaveCount(0);
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 10_000 });
    await expect(result).toHaveAttribute('data-step', 'despair', { timeout: 6000 });
    // 敗北のセリフが終わると、勝利の戦績へ自動で進む
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 6000 });
    const a = await recs(page);
    const clear = a.filter((r) => near(r.d, D.clear, 0.12));
    const victory = a.filter((r) => near(r.d, D.victory, 0.1));
    const loss = a.filter((r) => near(r.d, D.lossLine, 0.1));
    expect(clear).toHaveLength(1);
    expect(clear[0]!.loop).toBe(false);
    expect(victory).toHaveLength(1);
    expect(loss).toHaveLength(1);
    expect(bgms(a)[0]!.e!).toBeLessThan(clear[0]!.s + 300);
    expect(victory[0]!.s).toBeGreaterThanOrEqual(clear[0]!.e! - 30);
    expect(loss[0]!.s).toBeGreaterThanOrEqual(victory[0]!.e! - 30);
    expect(at(await marks(page), 'result-stats')).toBeGreaterThanOrEqual(loss[0]!.e! - 30);
    // 再挑戦して、もう一度クリア → ダンスを飛ばすと、曲が止まってクリアの表示へ（あとから VICTORY は鳴らない）
    await page.getByTestId('bowie-retry').click();
    for (let i = 0; i < 4; i++) await solve(page);
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    await page.waitForTimeout(1000);
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'despair');
    await expect(page.getByTestId('bowie-dance')).toHaveCount(0);
    await page.waitForTimeout(5500);
    const b = await recs(page);
    const clear2 = b.filter((r) => near(r.d, D.clear, 0.12));
    expect(clear2).toHaveLength(2);
    expect(clear2[1]!.e! - clear2[1]!.s).toBeLessThan(2500);
    expect(b.filter((r) => near(r.d, D.victory, 0.1))).toHaveLength(1);
    // ダンスを飛ばしても、ボウイの絶望と敗北のセリフ（1回）を経て戦績へ
    expect(b.filter((r) => near(r.d, D.lossLine, 0.1))).toHaveLength(2);
    await expect(result).toHaveAttribute('data-step', 'stats');
  });

  test('音を OFF・音楽の音量0・音声の読み込みに失敗しても、被弾のリアクションとクリアのダンスは音の長さだけ進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await record(page);
    // 音楽の音量 0（サウンドはオン）：ダンスは曲の長さだけ
    await guest(page, { perStage: 1 });
    await page.evaluate(() => localStorage.setItem('sakura-type:bowie-sound:v1', JSON.stringify({ version: 1, music: 0, sfx: 0.8, voice: 1 })));
    await enter(page);
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 10_000 });
    let m = await marks(page);
    expect(at(m, 'result-victory') - at(m, 'result-dance')).toBeGreaterThanOrEqual(5700);
    // 音を OFF：被弾のリアクション（被弾の声の長さ）のあと DEFEAT
    await toStats(page);
    await page.getByTestId('bowie-select').click();
    await page.evaluate(() => sessionStorage.setItem('sakura-type:bowie-dev', JSON.stringify({ perStage: 1, timeScale: 0.2 })));
    await page.goto('./#/game/bowie');
    await page.getByTestId('bowie-mute').click();
    await expect(page.getByTestId('bowie-mute')).toContainText('OFF');
    await page.getByTestId('bowie-start').click();
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 20_000 });
    m = await marks(page);
    const hitAt = m.filter(([, k]) => k === 'hero-is-hit').at(-1)![0];
    expect(at(m.filter(([t]) => t > hitAt), 'result-defeat') - hitAt).toBeGreaterThanOrEqual(3200);
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 8000 });
  });

  test('音声の読み込みに失敗しても、ダンス・被弾のリアクション・結果の画面へ進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await page.route('**/*.mp3', (r) => r.abort());
    await guest(page, { perStage: 1 });
    await enter(page);
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance');
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 10_000 });
    const m = await marks(page);
    expect(at(m, 'result-victory') - at(m, 'result-dance')).toBeGreaterThanOrEqual(5700);
    await expect(result).toHaveAttribute('data-step', 'despair', { timeout: 6000 });
  });

  test('画面の大きさ：サウンド設定とクリアのダンスが画面に収まる（PC・Surface・タブレット・スマートフォン）', async ({ page }, info) => {
    test.setTimeout(60_000);
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await guest(page, { perStage: 1 });
    await page.goto('./#/game/bowie');
    const vp = page.viewportSize()!;
    const inView = async (sel: string) => {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x, sel).toBeGreaterThanOrEqual(-0.5);
      expect(b.y, sel).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(vp.height + 0.5);
    };
    await page.getByTestId('bowie-sound-open').click();
    for (const id of ['bss-on', 'bss-default', 'bss-music', 'bss-sfx', 'bss-voice', 'bss-close']) await inView(`[data-testid="${id}"]`);
    await page.screenshot({ path: test.info().outputPath(`sound-${info.project.name}.png`) });
    await page.getByTestId('bss-close').click();
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 4; i++) await solve(page);
    await skipMovie(page);
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'dance');
    await page.waitForTimeout(500);
    await inView('[data-testid="bowie-dance"]');
    await inView('.bowie-dance-sway');
    await inView('[data-testid="bowie-skip"]');
    await page.screenshot({ path: test.info().outputPath(`dance-${info.project.name}.png`) });
  });
});
