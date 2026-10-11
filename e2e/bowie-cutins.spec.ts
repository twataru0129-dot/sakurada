/**
 * ボウイの爆弾遊戯：回ごとのカットイン（画像・セリフ）と、敗北の DEFEAT の画像（v1.5.3）。
 * 出題数は開発用の設定（sessionStorage）で各段階2問にします（カットインは各段階の1問目のあと）。
 */
import { expect, test, type Page } from '@playwright/test';

const DEV = 'sakura-type:bowie-dev';
type Rec = { d: number; s: number; e: number | null };
type Mark = [number, string];

async function open(page: Page, dev: Record<string, unknown>, opts: { mute?: boolean } = {}) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
  await page.goto('./#/game/bowie');
  const mute = page.getByTestId('bowie-mute');
  if (opts.mute && (await mute.textContent())?.includes('ON')) await mute.click();
  await expect(mute).toContainText(opts.mute ? 'OFF' : 'ON');
  // 鳴った音（長さ・始まり・終わり）と、カットイン・結果の画面の切り替えを、時刻つきで記録します
  await page.evaluate(() => {
    const w = window as unknown as { __a: Rec[]; __m: Mark[]; __lc?: string; __lr?: string };
    w.__a = [];
    w.__m = [];
    const t0 = performance.now();
    const create = AudioContext.prototype.createBufferSource;
    AudioContext.prototype.createBufferSource = function (this: AudioContext) {
      const src = create.call(this);
      const start = src.start.bind(src);
      src.start = (...args: Parameters<typeof src.start>) => {
        const rec: Rec = { d: src.buffer?.duration ?? 0, s: performance.now() - t0, e: null };
        w.__a.push(rec);
        src.addEventListener('ended', () => (rec.e = performance.now() - t0));
        start(...args);
      };
      return src;
    };
    new MutationObserver(() => {
      const c = document.querySelector<HTMLElement>('[data-testid="bowie-cutin"]');
      const k = c ? `cutin${c.dataset.cutin}` : 'none';
      if (w.__lc !== k) {
        w.__lc = k;
        w.__m.push([performance.now() - t0, k]);
      }
      const r = document.querySelector<HTMLElement>('[data-testid="bowie-result"]');
      const rk = r ? `result-${r.dataset.step}` : '';
      if (rk && w.__lr !== rk) {
        w.__lr = rk;
        w.__m.push([performance.now() - t0, rk]);
      }
    }).observe(document.body, { subtree: true, childList: true, attributes: true });
  });
}
const rec = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[]; __m: Mark[] }).__a);
const marks = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[]; __m: Mark[] }).__m);
const guide = async (page: Page) => (await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '';
async function solve(page: Page) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.type(await guide(page));
}
/** 音の長さ（実際に読み込んだ長さ。MP3 の読み込みで登録の長さと少しずれます） */
const near = (d: number, want: number) => Math.abs(d - want) < 0.12;
const VOICES = [1.541, 2.429, 3.37, 1.776];
const DEFEAT = 4.284;
const LAUGH = 4.493;

