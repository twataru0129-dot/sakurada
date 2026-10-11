/**
 * v1.3.0 のゲームの改善の E2E テスト：
 * 短縮コース（標準の約半分）、PC の一画面の配置、ミスの効果音・表示、工程の表示、完成記念画像、旧短縮記録との区別。
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-game')).toBeVisible();
}
async function startCourse(page: Page, course: '標準コース' | '短縮コース') {
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-sakurada-familia').click();
  await page.getByRole('radio', { name: new RegExp(course) }).check();
  await page.getByTestId('game-start').click();
  await expect(page.getByTestId('game-go')).toBeVisible();
}
/** いまの文のガイド（これから打つローマ字。表示は行ごとに分かれるため、まとめた値を読みます） */
const guideText = async (page: Page) => (await page.getByTestId('game-romaji').getAttribute('data-remaining')) ?? '';
async function typeAll(page: Page, each?: () => Promise<void>) {
  for (let i = 0; i < 100; i++) {
    if (!(await page.locator('.game-romaji .romaji-next').count())) break;
    await each?.();
    await page.keyboard.type(await guideText(page));
  }
}
/** 乱数を固定して、コースの1本目の物語を選ばせます */
async function fixRandom(page: Page) {
  await page.evaluate(() => {
    crypto.getRandomValues = <T extends ArrayBufferView | null>(a: T) => {
      if (a instanceof Uint32Array) a[0] = 0;
      return a;
    };
  });
}
const guestGames = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('sakura-type:guest-game-history:v1');
    return raw ? (JSON.parse(raw).records as Array<Record<string, unknown>>) : [];
  });

/** 保存形式どおりの過去の記録（ゲスト） */
function pastRecord(i: number, extra: Record<string, unknown>) {
  const elapsedMs = 200_000;
  const missCount = 2;
  const recordTimeMs = elapsedMs + missCount * 5000;
  return {
    id: `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`,
    gameId: 'sakurada-familia',
    ruleVersion: 'sakurada-rule-v1',
    storySetVersion: 'sakurada-stories-v1',
    storyId: 'inherited-dream',
    courseId: 'standard',
    inputMethod: 'keyboard',
    romajiStyle: 'hepburn',
    startedAt: `2026-10-0${i}T01:00:00.000Z`,
    finishedAt: `2026-10-0${i}T01:05:00.000Z`,
    elapsedMs,
    missCount,
    penaltyMs: missCount * 5000,
    recordTimeMs,
    completionYear: 1882 + Math.floor(recordTimeMs / 2000),
    correctKeystrokes: 1800,
    accuracy: (1800 * 100) / 1802,
    completedReadingCharacters: 967,
    totalReadingCharacters: 967,
    pauseCount: 0,
    finished: true,
    ...extra,
  };
}

