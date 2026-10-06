/**
 * ログイン・記録保存の画面側の動作を、Supabase の通信をまねたモックで確かめます。
 * （本物の Supabase との接続は docs/manual-checks.md の手順で確認してください）
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const API = 'https://mock.supabase.test';
const USER_ID = '11111111-2222-4333-8444-555555555555';

function b64url(o: unknown) {
  return Buffer.from(JSON.stringify(o)).toString('base64url');
}
const now = Math.floor(Date.now() / 1000);
const USERS: Record<string, { id: string; name: string }> = {
  stu01: { id: USER_ID, name: 'さくら' },
  stu02: { id: '22222222-3333-4444-8555-666666666666', name: 'もみじ' },
};
const tokenFor = (id: string) =>
  `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: id, role: 'authenticated', aal: 'aal1', exp: now + 3600, amr: [{ method: 'password', timestamp: now }] })}.sig`;
const userObj = (login: string) => ({ id: USERS[login]!.id, aud: 'authenticated', role: 'authenticated', email: `${login}@id.sakura-type.invalid`, app_metadata: {}, user_metadata: {}, factors: [] });

interface MockState {
  resultPosts: number;
  failFirstSave: boolean;
  logoutCalls: number;
  passwordSeenInUrl: boolean;
  savedBodies: unknown[];
  /** モックのクラウド：利用者ごとの記録（RLS の代わりに、ログイン中の人の分だけを返します） */
  rows: Map<string, Record<string, unknown>[]>;
  current: string;
  /** 検定モードの記録（exam_results） */
  examBodies?: Record<string, unknown>[];
  examRows?: Map<string, Record<string, unknown>[]>;
}

async function mockSupabase(page: Page, opts: { failFirstSave?: boolean; state?: MockState; noRomajiStyleColumn?: boolean } = {}): Promise<MockState> {
  const st: MockState = opts.state ?? { resultPosts: 0, failFirstSave: !!opts.failFirstSave, logoutCalls: 0, passwordSeenInUrl: false, savedBodies: [], rows: new Map(), current: 'stu01' };
  const json = (route: Route, body: unknown, status = 200) =>
    route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') {
      return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    }
    if (url.search.includes('password')) st.passwordSeenInUrl = url.search.includes('secret');
    if (url.pathname === '/auth/v1/token') {
      const body = req.postDataJSON() as { email: string; password: string };
      if (body.password !== 'pass1234') return json(route, { error: 'invalid_grant', error_description: 'Invalid login credentials', msg: 'Invalid login credentials' }, 400);
      st.current = body.email.split('@')[0]!;
      if (!USERS[st.current]) return json(route, { error: 'invalid_grant', msg: 'Invalid login credentials' }, 400);
      return json(route, { access_token: tokenFor(USERS[st.current]!.id), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user: userObj(st.current) });
    }
    if (url.pathname === '/auth/v1/user') return json(route, userObj(st.current));
    if (url.pathname === '/auth/v1/logout') {
      st.logoutCalls++;
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/profiles') {
      const u = USERS[st.current]!;
      const row = { id: u.id, login_id: st.current, display_name: u.name, role: 'student', status: 'active' };
      return json(route, (req.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? row : [row]);
    }
    if (url.pathname === '/rest/v1/user_settings' || url.pathname === '/rest/v1/student_defaults') {
      if (req.method() !== 'GET') return json(route, null, 201);
      return (req.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? json(route, null, 406) : json(route, []);
    }
    if (url.pathname === '/rest/v1/practice_results') {
      if (req.method() === 'POST') {
        st.resultPosts++;
        st.savedBodies.push(req.postDataJSON());
        if (st.failFirstSave && st.resultPosts === 1) return json(route, { message: 'server error' }, 503);
        const b = req.postDataJSON() as Record<string, unknown>;
        // v1.0.3 のマイグレーション前（romaji_style 列がない）を再現
        if (opts.noRomajiStyleColumn && 'romaji_style' in b) {
          return json(route, { code: 'PGRST204', message: "Could not find the 'romaji_style' column of 'practice_results' in the schema cache" }, 400);
        }
        const list = st.rows.get(st.current) ?? [];
        if (!list.some((r) => r.id === b.id)) {
          const correct = Number(b.correct_count);
          const miss = Number(b.miss_count);
          list.push({
            ...b,
            user_id: USERS[st.current]!.id,
            end_mode: b.end_mode ?? 'time',
            target_count: b.target_count ?? null,
            accuracy: correct + miss === 0 ? null : (correct * 100) / (correct + miss),
            speed: Number(b.elapsed_ms) > 0 ? (correct * 60000) / Number(b.elapsed_ms) : 0,
            rank: 'G−',
            official: false,
          });
        }
        st.rows.set(st.current, list);
        return json(route, null, 201);
      }
      const mine = [...(st.rows.get(st.current) ?? [])].sort((a, b) => String(b.started_at).localeCompare(String(a.started_at)));
      return json(route, mine);
    }
    if (url.pathname === '/rest/v1/exam_results') {
      st.examBodies ??= [];
      st.examRows ??= new Map();
      if (req.method() === 'POST') {
        const b = req.postDataJSON() as Record<string, unknown>;
        st.examBodies.push(b);
        const list = st.examRows.get(st.current) ?? [];
        if (list.some((r) => r.id === b.id)) return json(route, { code: '23505', message: 'duplicate key' }, 409);
        const score = b.scoring_enabled ? Math.max(0, Number(b.input_chars) - Number(b.miss_count) * Number(b.penalty_per_error)) : null;
        list.push({ ...b, user_id: USERS[st.current]!.id, score_chars: score, achieved: null });
        st.examRows.set(st.current, list);
        return json(route, null, 201);
      }
      return json(route, [...(st.examRows.get(st.current) ?? [])]);
    }
    if (url.pathname === '/rest/v1/materials') return json(route, []);
    return json(route, { message: 'not mocked' }, 404);
  });
  return st;
}

