/**
 * ボウイの爆弾遊戯：段階アップ（通算20・40・60問の解除のあと）の表示とボイス、開始前の画面（v1.6.1）。
 * 出題数は開発用の設定で各段階1問にします（段階アップは1・2・3問目の解除のあと。カットインは出ません）。
 * 鳴った音は Web Audio の再生（長さ・始まり・終わり）を記録して確かめます。
 */
import { expect, test, type Page } from '@playwright/test';

const DEV = 'sakura-type:bowie-dev';
type Rec = { d: number; s: number; e: number | null; loop: boolean };
type Mark = [number, string];
/** 段階とボイスの対応：第2段階＝212302（3.50秒）、第3段階＝212407（3.76秒）、第4段階＝212220（1.54秒） */
const VOICE: Record<2 | 3 | 4, number> = { 2: 3.5, 3: 3.762, 4: 1.541 };
const TEXT: Record<2 | 3 | 4, [string, string]> = { 2: ['ボウイ覚醒', 'LEVEL 02'], 3: ['力の解放', 'LEVEL 03'], 4: ['終焉の遊戯', 'FINAL LEVEL'] };
const THROW = 0.78;
const near = (d: number, want: number, tol = 0.1) => Math.abs(d - want) < tol;

async function record(page: Page) {
  await page.addInitScript(() => {
    const w = window as unknown as { __a: Rec[]; __m: Mark[]; __osc: number; __ramps: number[]; __lk?: string };
    w.__a = [];
    w.__m = [];
    w.__osc = 0;
    w.__ramps = [];
    const t0 = performance.now();
    const AC = window.AudioContext;
    const ctxs: AudioContext[] = [];
    (w as unknown as { __ctx: AudioContext[] }).__ctx = ctxs;
    const Wrapped = function (this: unknown, opts?: AudioContextOptions) {
      const c = new AC(opts);
      ctxs.push(c);
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
    const osc = AC.prototype.createOscillator;
    AC.prototype.createOscillator = function (this: AudioContext) {
      w.__osc++;
      return osc.call(this);
    };
    // BGM を一時的に下げる・戻す（0.35 → 1）の記録
    const ramp = AudioParam.prototype.linearRampToValueAtTime;
    AudioParam.prototype.linearRampToValueAtTime = function (this: AudioParam, v: number, t: number) {
      if (v === 0.35 || v === 1) w.__ramps.push(v);
      return ramp.call(this, v, t);
    };
    new MutationObserver(() => {
      const l = document.querySelector<HTMLElement>('[data-testid="bowie-levelup"]');
      const k = l ? `levelup-${l.dataset.stage}` : 'no-levelup';
      if (w.__lk !== k) {
        w.__lk = k;
        w.__m.push([performance.now() - t0, k]);
      }
    }).observe(document, { subtree: true, childList: true, attributes: true });
  });
}
const recs = (page: Page) => page.evaluate(() => (window as unknown as { __a: Rec[] }).__a);
const marks = (page: Page) => page.evaluate(() => (window as unknown as { __m: Mark[] }).__m);
const span = (m: Mark[], k: string) => {
  const s = m.find(([, x]) => x === k)![0];
  return m.find(([t, x]) => t > s && x !== k)![0] - s;
};
const guide = async (page: Page) => (await page.getByTestId('bowie-romaji').getAttribute('data-remaining')) ?? '';
async function solve(page: Page) {
  await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 20_000 });
  await page.keyboard.type(await guide(page));
}
async function guest(page: Page, dev: Record<string, unknown> = { perStage: 1 }) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.evaluate(([k, v]) => sessionStorage.setItem(k, v), [DEV, JSON.stringify(dev)] as const);
}
async function enter(page: Page) {
  await page.goto('./#/game');
  await page.getByTestId('game-card-bowie-bomb').click();
  await expect(page.getByTestId('bowie-curtain')).toHaveCount(0, { timeout: 15_000 });
  await expect(page.getByTestId('bowie-start')).toBeVisible();
}

