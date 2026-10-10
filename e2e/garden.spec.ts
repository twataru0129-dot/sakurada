/**
 * ゲーム「桜ガーデン」の E2E テスト（ゲストの端末への保存）。
 * 記録は出来事（イベント）の一覧として保存されるため、遊んだ状態をすばやく作るときは、出来事を端末に入れてから開きます。
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

const KEY = 'sakura-type:guest-garden:v1';
const PROBLEMS = (JSON.parse(readFileSync('src/data/garden/problems.json', 'utf8')) as { problems: { id: string; text: string; reading: string }[] }).problems;
type Ev = { id: string; at: number; type: string; data: Record<string, unknown> };

/** 遊んだ状態の出来事を作ります（solved 問を完成・品種を入手・水やり・植える・飾り） */
function seedEvents(o: { solved?: number; first?: boolean; buy?: string[]; decos?: string[]; water?: [string, number][]; plant?: [string, number, number][]; place?: [string, string, number, number][] } = {}): Ev[] {
  let at = Date.now() - 50_000_000;
  const ev: Ev[] = [];
  const push = (type: string, data: Record<string, unknown>, id?: string) => ev.push({ id: id ?? `${type}-${at}`, at: at++, type, data });
  for (let k = 0; k < (o.solved ?? 0); k += 10) {
    const sid = `seed${k}`;
    const n = Math.min(10, (o.solved ?? 0) - k);
    const ids = PROBLEMS.slice(k % 490, (k % 490) + 10).map((p) => p.id);
    push('session', { session: sid, problems: ids }, `session:${sid}`);
    for (let i = 0; i < n; i++) push('solve', { session: sid, index: i }, `solve:${sid}:${i}`);
    push('end', { session: sid });
  }
  if (o.first) push('first', {}, 'first');
  for (const sp of o.buy ?? []) push('buy_tree', { species: sp, tree: `t-${sp}` });
  for (const d of o.decos ?? []) push('buy_deco', { kind: d });
  for (const [tree, amount] of o.water ?? []) push('water', { tree, amount });
  for (const [tree, garden, slot] of o.plant ?? []) push('plant', { tree, garden, slot });
  for (const [deco, kind, col, row] of o.place ?? []) push('place', { deco, kind, garden: 0, col, row });
  return ev;
}

async function openGarden(page: Page, events?: Ev[]) {
  await page.goto('./');
  if (events) await page.evaluate(([k, v]) => localStorage.setItem(k, v), [KEY, JSON.stringify({ version: 1, events })] as const);
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-sakura-garden').click();
  await expect(page.getByTestId('garden-main')).toBeVisible();
}
const num = async (page: Page, id: string) => Number(((await page.getByTestId(id).textContent()) ?? '').replace(/[^0-9]/g, ''));
const guide = async (page: Page) => (await page.getByTestId('garden-romaji').getAttribute('data-remaining')) ?? '';
const stored = (page: Page) => page.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? '{"events":[]}').events as Ev[], KEY);
const kanaOf = (text: string) => [...PROBLEMS.find((p) => p.text === text)!.reading].length;

