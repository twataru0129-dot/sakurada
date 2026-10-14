/**
 * ボウイの爆弾遊戯：最終形態と最終決戦（v1.8.0）。
 * 出題数・時間の倍率は開発用の設定で縮めます（変身は「第4段階へ入る段階アップ」で起きるので、本番の60問のあとと同じ条件です）。
 * 鳴った音は Web Audio の再生（音源の長さ・始まり）を記録して確かめます。
 */
import { expect, test, type Page } from '@playwright/test';

/** クリアのスペシャルムービー（v1.9.0）を「ムービーをスキップ」で飛ばします（そのあとはダンスから。ムービー自体は bowie-movie.spec.ts で確かめます） */
async function skipMovie(page: Page) {
  await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'movie', { timeout: 20_000 });
  await page.getByTestId('bowie-movie-skip').click();
}


const DEV = 'sakura-type:bowie-dev';
type Rec = { d: number; s: number; delay: number; loop: boolean };
type Sample = [number, string, string, string];

async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __a: Rec[]; __f: Sample[]; __t0: number };
    w.__a = [];
    w.__f = [];
    w.__t0 = performance.now();
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const src = create.call(this);
      const start = src.start.bind(src);
      src.start = (...args: Parameters<typeof src.start>) => {
        w.__a.push({ d: src.buffer?.duration ?? 0, s: performance.now() - w.__t0, delay: Math.max(0, (args[0] ?? 0) - this.currentTime) * 1000, loop: src.loop });
        start(...args);
      };
      return src;
    };
    // 毎フレーム：背景・ボウイの姿・状態（同じフレームで背景と姿が変わることを確かめるため）
    const tick = () => {
      const st = document.querySelector<HTMLElement>('[data-testid="bowie-stage-area"]');
      const v = document.querySelector<HTMLElement>('[data-testid="bowie-villain"]');
      const m = document.querySelector<HTMLElement>('[data-testid="bowie-main"]');
      if (st && v && m) {
        const k: Sample = [performance.now() - w.__t0, st.dataset.background ?? '', v.dataset.sprite ?? '', m.dataset.phase ?? ''];
        const last = w.__f.at(-1);
        if (!last || last[1] !== k[1] || last[2] !== k[2] || last[3] !== k[3]) w.__f.push(k);
      }
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  });
}
const recs = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[] }).__a);
const frames = (page: Page) => page.evaluate(() => (window as unknown as { __f: Sample[] }).__f);
const now = (page: Page) => page.evaluate(() => performance.now() - (window as unknown as { __t0: number }).__t0);
const near = (d: number, want: number, tol = 0.03) => Math.abs(d - want) < tol;

async function setup(page: Page, dev: Record<string, unknown>) {
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
/** 第4段階の始まり（変身のある段階アップ）まで進めます（各段階 perStage 問） */
async function toStage4(page: Page, perStage: number) {
  for (let i = 0; i < perStage * 3; i++) await solve(page);
  await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '4');
}
const form = (page: Page) => page.getByTestId('bowie-main').getAttribute('data-form');