test.describe('v1.3.0 短縮コース', () => {
  test('コースの説明は実測値（短い物語・約950打鍵）。「約50打鍵」の表示はない', async ({ page }) => {
    await guest(page);
    await page.getByTestId('home-game').click();
    await page.getByTestId('game-card-sakurada-familia').click();
    await expect(page.getByRole('radio', { name: /短縮コース/ })).toHaveAccessibleName('短縮コース（短い物語・約950打鍵）');
    await expect(page.getByRole('radio', { name: /標準コース/ })).toHaveAccessibleName('標準コース（長い物語・約1800打鍵）');
    await expect(page.getByText('約50打鍵')).toHaveCount(0);
    await expect(page.getByText(/分以内に終わ/)).toHaveCount(0);
  });

  test('旧短縮コース（約50打鍵）の記録は消さずに区別して表示し、新しい短縮版とは比べない。標準の比較は続く', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    const legacy = pastRecord(1, { storyId: 'inherited-dream-intro', courseId: 'short', totalReadingCharacters: 28, completedReadingCharacters: 28, correctKeystrokes: 51, accuracy: (51 * 100) / 53 });
    const std = pastRecord(2, {});
    await page.evaluate(
      ([l, s]) => {
        localStorage.setItem('sakura-type:guest-game-history:v1', JSON.stringify({ version: 1, records: [s, l] }));
        localStorage.setItem('sakura-type:guest-game-bests:v1', JSON.stringify({ version: 1, records: [s, l] }));
      },
      [legacy, std],
    );
    await fixRandom(page);
    // 新しい短縮版：旧短縮版の記録とは比べない（初めての完成）
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await typeAll(page);
    await expect(page.getByText('初めての完成！')).toBeVisible();
    await expect(page.getByTestId('game-compare')).not.toContainText('3つの物語全体');
    // 標準コース：v1.2.0 の記録（同じ物語・同じ版）と比べられる
    await page.getByRole('button', { name: 'ゲーム選択へ' }).click();
    await page.getByTestId('game-card-sakurada-familia').click();
    await page.getByRole('radio', { name: /標準コース/ }).check();
    await page.getByTestId('game-start').click();
    await page.getByTestId('game-go').click();
    await typeAll(page);
    await expect(page.getByTestId('cmp-prev')).toContainText('前回より');
    // 記録の一覧：旧短縮は「旧短縮コース（約50打鍵）」と表示し、消えていない
    await page.getByRole('button', { name: 'ゲームの記録' }).click();
    await expect(page.getByTestId('game-history-row')).toHaveCount(4);
    await expect(page.getByTestId('game-history-table')).toContainText('旧短縮コース（約50打鍵）');
    await expect(page.getByTestId('game-history-table')).toContainText('夢をつないだ建築物（短縮版）');
    const recs = await guestGames(page);
    const newShort = recs.find((r) => r.courseId === 'short' && r.storySetVersion === 'sakurada-stories-v2')!;
    expect(newShort.storyId).toBe('inherited-dream-short');
    expect(newShort.totalReadingCharacters).toBe(503);
    expect(recs.find((r) => r.storyId === 'inherited-dream-intro')).toMatchObject({ totalReadingCharacters: 28, storySetVersion: 'sakurada-stories-v1' });
  });
});

test.describe('v1.3.0 PC の一画面の配置', () => {
  for (const [w, h] of [
    [1366, 768],
    [1280, 720],
  ] as const) {
    test(`${w}×${h}：ガイド ON でも、必要な情報と操作が縦スクロールなしで見え、文が変わっても枠が跳ねない`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pc');
      test.setTimeout(120_000);
      await page.setViewportSize({ width: w, height: h });
      await guest(page);
      await fixRandom(page);
      await startCourse(page, '標準コース');
      await page.getByTestId('game-go').click();
      const ids = ['building', 'game-text', 'game-romaji', 'gauge-bar', 'gauge-pct', 'gauge-left', 'gauge-stage', 'game-time', 'game-penalty', 'game-pause'];
      const check = async () => {
        for (const id of ids) {
          const b = (await page.getByTestId(id).boundingBox())!;
          expect(b, id).not.toBeNull();
          expect(b.y, id).toBeGreaterThanOrEqual(0);
          expect(b.y + b.height, id).toBeLessThanOrEqual(h + 0.5);
          expect(b.x + b.width, id).toBeLessThanOrEqual(w + 0.5);
        }
        for (const sel of ['.gkb', '.game-hands .hands', '.gkb .key.target']) {
          const b = (await page.locator(sel).first().boundingBox())!;
          expect(b.y + b.height, sel).toBeLessThanOrEqual(h + 0.5);
        }
        const sc = await page.evaluate(() => [document.documentElement.scrollHeight, window.innerHeight, document.documentElement.scrollWidth, window.innerWidth]);
        expect(sc[0]).toBeLessThanOrEqual(sc[1]!);
        expect(sc[2]).toBeLessThanOrEqual(sc[3]!);
        // 文字・キーを小さくしすぎない
        const sizes = await page.evaluate(() => ({
          text: parseFloat(getComputedStyle(document.querySelector('[data-testid="game-text"]')!).fontSize),
          key: document.querySelector('.gkb .gkb-key')!.getBoundingClientRect().height,
        }));
        expect(sizes.text).toBeGreaterThanOrEqual(20);
        expect(sizes.key).toBeGreaterThanOrEqual(34);
      };
      await check();
      const sentence = page.getByTestId('game-sentence');
      const kb = page.locator('.gkb');
      const h0 = (await sentence.boundingBox())!.height;
      const k0 = (await kb.boundingBox())!.y;
      // 全部の文で、文の枠の高さとキーボードの位置が変わらないこと（ミスを続けても）
      let n = 0;
      await typeAll(page, async () => {
        n++;
        if (n % 8 === 0) for (let i = 0; i < 4; i++) await page.keyboard.press('q');
        expect((await sentence.boundingBox())!.height).toBeCloseTo(h0, 0);
        expect((await kb.boundingBox())!.y).toBeCloseTo(k0, 0);
        if (n === 16) await check();
      });
      await expect(page).toHaveURL(/#\/game\/sakurada\/result/);
    });
  }

  test('拡大表示・小さい画面（1000×560）では情報を切り捨てず、スクロールで見られる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.setViewportSize({ width: 1000, height: 560 });
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    for (const id of ['building', 'game-text', 'game-romaji', 'gauge-bar', 'gauge-left', 'gauge-stage']) await expect(page.getByTestId(id)).toBeVisible();
    // 下のガイドまでスクロールで届く（隠していない）
    await page.locator('.gkb').scrollIntoViewIfNeeded();
    await expect(page.locator('.gkb')).toBeInViewport();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)).toBeLessThanOrEqual(0);
  });

  test('工程が変わると「…が始まった！」を短く表示し、入力は続けられる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.type(await guideText(page));
      if (await page.getByTestId('stage-toast').count()) break;
    }
    await expect(page.getByTestId('stage-toast')).toHaveText('基礎工事が始まった！');
    // 表示中も入力できる
    const before = await page.getByTestId('gauge-left').locator('strong').textContent();
    await page.keyboard.type((await guideText(page)).slice(0, 3));
    await expect(page.getByTestId('gauge-left').locator('strong')).not.toHaveText(before!);
    await expect(page.getByTestId('stage-toast')).toHaveCount(0, { timeout: 5000 });
  });
});