test.describe('桜ガーデン', () => {
  test('ゲームの選択から入り、最初のソメイヨシノを無料で受け取ると庭に植わる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page);
    await expect(page.getByText('桜ガーデン').first()).toBeVisible();
    await expect(page.getByTestId('garden-water')).toContainText('0');
    await expect(page.getByTestId('grow-card')).toContainText('最初の桜の苗を受け取ろう。');
    await page.getByTestId('receive-first').click();
    await expect(page.getByTestId('scene-tree-0')).toHaveAttribute('data-species', 'somei_yoshino');
    await expect(page.getByTestId('grow-name')).toHaveText('ソメイヨシノ');
    await expect(page.getByTestId('grow-stage')).toHaveText('苗木');
    await expect(page.getByTestId('grow-water')).toHaveText('水 0 / 20');
    // 二度は受け取れない
    await expect(page.getByTestId('receive-first')).toHaveCount(0);
  });

  test('5問：1問ごとに水1・花びら1、読みのかな20文字ごとに水1（端数は持ち越し）。別の打ち方でも正解。再読み込みしても二重にならない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page);
    await page.getByTestId('garden-count-5').check();
    await page.getByTestId('garden-start').click();
    await expect(page).toHaveURL(/#\/game\/garden\/play/);
    // 開始前のキーは数えず、スペースで始まる
    await page.keyboard.press('a');
    await expect(page.getByTestId('garden-practice')).not.toHaveClass(/is-miss/);
    await page.keyboard.press(' ');
    let kana = 0;
    let usedAlt = false;
    for (let i = 0; i < 5; i++) {
      await expect(page.getByTestId('garden-progress')).toHaveText(`${i + 1} / 5`);
      kana += kanaOf((await page.getByTestId('garden-text').textContent())!);
      // その問題が終わるまで1文字ずつ打ちます。別の打ち方：shi → si、chi → ti、tsu → tu
      for (let n = 0; n < 200; n++) {
        if (await page.getByTestId('garden-finished').count()) break;
        if ((await page.getByTestId('garden-progress').textContent()) !== `${i + 1} / 5`) break;
        const g = await guide(page);
        const m = /^(shi|chi|tsu)/.exec(g);
        if (m) {
          usedAlt = true;
          await page.keyboard.type({ shi: 'si', chi: 'ti', tsu: 'tu' }[m[1] as 'shi' | 'chi' | 'tsu']);
        } else await page.keyboard.press(g[0]!);
      }
    }
    await expect(page.getByTestId('garden-finished')).toBeVisible();
    const water = 5 + Math.floor(kana / 20);
    await expect(page.getByTestId('garden-summary')).toHaveText(`集めた水 ${water}　花びら 5枚`);
    await expect(page.getByTestId('garden-water')).toContainText(String(water));
    await expect(page.getByTestId('garden-petals')).toContainText('5');
    if (!usedAlt) test.info().annotations.push({ type: 'note', description: '別の打ち方を含む問題がありませんでした' });
    // 端数の持ち越し：保存した出来事から計算し直しても同じ
    const ev = await stored(page);
    expect(ev.filter((e) => e.type === 'solve')).toHaveLength(5);
    // 再読み込み → もう一度ゲストで入っても同じ値（二重に増えない）
    await page.reload();
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.goto('./#/game/garden');
    await expect(page.getByTestId('garden-water')).toContainText(String(water));
    await expect(page.getByTestId('garden-petals')).toContainText('5');
    expect((await stored(page)).filter((e) => e.type === 'solve')).toHaveLength(5);
  });

  test('途中でやめても完成した問題は残り、続きから始めても二重にならない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page);
    await page.getByTestId('garden-count-5').check();
    await page.getByTestId('garden-start').click();
    // 開始待ちの画面が出てからスペースで始めます（画面が切り替わる前のスペースは届きません）
    await expect(page.getByTestId('garden-go')).toBeVisible();
    await page.keyboard.press(' ');
    await expect(page.getByTestId('garden-go')).toHaveCount(0);
    for (let i = 0; i < 2; i++) {
      await expect(page.getByTestId('garden-progress')).toHaveText(`${i + 1} / 5`);
      await page.keyboard.type(await guide(page));
    }
    // 3問目は途中まで（未精算）。次の問題に切り替わってからガイドを読みます
    await expect(page.getByTestId('garden-progress')).toHaveText('3 / 5');
    const g = await guide(page);
    await page.keyboard.type(g.slice(0, 4));
    await expect(page.getByTestId('garden-progress')).toHaveText('3 / 5');
    await page.reload();
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.goto('./#/game/garden');
    await expect(page.getByTestId('garden-petals')).toContainText('2');
    await expect(page.getByTestId('garden-start')).toHaveText('続きから始める（2 / 5）');
    await page.getByTestId('garden-start').click();
    await expect(page.getByTestId('garden-progress')).toHaveText('3 / 5');
    await page.keyboard.press(' ');
    for (let i = 0; i < 3; i++) await page.keyboard.type(await guide(page));
    await expect(page.getByTestId('garden-finished')).toBeVisible();
    await expect(page.getByTestId('garden-petals')).toContainText('5');
    const ev = await stored(page);
    expect(ev.filter((e) => e.type === 'solve')).toHaveLength(5);
    expect(new Set(ev.map((e) => e.id)).size).toBe(ev.length);
  });

  test('練習中は庭のメニューを出さず、入力のキーで庭の操作が起きない。ひと休み → 練習を終える', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 30, first: true, plant: [['first-1', 0, 0]] }));
    await page.getByTestId('garden-start').click();
    await expect(page.getByTestId('menu-shop')).toHaveCount(0);
    await page.keyboard.press(' ');
    await page.keyboard.type('zzzz');
    await expect(page.getByTestId('shop')).toHaveCount(0);
    await expect(page.getByTestId('garden-practice')).toBeVisible();
    // スペースは入力中は何もしない（ミスにも数えない）
    await page.keyboard.press(' ');
    await page.getByTestId('garden-pause').click();
    await expect(page.getByTestId('garden-paused')).toContainText('完成した問題のごほうびは残ります。');
    await page.getByTestId('garden-end').click();
    await expect(page.getByTestId('garden-finished')).toBeVisible();
    await page.getByTestId('garden-back-to-garden').click();
    await expect(page.getByTestId('menu-shop')).toBeVisible();
    await expect(page.getByTestId('garden-start')).toHaveText('練習を始める');
  });

  test('成長：最初の木は水5・10・20で若木・つぼみ・満開。必要以上の水は使わず、満開には水を使えない（鑑賞する）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 30, first: true, plant: [['first-1', 0, 0]] }));
    const w0 = await num(page, 'garden-water');
    await page.getByTestId('water-1').click();
    await expect(page.getByTestId('grow-water')).toHaveText('水 1 / 20');
    for (let i = 0; i < 4; i++) await page.getByTestId('water-1').click();
    await expect(page.getByTestId('grow-stage')).toHaveText('若木');
    await expect(page.getByTestId('grow-message')).toContainText('若木になりました');
    await page.getByTestId('water-5').click();
    await expect(page.getByTestId('grow-stage')).toHaveText('つぼみ');
    await page.getByTestId('water-bloom').click();
    await expect(page.getByTestId('grow-stage')).toHaveText('満開');
    await expect(page.getByTestId('grow-message')).toContainText('桜が満開になりました！');
    await expect(page.getByTestId('grow-water')).toHaveText('水 20 / 20');
    expect(await num(page, 'garden-water')).toBe(w0 - 20);
    await expect(page.getByTestId('water-1')).toHaveCount(0);
    await page.getByTestId('grow-view').click();
    await expect(page.getByTestId('viewing')).toBeVisible();
    await page.getByTestId('sheet-close').click();
    expect(await num(page, 'garden-water')).toBe(w0 - 20);
    // 図鑑に満開として登録
    await page.getByTestId('menu-collection').click();
    await expect(page.getByTestId('collection-count')).toHaveText('満開にした桜 1 / 8');
    await expect(page.getByTestId('collection-somei_yoshino')).toContainText('満開に育てました');
  });

  test('お店：花びらが足りないときは不足数を表示。交換の確認を二度押しても1回だけ。累計の問題数で苗が並ぶ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 25, first: true }));
    await page.getByTestId('menu-shop').click();
    await expect(page.getByTestId('shop-petals')).toHaveText('25');
    // 関山は50問で並ぶ（まだ25問）
    await expect(page.getByTestId('shop-tree-kanzan')).toContainText('練習で50問完成すると、お店に並びます');
    await expect(page.getByTestId('shop-buy-kanzan')).toBeDisabled();
    await page.getByTestId('shop-buy-yae_beni_shidare').click();
    await expect(page.getByTestId('shop-confirm')).toContainText('花びら20枚で「八重紅枝垂」と交換しますか？');
    await page.getByTestId('shop-confirm-yes').dblclick();
    await expect(page.getByTestId('shop-message')).toHaveText('「八重紅枝垂」が持ちものに増えました。');
    await expect(page.getByTestId('shop-petals')).toHaveText('5');
    await expect(page.getByTestId('shop-tree-yae_beni_shidare')).toContainText('持っている数 1');
    expect((await stored(page)).filter((e) => e.type === 'buy_tree')).toHaveLength(1);
    await page.getByTestId('shop-tab-deco').click();
    await expect(page.getByTestId('shop-deco-small_pond')).toContainText('花びらがあと55枚必要です。');
    await expect(page.getByTestId('shop-buy-small_pond')).toBeDisabled();
  });

  test('庭づくり：飾りをマス目に置く・重なりと桜の根元には置けない・移動・片付け。持ちものの数が合う', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 200, first: true, decos: ['small_pond', 'stone_lantern'], plant: [['first-1', 0, 0]] }));
    await page.getByTestId('menu-garden').click();
    await page.getByTestId('edit-place-small_pond').click();
    await page.getByTestId('cell-5-4').click();
    await expect(page.getByTestId('scene-deco-small_pond')).toBeVisible();
    await expect(page.getByTestId('garden-edit-msg')).toContainText('小さな池を置きました');
    // 池の上には灯籠を置けない
    await page.getByTestId('edit-place-stone_lantern').click();
    // 池は押したマスを下の段の中ほどにして、横4〜6・縦3〜4のマスを使っています
    await page.getByTestId('cell-5-4').click();
    await expect(page.getByTestId('garden-edit-msg')).toHaveText('ここには置けません。別の場所を選んでね。');
    await expect(page.getByTestId('scene-deco-stone_lantern')).toHaveCount(0);
    // 桜の根元（植える場所1のまわり）にも置けない
    await page.getByTestId('cell-2-0').click();
    await expect(page.getByTestId('garden-edit-msg')).toHaveText('ここには置けません。別の場所を選んでね。');
    await page.getByTestId('cell-0-5').click();
    await expect(page.getByTestId('scene-deco-stone_lantern')).toBeVisible();
    // 移動と片付け
    await page.getByTestId('scene-deco-stone_lantern').click();
    await page.getByTestId('deco-move').click();
    await page.getByTestId('cell-11-5').click();
    await page.getByTestId('scene-deco-small_pond').click();
    await page.getByTestId('deco-stow').click();
    await expect(page.getByTestId('scene-deco-small_pond')).toHaveCount(0);
    await page.getByTestId('garden-edit-done').click();
    await page.getByTestId('menu-inventory').click();
    await expect(page.getByTestId('inv-count-small_pond')).toHaveText('持っている数 1（庭に置いている数 0・持ちもの 1）');
    await expect(page.getByTestId('inv-count-stone_lantern')).toHaveText('持っている数 1（庭に置いている数 1・持ちもの 0）');
    const ev = await stored(page);
    expect(ev.filter((e) => e.type === 'place')).toHaveLength(2);
    expect(ev.filter((e) => e.type === 'buy_deco')).toHaveLength(2);
  });

  test('1つの庭に桜は3本まで：4本目は入れ替え（元の桜は持ちものへ、成長は残る）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 200, first: true, buy: ['kanzan', 'ukon', 'gyoiko'], water: [['t-kanzan', 12]], plant: [['first-1', 0, 0], ['t-kanzan', 0, 1], ['t-ukon', 0, 2]] }));
    await page.getByTestId('menu-garden').click();
    await page.getByTestId('scene-slot-1').click();
    await expect(page.getByTestId('slot-chooser')).toContainText('入れ替える桜を選んでね。');
    await page.getByTestId('slot-plant-t-gyoiko').click();
    await expect(page.getByTestId('scene-tree-1')).toHaveAttribute('data-species', 'gyoiko');
    await expect(page.locator('[data-testid^="scene-tree-"]')).toHaveCount(3);
    await page.getByTestId('garden-edit-done').click();
    await page.getByTestId('menu-inventory').click();
    await expect(page.getByTestId('inv-tree-t-kanzan')).toContainText('若木・持ちもの');
  });

  test('庭の画像を保存：背景と置いた物だけの PNG をダウンロードする', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 100, first: true, decos: ['wooden_bench'], plant: [['first-1', 0, 0]], place: [['b1', 'wooden_bench', 4, 3]] }));
    await page.getByTestId('menu-garden').click();
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByTestId('garden-save-image').click()]);
    expect(dl.suggestedFilename()).toMatch(/^sakura-garden-1_\d{8}-\d{6}\.png$/);
    const buf = readFileSync((await dl.path())!);
    expect(buf.subarray(1, 4).toString()).toBe('PNG');
    expect(buf.readUInt32BE(16)).toBe(1586);
    expect(buf.readUInt32BE(20)).toBe(992);
    await expect(page.getByTestId('garden-image-msg')).toHaveText('庭の画像をダウンロードします。');
  });

  test('庭の名前は20文字まで。150問で2つ目の庭が使え、桜を移すと元の庭から外れる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 150, first: true, plant: [['first-1', 0, 0]] }));
    await page.getByTestId('menu-garden').click();
    await page.getByTestId('garden-name').fill('あ'.repeat(21));
    await page.getByTestId('garden-rename').click();
    await expect(page.getByTestId('garden-edit-msg')).toHaveText('庭の名前は20文字までにしてね。');
    await page.getByTestId('garden-name').fill('さくらの庭');
    await page.getByTestId('garden-rename').click();
    await expect(page.getByTestId('garden-switch')).toContainText('さくらの庭');
    await page.getByTestId('garden-switch').selectOption('1');
    await page.getByTestId('scene-slot-0').click();
    await page.getByTestId('slot-plant-first-1').click();
    await expect(page.getByTestId('transfer')).toContainText('この桜は「さくらの庭」にあります。こちらへ移しますか？');
    await page.getByTestId('transfer-yes').click();
    await expect(page.getByTestId('scene-tree-0')).toBeVisible();
    await page.getByTestId('garden-switch').selectOption('0');
    await expect(page.locator('[data-testid^="scene-tree-"]')).toHaveCount(0);
  });
});

