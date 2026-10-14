/**
 * 文書作成モード（v2.0.0）の E2E テスト（ゲスト・ログイン機能なし）。
 * 日本語入力（IME）の変換は、Chromium の IME 入力（CDP の Input.imeSetComposition / Input.insertText）で再現します。
 * 実際の Microsoft IME（Surface）・Mac の日本語入力・iPad での確認は docs/manual-checks.md の手順で行ってください。
 */
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';
import { readZip } from '../src/core/zip';

const FIX = 'e2e/fixtures/';
const ORDER = (JSON.parse(readFileSync('src/data/exam/document_order.json', 'utf8')) as { order: string[] }).order;
const PROBLEMS = (JSON.parse(readFileSync('src/data/exam/exam_problems.json', 'utf8')) as { problems: Array<{ id: string; title: string; answerText: string }> }).problems;
const FIRST = PROBLEMS.find((p) => p.id === ORDER[0])!;
const FIRST_PARAS = FIRST.answerText.split('\n');

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-exam')).toBeVisible();
}

/** 収録問題を選んで、練習画面の「スタート」の前まで */
async function openBuiltin(page: Page, index = 0) {
  await page.getByTestId('home-exam').click();
  await page.getByTestId('exam-problem').nth(index).click();
  await page.getByTestId('exam-start').click();
  await expect(page.getByTestId('doc-go')).toBeVisible();
}

async function ime(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}
/** 変換中（未確定）の文字を出します */
const compose = (c: CDPSession, text: string) => c.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
/** 確定した文字を入れます（IME の確定と同じ入り方） */
const commitText = (c: CDPSession, text: string) => c.send('Input.insertText', { text });

const box = (page: Page, i: number) => page.getByTestId('doc-input').nth(i);

const guestDocRecords = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('sakura-type:guest-document-history');
    return raw ? (JSON.parse(raw).records as Array<Record<string, unknown>>) : [];
  });

/** 段落をすべて見本どおりに入力します（最後の段落以外は Enter で改行して次へ） */
async function typeAll(page: Page, c: CDPSession, paras: string[]) {
  for (let i = 0; i < paras.length; i++) {
    await expect(box(page, i)).toBeFocused();
    await commitText(c, paras[i]!);
    if (i < paras.length - 1) await page.keyboard.press('Enter');
  }
}

test.describe('文書作成モード：問題の選択', () => {
  test('ホームの③は文書作成モード。収録30問をやさしい順に、タイトル・文字数（改行を除く）・段落数で表示（級は出さない）', async ({ page }) => {
    await guest(page);
    await expect(page.getByTestId('home-exam')).toContainText('文書作成モード');
    await page.getByTestId('home-exam').click();
    await expect(page.getByRole('heading', { name: '文書作成モード', level: 1 })).toBeVisible();
    const items = page.getByTestId('exam-problem');
    await expect(items).toHaveCount(30);
    const ids = await items.evaluateAll((els) => els.map((e) => e.getAttribute('data-problem-id')));
    expect(ids).toEqual(ORDER);
    const first = items.first();
    await expect(first).toContainText(FIRST.title);
    const chars = FIRST.answerText.replace(/\n/g, '').length;
    await expect(first.getByTestId('exam-problem-meta')).toHaveText(`${chars}文字${FIRST_PARAS.length}段落`);
    await expect(page.locator('main')).not.toContainText(/\d級|級相当|自動採点|10分/);
    await page.getByTestId('doc-tab-teacher').click();
    await expect(page.getByTestId('no-problems')).toBeVisible();
  });
});

