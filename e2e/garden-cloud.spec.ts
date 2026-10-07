/**
 * 桜ガーデンのアカウントへの保存（Supabase の通信をまねたモック）。
 * 本物の Supabase との確認は docs/manual-checks.md の手順で行います。
 */
import { expect, test, type Page, type Route } from '@playwright/test';

const API = 'https://mock.supabase.test';
const now = Math.floor(Date.now() / 1000);
const USERS: Record<string, { id: string; name: string }> = {
  stu01: { id: '11111111-2222-4333-8444-555555555555', name: 'さくら' },
  stu02: { id: '22222222-3333-4444-8555-666666666666', name: 'もみじ' },
};
const b64url = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
const tokenFor = (id: string) => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url({ sub: id, role: 'authenticated', aal: 'aal1', exp: now + 3600 })}.sig`;
const userObj = (login: string) => ({ id: USERS[login]!.id, aud: 'authenticated', role: 'authenticated', email: `${login}@id.sakura-type.invalid`, app_metadata: {}, user_metadata: {}, factors: [] });

interface Cloud {
  current: string;
  /** 利用者ごとの出来事（RLS の代わりに、ログイン中の人の分だけを返します） */
  rows: Map<string, Record<string, unknown>[]>;
  posts: Record<string, unknown>[][];
  failNext: number;
  missing: boolean;
}

async function mock(page: Page, cloud: Cloud) {
  const json = (route: Route, body: unknown, status = 200) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await page.route(`${API}/**`, async (route) => {
    const req = route.request();
    const url = new URL(req.url());
    if (req.method() === 'OPTIONS') return route.fulfill({ status: 200, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    if (url.pathname === '/auth/v1/token') {
      const body = req.postDataJSON() as { email: string; password: string };
      cloud.current = body.email.split('@')[0]!;
      if (body.password !== 'pass1234' || !USERS[cloud.current]) return json(route, { error: 'invalid_grant', msg: 'Invalid login credentials' }, 400);
      return json(route, { access_token: tokenFor(USERS[cloud.current]!.id), token_type: 'bearer', expires_in: 3600, expires_at: now + 3600, refresh_token: 'r1', user: userObj(cloud.current) });
    }
    if (url.pathname === '/auth/v1/user') return json(route, userObj(cloud.current));
    if (url.pathname === '/auth/v1/logout') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*' } });
    if (url.pathname === '/rest/v1/profiles') {
      const u = USERS[cloud.current]!;
      const row = { id: u.id, login_id: cloud.current, display_name: u.name, role: 'student', status: 'active' };
      return json(route, (req.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? row : [row]);
    }
    if (url.pathname === '/rest/v1/user_settings' || url.pathname === '/rest/v1/student_defaults') {
      if (req.method() !== 'GET') return json(route, null, 201);
      return (req.headers()['accept'] ?? '').includes('vnd.pgrst.object') ? json(route, null, 406) : json(route, []);
    }
    if (url.pathname === '/rest/v1/garden_events') {
      if (cloud.missing) return json(route, { code: 'PGRST205', message: "Could not find the table 'public.garden_events' in the schema cache" }, 404);
      const uid = USERS[cloud.current]!.id;
      if (req.method() === 'POST') {
        const body = req.postDataJSON() as Record<string, unknown>[];
        cloud.posts.push(body);
        if (cloud.failNext > 0) {
          cloud.failNext--;
          return json(route, { message: 'server error' }, 503);
        }
        // 本人以外の user_id は受け付けません（RLS の代わり）。同じ ID は無視します（ignore-duplicates）
        if (body.some((r) => r.user_id !== uid)) return json(route, { code: '42501', message: 'row-level security' }, 403);
        expect(req.headers()['prefer'] ?? '').toContain('resolution=ignore-duplicates');
        const list = cloud.rows.get(uid) ?? [];
        for (const r of body) if (!list.some((x) => x.event_id === r.event_id)) list.push(r);
        cloud.rows.set(uid, list);
        return json(route, null, 201);
      }
      expect(url.searchParams.get('user_id')).toBe(`eq.${uid}`);
      return json(route, cloud.rows.get(uid) ?? []);
    }
    return json(route, []);
  });
}

async function login(page: Page, id: string) {
  await page.goto('./');
  await page.getByRole('button', { name: 'ログインして練習' }).click();
  await page.getByLabel('ID（英字と数字）').fill(id);
  await page.getByLabel('パスワード').fill('pass1234');
  await page.getByRole('button', { name: 'ログイン' }).click();
  await expect(page.getByTestId('home-game')).toBeVisible();
}
async function openGarden(page: Page) {
  await page.getByTestId('home-game').click();
  await page.getByTestId('game-card-sakura-garden').click();
  await expect(page.getByTestId('garden-main')).toBeVisible();
}
const guide = async (page: Page) => (await page.getByTestId('garden-romaji').getAttribute('data-remaining')) ?? '';
async function play5(page: Page) {
  await page.getByTestId('garden-count-5').check();
  await page.getByTestId('garden-start').click();
  await page.keyboard.press(' ');
  for (let i = 0; i < 5; i++) await page.keyboard.type(await guide(page));
  await expect(page.getByTestId('garden-finished')).toBeVisible();
  await page.getByTestId('garden-back-to-garden').click();
}
async function logout(page: Page) {
  await page.getByRole('button', { name: '終了してログアウト' }).click();
  await expect(page.getByRole('button', { name: 'ログインして練習' })).toBeVisible();
}

test.use({ baseURL: 'http://localhost:5179/mock/' });

test('ログイン利用者の庭はアカウントに保存され、別の端末でも同じ庭になる。別のアカウント・ゲストとは混ざらない', async ({ page, browser }, info) => {
  test.skip(info.project.name !== 'pc');
  const cloud: Cloud = { current: 'stu01', rows: new Map(), posts: [], failNext: 0, missing: false };
  await mock(page, cloud);
  await login(page, 'stu01');
  await openGarden(page);
  await page.getByTestId('receive-first').click();
  await play5(page);
  await expect(page.getByTestId('garden-save')).toHaveText('記録を同期しました。');
  const petals = await page.getByTestId('garden-petals').textContent();
  const mine = cloud.rows.get(USERS.stu01!.id)!;
  expect(mine.filter((r) => r.event_type === 'solve')).toHaveLength(5);
  // 端末には保存しません（ゲストの保存場所にも書き込みません）
  expect(await page.evaluate(() => Object.keys(localStorage).filter((k) => k.includes('garden')))).toEqual([]);
  // 別のアカウント：何も持っていない
  await page.goto('./#/home');
  await logout(page);
  await login(page, 'stu02');
  await openGarden(page);
  await expect(page.getByTestId('garden-petals')).toContainText('0');
  await expect(page.getByTestId('receive-first')).toBeVisible();
  // 別の端末で stu01 にログイン：同じ庭
  const other = await browser.newContext({ baseURL: 'http://localhost:5179/mock/', locale: 'ja-JP' });
  const p2 = await other.newPage();
  await mock(p2, cloud);
  await login(p2, 'stu01');
  await openGarden(p2);
  await expect(p2.getByTestId('garden-petals')).toHaveText(petals!);
  await expect(p2.getByTestId('scene-tree-0')).toHaveAttribute('data-species', 'somei_yoshino');
  await other.close();
});

test('送れなかった変更は「保存できていない」と表示し、もう一度送ると二重にならずに保存される', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const cloud: Cloud = { current: 'stu01', rows: new Map(), posts: [], failNext: 2, missing: false };
  await mock(page, cloud);
  await login(page, 'stu01');
  await openGarden(page);
  await page.getByTestId('receive-first').click();
  await expect(page.getByTestId('garden-save')).toContainText('アカウントに保存できていない変更があります。');
  await page.getByTestId('garden-retry').click();
  await expect(page.getByTestId('garden-save')).toHaveText('記録を同期しました。');
  const rows = cloud.rows.get(USERS.stu01!.id)!;
  expect(rows.map((r) => r.event_id).sort()).toEqual([...new Set(rows.map((r) => r.event_id))].sort());
  expect(rows.filter((r) => r.event_type === 'first')).toHaveLength(1);
});

test('保存先の表がまだないときは、保存できたように見せない', async ({ page }, info) => {
  test.skip(info.project.name !== 'pc');
  const cloud: Cloud = { current: 'stu01', rows: new Map(), posts: [], failNext: 0, missing: true };
  await mock(page, cloud);
  await login(page, 'stu01');
  await openGarden(page);
  await expect(page.getByTestId('garden-main')).toContainText('アカウントの保存先が準備されていないため');
  await expect(page.getByTestId('receive-first')).toHaveCount(0);
});