test.use({ baseURL: 'http://localhost:5179/mock/' });

async function login(page: Page, password = 'pass1234', id = 'ＳＴＵ01') {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインして練習' }).click();
  await page.getByLabel('ID（英字と数字）').fill(id);
  await page.getByLabel('パスワード').fill(password);
  await page.getByRole('button', { name: 'ログイン' }).click();
}

test('IDとパスワードでログインし、ログイン状態を端末に保存しない', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  await mockSupabase(page);
  await login(page);
  await expect(page.getByRole('heading', { name: 'さくらさん、こんにちは' })).toBeVisible();
  await expect(page.getByRole('button', { name: '終了してログアウト' })).toBeVisible();
  const stored = await page.evaluate(() => [...Object.keys(localStorage), ...Object.keys(sessionStorage)]);
  expect(stored).toEqual([]);
  // 再読み込みするとログアウトした状態になる（長期のログイン保持はしない）
  await page.reload();
  await expect(page.getByRole('button', { name: 'ゲストで練習' })).toBeVisible();
});

test('パスワードが違うときは、IDの有無が分からない共通のメッセージ', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  await mockSupabase(page);
  await login(page, 'wrong999');
  await expect(page.getByRole('alert')).toHaveText('IDまたはパスワードが違います。');
});

test('保存失敗を明示し、再送で保存済みになる（同じIDで再送）。ログアウトでセッションを終了する', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const st = await mockSupabase(page, { failFirstSave: true });
  await login(page);
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('実物のキーボード').check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await expect(page.locator('.romaji-next')).toBeVisible({ timeout: 6000 });
  await page.keyboard.type(((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? ''));
  await page.getByRole('button', { name: '途中で終わる' }).click();
  await page.getByRole('button', { name: '終わる' }).click();
  await expect(page.getByText('× 記録を保存できませんでした')).toBeVisible();
  await expect(page.getByText('✓ 記録を保存しました')).toHaveCount(0);
  await page.getByRole('button', { name: 'もう一度保存する' }).click();
  await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
  expect(st.resultPosts).toBe(2);
  const [a, b] = st.savedBodies as Array<{ id: string; correct_count: number; finished: boolean }>;
  expect(a!.id).toBe(b!.id);
  expect(a!.finished).toBe(false);
  // 文章全文やキー操作の履歴は送らない
  expect(Object.keys(a!).sort()).toEqual(
    ['completed_questions', 'correct_count', 'difficulty', 'elapsed_ms', 'finished', 'id', 'input_method', 'kind', 'minutes', 'miss_count', 'question_set_version', 'rank_version', 'romaji_style', 'set_type', 'started_at', 'theme'].sort(),
  );

  await page.getByRole('button', { name: '終了してログアウト' }).click();
  await expect(page.getByRole('button', { name: 'ゲストで練習' })).toBeVisible();
  expect(st.logoutCalls).toBe(1);
  await page.goto('./#/result');
  await expect(page.getByRole('heading', { name: '練習の結果' })).toHaveCount(0);
  await page.goto('./#/home');
  await expect(page.getByRole('button', { name: 'ゲストで練習' })).toBeVisible();
});