test.describe('v1.3.0 ミスの効果音と表示', () => {
  async function countTones(page: Page) {
    await page.addInitScript(() => {
      (window as unknown as { __tones: number }).__tones = 0;
      const orig = window.AudioContext.prototype.createOscillator;
      window.AudioContext.prototype.createOscillator = function (this: AudioContext) {
        (window as unknown as { __tones: number }).__tones++;
        return orig.call(this);
      };
    });
  }
  const tones = (page: Page) => page.evaluate(() => (window as unknown as { __tones: number }).__tones);

  test('音 ON：ミスで短い音が鳴り、＋5秒・枠の強調。続けてミスしても表示は1つ・加算は1回5秒ずつ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await countTones(page);
    await guest(page);
    await page.getByTestId('home-game').click();
    await page.getByTestId('game-card-sakurada-familia').click();
    await expect(page.getByText('音：ON')).toBeVisible();
    await page.getByRole('radio', { name: /短縮コース/ }).check();
    await page.getByTestId('game-start').click();
    await page.getByTestId('game-go').click();
    const t0 = await tones(page);
    await page.keyboard.press('q');
    await expect(page.getByTestId('penalty-pop')).toHaveText('＋5秒');
    await expect(page.getByTestId('game-sentence')).toHaveClass(/is-miss/);
    expect(await tones(page)).toBeGreaterThan(t0);
    // 続けてミス
    await page.keyboard.press('q');
    await page.keyboard.press('z');
    await expect(page.getByTestId('penalty-pop')).toHaveCount(1);
    await expect(page.getByTestId('game-penalty')).toContainText('ミス 3回（＋15秒）');
    // 演出の間もそのまま入力でき、フォーカスは移らない
    expect(await page.evaluate(() => document.activeElement === document.body)).toBe(true);
    const before = Number(await page.getByTestId('gauge-left').locator('strong').textContent());
    await page.keyboard.type((await guideText(page)).slice(0, 3));
    expect(Number(await page.getByTestId('gauge-left').locator('strong').textContent())).toBeLessThan(before);
    await typeAll(page);
    await expect(page.getByTestId('miss-count')).toHaveText(/3/);
    await expect(page.getByTestId('penalty-time')).toContainText('15');
    const r = (await guestGames(page))[0]!;
    expect(r).toMatchObject({ missCount: 3, penaltyMs: 15000 });
    expect(r.recordTimeMs).toBe((r.elapsedMs as number) + 15000);
  });

  test('音 OFF：ミスの音は鳴らない（表示は出る）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await countTones(page);
    await guest(page);
    await page.locator('.home-settings .switch', { hasText: '音' }).locator('input').uncheck();
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await page.keyboard.press('q');
    await expect(page.getByTestId('penalty-pop')).toBeVisible();
    expect(await tones(page)).toBe(0);
  });

  test('動きを減らす設定：＋5秒と枠の強調は、動かさずに表示する', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await guest(page);
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await page.keyboard.press('q');
    await expect(page.getByTestId('penalty-pop')).toBeVisible();
    expect(await page.getByTestId('penalty-pop').evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
    await expect(page.getByTestId('game-sentence')).toHaveClass(/is-miss/);
  });
});