test.describe('文書作成モード：練習画面', () => {
  test('段落ごとに「番号 → 見本 → 入力欄」を縦に並べる。上部に題名・経過時間・チェック・全文を確認。横にはみ出さない', async ({ page }) => {
    await guest(page);
    await openBuiltin(page);
    await expect(page.getByTestId('doc-para')).toHaveCount(FIRST_PARAS.length);
    await expect(page.getByTestId('doc-title')).toContainText(FIRST.title);
    await expect(page.getByTestId('doc-timer')).toContainText('0分0秒');
    for (const id of ['doc-check', 'doc-full', 'doc-done']) await expect(page.getByTestId(id)).toBeVisible();
    // 見本の下に入力欄（左右に分けない）
    const s = (await page.getByTestId('doc-sample').first().boundingBox())!;
    const t = (await box(page, 0).boundingBox())!;
    expect(t.y).toBeGreaterThan(s.y + s.height - 1);
    expect(Math.abs(t.x - s.x)).toBeLessThan(4);
    await expect(page.getByTestId('doc-sample').first()).toContainText(FIRST_PARAS[0]!);
    // スタート前は入力できない
    await expect(box(page, 0)).toHaveAttribute('readonly', '');
    await page.getByTestId('doc-go').click();
    await expect(box(page, 0)).toBeFocused();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('Enter：段落の終わりでは改行を記録して次の段落へ。文の途中では改行を入れて移らない。押しっぱなし・空の段落では進まない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    // 空の段落で Enter：進まず、案内を出す
    await page.keyboard.press('Enter');
    await expect(box(page, 0)).toBeFocused();
    await expect(box(page, 0)).toHaveValue('');
    await expect(page.getByTestId('doc-hint')).toContainText('入力してから');
    // スペースは入力欄に入る（奪わない）
    await commitText(c, '朝、窓');
    await page.keyboard.press('Space');
    await expect(box(page, 0)).toHaveValue('朝、窓 ');
    await page.keyboard.press('Backspace');
    // 文の途中の Enter：その位置に改行（次へは移らない）
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    await expect(box(page, 0)).toHaveValue('朝、\n窓');
    await expect(box(page, 0)).toBeFocused();
    await page.keyboard.press('Backspace');
    await expect(box(page, 0)).toHaveValue('朝、窓');
    await page.keyboard.press('End');
    // 段落の終わりの Enter：改行を記録して次へ
    await page.keyboard.press('Enter');
    await expect(box(page, 1)).toBeFocused();
    await expect(box(page, 0)).toHaveValue('朝、窓'); // 欄の本文には改行を足さない（記録だけ）
    await expect(page.getByTestId('doc-para').first().getByTestId('doc-break-done')).toBeVisible();
    // 押しっぱなしの Enter（繰り返し）では、空の段落を飛ばして進まない
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.down('Enter');
    await page.keyboard.up('Enter');
    await expect(box(page, 1)).toBeFocused();
    await expect(page.getByTestId('doc-para').nth(1).getByTestId('doc-break-done')).toHaveCount(0);
    // 段落の先頭の Backspace：前の段落の改行を消して、前の段落の終わりへ（文字は消さない）
    await page.keyboard.press('Backspace');
    await expect(box(page, 0)).toBeFocused();
    await expect(box(page, 0)).toHaveValue('朝、窓');
    await expect(page.getByTestId('doc-para').first().getByTestId('doc-break-done')).toHaveCount(0);
    const caret = await box(page, 0).evaluate((el: HTMLTextAreaElement) => el.selectionStart);
    expect(caret).toBe(3);
    // もう一度 Enter で改行を記録 → Delete（段落の終わり）で記録を消す
    await page.keyboard.press('Enter');
    await expect(box(page, 1)).toBeFocused();
    await page.keyboard.press('ArrowUp');
    await expect(box(page, 0)).toBeFocused();
    await page.keyboard.press('Delete');
    await expect(page.getByTestId('doc-para').first().getByTestId('doc-break-done')).toHaveCount(0);
  });

  test('IME：変換中の Enter（確定）では改行も移動もしない。確定した文字は入力欄に入る。元に戻す（Ctrl+Z）も使える', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    await compose(c, 'あさ');
    await expect(box(page, 0)).toHaveValue('あさ');
    await expect(page.getByTestId('doc-count')).toContainText('入力 0文字');
    // 変換中の Enter：確定の操作（keydown の isComposing・keyCode 229）。改行・移動の処理をしない
    await box(page, 0).evaluate((el) => {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', isComposing: true, keyCode: 229, bubbles: true, cancelable: true }));
    });
    await commitText(c, '朝');
    await expect(box(page, 0)).toHaveValue('朝');
    // 確定の直後の Enter（ブラウザによっては変換中の印が付かない）も、改行として二重に処理しない
    await box(page, 0).evaluate((el) => {
      el.dispatchEvent(new CompositionEvent('compositionend', { data: '朝', bubbles: true }));
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', code: 'Enter', bubbles: true, cancelable: true }));
    });
    await expect(box(page, 0)).toBeFocused();
    await expect(box(page, 0)).toHaveValue('朝');
    await expect(page.getByTestId('doc-para').first().getByTestId('doc-break-done')).toHaveCount(0);
    await expect(page.getByTestId('doc-count')).toContainText('入力 1文字');
    // 確定してからの Enter は改行として扱う
    await page.waitForTimeout(100);
    await page.keyboard.press('Enter');
    await expect(box(page, 1)).toBeFocused();
    // 元に戻す・範囲選択はブラウザのまま
    await commitText(c, 'わたしは');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Shift+ArrowLeft');
    await page.keyboard.press('Delete');
    await expect(box(page, 1)).toHaveValue('わた');
    await page.keyboard.press('ControlOrMeta+z');
    await expect(box(page, 1)).toHaveValue('わたしは');
  });

  test('生徒の入力欄には貼り付けできない（先生の問題の登録欄では貼り付けできる：別のテスト）', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'pc');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    await page.evaluate(() => navigator.clipboard.writeText('貼り付けた文章'));
    await page.keyboard.press('ControlOrMeta+v');
    await expect(box(page, 0)).toHaveValue('');
  });

  test('チェック：押したときだけ、違う字に赤い波線・抜けに小さな印。未入力の段落と入力中の段落の残りは誤りにしない。直すとその段落の表示を外す', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    const p0 = FIRST_PARAS[0]!;
    // 1文字を違う字に、もう1文字を抜かす（途中の1文字の抜けで、後ろがすべて誤りにならない）
    const typo = p0.slice(0, 2) + '×' + p0.slice(3, 6) + p0.slice(7);
    await commitText(c, typo);
    // 入力中は何も知らせない
    await expect(page.getByTestId('doc-wavy')).toHaveCount(0);
    await page.keyboard.press('Enter');
    await commitText(c, FIRST_PARAS[1]!.slice(0, 5));
    await page.getByTestId('doc-check').click();
    const para0 = page.getByTestId('doc-para').first();
    await expect(para0.getByTestId('doc-wavy')).toHaveCount(1);
    await expect(para0.getByTestId('doc-wavy')).toHaveText('×');
    await expect(para0.locator('[data-testid="doc-pin"][data-kind="missing"]')).toHaveCount(1);
    await expect(para0.getByTestId('doc-notes')).toContainText(`「${p0[2]}」と違う文字です`);
    // 印は本文に入れない
    await expect(box(page, 0)).toHaveValue(typo);
    // 入力中の段落（段落2）の残り・まだ入力していない段落は誤りにしない
    await expect(page.getByTestId('doc-para').nth(1).getByTestId('doc-mirror')).toHaveCount(0);
    await expect(page.getByTestId('doc-para').nth(1)).toContainText('見本と同じです（入力したところまで）');
    await expect(page.getByTestId('doc-para').nth(2).getByTestId('doc-notes')).toHaveCount(0);
    await expect(page.getByTestId('doc-msg')).toContainText('文字の違い 2か所');
    // 写しは入力欄と同じ位置・同じ大きさ
    const a = (await box(page, 0).boundingBox())!;
    const m = (await para0.getByTestId('doc-mirror').boundingBox())!;
    expect(Math.abs(a.x - m.x) + Math.abs(a.y - m.y) + Math.abs(a.width - m.width) + Math.abs(a.height - m.height)).toBeLessThan(2);
    // 直すと、その段落のチェックの表示を外す（自動では再チェックしない）
    await box(page, 0).click();
    await page.keyboard.press('End');
    await commitText(c, 'あ');
    await expect(para0.getByTestId('doc-mirror')).toHaveCount(0);
    await expect(para0.getByTestId('doc-stale')).toBeVisible();
    // 変換中はチェックしない（入力欄から離れずに押したとき。マウスで押すと、多くの IME はその前に確定します）
    await compose(c, 'か');
    await page.getByTestId('doc-check').dispatchEvent('click');
    await expect(page.getByTestId('doc-msg')).toContainText('変換中の文字があります');
  });

  test('空白・改行の違いは文字の誤りと分けて示す。押していない改行は補わない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    const p0 = FIRST_PARAS[0]!;
    await commitText(c, p0.slice(0, 3) + ' ' + p0.slice(3));
    // Enter を押さずに次の段落へ（矢印で移動）
    await page.keyboard.press('ArrowDown');
    await expect(box(page, 1)).toBeFocused();
    await commitText(c, FIRST_PARAS[1]!.slice(0, 4));
    await page.getByTestId('doc-check').click();
    const para0 = page.getByTestId('doc-para').first();
    await expect(para0.getByTestId('doc-wavy')).toHaveCount(1);
    await expect(para0.locator('[data-kind="space"]')).toHaveCount(1);
    await expect(para0.locator('[data-kind="missingBreak"]')).toHaveCount(1);
    await expect(page.getByTestId('doc-msg')).toContainText('文字の違い 0か所');
    await expect(page.getByTestId('doc-msg')).toContainText('空白・改行の違い 2か所');
    // 全文：本人の入力だけ（押していない改行は補わない）
    await page.getByTestId('doc-full').click();
    await expect(page.getByTestId('doc-full-paper').getByTestId('doc-paper-body')).toHaveText(p0.slice(0, 3) + ' ' + p0.slice(3) + FIRST_PARAS[1]!.slice(0, 4));
  });

  test('経過時間：スタートから測り、全文の確認中も進み、完成！で止まる。空の段落があると完成できず、その段落へ案内', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await openBuiltin(page);
    await page.clock.runFor(30_000); // スタート前は数えない
    await expect(page.getByTestId('doc-timer')).toContainText('0分0秒');
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    await commitText(c, FIRST_PARAS[0]!);
    await page.keyboard.press('Enter');
    await page.getByTestId('doc-full').click();
    await expect(page.getByTestId('doc-full-view')).toBeVisible();
    await expect(page.getByTestId('doc-full-paper')).toContainText(FIRST.title);
    await expect(page.getByTestId('doc-full-paper').getByTestId('doc-paper-body')).toHaveText(FIRST_PARAS[0]! + '\n');
    await page.clock.runFor(65_000);
    await page.getByTestId('doc-full-back').click();
    await expect(page.getByTestId('doc-timer')).toContainText('1分5秒');
    // 空の段落があると完成できない → その段落へ
    await page.getByTestId('doc-done').click();
    await expect(page.getByTestId('doc-msg')).toContainText('段落 2 がまだ空です');
    await expect(box(page, 1)).toBeFocused();
    // 空白だけの入力も「空」
    await commitText(c, '　 ');
    await page.getByTestId('doc-done').click();
    await expect(page.getByTestId('doc-msg')).toContainText('段落 2 がまだ空です');
  });

  test('完成：誤りがあっても完成でき、本人の入力どおりの文書を表示（波線なし）。間違いの確認は切り替えて表示。記録は1回だけ', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await page.clock.install();
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    const paras = [...FIRST_PARAS];
    paras[1] = paras[1]!.replace(/。/, '、'); // 誤字を残す
    await typeAll(page, c, paras);
    // 変換中は完成しない
    await compose(c, 'て');
    await page.getByTestId('doc-done').dispatchEvent('click');
    await expect(page.getByTestId('doc-msg')).toContainText('変換中の文字があります');
    await commitText(c, 'て');
    await page.keyboard.press('Backspace');
    await page.clock.runFor(125_000);
    await page.getByTestId('doc-done').click();
    // 連打しても記録は1回
    await page.getByTestId('doc-done-confirm').dblclick();
    await expect(page).toHaveURL(/#\/exam\/result/);
    await expect(page.getByTestId('doc-result-title')).toHaveText('文書が完成しました');
    await expect(page.getByTestId('doc-elapsed')).toHaveText('2分5秒');
    const paper = page.getByTestId('doc-result-paper');
    await expect(paper.locator('h1')).toHaveText(FIRST.title);
    await expect(paper.getByTestId('doc-paper-body')).toHaveText(paras.join('\n'));
    await expect(paper.getByTestId('doc-wavy')).toHaveCount(0);
    await expect(page.getByTestId('doc-save-state')).toContainText('記録を保存しました');
    await page.getByTestId('doc-show-check').click();
    await expect(page.getByTestId('doc-review-summary')).toContainText('文字の違い 1か所');
    await expect(page.getByTestId('doc-review').getByTestId('doc-wavy')).toHaveCount(1);
    const recs = await guestDocRecords(page);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ problemId: FIRST.id, problemTitle: FIRST.title, problemRevision: 1, status: 'completed', textErrors: 1, wrongChars: 1, spaceErrors: 0, breakErrors: 0, rulesVersion: 'doc-v1' });
    expect(recs[0]!.elapsedMs).toBeGreaterThanOrEqual(125_000);
    expect(recs[0]!.elapsedMs).toBeLessThan(126_000);
    // 記録に本文を含めない
    expect(JSON.stringify(recs)).not.toContain(paras[1]!.slice(0, 12));
    // 記録の画面：文書作成の記録（旧検定の記録とは別）
    await page.evaluate(() => (location.hash = '#/history'));
    await page.getByTestId('tab-exam').click();
    await expect(page.getByTestId('doc-history-row')).toHaveCount(1);
    await expect(page.getByTestId('doc-history-row')).toContainText(FIRST.title);
  });

  test('途中でやめる：その時点の入力で「途中で終了」として記録', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    await commitText(c, 'あいう');
    await page.getByTestId('doc-quit').click();
    await page.getByTestId('doc-quit-confirm').click();
    await expect(page.getByTestId('doc-result-title')).toHaveText('途中で終了しました');
    const recs = await guestDocRecords(page);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ status: 'quit', inputChars: 3 });
  });
});