test('問題数で練習の記録は end_mode と target_count を付けて保存し、minutes は空にする', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const st = await mockSupabase(page);
  await login(page);
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('実物のキーボード').check();
  await page.getByLabel('問題数で練習').check();
  await page.getByLabel('25問').check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await page.keyboard.type(((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? ''));
  await page.getByRole('button', { name: '途中で終わる' }).click();
  await page.getByRole('button', { name: '終わる' }).click();
  await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
  const body = st.savedBodies[0] as Record<string, unknown>;
  expect(body.end_mode).toBe('count');
  expect(body.target_count).toBe(25);
  expect(body.minutes).toBeNull();
  expect(body.finished).toBe(false);
  expect(body.completed_questions).toBe(1);
  // ミス詳細はクラウドに送らない
  expect(Object.keys(body)).not.toContain('missDetails');
});

async function practiceOnce(page: Page) {
  await page.getByRole('button', { name: /タイピングモード/ }).click();
  await page.getByLabel('実物のキーボード').check();
  await page.getByRole('button', { name: '練習をはじめる' }).click();
  await page.getByRole('button', { name: 'スタート' }).click();
  await page.keyboard.type(((await page.locator('.romaji-next').textContent()) ?? '') + ((await page.locator('.romaji-rest').textContent()) ?? ''));
  await page.getByRole('button', { name: '途中で終わる' }).click();
  await page.getByRole('button', { name: '終わる' }).click();
}

test.describe('練習の記録（ログイン利用者・v1.0.3）', () => {
  test('アカウントの記録を表示し、ゲストの記録と混ぜない。ログイン利用者の記録は端末に書き込まない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    const st = await mockSupabase(page);
    // 先にゲストで1回練習（この端末に保存される）
    await page.goto('./');
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await practiceOnce(page);
    await page.getByRole('button', { name: 'ゲストを終了' }).click();
    // ログインして1回練習
    await login(page);
    await practiceOnce(page);
    await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-source')).toContainText('アカウントに保存した記録');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    const guest = await page.evaluate(() => JSON.parse(localStorage.getItem('sakura-type:guest-history') ?? '{"records":[]}').records.length);
    expect(guest).toBe(1); // ゲストの1件だけ。ログイン利用者の記録は書き込まれていない
    expect(st.rows.get('stu01')).toHaveLength(1);
    // ログアウト後はゲストの記録だけ
    await page.getByRole('button', { name: '終了してログアウト' }).click();
    await page.getByRole('button', { name: /ゲストで練習/ }).click();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-source')).toContainText('ゲスト');
    await expect(page.getByTestId('history-row')).toHaveCount(1);
  });

  test('アカウントを切り替えると、前の人の記録やグラフが残らない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await mockSupabase(page);
    await login(page);
    await practiceOnce(page);
    await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
    await page.getByRole('button', { name: '終了してログアウト' }).click();
    await login(page, 'pass1234', 'stu02');
    await expect(page.getByRole('heading', { name: 'もみじさん、こんにちは' })).toBeVisible();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-empty')).toHaveText('練習すると、ここに記録が残ります。');
    await expect(page.getByTestId('history-row')).toHaveCount(0);
  });

  test('保存に失敗した今回の結果は「未保存」として1件だけ表示し、再保存後も重複しない。ゲスト保存に切り替えない', async ({ page }, info) => {
    test.skip(info.project.name !== 'pc');
    await mockSupabase(page, { failFirstSave: true });
    await login(page);
    await practiceOnce(page);
    await expect(page.getByText('× 記録を保存できませんでした')).toBeVisible();
    expect(await page.evaluate(() => localStorage.getItem('sakura-type:guest-history'))).toBeNull();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').getByText('未保存')).toBeVisible();
    await page.goBack();
    await page.getByRole('button', { name: 'もう一度保存する' }).click();
    await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
    await page.getByRole('button', { name: '練習の記録' }).click();
    await expect(page.getByTestId('history-row')).toHaveCount(1);
    await expect(page.getByTestId('history-row').getByText('未保存')).toHaveCount(0);
  });
});