test.describe('ボウイの爆弾遊戯：回ごとのカットインと DEFEAT の画像', () => {
  test('1回目は従来の画像とセリフ、2〜4回目は回ごとの専用の画像とセリフ。セリフは1回だけで最後まで流れてから画像が抜ける。カットイン中は爆弾が止まる。被弾 → 爆発 → DEFEAT の画像と音声 → 煽りの画像1枚と笑い声1回', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(150_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await open(page, { perStage: 2 });
    await page.getByTestId('bowie-start').click();
    const cut = page.getByTestId('bowie-cutin');
    const images = ['speed_cutin', 'bowie_cutin_02', 'bowie_cutin_03', 'bowie_cutin_04'];
    for (let i = 0; i < 8; i++) {
      await solve(page);
      if (i % 2 === 0) {
        const no = i / 2 + 1;
        await expect(cut).toHaveAttribute('data-cutin', String(no));
        await expect(page.getByTestId('bowie-cutin-img')).toHaveAttribute('src', new RegExp(images[no - 1]!));
        // 2〜4回目はセリフの文字を重ねない（画像にも文字はありません）
        if (no > 1) await expect(cut).toHaveAttribute('aria-label', 'ボウイの加速のカットイン');
        else await expect(cut).toHaveAttribute('aria-label', 'ボウイ「少しテンポを落とそうか」');
        await expect(cut).not.toContainText(/./);
        // 画面全体を覆い、画像は縦横比を保って全体が見える
        await page.waitForTimeout(600);
        const box = (await cut.boundingBox())!;
        expect([box.width, box.height]).toEqual([1368, 912]);
        const img = await page.getByTestId('bowie-cutin-img').evaluate((e: HTMLImageElement) => ({ fit: getComputedStyle(e).objectFit, w: e.naturalWidth, h: e.naturalHeight }));
        expect(img).toEqual({ fit: 'contain', w: 1672, h: 941 });
        // カットイン中は爆弾が出ず、入力も受け付けない
        await expect(page.getByTestId('bowie-bomb')).toBeHidden();
        await page.keyboard.type('zzz');
        await expect(cut).toBeHidden({ timeout: 8000 });
        // 投げ直した爆弾は最初の位置から（カットインの時間は足されません）
        await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 8000 });
        expect(Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'))).toBeLessThan(0.15);
      }
    }
    // 8問をすべて解除して勝利（敗北の流れは次のテストで確認します）
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-kind', 'win', { timeout: 10_000 });
    const a = await rec(page);
    const m = await marks(page);
    // カットインごとに、その回のセリフが1回だけ鳴り、画像が抜ける（抜け始める）前に最後まで終わっている
    const spans: [number, number][] = [];
    for (let n = 1; n <= 4; n++) {
      const s = m.find(([, k]) => k === `cutin${n}`)![0];
      const e = m.find(([t, k]) => t > s && k === 'none')![0];
      spans.push([s, e]);
      // セリフは画像が入りきってから（入り始めと同時に鳴る「シャキーン」・地鳴りとは別）。地鳴り（1.83秒）と取り違えないよう、始まりの時刻で分けます
      expect(a.filter((r) => r.s >= s - 5 && r.s < s + 150 && near(r.d, 0.836)), `cutin ${n} shine`).toHaveLength(1);
      const voices = a.filter((r) => r.s >= s + 150 && r.s <= e && near(r.d, VOICES[n - 1]!));
      expect(voices, `cutin ${n} voice`).toHaveLength(1);
      expect(voices[0]!.e, `cutin ${n} voice ended`).not.toBeNull();
      expect(voices[0]!.e!).toBeLessThanOrEqual(e - 250 + 30); // 抜け始める前に終わる
      // 全体の長さ：入る＋セリフ＋余韻＋抜ける
      expect(e - s).toBeGreaterThanOrEqual((0.25 + VOICES[n - 1]! - 0.12 + 0.16 + 0.25) * 1000);
    }
    // 1回目のセリフ（約1.5秒）は、ほかの回のセリフとして鳴っていない（回ごとに対応）
    for (let n = 2; n <= 4; n++) expect(a.filter((r) => r.s >= spans[n - 1]![0] + 150 && r.s <= spans[n - 1]![1] && near(r.d, VOICES[0]!))).toHaveLength(0);
  });

  test('被弾：爆発 → DEFEAT の画像を画面全体に（セリフ・点数・操作の案内なし）と敗北の音声1回 → 音声が終わると煽りの画像1枚と笑い声1回', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await open(page, { perStage: 2, timeScale: 0.2 });
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    const defeat = page.getByTestId('bowie-defeat');
    await expect(defeat).toHaveAttribute('src', /bowie_defeat/);
    await expect.poll(() => defeat.evaluate((e: HTMLImageElement) => e.complete && e.naturalWidth === 1672)).toBe(true);
    expect(await defeat.evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
    // 点数・見出し・案内は出さない（飛ばすボタンだけを画像の外に置きます）
    await expect(page.getByTestId('bowie-final-score')).toHaveCount(0);
    await expect(result).not.toContainText(/ゲームオーバー|点|Tap|タップ|続ける/);
    const img = (await defeat.boundingBox())!;
    const bar = (await page.locator('.bowie-defeat-bar').boundingBox())!;
    expect(img.y + img.height).toBeLessThanOrEqual(bar.y + 0.5);
    await expect(result).toHaveAttribute('data-step', 'taunt', { timeout: 8000 });
    await expect(page.getByTestId('bowie-taunt')).toHaveCount(1);
    await expect(page.getByTestId('bowie-final-score')).toHaveText('0');
    await page.waitForTimeout(5000);
    const a = await rec(page);
    const m = await marks(page);
    const dStart = m.find(([, k]) => k === 'result-defeat')![0];
    const tStart = m.find(([, k]) => k === 'result-taunt')![0];
    const explosion = a.filter((r) => near(r.d, 1.28));
    const defeats = a.filter((r) => near(r.d, DEFEAT));
    const laughs = a.filter((r) => near(r.d, LAUGH));
    expect(explosion).toHaveLength(1);
    expect(defeats).toHaveLength(1);
    expect(laughs).toHaveLength(1);
    // 爆発のあとに DEFEAT（画像と音声が同時）、音声が終わってから煽りの画面と笑い声
    expect(Math.abs(defeats[0]!.s - dStart)).toBeLessThan(150);
    expect(explosion[0]!.e!).toBeLessThanOrEqual(dStart + 50);
    expect(tStart).toBeGreaterThanOrEqual(defeats[0]!.e! - 50);
    expect(Math.abs(laughs[0]!.s - tStart)).toBeLessThan(150);
  });

  test('音を OFF にしても、カットインはセリフの長さだけ・DEFEAT は敗北の音声の長さだけ表示して進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await open(page, { perStage: 2 }, { mute: true });
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toHaveAttribute('data-cutin', '1');
    await expect(page.getByTestId('bowie-cutin')).toBeHidden({ timeout: 8000 });
    await solve(page);
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toHaveAttribute('data-cutin', '2');
    await expect(page.getByTestId('bowie-cutin')).toBeHidden({ timeout: 8000 });
    // 次の問題は打たずに被弾（2段階目の後半：約5.5秒）
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'taunt', { timeout: 8000 });
    const m = await marks(page);
    const span = (k: string) => {
      const s = m.find(([, x]) => x === k)![0];
      return m.find(([t, x]) => t > s && x !== k)![0] - s;
    };
    expect(span('cutin1')).toBeGreaterThanOrEqual(2150);
    expect(span('cutin2')).toBeGreaterThanOrEqual(3000);
    expect(span('result-defeat')).toBeGreaterThanOrEqual(DEFEAT * 1000 - 100);
  });

  test('音声の読み込みに失敗しても、カットイン・DEFEAT・結果の画面へ進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await page.route('**/*.mp3', (r) => r.abort());
    await open(page, { perStage: 2, timeScale: 0.3 });
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toBeVisible();
    await expect(page.getByTestId('bowie-cutin')).toBeHidden({ timeout: 8000 });
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'taunt', { timeout: 10_000 });
    await expect(page.getByTestId('bowie-taunt')).toHaveCount(1);
  });

  test('DEFEAT の間に「演出を飛ばす」：煽りの画像1枚と笑い声1回だけ。敗北の音声はあとから鳴らない。再挑戦・ホームで前の音と画面が残らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await open(page, { perStage: 2, timeScale: 0.2 });
    await page.getByTestId('bowie-start').click();
    const result = page.getByTestId('bowie-result');
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    await page.waitForTimeout(500);
    await page.getByTestId('bowie-skip').click();
    await expect(result).toHaveAttribute('data-step', 'taunt');
    await expect(page.getByTestId('bowie-taunt')).toHaveCount(1);
    const id = await page.getByTestId('bowie-taunt').getAttribute('data-taunt-id');
    await page.waitForTimeout(5500);
    // 表示中は同じ1枚のまま
    await expect(page.getByTestId('bowie-taunt')).toHaveAttribute('data-taunt-id', id!);
    let a = await rec(page);
    expect(a.filter((r) => near(r.d, LAUGH))).toHaveLength(1);
    expect(a.filter((r) => near(r.d, DEFEAT))).toHaveLength(1);
    // 飛ばした敗北の音声は止まっている（最後まで鳴った記録の終わりが、飛ばした時刻のすぐあと）
    const d = a.find((r) => near(r.d, DEFEAT))!;
    expect(d.e! - d.s).toBeLessThan(DEFEAT * 1000 - 1000);
    // 再挑戦：結果の画面が消え、新しいゲームの音だけ
    await page.getByTestId('bowie-retry').click();
    await expect(result).toHaveCount(0);
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 8000 });
    a = await rec(page);
    expect(a.filter((r) => near(r.d, LAUGH) && r.e === null)).toHaveLength(0);
    // もう一度負けて、すぐホームへ
    await expect(result).toHaveAttribute('data-step', 'defeat', { timeout: 15_000 });
    await page.getByTestId('bowie-skip').click();
    await page.getByTestId('bowie-home').click();
    await expect(page).toHaveURL(/#\/home/);
    await expect(result).toHaveCount(0);
    await page.waitForTimeout(800);
    a = await rec(page);
    expect(a.filter((r) => r.e === null)).toHaveLength(0);
  });

  test('画面の大きさ：DEFEAT・煽り・カットインの画像が縦横比を保ったまま画面に収まる（PC・Surface・タブレット・スマートフォン）', async ({ page }, info) => {
    test.setTimeout(60_000);
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1280, height: 720 });
    await open(page, { perStage: 2, timeScale: 0.4 });
    await page.getByTestId('bowie-start').click();
    const vp = page.viewportSize()!;
    const inside = async (sel: string) => {
      const b = (await page.locator(sel).boundingBox())!;
      // object-fit: contain の中で実際に描かれる範囲
      const { w, h } = await page.locator(sel).evaluate((e: HTMLImageElement) => ({ w: e.naturalWidth, h: e.naturalHeight }));
      const scale = Math.min(b.width / w, b.height / h);
      expect(scale, sel).toBeGreaterThan(0);
      expect(b.x).toBeGreaterThanOrEqual(-0.5);
      expect(b.y).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height).toBeLessThanOrEqual(vp.height + 0.5);
      expect(await page.locator(sel).evaluate((e) => getComputedStyle(e).objectFit)).toBe('contain');
    };
    await solve(page);
    await expect(page.getByTestId('bowie-cutin')).toBeVisible();
    await page.waitForTimeout(300);
    await inside('[data-testid="bowie-cutin-img"]');
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-step', 'defeat', { timeout: 20_000 });
    await inside('[data-testid="bowie-defeat"]');
    await page.getByTestId('bowie-skip').click();
    await expect(page.getByTestId('bowie-taunt')).toBeVisible();
    const t = (await page.getByTestId('bowie-taunt').boundingBox())!;
    expect(t.x + t.width).toBeLessThanOrEqual(vp.width + 0.5);
    expect(t.y + t.height).toBeLessThanOrEqual(vp.height + 0.5);
    await expect(page.getByTestId('bowie-retry')).toBeInViewport();
    await expect(page.getByTestId('bowie-home')).toBeInViewport();
    await page.screenshot({ path: test.info().outputPath(`taunt-${info.project.name}.png`) });
  });
});