test.describe('文書作成モード：印刷・Word', () => {
  async function complete(page: Page) {
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    const paras = [...FIRST_PARAS];
    paras[0] = '　' + paras[0]!.replace('。', '。  ') + '\t';
    await typeAll(page, c, paras);
    await page.getByTestId('doc-done').click();
    await page.getByTestId('doc-done-confirm').click();
    await expect(page.getByTestId('doc-result')).toBeVisible();
    return paras;
  }

  test('印刷：タイトルと本人の全文だけ（ボタン・ヘッダー・見本・時間は印刷しない）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await complete(page);
    await page.getByTestId('doc-show-check').click();
    await page.emulateMedia({ media: 'print' });
    await expect(page.getByTestId('doc-result-paper')).toBeVisible();
    for (const id of ['doc-print', 'doc-word', 'doc-elapsed', 'doc-review']) await expect(page.getByTestId(id)).toBeHidden();
    await expect(page.locator('.app-header')).toBeHidden();
    const pdf = await page.pdf({ format: 'A4' });
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    await page.emulateMedia({ media: 'screen' });
  });

  test('Word で保存：本物の .docx（A4・日本語の書体）。本人の改行・空白・誤字のまま。ファイル名はタイトル', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    const paras = await complete(page);
    const dl = page.waitForEvent('download');
    await page.getByTestId('doc-word').click();
    const d = await dl;
    expect(d.suggestedFilename()).toBe(`${FIRST.title}.docx`);
    const bytes = new Uint8Array(readFileSync(await d.path()));
    const files = readZip(bytes);
    const doc = new TextDecoder().decode(files.find((f) => f.name === 'word/document.xml')!.data);
    expect(doc).toContain('w:w="11906" w:h="16838"');
    expect(doc).toContain(`<w:t xml:space="preserve">${FIRST.title}</w:t>`);
    expect(doc).toContain('<w:tab/>');
    expect(doc).toContain(paras[0]!.replace('\t', '').split('  ')[0]);
    expect(doc).toContain('。  ');
    expect(doc.match(/<w:p>|<w:p /g)!.length).toBe(1 + paras.length);
    const styles = new TextDecoder().decode(files.find((f) => f.name === 'word/styles.xml')!.data);
    expect(styles).toContain('游明朝');
    await expect(page.getByTestId('doc-word-msg')).toContainText('保存しました');
  });
});

