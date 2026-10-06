/**
 * 検定モード（v1.1.0）の E2E テスト（ゲスト・ログイン機能なし）。
 * 日本語入力（IME）の変換は、Chromium の IME 入力（CDP の Input.imeSetComposition / Input.insertText）で再現します。
 * 実際の Microsoft IME・iPad の日本語入力での確認は docs/manual-checks.md の手順で行ってください。
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { expect, test, type Browser, type CDPSession, type Page } from '@playwright/test';

const FIX = 'e2e/fixtures/';

async function guest(page: Page) {
  await page.goto('./');
  await page.getByRole('button', { name: /ゲストで練習/ }).first().click();
  await expect(page.getByTestId('home-exam')).toBeVisible();
}

async function openBuiltin(page: Page, index = 0, time?: string) {
  await page.getByTestId('home-exam').click();
  await page.getByTestId('exam-problem').nth(index).click();
  if (time) await page.getByRole('radio', { name: time }).check();
  await page.getByTestId('exam-start').click();
  await expect(page.getByTestId('exam-go')).toBeVisible();
}

async function ime(page: Page): Promise<CDPSession> {
  return page.context().newCDPSession(page);
}
/** 変換中（未確定）の文字を出します */
const compose = (c: CDPSession, text: string) => c.send('Input.imeSetComposition', { text, selectionStart: text.length, selectionEnd: text.length });
/** 変換を確定します */
const commitText = (c: CDPSession, text: string) => c.send('Input.insertText', { text });

const guestExamRecords = (page: Page) =>
  page.evaluate(() => {
    const raw = localStorage.getItem('sakura-type:guest-exam-history');
    return raw ? (JSON.parse(raw).records as Array<Record<string, unknown>>) : [];
  });

