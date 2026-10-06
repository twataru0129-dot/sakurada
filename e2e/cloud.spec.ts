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
const accessToken = `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: USER_ID, role: 'authenticated', aal: 'aal1', exp: now + 3600, amr: [{ method: 'password', timestamp: now }] })}.sig`;
const user = { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: 'stu01@id.sakura-type.invalid', app_metadata: {}, user_metadata: {}, factors: [] };

interface MockState {
  resultPosts: number;
  failFirstSave: boolean;
  logoutCalls: number;
  passwordSeenInUrl: boolean;
  savedBodies: unknown[];
}

async function mockSupabase(page: Page, opts: { failFirstSave?: boolean } = {}): Promise<MockState> {
  const st: MockState = { resultPosts: 0, failFirstSave: !!opts.failFirstSave, logoutCalls: 0, passwordSeenInUrl: false, savedBodies: [] };
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
      return json(route, { access_token: accessToken, token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user });
    }
    if (url.pathname === '/auth/v1/user') return json(route, user);
    if (url.pathname === '/auth/v1/logout') {
      st.logoutCalls++;
      return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    }
    if (url.pathname === '/rest/v1/profiles') {
      const row = { id: USER_ID, login_id: 'stu01', display_name: 'さくら', role: 'student', status: 'active' };
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
        return json(route, null, 201);
      }
      return json(route, []);
    }
    if (url.pathname === '/rest/v1/materials') return json(route, []);
    return json(route, { message: 'not mocked' }, 404);
  });
  return st;
}

test.use({ baseURL: 'http://localhost:5179/mock/' });

async function login(page: Page, password = 'pass1234') {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインして練習' }).click();
  await page.getByLabel('ID（英字と数字）').fill('ＳＴＵ01');
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
    ['completed_questions', 'correct_count', 'difficulty', 'elapsed_ms', 'finished', 'id', 'input_method', 'kind', 'minutes', 'miss_count', 'question_set_version', 'rank_version', 'set_type', 'started_at', 'theme'].sort(),
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