test.describe('桜ガーデン：特別な苗', () => {
  const SEVEN = ['yae_beni_shidare', 'kanzan', 'asahiyama', 'ukon', 'gyoiko', 'amanogawa'];
  const hiddenWords = /さいたま|特別な|？？？|\/ ?9\b/;

  test('通常の8種類がそろう前は、名前・画像・枠・総数9などが画面にも読み上げ用の文章にも出ない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 400, first: true, buy: SEVEN }));
    for (const open of ['menu-collection', 'menu-inventory', 'menu-shop', 'garden-help']) {
      await page.getByTestId(open).click();
      const html = await page.evaluate(() => document.documentElement.outerHTML);
      expect(html, open).not.toMatch(hiddenWords);
      await page.getByTestId('sheet-close').click();
    }
    await page.getByTestId('menu-collection').click();
    await expect(page.getByTestId('collection-count')).toHaveText('満開にした桜 0 / 8');
    const loaded = await page.evaluate(() => performance.getEntriesByType('resource').map((r) => r.name).filter((n) => /special|saitama/.test(n)));
    expect(loaded).toEqual([]);
  });

  test('8種類目を手に入れた直後に無料で1本届く（満開は不要）。閉じても持ちものに残り、再読み込みしても二重に届かない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await openGarden(page, seedEvents({ solved: 400, first: true, buy: SEVEN }));
    await page.getByTestId('menu-shop').click();
    await page.getByTestId('shop-buy-kenrokuen_kikuzakura').click();
    await page.getByTestId('shop-confirm-yes').click();
    await page.getByTestId('sheet-close').click();
    await expect(page.getByTestId('special-arrival')).toContainText('あなたの庭に、特別な桜の苗が届きました。');
    // 苗を見なくても、閉じれば持ちものに入っている
    await page.getByTestId('sheet-close').click();
    await page.getByTestId('menu-inventory').click();
    await expect(page.getByTestId('inv-tree-gift-1')).toContainText('さいたま桜');
    await page.getByTestId('sheet-close').click();
    await page.reload();
    await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
    await page.goto('./#/game/garden');
    await expect(page.getByTestId('garden-main')).toBeVisible();
    await expect(page.getByTestId('special-arrival')).toHaveCount(0);
    await page.getByTestId('menu-inventory').click();
    await expect(page.locator('[data-testid="inv-tree-gift-1"]')).toHaveCount(1);
    // 図鑑の分母は8のまま（満開にするまで特別なページは出ない）
    await page.getByTestId('sheet-close').click();
    await page.getByTestId('menu-collection').click();
    await expect(page.getByTestId('collection-count')).toHaveText('満開にした桜 0 / 8');
    await expect(page.getByTestId('collection-special')).toHaveCount(0);
  });

  test('届いたときの知らせで「苗を見る」と名前と苗が表示される。満開にすると特別なページに記録（分母は8のまま）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    const ev = seedEvents({ solved: 500, first: true, buy: [...SEVEN, 'kenrokuen_kikuzakura'], water: [['gift-1', 100]], plant: [['gift-1', 0, 1]] });
    await openGarden(page, ev);
    await page.getByTestId('special-reveal').click();
    await expect(page.getByTestId('special-arrival')).toContainText('さいたま桜');
    await page.getByTestId('sheet-close').click();
    await page.getByTestId('menu-collection').click();
    await expect(page.getByTestId('collection-count')).toHaveText('満開にした桜 0 / 8');
    await expect(page.getByTestId('collection-special')).toContainText('さいたま桜');
  });

  test('動きを減らす設定では、満開の特別な桜の光を出さない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openGarden(page, seedEvents({ solved: 500, first: true, buy: [...SEVEN, 'kenrokuen_kikuzakura'], water: [['gift-1', 100]], plant: [['gift-1', 0, 1]] }));
    await page.getByTestId('sheet-close').click();
    await expect(page.locator('.gscene-sparkle')).toBeHidden();
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await expect(page.locator('.gscene-sparkle')).toBeVisible();
  });
});