test.describe('検定モード', () => {
  test('ホームから選べて、収録問題は6段階×5問。問題名・段階・制限時間・自動採点の有無を表示', async ({ page }) => {
    await guest(page);
    await page.getByTestId('home-exam').click();
    await expect(page.getByRole('heading', { name: '検定モード（文章入力）' })).toBeVisible();
    for (const g of ['4級相当', '3級相当', '準2級相当', '2級相当', '準1級相当', '1級相当']) {
      await page.getByRole('radio', { name: g, exact: true }).check();
      await expect(page.getByTestId('exam-problem')).toHaveCount(5);
      await expect(page.getByTestId('exam-problem').first()).toContainText(g);
      await expect(page.getByTestId('exam-problem').first()).toContainText('制限時間：10分');
      await expect(page.getByTestId('exam-problem').first()).toContainText('自動採点あり');
    }
    await page.getByRole('button', { name: '先生の追加問題', exact: true }).click();
    await expect(page.getByTestId('no-problems')).toBeVisible();
  });

  test('スペースキーで開始（本文に入らない）、入力中のスペース・Enter は奪わない、変換中は数えない', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await openBuiltin(page);
    const input = page.getByTestId('exam-input');
    await expect(input).toHaveAttribute('readonly', '');
    await page.keyboard.press('Space');
    await expect(input).toBeFocused();
    await expect(input).toHaveValue('');
    await page.keyboard.type('ab cd');
    await page.keyboard.press('Enter');
    await expect(input).toHaveValue('ab cd\n');
    await expect(page.getByTestId('exam-count')).toContainText('4');
    await input.fill('');
    await input.dispatchEvent('input');
    // IME：変換中の文字は数えず、確定したら数える
    const c = await ime(page);
    await compose(c, 'あさ');
    await expect(input).toHaveValue('あさ');
    await expect(page.getByTestId('exam-count')).toContainText('入力 0 文字');
    await commitText(c, '朝');
    await expect(input).toHaveValue('朝');
    await expect(page.getByTestId('exam-count')).toContainText('入力 1 文字');
    // 確定後の削除も自然に動く
    await page.keyboard.press('Backspace');
    await expect(page.getByTestId('exam-count')).toContainText('入力 0 文字');
  });

  test('採点：1文字の置換と途中の脱落はそれぞれ1ミス、未入力の末尾はミスにしない。違いを凡例つきで表示', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    // お手本「朝、学校に着いたら、まず教室であいさつをします。」→「校」を「行」に置換、「ま」を脱落
    await page.getByTestId('exam-input').pressSequentially('朝、学行に着いたら、ず教室であいさつをします。');
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').click();
    await expect(page).toHaveURL(/#\/exam\/result/);
    await expect(page.getByTestId('stat-input')).toContainText('23');
    await expect(page.getByTestId('stat-miss')).toContainText('2');
    await expect(page.getByTestId('stat-matched')).toContainText('22');
    await expect(page.getByTestId('stat-score')).toContainText('21');
    await expect(page.getByTestId('exam-end-label')).toHaveText('途中終了');
    await expect(page.getByTestId('judge-skip')).toBeVisible();
    await expect(page.getByTestId('diff-legend')).toBeVisible();
    await expect(page.getByTestId('exam-diff').locator('.d-sub')).toHaveText(/行→校/);
    await expect(page.getByTestId('exam-diff').locator('.d-del')).toContainText('抜:ま');
    await expect(page.getByTestId('diff-rest')).toContainText('ミスに数えません');
    const recs = await guestExamRecords(page);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ problemId: 'exam-original-4-01', problemRevision: 1, missCount: 2, scoreChars: 21, achieved: null });
    // 記録に入力本文を含めない
    expect(JSON.stringify(recs)).not.toContain('学行');
  });

  test('空の入力でも採点が破綻しない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await openBuiltin(page, 0, '時間制限なし');
    await page.getByTestId('exam-go').click();
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').click();
    await expect(page.getByTestId('stat-input')).toContainText('0');
    await expect(page.getByTestId('stat-miss')).toContainText('0');
    await expect(page.getByTestId('exam-end-label')).toHaveText('終了（時間制限なし）');
  });

  test('10分の計測を完了：時間になった瞬間の確定済みの文章で終わり、変換中の文字と締切後の確定は加えない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    const input = page.getByTestId('exam-input');
    await input.pressSequentially('朝、学校に着いたら、まず教室であいさつをします。');
    const c = await ime(page);
    await compose(c, 'かばん');
    await expect(page.getByTestId('exam-count')).toContainText('入力 24 文字');
    await page.clock.runFor(600_000);
    await expect(page).toHaveURL(/#\/exam\/result/);
    await commitText(c, '鞄').catch(() => {});
    await expect(page.getByTestId('stat-input')).toContainText('24');
    await expect(page.getByTestId('stat-elapsed')).toHaveText('10分00秒');
    await expect(page.getByTestId('exam-end-label')).toHaveText('10分の計測を完了');
    // 4級相当の目安200文字に届かない
    await expect(page.getByTestId('judge-not-yet')).toContainText('目安まであと 176文字');
    const recs = await guestExamRecords(page);
    expect(recs).toHaveLength(1);
    expect(recs[0]).toMatchObject({ endReason: 'time_up', elapsedMs: 600000, inputChars: 24, achieved: false });
  });

  test('目安達成：標準10分を完了し、得点文字数が基準以上', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    const text = JSON.parse(readFileSync('src/data/exam/exam_problems.json', 'utf8')).problems[0].answerText as string;
    await page.clock.install();
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    await page.getByTestId('exam-input').fill(text.slice(0, 230));
    await page.clock.runFor(600_000);
    await expect(page.getByTestId('judge-achieved')).toContainText('目安達成');
    await expect(page.getByText('公式検定の合格を認定するものではありません')).toBeVisible();
    await expect(page.getByText('合格しました')).toHaveCount(0);
  });

  test('別のタブに切り替えている間も時間は進み、戻ったときに締め切られる', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await page.clock.install();
    await guest(page);
    await openBuiltin(page, 0, '3分');
    await page.getByTestId('exam-go').click();
    await page.getByTestId('exam-input').pressSequentially('朝、学校');
    // タブが非表示の間はタイマーが動かないことがあるため、時間だけを進めてから表示に戻します
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await page.clock.fastForward(5 * 60_000);
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await expect(page).toHaveURL(/#\/exam\/result/);
    await expect(page.getByTestId('stat-elapsed')).toHaveText('3分00秒');
    await expect(page.getByTestId('exam-end-label')).toHaveText('時間いっぱいまで練習');
    await expect(page.getByTestId('judge-skip')).toContainText('3分の練習のため');
  });

  test('全文を入力して早く終えたら「全文入力完了」（目安達成の判定とは区別）', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    const text = JSON.parse(readFileSync('src/data/exam/exam_problems.json', 'utf8')).problems[0].answerText as string;
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    await page.getByTestId('exam-input').fill(text);
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').click();
    await expect(page.getByTestId('exam-end-label')).toHaveText('全文入力完了');
    await expect(page.getByTestId('judge-fulltext')).toBeVisible();
    await expect(page.getByTestId('stat-miss')).toContainText('0');
  });

  test('終了ボタンの連打でも結果と記録は1回だけ', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    await page.getByTestId('exam-input').pressSequentially('朝');
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').dblclick();
    await expect(page).toHaveURL(/#\/exam\/result/);
    expect(await guestExamRecords(page)).toHaveLength(1);
    await page.getByRole('button', { name: '検定モードの記録' }).click();
    await expect(page.getByTestId('exam-history-row')).toHaveCount(1);
    // タイピングの記録には混ざらない
    await page.getByTestId('tab-typing').click();
    await expect(page.getByTestId('history-empty')).toBeVisible();
  });

  test('小さい画面では上下に並び、横にはみ出さない', async ({ page }, info) => {
    test.skip(info.project.name !== 'phone');
    await guest(page);
    await openBuiltin(page);
    await page.getByTestId('exam-go').click();
    const model = await page.locator('.exam-model').boundingBox();
    const paper = await page.locator('.exam-paper-pane').boundingBox();
    expect(paper!.y).toBeGreaterThan(model!.y + model!.height - 1);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const size = () => page.locator('.exam-paper').evaluate((el) => parseFloat(getComputedStyle(el).fontSize));
    const before = await size();
    await page.getByRole('button', { name: '文字を大きく' }).click();
    await expect.poll(size).toBeGreaterThan(before);
  });
});