test.describe('文書作成モード：先生の問題', () => {
  async function newProblem(page: Page) {
    await page.getByTestId('home-exam').click();
    await page.getByTestId('doc-manage').click();
    await page.getByTestId('new-problem').click();
    await expect(page.getByTestId('exam-editor')).toBeVisible();
  }

  test('タイトル＋見本の文章（貼り付けできる）で登録 → 段落のプレビュー → 生徒用プレビュー → 編集・複製・非表示・削除', async ({ page, context }, info) => {
    test.skip(info.project.name !== 'pc');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    await guest(page);
    await newProblem(page);
    await expect(page.getByTestId('exam-editor')).not.toContainText(/級|制限時間/);
    await page.getByTestId('ep-title').fill('朝の会');
    await page.evaluate(() => navigator.clipboard.writeText('今日の予定を話します。\n\n係の仕事を確かめます。'));
    await page.getByTestId('ep-sample').focus();
    await page.keyboard.press('ControlOrMeta+v');
    await expect(page.getByTestId('ep-sample')).toHaveValue('今日の予定を話します。\n\n係の仕事を確かめます。');
    // 空の行は勝手に消さず、知らせる
    await expect(page.getByTestId('ep-issues')).toContainText('空の行');
    await page.getByTestId('ep-confirmed').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('editor-errors')).toBeVisible();
    await page.getByTestId('ep-remove-blank').click();
    await expect(page.getByTestId('ep-sample')).toHaveValue('今日の予定を話します。\n係の仕事を確かめます。');
    await expect(page.getByTestId('ep-paragraphs').locator('li')).toHaveCount(2);
    // 見本を変えたら、段落の確認はやり直し
    await expect(page.getByTestId('ep-confirmed')).not.toBeChecked();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('editor-errors')).toContainText('段落の区切りを確認');
    await page.getByTestId('ep-confirmed').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-msg')).toContainText('保存しました');
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
    // 生徒用プレビュー（記録しない）
    await page.getByTestId('manage-preview').click();
    await expect(page.getByTestId('doc-para')).toHaveCount(2);
    await page.getByTestId('doc-go').click();
    const c = await ime(page);
    await typeAll(page, c, ['今日の予定を話します。', '係の仕事を確かめます。']);
    await page.getByTestId('doc-done').click();
    await page.getByTestId('doc-done-confirm').click();
    await expect(page.getByTestId('doc-result-title')).toHaveText('文書が完成しました');
    expect(await guestDocRecords(page)).toHaveLength(0);
    // 生徒の一覧に出る
    await page.getByTestId('doc-back').click();
    await page.getByTestId('doc-tab-teacher').click();
    await expect(page.getByTestId('exam-problem')).toHaveCount(1);
    await expect(page.getByTestId('exam-problem-meta')).toHaveText('22文字2段落');
    // 編集で改訂番号が上がる・複製・非表示・削除
    await page.getByTestId('doc-manage').click();
    await page.getByTestId('manage-edit').click();
    await page.getByTestId('ep-title').fill('朝の会（改）');
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-row')).toContainText('朝の会（改）');
    await page.getByTestId('manage-copy').click();
    await expect(page.getByTestId('manage-row')).toHaveCount(2);
    await page.getByTestId('manage-row').nth(1).getByTestId('manage-visible').click();
    await expect(page.getByTestId('manage-row').nth(1).getByTestId('manage-visible')).not.toBeChecked();
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('manage-row').nth(1).getByTestId('manage-delete').click();
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
  });

  test('旧検定の画像の問題（見本の文章なし）：原本は残し、見本の文章を登録・確認するまで使えない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await page.getByTestId('home-exam').click();
    await page.getByTestId('doc-tab-teacher').click();
    await expect(page.getByTestId('no-problems')).toBeVisible();
    // v1.9.0 までに保存された問題（画像のお手本・採点なし）を、この端末の保存先に置きます
    const png = Array.from(readFileSync(`${FIX}print.png`));
    await page.evaluate(async (bytes) => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('sakura-type-exam', 1);
        r.onupgradeneeded = () => {
          r.result.createObjectStore('problems', { keyPath: 'id' });
          r.result.createObjectStore('files', { keyPath: 'id' });
        };
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const tx = db.transaction(['problems', 'files'], 'readwrite');
      tx.objectStore('files').put({ id: 'f-legacy-1', name: 'print.png', type: 'image/png', size: bytes.length, blob: new Blob([new Uint8Array(bytes)], { type: 'image/png' }), sha256: null });
      tx.objectStore('problems').put({
        id: 'tp-legacy-1',
        revision: 3,
        title: '旧検定のプリント',
        grade: 'pre2',
        source: 'teacher',
        timeLimitSeconds: 600,
        scoringEnabled: false,
        answerText: null,
        answerConfirmed: false,
        visible: true,
        material: { kind: 'image', pages: [{ fileId: 'f-legacy-1', rotation: 0 }] },
        createdAt: '2026-09-01T00:00:00.000Z',
        updatedAt: '2026-09-01T00:00:00.000Z',
      });
      await new Promise((res) => (tx.oncomplete = res));
      db.close();
    }, png);
    await page.getByTestId('doc-manage').click();
    const row = page.getByTestId('manage-row');
    await expect(row).toHaveCount(1);
    await expect(row.getByTestId('manage-sample-state')).toContainText('見本の文章を登録・確認すると使用できます');
    await expect(row.getByTestId('manage-preview')).toBeDisabled();
    // 生徒の一覧には出さない
    await page.goBack();
    await page.getByTestId('doc-tab-teacher').click();
    await expect(page.getByTestId('exam-problem')).toHaveCount(0);
    await expect(page.getByTestId('doc-hidden-note')).toContainText('1問');
    // 見本の文章を登録・確認すると使える（原本は残る・改訂番号は上がる・ID は同じ）
    await page.getByTestId('doc-manage').click();
    await page.getByTestId('manage-edit').click();
    await expect(page.getByTestId('legacy-original')).toBeVisible();
    await page.getByTestId('ep-sample').fill('プリントの一段落目です。\nプリントの二段落目です。');
    await page.getByTestId('ep-confirmed').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-msg')).toContainText('保存しました');
    await expect(row.getByTestId('manage-sample-state')).not.toContainText('使用できます');
    const stored = await page.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res) => {
        const r = indexedDB.open('sakura-type-exam');
        r.onsuccess = () => res(r.result);
      });
      const get = (s: string, k: string) =>
        new Promise<unknown>((res) => {
          const q = db.transaction(s).objectStore(s).get(k);
          q.onsuccess = () => res(q.result);
        });
      const p = (await get('problems', 'tp-legacy-1')) as { revision: number; material: { kind: string; pages: Array<{ fileId: string }> } };
      const f = await get('files', 'f-legacy-1');
      return { revision: p.revision, kind: p.material.kind, fileId: p.material.pages[0]!.fileId, file: !!f };
    });
    expect(stored).toEqual({ revision: 4, kind: 'image', fileId: 'f-legacy-1', file: true });
    await page.goBack();
    await page.getByTestId('doc-tab-teacher').click();
    await expect(page.getByTestId('exam-problem')).toHaveCount(1);
    await expect(page.getByTestId('exam-problem')).toContainText('旧検定のプリント');
  });

  test('教材パック（版2）：文章の問題と並び順を書き出し、別のブラウザ環境で読み込める。版1（旧検定）のパックも読める', async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await newProblem(page);
    await page.getByTestId('ep-title').fill('配布する文章');
    await page.getByTestId('ep-sample').fill('配布用の見本です。\n二段落目です。');
    await page.getByTestId('ep-confirmed').check();
    await page.getByTestId('ep-order').fill('5');
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
    await page.getByTestId('manage-row').getByRole('checkbox', { name: /書き出す/ }).check();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-pack').click();
    const packPath = await (await dl).path();
    const pack = readFileSync(packPath);
    const len = pack.readUInt32BE(17);
    const manifest = JSON.parse(pack.subarray(21, 21 + len).toString('utf8'));
    expect(manifest.version).toBe(2);
    expect(manifest.problems[0]).toMatchObject({ title: '配布する文章', sortOrder: 5, material: { kind: 'text' }, answerText: '配布用の見本です。\n二段落目です。' });
    for (const w of ['password', 'access_token', 'textErrors']) expect(pack.includes(Buffer.from(w))).toBe(false);

    const other = await (browser as Browser).newContext({ baseURL: info.project.use.baseURL, locale: 'ja-JP' });
    const p2 = await other.newPage();
    await guest(p2);
    await p2.getByTestId('home-exam').click();
    await p2.getByTestId('doc-tab-teacher').click();
    await p2.getByTestId('pack-input').setInputFiles(packPath);
    await expect(p2.getByTestId('import-plan')).toContainText('新しく追加');
    await p2.getByRole('button', { name: 'この端末に追加する' }).click();
    await expect(p2.getByText('1問をこの端末に追加しました')).toBeVisible();
    await expect(p2.getByTestId('exam-problem')).toContainText('配布する文章');

    // 版1（v1.x の検定モード）の教材パック：画像の問題（正解文あり・確認済み）
    const png = readFileSync(`${FIX}print.png`);
    const { createHash } = await import('node:crypto');
    const v1 = {
      format: 'sakura-type-exam-pack',
      version: 1,
      appVersion: '1.9.0',
      exportedAt: '2026-10-01T00:00:00.000Z',
      problems: [
        {
          id: 'tp-v1-pack',
          revision: 2,
          title: '旧パックの問題',
          grade: '3',
          timeLimitSeconds: 600,
          scoringEnabled: true,
          answerText: '旧パックの見本です。\n二段落目です。',
          answerConfirmed: true,
          visible: true,
          material: { kind: 'image', pages: [{ fileId: 'f-v1-pack', rotation: 0 }] },
          createdAt: '2026-09-01T00:00:00.000Z',
          updatedAt: '2026-09-01T00:00:00.000Z',
        },
      ],
      files: [{ id: 'f-v1-pack', name: 'print.png', type: 'image/png', size: png.length, offset: 0, sha256: createHash('sha256').update(png).digest('hex') }],
    };
    const json = Buffer.from(JSON.stringify(v1));
    const head = Buffer.alloc(4);
    head.writeUInt32BE(json.length);
    await p2.getByTestId('pack-input').setInputFiles({ name: 'old.sakuraexam', mimeType: 'application/octet-stream', buffer: Buffer.concat([Buffer.from('SAKURA-EXAM-PACK\n'), head, json, png]) });
    await expect(p2.getByTestId('import-plan')).toContainText('新しく追加');
    await p2.getByRole('button', { name: 'この端末に追加する' }).click();
    await expect(p2.getByText('1問をこの端末に追加しました')).toBeVisible();
    await expect(p2.getByTestId('exam-problem')).toHaveCount(2);
    await expect(p2.getByTestId('exam-problem').nth(0)).toContainText('配布する文章'); // 並び順 5 が先
    await expect(p2.getByTestId('exam-problem').nth(1)).toContainText('旧パックの問題');
    await other.close();
  });
});