test.describe('v1.3.0 完成記念画像', () => {
  test('PC：結果と同じ値の PNG を保存できる（名前なし／長い名前）。何度保存しても記録は増えない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.goto('/sakurada/');
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await startCourse(page, '短縮コース');
    await page.getByTestId('game-go').click();
    await page.keyboard.press('q');
    await typeAll(page);
    const shown = {
      year: (await page.getByTestId('game-complete-title').textContent())!.match(/西暦(\d+)年/)![1],
      time: await page.getByTestId('record-time').textContent(),
      accuracy: await page.getByTestId('accuracy').textContent(),
    };
    await page.getByTestId('memorial-open').click();
    const img = page.getByTestId('memorial-img');
    await expect(img).toBeVisible();
    const content = JSON.parse((await img.getAttribute('data-content'))!);
    expect(content).toMatchObject({ title: 'サクラダファミリアを完成させよ', yearLabel: 'ゲーム内の完成年', year: `西暦${shown.year}年`, time: shown.time, accuracy: shown.accuracy, course: '短縮コース', nickname: null });
    expect(content.story).toMatch(/（短縮版）$/);
    const save = async () => {
      const dl = page.waitForEvent('download');
      await page.getByTestId('memorial-download').click();
      const d = await dl;
      expect(d.suggestedFilename()).toMatch(/^sakurada-memorial-\d{8}-\d{6}\.png$/);
      const buf = readFileSync((await d.path())!);
      expect(buf.subarray(1, 4).toString()).toBe('PNG');
      return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
    };
    expect(await save()).toEqual({ w: 1600, h: 1600 });
    // 名前を載せる（長い名前でも切れずに入る）
    await page.getByTestId('memorial-with-name').check();
    await page.getByTestId('memorial-name').fill('とても長いニックネームのタイピング名人チャンピオンです');
    await expect.poll(async () => JSON.parse((await img.getAttribute('data-content'))!).nickname).toBe('とても長いニックネームのタイピング名人チ'); // 20文字まで
    await save();
    await save();
    expect(await guestGames(page)).toHaveLength(1);
    // 画像は /sakurada/ の下から読み込んでいる（外部へは送らない）
    expect(await img.getAttribute('src')).toMatch(/^blob:/);
  });

  test('iPhone：共有（写真に保存）を使える端末では共有の画面を開き、共有先は本人が選ぶ。長押しで保存する方法も案内する', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await page.addInitScript(() => {
      (window as unknown as { __shared: unknown[] }).__shared = [];
      Object.defineProperty(navigator, 'canShare', { value: (d: { files?: File[] }) => !!d.files?.length, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: async (d: { files: File[] }) => {
          (window as unknown as { __shared: unknown[] }).__shared.push(d.files.map((f) => [f.name, f.type]));
        },
        configurable: true,
      });
    });
    await guest(page);
    await page.getByTestId('home-game').click();
    await page.getByTestId('game-card-sakurada-familia').click();
    await page.getByRole('radio', { name: /短縮コース/ }).check();
    await page.getByTestId('game-start').click();
    await page.getByTestId('game-go').click();
    await typeAll(page);
    await page.getByTestId('memorial-open').click();
    await expect(page.getByTestId('memorial-img')).toBeVisible();
    await expect(page.getByText('長押しして「"写真"に保存」')).toBeVisible();
    await page.getByTestId('memorial-share').click();
    const shared = await page.evaluate(() => (window as unknown as { __shared: string[][][] }).__shared);
    expect(shared).toHaveLength(1);
    expect(shared[0]![0]![0]).toMatch(/^sakurada-memorial-\d{8}-\d{6}\.png$/);
    expect(shared[0]![0]![1]).toBe('image/png');
    expect(await guestGames(page)).toHaveLength(1);
  });
});