test.describe('ボウイの爆弾遊戯：段階アップ', () => {
  test('通算20・40・60問のあと：中央の帯に「ボウイ覚醒／LEVEL 02」「力の解放／LEVEL 03」「終焉の遊戯／FINAL LEVEL」と金属音、指定のボイスを各1回。ボイスが終わってから投球し、途中の入力は持ち越さない。BGM は流し直さず、ボイスの間は下げて戻す', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await page.setViewportSize({ width: 1368, height: 912 });
    await record(page);
    await guest(page);
    await enter(page);
    await page.getByTestId('bowie-start').click();
    // 第1段階の始まりは、これまでどおりの表示（段階アップの表示は使いません）
    await expect(page.getByTestId('bowie-banner')).toContainText('第1段階');
    await expect(page.getByTestId('bowie-levelup')).toHaveCount(0);
    for (const st of [2, 3, 4] as const) {
      await solve(page);
      const lu = page.getByTestId('bowie-levelup');
      await expect(lu).toHaveAttribute('data-stage', String(st));
      await expect(page.getByTestId('bowie-levelup-title')).toHaveText(TEXT[st][0]);
      await expect(page.getByTestId('bowie-levelup-level')).toHaveText(TEXT[st][1]);
      // 下の欄は統一の案内だけ（長さの説明は出さない）。以前の小さな四角の表示もない
      await expect(page.getByTestId('bowie-wait')).toHaveText('ボウイがレベルアップしました');
      await expect(page.getByTestId('bowie-panel')).not.toContainText(/単語|文章/);
      await expect(page.getByTestId('bowie-banner')).toHaveCount(0);
      // 帯はステージの横いっぱい。後ろのゲーム画面（キャラクター）は見えたまま
      // （帯は横に伸びて出てくるため、動きを含まない大きさで比べます）
      const [bw, bh, sw, sh] = await page.evaluate(() => {
        const b = document.querySelector<HTMLElement>('.blu-band')!;
        const st = document.querySelector<HTMLElement>('[data-testid="bowie-stage-area"]')!;
        return [b.offsetWidth, b.offsetHeight, st.clientWidth, st.clientHeight];
      });
      expect(Math.abs(bw! - sw!)).toBeLessThan(2);
      expect(bh!).toBeLessThan(sh! * 0.6);
      await expect(page.getByTestId('bowie-hero')).toBeVisible();
      // 演出の間のキーは入力にならず、次の問題へ持ち越さない。爆弾は出ない
      await page.keyboard.type('kasimasu');
      await expect(page.getByTestId('bowie-bomb')).toBeHidden();
      await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
      await expect(page.locator('.bowie-romaji .r-done')).toHaveCount(0);
      expect(Number(await page.getByTestId('bowie-bomb').getAttribute('data-progress'))).toBeLessThan(0.2);
    }
    await solve(page);
    await expect(page.getByTestId('bowie-result')).toHaveAttribute('data-kind', 'win', { timeout: 10_000 });
    const a = await recs(page);
    const m = await marks(page);
    for (const st of [2, 3, 4] as const) {
      const s0 = m.find(([, k]) => k === `levelup-${st}`)![0];
      const e0 = s0 + span(m, `levelup-${st}`);
      const voices = a.filter((r) => r.s >= s0 && r.s <= e0 && near(r.d, VOICE[st]));
      expect(voices, `stage ${st} voice`).toHaveLength(1);
      // ほかの段階のボイスは鳴らない（対応の取り違えがない）
      for (const other of [2, 3, 4].filter((x) => x !== st) as (2 | 3 | 4)[]) expect(a.filter((r) => r.s >= s0 && r.s <= e0 && near(r.d, VOICE[other], 0.05))).toHaveLength(0);
      // 文字が出たあとにボイス。ボイスが最後まで終わってから表示が消え、そのあとに投球
      expect(voices[0]!.s - s0).toBeGreaterThanOrEqual(300);
      expect(voices[0]!.e).not.toBeNull();
      expect(e0).toBeGreaterThanOrEqual(voices[0]!.e! - 30);
      const nextThrow = a.find((r) => near(r.d, THROW, 0.08) && r.s > s0)!;
      expect(nextThrow.s).toBeGreaterThanOrEqual(voices[0]!.e! - 30);
    }
    // 金属音（重ねた4つの音）が段階アップごとに1回。第4段階の始まりには、最終形態への変身の上昇音と衝撃音（各1つ）が加わります（v1.8.0）
    expect(await page.evaluate(() => (window as unknown as { __osc: number }).__osc)).toBe(12 + 2);
    // 通常の BGM は1つのまま（流し直さない）。第4段階の始まり（60問のあと）で、最終決戦の BGM（約347秒）に1回だけ切り替わり、
    // 通常の BGM はそのフェードアウトで終わります（v1.8.1）。ボイスの間に下げ、終わると戻す（段階アップ3回ぶん）
    const bgm = a.filter((r) => r.loop);
    expect(bgm).toHaveLength(2);
    expect(near(bgm[0]!.d, 116.3, 0.5)).toBe(true);
    expect(near(bgm[1]!.d, 347.1, 0.5)).toBe(true);
    const s4 = m.find(([, k]) => k === 'levelup-4')![0];
    expect(bgm[1]!.s).toBeGreaterThanOrEqual(s4 - 50);
    expect(bgm[0]!.e).not.toBeNull();
    expect(bgm[0]!.e!).toBeGreaterThan(s4);
    const ramps = await page.evaluate(() => (window as unknown as { __ramps: number[] }).__ramps);
    expect(ramps.filter((v) => v === 0.35).length).toBeGreaterThanOrEqual(3);
    expect(ramps.at(-1)).toBe(1);
  });

  test('音を OFF・ボイスの音量0・ボイスの読み込みに失敗しても、ボイスの長さだけ表示して進む', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(120_000);
    await record(page);
    // ボイスの音量 0
    await guest(page);
    await page.evaluate(() => localStorage.setItem('sakura-type:bowie-sound:v1', JSON.stringify({ version: 1, music: 0.2, sfx: 0.8, voice: 0 })));
    await enter(page);
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toBeVisible();
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    // 音を OFF
    await page.getByTestId('bowie-mute').click();
    await expect(page.getByTestId('bowie-mute')).toContainText('OFF');
    await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '3');
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const m = await marks(page);
    expect(span(m, 'levelup-2')).toBeGreaterThanOrEqual(450 + 3500 + 300 - 100);
    expect(span(m, 'levelup-3')).toBeGreaterThanOrEqual(450 + 3762 + 300 - 100);
  });

  test('ボイスの読み込みに失敗しても、登録の長さで進み、止まらない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await page.route('**/*bowie_voice_212302*', (r) => r.abort());
    await guest(page);
    await enter(page);
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toHaveAttribute('data-stage', '2');
    await expect(page.getByTestId('bowie-text')).toBeVisible({ timeout: 10_000 });
    const m = await marks(page);
    expect(span(m, 'levelup-2')).toBeGreaterThanOrEqual(450 + 3500 + 300 - 100);
    expect((await recs(page)).filter((r) => near(r.d, VOICE[2]))).toHaveLength(0);
  });

  test('段階アップの途中で一時停止 →「やめる」：ボイスと演出を止め、BGM は大きさを戻して開始前の画面で流れる。ホームへ移るとすべて止まる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    test.setTimeout(60_000);
    await record(page);
    await guest(page);
    await enter(page);
    await page.getByTestId('bowie-start').click();
    await solve(page);
    await expect(page.getByTestId('bowie-levelup')).toBeVisible();
    await page.waitForTimeout(1200);
    await page.keyboard.press('Escape');
    await page.getByTestId('bowie-quit').click();
    await expect(page.getByTestId('bowie-title')).toBeVisible();
    await page.waitForTimeout(600);
    let a = await recs(page);
    const voice = a.filter((r) => near(r.d, VOICE[2]));
    expect(voice).toHaveLength(1);
    expect(voice[0]!.e).not.toBeNull();
    expect(a.filter((r) => r.e === null && !r.loop)).toHaveLength(0);
    expect(a.filter((r) => r.loop && r.e === null)).toHaveLength(1);
    const ramps = await page.evaluate(() => (window as unknown as { __ramps: number[] }).__ramps);
    expect(ramps.at(-1)).toBe(1);
    // もう一度始めると、第1段階の始まりから（前の段階アップの表示・時間は残っていない）
    await page.getByTestId('bowie-start').click();
    await expect(page.getByTestId('bowie-banner')).toContainText('第1段階');
    await expect(page.getByTestId('bowie-levelup')).toHaveCount(0);
    // ホームへ
    await page.goto('./#/home');
    await page.waitForTimeout(500);
    // 画面を離れると音の仕組み（AudioContext）ごと閉じ、BGM を含めて何も鳴らない
    expect(await page.evaluate(() => (window as unknown as { __ctx: AudioContext[] }).__ctx.map((c) => c.state))).toEqual(['closed']);
  });
});

test.describe('ボウイの爆弾遊戯：開始前の画面', () => {
  test('遊び方は初期状態では出さず、「遊び方」ボタンのダイアログで全文。キーボードで開閉でき、閉じるとボタンへ戻る。ダイアログの間のスペースで始まらない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await page.goto('./#/game/bowie');
    const title = page.getByTestId('bowie-title');
    await expect(page.getByTestId('bowie-howto')).toHaveCount(0);
    await expect(title).not.toContainText('表示された文字を入力して解除');
    // 主役はロゴとスタート。ハイスコア・音・サウンド設定・ゲームの選択へ戻るは残す
    await expect(page.locator('.bowie-title-logo')).toBeVisible();
    await expect(page.getByTestId('bowie-start')).toBeVisible();
    for (const id of ['bowie-best', 'bowie-mute', 'bowie-sound-open', 'bowie-howto-open']) await expect(page.getByTestId(id)).toBeVisible();
    await expect(page.getByRole('button', { name: 'ゲームの選択にもどる' })).toBeVisible();
    // キーボードで開く
    await page.getByTestId('bowie-howto-open').focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByTestId('bowie-howto');
    await expect(dialog).toBeVisible();
    await expect(dialog).toHaveAttribute('role', 'dialog');
    for (const t of ['表示された文字を入力して解除', '早く解除するほど高得点', '減点はありません', 'その場で終了', '全80問を解除すれば勝利', 'Shift は要りません', 'Esc で一時停止']) await expect(dialog).toContainText(t);
    await expect(page.getByTestId('bowie-howto-close')).toBeFocused();
    // ダイアログの間のスペースで始まらない
    await page.keyboard.press(' ');
    await page.waitForTimeout(300);
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    await expect(dialog).toBeHidden(); // スペースは「閉じる」のボタンを押します
    await expect(page.getByTestId('bowie-howto-open')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(dialog).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.getByTestId('bowie-howto-open')).toBeFocused();
    await expect(page).toHaveURL(/#\/game\/bowie$/);
    // ダイアログを閉じたあとは、スペースで開始できる（ボタンの外にフォーカスを移してから）
    await page.locator('.bowie-title-logo').click();
    await page.keyboard.press(' ');
    await expect(page).toHaveURL(/#\/game\/bowie\/play/);
  });

  test('背景は星空と城の舞台の画像（プレイ中は従来の背景）。ロゴ・スタート・補助の操作が画面に収まり、横にはみ出さない', async ({ page }, info) => {
    if (info.project.name === 'pc') await page.setViewportSize({ width: 1368, height: 912 });
    await guest(page);
    await page.goto('./#/game/bowie');
    const title = page.getByTestId('bowie-title');
    expect(await title.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('bowie_title_background');
    expect(await title.evaluate((e) => getComputedStyle(e).backgroundSize)).toBe('cover');
    const vp = page.viewportSize()!;
    for (const sel of ['.bowie-title-logo', '[data-testid="bowie-start"]', '[data-testid="bowie-best"]', '[data-testid="bowie-mute"]', '[data-testid="bowie-sound-open"]', '[data-testid="bowie-howto-open"]']) {
      const b = (await page.locator(sel).boundingBox())!;
      expect(b.x, sel).toBeGreaterThanOrEqual(-0.5);
      expect(b.x + b.width, sel).toBeLessThanOrEqual(vp.width + 0.5);
      expect(b.y + b.height, sel).toBeLessThanOrEqual(vp.height + 0.5);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.screenshot({ path: test.info().outputPath(`title-${info.project.name}.png`) });
    await page.getByTestId('bowie-start').click();
    await expect(page.getByTestId('bowie-stage-area')).toBeVisible();
    expect(await page.getByTestId('bowie-stage-area').evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('stage_background');
  });
});