test.describe('文書作成モード：旧検定モードの記録', () => {
  test('v1.9.0 までの検定モードの記録は「旧検定モードの記録」として、当時の成績のまま表示する', async ({ page }) => {
    await guest(page);
    await page.evaluate(() => {
      localStorage.setItem(
        'sakura-type:guest-exam-history',
        JSON.stringify({
          version: 1,
          records: [
            {
              id: 'legacy-exam-1',
              startedAt: '2026-09-20T01:00:00.000Z',
              problemId: 'exam-original-4-01',
              problemTitle: '旧検定の記録の問題',
              problemRevision: 1,
              problemSource: 'builtin',
              grade: '4',
              timeLimitSeconds: 600,
              elapsedMs: 600000,
              endReason: 'time_up',
              fullTextCompleted: false,
              scoringEnabled: true,
              inputChars: 230,
              matchedChars: 225,
              missCount: 5,
              scoreChars: 220,
              penaltyPerError: 1,
              targetCharacters: 200,
              achieved: true,
              scoringVersion: 'exam-v1',
            },
          ],
        }),
      );
      location.hash = '#/history';
    });
    await page.getByTestId('tab-exam').click();
    await expect(page.getByTestId('doc-history-empty')).toBeVisible();
    const legacy = page.getByTestId('legacy-exam-records');
    await expect(legacy).toContainText('旧検定モードの記録');
    await expect(legacy).toContainText('旧検定の記録の問題');
    await expect(legacy).toContainText('220');
  });
});

test.describe('文書作成モード：画面の幅', () => {
  test('スマートフォンの幅でも横にはみ出さず、見本と入力欄が縦に並ぶ', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('doc-go').click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await box(page, 0).fill('朝、窓の外を見ると');
    await expect(box(page, 0)).toHaveValue('朝、窓の外を見ると');
  });
});