test.describe('ボウイの爆弾遊戯：最終形態', () => {
  test('59問までは通常、60問のあとの段階アップの中で1回だけ変身：背景と姿は同じフレームで切り替わり、魔力の上昇音・衝撃音は各1回。ボイスは1回で途中で切らず、通常BGMから最終BGMへ1回切替。演出中のキーは持ち越さない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 2; i++) await solve(page);
    // 3問目（本番の60問目にあたる）を解除するまでは通常
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 30_000 });
    expect(await form(page)).toBe('normal');
    await expect(page.getByTestId('bowie-stage-area')).toHaveAttribute('data-background', 'normal');
    await expect(page.getByTestId('bowie-villain')).toHaveAttribute('data-sprite', /^bowie_(idle|release_4|laugh)$/);
    const bgmBefore = (await recs(page)).filter((r) => r.d > 100).length;
    await solve(page);
    const t0 = await now(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '4');
    await expect(page.getByTestId('bowie-levelup-title')).toHaveText('終焉の遊戯');
    await expect(page.getByTestId('bowie-wait')).toHaveText('ボウイがレベルアップしました');
    await expect(page.getByTestId('bowie-transform')).toBeVisible();
    // 演出の間のキーは判定にもミスにも入らない
    await page.keyboard.type('qzxk');
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 3000 });
    await page.keyboard.type('qzxk');
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('.bowie-romaji .r-done')).toHaveCount(0);
    await expect(page.getByTestId('bowie-transform')).toHaveCount(0);
    const f = await frames(page);
    const a = await recs(page);
    // 背景と姿の組み合わせ：通常の背景に最終形態の姿、最終の背景に通常の姿のフレームは一度もない
    for (const [, bg, sprite] of f) expect(`${bg}:${sprite.startsWith('bowie_final') ? 'final' : 'normal'}`).toMatch(/^(normal:normal|final:final)$/);
    const switchAt = f.find(([, bg]) => bg === 'final')![0];
    // 変身は段階アップの始まりから約0.82秒（ピーク）。そのあと通常に戻らない
    expect(switchAt - t0).toBeGreaterThan(1650);
    expect(switchAt - t0).toBeLessThan(2150);
    expect(f.filter(([t, bg]) => t > switchAt && bg !== 'final')).toHaveLength(0);
    // 投球は変身の余韻とボイスの両方が終わってから（ボイス 1.54 秒＋0.45＋0.3）
    const throwAt = f.find(([t, , , ph]) => t > t0 && ph === 'throwing')![0];
    expect(throwAt - t0).toBeGreaterThan(3150);
    const during = a.filter((r) => r.s >= t0 - 50 && r.s <= throwAt);
    expect(during.filter((r) => near(r.d, 1.541, 0.1))).toHaveLength(1); // 「勝負を決めますよ！」
    expect(during.filter((r) => near(r.d, 0.47))).toHaveLength(1); // 魔力の上昇音（ノイズ）
    expect(during.filter((r) => near(r.d, 0.7))).toHaveLength(1); // 衝撃音（ノイズ）
    // 衝撃音はピークの瞬間
    const impact = during.find((r) => near(r.d, 0.7))!;
    expect(Math.abs(impact.s - switchAt)).toBeLessThan(120);
    // 通常の BGM を流し直さない
    expect(a.filter((r) => near(r.d, 116.3, 0.5)).length).toBe(bgmBefore);
    const finalMusic = a.filter((r) => near(r.d, 347.14, 0.5));
    expect(finalMusic).toHaveLength(1);
    expect(finalMusic[0]!.s - t0).toBeLessThan(200);
    expect(finalMusic[0]!.delay).toBeGreaterThan(850);
    expect(finalMusic[0]!.delay).toBeLessThanOrEqual(1000);
    expect(finalMusic[0]!.loop).toBe(true);
    // 再生予約は段階開始時に1回、音が始まるのは AudioContext 時刻で1秒後。

  });

  test('最終形態の放つ動作：構える → 送り出す → 放つ（合計約350ms）。手を離れた瞬間に手のひらの前から独立した爆弾1個が出て、入力が始まる。足元の位置と大きさはずれない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    await toStage4(page, 1);
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const f = await frames(page);
    // 変身のあとの最初の投球
    const tStart = f.findIndex(([, bg, , ph]) => bg === 'final' && ph === 'throwing');
    const seq = f.slice(tStart).filter(([, , , ph]) => ph === 'throwing').map(([, , s]) => s);
    expect([...new Set(seq)]).toEqual(['bowie_final_release_prepare', 'bowie_final_release_mid', 'bowie_final_release']);
    const flyAt = f.find(([, , , ph], i) => i > tStart && ph === 'flying')!;
    const dur = flyAt[0] - f[tStart]![0];
    expect(dur).toBeGreaterThan(300);
    expect(dur).toBeLessThan(420);
    // 手を離れたあとも「放つ」の姿（余韻）。手に残る爆弾の絵はなく、爆弾は1個だけ
    expect(flyAt[2]).toBe('bowie_final_release');
    await expect(page.locator('[data-testid="bowie-bomb"]')).toHaveCount(1);
    const pos = await page.evaluate(() => {
      const st = document.querySelector<HTMLElement>('[data-testid="bowie-stage-area"]')!.getBoundingClientRect();
      const bomb = document.querySelector<HTMLElement>('[data-testid="bowie-bomb"]')!.getBoundingClientRect();
      const fig = (k: string) => {
        const el = Array.from(document.querySelectorAll<HTMLElement>('.bowie-figure')).find((e) => e.querySelector('img')!.getAttribute('src')!.includes(`/${k}`))!;
        return { left: el.offsetLeft, top: el.offsetTop, w: el.offsetWidth, h: el.offsetHeight };
      };
      return { st, bomb: { x: bomb.x - st.x + bomb.width / 2, y: bomb.y - st.y + bomb.height / 2 }, rel: fig('bowie_final_release'), idle: fig('bowie_final_idle'), prep: fig('bowie_final_release_prepare'), mid: fig('bowie_final_release_mid'), laugh: fig('bowie_final_laugh'), angry: fig('bowie_final_angry') };
    });
    const progress = Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'));
    expect(progress).toBeLessThan(0.15);
    // 爆弾は放つ姿の手のひらの前（画像の左の約2割・上の約3割）から出て、左へ進む
    expect(pos.bomb.x).toBeGreaterThan(pos.rel.left - pos.rel.w * 0.35);
    expect(pos.bomb.x).toBeLessThan(pos.rel.left + pos.rel.w * 0.25);
    expect(pos.bomb.y).toBeGreaterThan(pos.rel.top);
    expect(pos.bomb.y).toBeLessThan(pos.rel.top + pos.rel.h * 0.35);
    // 6枚の足元（下端）は同じ線にそろい、同じ倍率（同じ大きさで描かれた待機・構える・送り出すは高さもほぼ同じ）
    const bottoms = [pos.idle, pos.prep, pos.mid, pos.rel, pos.angry, pos.laugh].map((b) => b.top + b.h);
    for (const b of bottoms) expect(Math.abs(b - bottoms[0]!)).toBeLessThan(2);
    expect(Math.abs(pos.prep.h - pos.idle.h)).toBeLessThan(2);
    expect(Math.abs(pos.mid.h - pos.idle.h)).toBeLessThan(2);
  });

  test('変身のあと：解除で怒り（次の投球の絵のあと）、通算70問のあとのカットインだけ最終形態の「払いのける！」（1〜3回目とボイスは同じ）。通常の姿へは戻らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 3, timeScale: 0.4 });
    await page.getByTestId('bowie-start').click();
    const seen: string[] = [];
    for (let i = 0; i < 9; i++) {
      await solve(page);
      const c = page.getByTestId('bowie-cutin');
      if (i % 3 === 0) {
        await expect(c).toBeVisible();
        seen.push((await page.getByTestId('bowie-cutin-img').getAttribute('src')) ?? '');
      }
    }
    expect(seen[0]).toContain('speed_cutin');
    expect(seen[1]).toContain('bowie_cutin_02_text');
    expect(seen[2]).toContain('bowie_cutin_03_text');
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 5000 });
    // 第4段階の1問目（本番の通算70問目のあと）→ 4回目のカットインは最終形態の画像。セリフの字幕は重ねない
    const c4 = await now(page);
    await solve(page);
    const cut = page.getByTestId('bowie-cutin');
    await expect(cut).toHaveAttribute('data-cutin', '4');
    await expect(page.getByTestId('bowie-cutin-img')).toHaveAttribute('src', /bowie_final_cutin_04/);
    expect((await cut.innerText()).trim()).toBe('');
    await expect.poll(() => page.getByTestId('bowie-cutin-img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth === 1672)).toBe(true);
    await expect(cut).toHaveCount(0, { timeout: 10_000 });
    // 4回目のセリフ（読み込んだ長さ 約1.75秒。登場音・地鳴りの約1.8秒とは別）が1回
    const cutinVoices = (await recs(page)).filter((r) => r.s > c4 && near(r.d, 1.75, 0.03));
    expect(cutinVoices).toHaveLength(1);
    // 2問目を解除 → すぐ次の投球（構える〜放つ）→ 怒り → 待機
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const before = (await frames(page)).length;
    await solve(page);
    await expect(page.getByTestId('bowie-villain')).toHaveAttribute('data-sprite', 'bowie_final_angry', { timeout: 3000 });
    await expect(page.getByTestId('bowie-villain')).toHaveAttribute('data-sprite', /bowie_final_(idle|laugh)/, { timeout: 5000 });
    const after = (await frames(page)).slice(before).map(([, , s]) => s);
    const order = after.filter((s, i) => s !== after[i - 1]);
    expect(order.indexOf('bowie_final_release_prepare')).toBeLessThan(order.indexOf('bowie_final_angry'));
    expect(order.indexOf('bowie_final_release')).toBeLessThan(order.indexOf('bowie_final_angry'));
    // 変身のあとは、通常の姿・通常の背景にならない
    const all = await frames(page);
    const fAt = all.findIndex(([, bg]) => bg === 'final');
    for (const [, bg, s] of all.slice(fAt)) {
      expect(bg).toBe('final');
      expect(s).toMatch(/^bowie_final_/);
    }
  });

  test('変身のあとに負けると：赤い背景と高笑いの姿 → DEFEAT → 最終形態版の煽り（1枚・固定）と笑い声 → 鳴き声 → 敗北の戦績。再挑戦は通常から、変身の前に負ければ通常版の煽り', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 1, timeScale: 0.25 });
    await page.getByTestId('bowie-start').click();
    await toStage4(page, 1);
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 5000 });
    // 解除しないで着弾させます
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-phase', 'hit', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-villain')).toHaveAttribute('data-sprite', 'bowie_final_laugh');
    await expect(page.getByTestId('bowie-stage-area')).toHaveAttribute('data-background', 'final');
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 15_000 });
    const taunt = page.getByTestId('bowie-taunt');
    const id = await taunt.getAttribute('data-taunt-id');
    expect(id).toMatch(/^final_(0[1-9]|10)$/);
    await expect(taunt).toHaveAttribute('src', new RegExp(`game_over_${id}`));
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 20_000 });
    // 表示中は同じ画像のまま、笑い声・鳴き声は各1回
    const a = await recs(page);
    // 読み込んだ長さ：笑い声 約4.49秒、鳴き声 約3.52秒（被弾の声 約3.45秒とは別）
    expect(a.filter((r) => near(r.d, 4.45, 0.1))).toHaveLength(1);
    expect(a.filter((r) => near(r.d, 3.52, 0.03))).toHaveLength(1);
    await expect(page.getByTestId('bowie-rank')).toHaveCount(0);
    await expect(page.getByTestId('bowie-remaining')).toContainText('1');
    // 再挑戦：通常の背景・姿から。変身の前（第1段階）に負けると通常版の煽り
    await page.getByTestId('bowie-retry').click();
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'normal');
    await expect(page.getByTestId('bowie-stage-area')).toHaveAttribute('data-background', 'normal');
    await expect(result).toHaveAttribute('data-kind', 'lose', { timeout: 20_000 });
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'normal');
    await page.getByTestId('bowie-skip').click();
    await expect(taunt).toHaveAttribute('data-taunt-id', /^(0[1-9]|10)$/);
  });

  test('変身のあとの勝利：ダンスは最終決戦の背景 → VICTORY → 通常の姿のボウイの絶望（赤い魔力が消える）と敗北のセリフ → 勝利の戦績。音 OFF・飛ばすの連打でも戦績に着く', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 1, timeScale: 0.3 });
    await page.getByTestId('bowie-start').click();
    await toStage4(page, 1);
    await solve(page);
    const result = page.getByTestId('bowie-result');
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance', { timeout: 10_000 });
    expect(await page.getByTestId('bowie-dance').evaluate((el) => el.style.backgroundImage)).toContain('stage_background_final');
    await expect(result).toHaveAttribute('data-step', 'victory', { timeout: 15_000 });
    await expect(result).toHaveAttribute('data-step', 'despair', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-despair')).toHaveAttribute('src', /bowie_despair/);
    await expect(page.getByTestId('bowie-dispel')).toHaveCount(1);
    await expect(page.locator('.bowie-despair-scene')).toHaveAttribute('data-background', 'final');
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-rank')).toBeVisible();
    // 音 OFF で、もう一度：飛ばすを連打しても戦績に着き、前の演出は戻らない
    await page.getByTestId('bowie-retry').click();
    await page.getByTestId('bowie-mute').click();
    await toStage4(page, 1);
    await solve(page);
    await skipMovie(page);
    await expect(result).toHaveAttribute('data-step', 'dance', { timeout: 10_000 });
    for (let i = 0; i < 5; i++) await page.getByTestId('bowie-skip').click({ timeout: 2000 }).catch(() => undefined);
    await expect(result).toHaveAttribute('data-step', 'stats', { timeout: 15_000 });
    await page.waitForTimeout(1500);
    await expect(result).toHaveAttribute('data-step', 'stats');
    // ゲーム選択へ移ると変身の状態も消える
    await page.getByTestId('bowie-select').click();
    await expect(page).toHaveURL(/#\/game$/);
  });

  test('一時停止すると変身も止まり、再開後に1回だけ。ゲーム選択へ移ると変身の音・演出は戻らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await setup(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 3; i++) await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '4');
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('bowie-paused')).toBeVisible();
    await page.waitForTimeout(1500);
    expect(await form(page)).toBe('normal');
    await page.getByTestId('bowie-resume').click();
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 5000 });
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    expect((await recs(page)).filter((r) => near(r.d, 0.7))).toHaveLength(1);
    // 次は、変身の途中で一時停止 → やめる → もう一度：通常から始まり、前の衝撃音は鳴らない
    await page.keyboard.press('Escape');
    await page.getByTestId('bowie-quit').click();
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 3; i++) await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '4');
    const n = (await recs(page)).filter((r) => near(r.d, 0.7)).length;
    await page.keyboard.press('Escape');
    await page.getByTestId('bowie-quit').click();
    await expect(page.getByTestId('bowie-title')).toBeVisible();
    await page.waitForTimeout(1500);
    expect((await recs(page)).filter((r) => near(r.d, 0.7)).length).toBe(n);
  });

  test('視差効果を減らす設定：揺れ・衝撃波・粒子を使わず、短いフェードで背景と姿が同時に変わる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await record(page);
    await setup(page, { perStage: 1 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 3; i++) await solve(page);
    await expect(page.getByTestId('bowie-transform')).toBeVisible();
    const css = await page.evaluate(() => {
      const q = (s: string) => getComputedStyle(document.querySelector(s)!);
      return { ring: q('.btf-ring').display, p: q('.btf-p').display, flash: q('.btf-flash').animationName };
    });
    expect(css).toEqual({ ring: 'none', p: 'none', flash: 'btf-fade' });
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 3000 });
    expect(await page.getByTestId('bowie-stage-area').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    const f = await frames(page);
    for (const [, bg, sprite] of f) expect(`${bg}:${sprite.startsWith('bowie_final') ? 'final' : 'normal'}`).toMatch(/^(normal:normal|final:final)$/);
  });

  test('画面の大きさ（Surface 相当 1368×912・タブレット・スマホ）：最終形態のボウイ・主人公・問題・カットインが見切れない', async ({ page }, info) => {
    test.setTimeout(150_000);
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await setup(page, { perStage: 2, timeScale: 0.4 });
    await page.getByTestId('bowie-start').click();
    for (let i = 0; i < 6; i++) await solve(page);
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-form', 'final', { timeout: 8000 });
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const box = await page.evaluate(() => {
      const r = (s: string) => document.querySelector(s)!.getBoundingClientRect();
      const st = r('[data-testid="bowie-stage-area"]');
      const v = r('[data-testid="bowie-villain"]');
      const h = r('[data-testid="bowie-hero"]');
      const t = r('[data-testid="bowie-text"]');
      return { st, v, h, t, vw: innerWidth, sw: document.documentElement.scrollWidth };
    });
    // 主人公は全身が見え、ボウイは頭から足元までステージの中（コートの裾は右端で切れてもよい）
    expect(box.h.left).toBeGreaterThanOrEqual(box.st.left - 1);
    expect(box.h.bottom).toBeLessThanOrEqual(box.st.bottom + 1);
    expect(box.v.top).toBeGreaterThanOrEqual(box.st.top - 1);
    expect(box.v.bottom).toBeLessThanOrEqual(box.st.bottom + 1);
    expect(box.v.left + box.v.width / 2).toBeLessThan(box.st.right);
    expect(box.t.right).toBeLessThanOrEqual(box.vw + 1);
    expect(box.sw).toBeLessThanOrEqual(box.vw + 1);
    // 4回目のカットイン（最終形態の画像）は縦横比を保って全体が見える
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toHaveAttribute('data-cutin', '4');
    await expect(page.getByTestId('bowie-cutin-img')).toHaveAttribute('src', /bowie_final_cutin_04/);
    await page.waitForTimeout(400);
    const c = await page.getByTestId('bowie-cutin-img').evaluate((img: HTMLImageElement) => {
      const r = img.getBoundingClientRect();
      return { l: r.left, r: r.right, t: r.top, b: r.bottom, ratio: r.width / r.height, fit: getComputedStyle(img).objectFit, vw: innerWidth, vh: innerHeight };
    });
    expect(c.l).toBeGreaterThanOrEqual(-2);
    expect(c.r).toBeLessThanOrEqual(c.vw + 2);
    expect(c.t).toBeGreaterThanOrEqual(-2);
    expect(c.b).toBeLessThanOrEqual(c.vh + 2);
  });
});