test.describe('先生の追加問題（この端末・教材パック）', () => {
  test.skip(({ browserName }) => browserName !== 'chromium');

  async function newProblem(page: Page) {
    await page.goto('./#/exam/manage');
    await page.getByTestId('new-problem').click();
  }

  test('対応していない形式・HEIC・パスワード付き PDF・壊れた PDF に案内を出す', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await newProblem(page);
    const input = page.getByTestId('material-input');
    await input.setInputFiles(`${FIX}photo.heic`);
    await expect(page.getByTestId('file-msg')).toContainText('HEIC');
    await input.setInputFiles(`${FIX}anim.gif`);
    await expect(page.getByTestId('file-msg')).toContainText('対応していない形式');
    await input.setInputFiles(`${FIX}password.pdf`);
    await expect(page.getByTestId('file-msg')).toContainText('パスワード');
    await input.setInputFiles(`${FIX}broken.pdf`);
    await expect(page.getByTestId('file-msg')).toContainText('壊れている');
    // 何も選ばないまま保存はできない
    await page.locator('#ep-title').fill('テスト');
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('editor-errors')).toContainText('お手本');
  });

  test('画像の問題（採点なし）を登録 → 再読み込み後も表示 → 生徒が練習（ミス数・目安は出さない）', async ({ page }, info) => {
    test.skip(info.project.name === 'phone');
    await guest(page);
    await newProblem(page);
    await page.locator('#ep-title').fill('写真のプリント');
    await page.locator('#ep-grade').selectOption('pre2');
    await page.getByTestId('material-input').setInputFiles(`${FIX}print.png`);
    await expect(page.getByTestId('editor-preview').getByTestId('viewer-canvas')).toBeVisible();
    await page.getByTestId('no-scoring').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-msg')).toContainText('保存しました');
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
    // 再読み込み（ゲストは選び直し）しても残る
    await page.reload();
    await guest(page);
    await page.getByTestId('home-exam').click();
    await page.getByRole('button', { name: '先生の追加問題', exact: true }).click();
    await page.getByRole('radio', { name: 'すべて' }).check();
    await expect(page.getByTestId('exam-problem')).toHaveCount(1);
    await expect(page.getByTestId('exam-problem')).toContainText('採点なし');
    await expect(page.getByTestId('exam-problem')).toContainText('準2級相当');
    await page.getByTestId('exam-problem').click();
    await expect(page.getByTestId('no-scoring-note')).toBeVisible();
    await page.getByTestId('exam-start').click();
    await expect(page.getByText('採点なし：入力文字数・経過時間・入力した文章だけを表示します。')).toBeVisible();
    await page.getByTestId('exam-go').click();
    // 画像の拡大・回転
    await expect(page.getByTestId('viewer-canvas')).toBeVisible();
    const w0 = (await page.getByTestId('viewer-canvas').boundingBox())!.width;
    await page.getByRole('button', { name: '拡大' }).click();
    await expect.poll(async () => (await page.getByTestId('viewer-canvas').boundingBox())!.width).toBeGreaterThan(w0);
    await page.getByRole('button', { name: '右に90度回す' }).click();
    await page.getByTestId('exam-input').pressSequentially('お手本の文章です。');
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').click();
    await expect(page.getByTestId('stat-input')).toContainText('9');
    await expect(page.getByTestId('judge-none')).toBeVisible();
    await expect(page.getByTestId('stat-miss')).toHaveCount(0);
    await expect(page.getByTestId('exam-diff')).toHaveCount(0);
    await expect(page.getByTestId('exam-input-text')).toHaveText('お手本の文章です。');
  });

  test('複数ページ PDF：ページの選択と順番、文字の取り出し（確認するまで採点に使わない）、練習中のページ移動', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await newProblem(page);
    await page.locator('#ep-title').fill('PDFのプリント');
    await page.locator('#ep-grade').selectOption('4');
    await page.getByTestId('material-input').setInputFiles(`${FIX}text-3pages.pdf`);
    await expect(page.getByTestId('pdf-pages')).toContainText('全3ページ');
    // 1ページ目を使わず、3 → 2 の順にする
    await page.getByRole('checkbox', { name: '1ページ' }).uncheck();
    await page.getByRole('button', { name: '1番目を後ろへ' }).click();
    await expect(page.getByTestId('page-order').locator('li').first()).toContainText('3ページ');
    await page.getByTestId('extract-text').click();
    await expect(page.getByTestId('extract-note')).toContainText('確認・修正');
    await expect(page.getByTestId('answer-text')).toHaveValue('三ページ目の本文です。帰る前に片づけをします。\n二ページ目の本文です。午後は実習があります。');
    await expect(page.getByTestId('answer-confirmed')).not.toBeChecked();
    await expect(page.getByTestId('short-note')).toContainText('短い教材として保存できます');
    // 確認済みにしないと保存できない
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('editor-errors')).toContainText('確認済み');
    await page.getByTestId('answer-confirmed').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-msg')).toContainText('保存しました');
    await expect(page.getByTestId('manage-row')).toContainText('あり（45文字）');
    // 生徒用プレビュー：PDF のページ移動と拡大
    await page.getByRole('button', { name: '生徒用プレビュー' }).click();
    await page.getByTestId('exam-go').click();
    await expect(page.getByTestId('viewer-page')).toHaveText('1 / 2 ページ');
    await page.getByRole('button', { name: '次のページ' }).click();
    await expect(page.getByTestId('viewer-page')).toHaveText('2 / 2 ページ');
    await page.getByRole('button', { name: '拡大' }).click();
    await expect(page.getByTestId('viewer-zoom')).toHaveText('125%');
    await page.getByTestId('exam-input').pressSequentially('三ページ目の本文です。');
    await page.getByTestId('exam-end').click();
    await page.getByTestId('exam-end-confirm').click();
    await expect(page.getByTestId('preview-note')).toBeVisible();
    await expect(page.getByTestId('stat-miss')).toContainText('0');
    // プレビューは記録しない
    expect(await guestExamRecords(page)).toHaveLength(0);
    // 編集すると改訂番号が上がる
    await page.getByRole('button', { name: '問題の管理にもどる' }).click();
    await page.getByRole('button', { name: '編集' }).click();
    await page.locator('#ep-title').fill('PDFのプリント（改）');
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-row')).toContainText('PDFのプリント（改）');
    await expect(page.getByTestId('manage-row').locator('td').nth(7)).toContainText('2');
    // 複製・非表示・削除
    await page.getByRole('button', { name: '複製' }).click();
    await expect(page.getByTestId('manage-row')).toHaveCount(2);
    await page.getByTestId('manage-row').nth(1).getByRole('checkbox', { name: '表示', exact: true }).click();
    await expect(page.getByTestId('manage-row').nth(1)).toContainText('非表示');
    page.once('dialog', (d) => void d.accept());
    await page.getByTestId('manage-row').nth(1).getByRole('button', { name: '削除' }).click();
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
  });

  test('教材パック：書き出して別のブラウザ環境で読み込むと、原本と正解文が一致する（上書きしない）', async ({ page, browser }, info) => {
    test.skip(info.project.name !== 'pc');
    await guest(page);
    await newProblem(page);
    await page.locator('#ep-title').fill('配布するプリント');
    await page.getByTestId('material-input').setInputFiles(`${FIX}text-3pages.pdf`);
    await expect(page.getByTestId('pdf-pages')).toBeVisible();
    await page.getByTestId('answer-text').fill('配布用の正解文です。\n二段落目です。');
    await page.getByTestId('answer-confirmed').check();
    await page.getByTestId('save-problem').click();
    await expect(page.getByTestId('manage-row')).toHaveCount(1);
    await page.getByTestId('manage-row').getByRole('checkbox', { name: /書き出す/ }).check();
    const dl = page.waitForEvent('download');
    await page.getByTestId('export-pack').click();
    const download = await dl;
    expect(download.suggestedFilename()).toMatch(/^sakura-exam-pack-\d{8}\.sakuraexam$/);
    const packPath = await download.path();
    const pack = readFileSync(packPath);
    for (const w of ['password', 'access_token', 'missCount', 'scoreChars']) expect(pack.includes(Buffer.from(w))).toBe(false);

    // 別のブラウザ環境（生徒の端末の代わり）
    const other = await (browser as Browser).newContext({ baseURL: info.project.use.baseURL, locale: 'ja-JP' });
    const p2 = await other.newPage();
    await guest(p2);
    await p2.getByTestId('home-exam').click();
    await p2.getByRole('button', { name: '先生の追加問題', exact: true }).click();
    await p2.getByTestId('pack-input').setInputFiles(packPath);
    await expect(p2.getByTestId('import-plan')).toContainText('新しく追加');
    await p2.getByRole('button', { name: 'この端末に追加する' }).click();
    await expect(p2.getByText('1問をこの端末に追加しました')).toBeVisible();
    await p2.getByRole('radio', { name: 'すべて' }).check();
    await expect(p2.getByTestId('exam-problem')).toContainText('配布するプリント');
    // 原本（PDF の中身）と正解文が一致する
    const stored = await p2.evaluate(async () => {
      const db: IDBDatabase = await new Promise((res, rej) => {
        const r = indexedDB.open('sakura-type-exam');
        r.onsuccess = () => res(r.result);
        r.onerror = () => rej(r.error);
      });
      const get = <T,>(store: string): Promise<T[]> =>
        new Promise((res) => {
          const q = db.transaction(store).objectStore(store).getAll();
          q.onsuccess = () => res(q.result as T[]);
        });
      const problems = await get<{ answerText: string; material: { fileId: string } }>('problems');
      const files = await get<{ id: string; blob: Blob }>('files');
      const f = files.find((x) => x.id === problems[0]!.material.fileId)!;
      const bytes = new Uint8Array(await f.blob.arrayBuffer());
      return { answer: problems[0]!.answerText, bytes: Array.from(bytes) };
    });
    expect(stored.answer).toBe('配布用の正解文です。\n二段落目です。');
    const sha = (b: Uint8Array | Buffer) => createHash('sha256').update(b).digest('hex');
    expect(sha(Uint8Array.from(stored.bytes))).toBe(sha(readFileSync(`${FIX}text-3pages.pdf`)));
    // もう一度読み込んでも上書き・重複しない
    await p2.getByTestId('pack-input').setInputFiles(packPath);
    await expect(p2.getByTestId('import-plan')).toContainText('同じ内容があります');
    await p2.getByRole('button', { name: 'この端末に追加する' }).click();
    await expect(p2.getByText('0問をこの端末に追加しました')).toBeVisible();
    await expect(p2.getByTestId('exam-problem')).toHaveCount(1);
    // 壊れたファイルは読み込まない
    await p2.getByTestId('pack-input').setInputFiles(`${FIX}print.png`);
    await expect(p2.getByText('桜打の教材パック（.sakuraexam）ではないか、ファイルが壊れています。')).toBeVisible();
    await other.close();
  });
});