test.describe('桜ガーデン：画面の大きさ', () => {
  const full = () => seedEvents({ solved: 360, first: true, buy: ['yae_beni_shidare', 'kanzan'], decos: ['small_pond', 'wooden_bench'], water: [['first-1', 20], ['t-yae_beni_shidare', 50], ['t-kanzan', 50]], plant: [['first-1', 0, 0], ['t-yae_beni_shidare', 0, 1], ['t-kanzan', 0, 2]], place: [['p', 'small_pond', 8, 3], ['b', 'wooden_bench', 3, 2]] });
  for (const [w, h] of [[1368, 912], [1280, 720]] as const) {
    test(`${w}×${h}：満開3本と池を置いても、問題とローマ字・主な操作が画面に収まる（スクロールなし）`, async ({ page }, info) => {
      test.skip(info.project.name !== 'pc');
      await page.setViewportSize({ width: w, height: h });
      await openGarden(page, full());
      for (const id of ['garden-water', 'garden-petals', 'garden-back', 'grow-card', 'garden-start', 'menu-garden', 'menu-shop', 'menu-collection', 'menu-inventory']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.y + b.height, id).toBeLessThanOrEqual(h + 0.5);
      }
      await page.getByTestId('garden-start').click();
      await page.keyboard.press(' ');
      for (const id of ['garden-text', 'garden-kana', 'garden-romaji', 'garden-progress', 'garden-pause']) {
        const b = (await page.getByTestId(id).boundingBox())!;
        expect(b.y + b.height, id).toBeLessThanOrEqual(h + 0.5);
        expect(b.x + b.width, id).toBeLessThanOrEqual(w + 0.5);
      }
      const size = await page.evaluate(() => ({ text: parseFloat(getComputedStyle(document.querySelector('[data-testid="garden-text"]')!).fontSize), sc: [document.documentElement.scrollHeight, innerHeight, document.documentElement.scrollWidth, innerWidth] }));
      expect(size.text).toBeGreaterThanOrEqual(20);
      expect(size.sc[0]).toBeLessThanOrEqual(size.sc[1]!);
      expect(size.sc[2]).toBeLessThanOrEqual(size.sc[3]!);
    });
  }

  test('スマートフォン：横にはみ出さず、画面のキーをタップして入力でき、問題の欄がキーボードに隠れない', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await openGarden(page, full());
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
    await page.getByTestId('garden-count-5').check();
    await page.getByTestId('garden-start').click();
    await page.getByTestId('garden-go').tap();
    const kb = (await page.locator('.gkb').boundingBox())!;
    const text = (await page.getByTestId('garden-romaji').boundingBox())!;
    expect(text.y + text.height).toBeLessThanOrEqual(kb.y);
    expect(kb.x + kb.width).toBeLessThanOrEqual(page.viewportSize()!.width + 0.5);
    const before = await guide(page);
    for (let i = 0; i < 4; i++) await page.locator(`.gkb [data-key="${(await guide(page))[0]}"]`).tap();
    expect((await guide(page)).length).toBeLessThan(before.length);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - innerWidth)).toBeLessThanOrEqual(0);
  });
});