test.describe('ボウイの爆弾遊戯：最終決戦の BGM の音量（v1.8.2）', () => {
  test('音楽20％（初期値）：通常の BGM 20％・ボイス中7％のまま、最終決戦の BGM は40％、変身のボイス・70問のカットインの間は20％、終わると40％に戻る。再挑戦は通常の BGM（20％）から', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.addInitScript(() => {
      // AudioParam の操作を記録します：value の代入（各 BGM の固有の音量）・linearRamp（ダッキング）・setTarget（音楽の音量の設定）
      const w = window as unknown as { __g: [number, string, number, number][] };
      w.__g = [];
      // AudioParam ごとの番号（ダッキングは1つの GainNode を何度も上げ下げするため、いちばん多く ramp された番号がダッキングです）
      const ids = new WeakMap<AudioParam, number>();
      let next = 0;
      const id = (p: AudioParam) => {
        if (!ids.has(p)) ids.set(p, next++);
        return ids.get(p)!;
      };
      const t0 = performance.now();
      const desc = Object.getOwnPropertyDescriptor(AudioParam.prototype, 'value')!;
      Object.defineProperty(AudioParam.prototype, 'value', {
        get(this: AudioParam) {
          return desc.get!.call(this);
        },
        set(this: AudioParam, v: number) {
          w.__g.push([performance.now() - t0, 'set', v, id(this)]);
          desc.set!.call(this, v);
        },
      });
      const ramp = AudioParam.prototype.linearRampToValueAtTime;
      AudioParam.prototype.linearRampToValueAtTime = function (this: AudioParam, v: number, t: number) {
        w.__g.push([performance.now() - t0, 'ramp', v, id(this)]);
        return ramp.call(this, v, t);
      };
      const target = AudioParam.prototype.setTargetAtTime;
      AudioParam.prototype.setTargetAtTime = function (this: AudioParam, v: number, t: number, c: number) {
        w.__g.push([performance.now() - t0, 'target', v, id(this)]);
        return target.call(this, v, t, c);
      };
    });
    await setup(page, { perStage: 2 });
    const log = () => page.evaluate(() => (window as unknown as { __g: [number, string, number, number][] }).__g);
    await page.getByTestId('bowie-start').click();
    // 第1〜3段階（通常の BGM）：カットイン3回と段階アップ2回
    for (let i = 0; i < 5; i++) await solve(page);
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 30_000 });
    const t4 = (await log()).length;
    await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '4');
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 15_000 });
    // 第4段階の1問目 → 4回目（70問のあと）のカットイン
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toHaveAttribute('data-cutin', '4');
    await expect(page.getByTestId('bowie-cutin')).toHaveCount(0, { timeout: 10_000 });
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const g = await log();
    const before = g.slice(0, t4);
    const after = g.slice(t4);
    // ダッキングの AudioParam（ramp の回数がいちばん多いもの）だけを見ます（金属音の倍音 0.35 などと区別するため）
    const count = new Map<number, number>();
    for (const [, k, , i] of g) if (k === 'ramp') count.set(i, (count.get(i) ?? 0) + 1);
    const duckId = [...count.entries()].sort((a, b) => b[1] - a[1])[0]![0];
    const ramps = (list: typeof g) => list.filter(([, k, , i]) => k === 'ramp' && i === duckId).map(([, , v]) => v);
    // 音楽の音量の設定は初期値の 20％のまま（強制的に変えない）
    const music = g.filter(([, k]) => k === 'target').map(([, , v]) => v);
    expect(music).toContain(0.2);
    expect(music).not.toContain(0.4);
    // 各 BGM の固有の音量：通常 1.0、最終決戦 2.0（1回だけ）
    const vols = g.filter(([, k, v]) => k === 'set' && (v === 1 || v === 2));
    expect(before.filter(([, k, v]) => k === 'set' && v === 2)).toHaveLength(0);
    expect(after.filter(([, k, v]) => k === 'set' && v === 2)).toHaveLength(1);
    expect(vols.length).toBeGreaterThan(0);
    // ボイスの間の下げ方：通常の BGM は 35％（3回のカットイン＋2回の段階アップ）、最終決戦の BGM は 50％（変身のボイス＋4回目のカットイン）
    const rb = ramps(before);
    const ra = ramps(after);
    expect(rb.filter((v) => v === 0.35).length).toBeGreaterThanOrEqual(5);
    expect(rb).not.toContain(0.5);
    expect(ra.filter((v) => v === 0.5).length).toBeGreaterThanOrEqual(2);
    expect(ra).not.toContain(0.35);
    // ボイス・演出のあとは元の大きさ（1）へ戻す
    expect(ra.at(-1)).toBe(1);
    // 実効の大きさ（音楽の設定 × 曲の固有の音量 × ボイス中の割合）
    expect(0.2 * 1 * 0.35).toBeCloseTo(0.07, 6);
    expect(0.2 * 2).toBeCloseTo(0.4, 6);
    expect(0.2 * 2 * 0.5).toBeCloseTo(0.2, 6);
    // 負けて再挑戦：最終決戦の BGM は止まり、通常の BGM（固有の音量 1.0）から。ボイスの間は 35％に戻る
    await expect(page.getByTestId('bowie-main')).toHaveAttribute('data-phase', 'hit', { timeout: 30_000 });
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-kind', 'lose', { timeout: 15_000 });
    for (let i = 0; i < 3; i++) await page.getByTestId('bowie-skip').click({ timeout: 2000 }).catch(() => undefined);
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'stats', { timeout: 15_000 });
    const n = (await log()).length;
    await page.getByTestId('bowie-retry').click();
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toHaveAttribute('data-cutin', '1');
    await expect(page.getByTestId('bowie-cutin')).toHaveCount(0, { timeout: 10_000 });
    const re = (await log()).slice(n);
    expect(re.filter(([, k, v]) => k === 'set' && v === 2)).toHaveLength(0);
    expect(re.filter(([, k, v]) => k === 'set' && v === 1).length).toBeGreaterThan(0);
    expect(ramps(re)).toContain(0.35);
    expect(ramps(re)).not.toContain(0.5);
  });
});