test('v1.0.3 のマイグレーション前（romaji_style 列なし）でも、お手本を外して保存できる', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const st = await mockSupabase(page, { noRomajiStyleColumn: true });
  await login(page);
  await practiceOnce(page);
  await expect(page.getByText('✓ 記録を保存しました')).toBeVisible();
  expect(st.resultPosts).toBe(2);
  expect(st.savedBodies[1]).not.toHaveProperty('romaji_style');
  expect(st.rows.get('stu01')).toHaveLength(1);
});

test('検定モード：ログイン利用者の記録はアカウントに保存し、端末やゲストの記録には書き込まない', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const st = await mockSupabase(page);
  await login(page);
  await expect(page.getByRole('heading', { name: 'さくらさん、こんにちは' })).toBeVisible();
  await page.getByTestId('home-exam').click();
  await page.getByTestId('exam-problem').first().click();
  await page.getByTestId('exam-start').click();
  await page.getByTestId('exam-go').click();
  await page.getByTestId('exam-input').pressSequentially('朝、学校に着いたら');
  await page.getByTestId('exam-end').click();
  await page.getByTestId('exam-end-confirm').click();
  await expect(page.getByTestId('exam-save-state')).toContainText('✓ 記録を保存しました（検定モードの記録）');
  expect(st.examBodies).toHaveLength(1);
  const body = st.examBodies![0]!;
  // 入力した文章・正解文は送らない。タイピングの記録の表にも送らない
  expect(JSON.stringify(body)).not.toContain('朝、学校に着いたら');
  expect(body).toMatchObject({ problem_id: 'exam-original-4-01', problem_revision: 1, grade: '4', input_chars: 9, miss_count: 0, end_reason: 'user_end' });
  expect(st.resultPosts).toBe(0);
  const keys = await page.evaluate(() => Object.keys(localStorage));
  expect(keys).not.toContain('sakura-type:guest-exam-history');
  await page.getByRole('button', { name: '検定モードの記録' }).click();
  await expect(page.getByTestId('exam-history-source')).toContainText('アカウント');
  await expect(page.getByTestId('exam-history-row')).toHaveCount(1);
  // 別のアカウントに切り替えると、前の人の記録は見えない
  await page.getByRole('button', { name: '終了してログアウト' }).click();
  await login(page, 'pass1234', 'stu02');
  await expect(page.getByRole('heading', { name: 'もみじさん、こんにちは' })).toBeVisible();
  await page.getByRole('button', { name: '練習の記録' }).click();
  await page.getByTestId('tab-exam').click();
  await expect(page.getByTestId('exam-history-empty')).toBeVisible();
});

test('検定モード：ログイン機能が設定済みのとき、生徒は先生の追加問題を管理できない（画面の表示）', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  await mockSupabase(page);
  await login(page);
  await expect(page.getByRole('heading', { name: 'さくらさん、こんにちは' })).toBeVisible();
  await page.getByTestId('home-exam').click();
  await expect(page.getByRole('button', { name: '先生の追加問題を管理する' })).toHaveCount(0);
  await page.evaluate(() => (window.location.hash = '#/exam/manage'));
  await expect(page.getByText('この画面は先生のアカウントでログインしたときだけ使えます。')).toBeVisible();
});
