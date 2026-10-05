/**
 * 教員用の管理処理（Supabase Edge Function / Deno）
 *
 * サービスロールの鍵が必要な処理だけをここで行います。鍵はこの関数の実行環境の中にだけあり、
 * フロントエンドや GitHub には含めません。
 *
 * 呼び出し元の確認（すべての操作で必須）
 *   1. ログイン中の利用者であること（JWT を認証基盤で検証）
 *   2. 二段階認証を済ませていること（JWT の aal が aal2）
 *   3. 有効な教員アカウントであること
 *   4. 対象の生徒・クラスを担当していること（データベースの権限関数で確認）
 *
 * パスワードはログに出しません。ログには操作の種類と内部IDだけを残します。
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2';
import {
  DEFAULT_LOGIN_DOMAIN,
  loginIdToEmail,
  normalizeLoginId,
  validateDisplayName,
  validateLoginId,
  validatePassword,
} from '../_shared/accountRules.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SAKURA_SERVICE_ROLE_KEY') ?? '';
const LOGIN_DOMAIN = Deno.env.get('LOGIN_EMAIL_DOMAIN') || DEFAULT_LOGIN_DOMAIN;
const ALLOWED_ORIGINS = (Deno.env.get('ALLOWED_ORIGINS') ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);
/** 停止中のアカウントのログイン禁止期間（実質無期限） */
const BAN_FOREVER = '876000h';

class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}

function corsHeaders(origin: string): Record<string, string> {
  const allow = ALLOWED_ORIGINS.includes(origin) ? origin : (ALLOWED_ORIGINS[0] ?? '');
  return {
    'Access-Control-Allow-Origin': allow,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

function json(body: unknown, status: number, origin: string): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders(origin), 'Content-Type': 'application/json; charset=utf-8' },
  });
}

/** 検証済みの JWT から aal（認証の強さ）を読み出します */
function jwtAal(token: string): string {
  try {
    const payload = token.split('.')[1] ?? '';
    const text = atob(payload.replace(/-/g, '+').replace(/_/g, '/'));
    return (JSON.parse(text) as { aal?: string }).aal ?? '';
  } catch {
    return '';
  }
}

function str(v: unknown, name: string): string {
  if (typeof v !== 'string') throw new HttpError(400, `${name} が正しくありません`);
  return v;
}

function uuid(v: unknown, name: string): string {
  const s = str(v, name);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new HttpError(400, `${name} が正しくありません`);
  return s;
}

async function assertRpcTrue(client: SupabaseClient, fn: string, args: Record<string, unknown>) {
  const { data, error } = await client.rpc(fn, args);
  if (error || data !== true) throw new HttpError(403, 'この操作をする権限がありません');
}

Deno.serve(async (req) => {
  const origin = req.headers.get('Origin') ?? '';
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders(origin) });

  try {
    if (!SUPABASE_URL || !ANON_KEY || !SERVICE_KEY) throw new HttpError(500, 'サーバーの設定が完了していません');
    if (ALLOWED_ORIGINS.length > 0 && !ALLOWED_ORIGINS.includes(origin)) throw new HttpError(403, '許可されていない呼び出し元です');
    if (req.method !== 'POST') throw new HttpError(405, 'POST で呼び出してください');

    const authHeader = req.headers.get('Authorization') ?? '';
    const token = authHeader.replace(/^Bearer\s+/i, '');
    if (!token) throw new HttpError(401, 'ログインが必要です');

    // 呼び出した本人の権限で動くクライアント（RLS と権限関数がそのまま効きます）
    const asCaller = createClient(SUPABASE_URL, ANON_KEY, {
      global: { headers: { Authorization: `Bearer ${token}` } },
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data: userData, error: userErr } = await asCaller.auth.getUser(token);
    if (userErr || !userData.user) throw new HttpError(401, 'ログインが必要です');
    if (jwtAal(token) !== 'aal2') throw new HttpError(403, '二段階認証を済ませてください');

    const admin = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: me } = await admin.from('profiles').select('id, role, status').eq('id', userData.user.id).maybeSingle();
    if (!me || me.role !== 'teacher' || me.status !== 'active') throw new HttpError(403, '教員アカウントでログインしてください');

    const body = (await req.json().catch(() => ({}))) as Record<string, unknown>;
    const action = str(body.action, 'action');
    console.log(JSON.stringify({ action, teacher: me.id }));

    switch (action) {
      case 'createStudent': {
        const loginId = normalizeLoginId(str(body.loginId, 'ID'));
        const displayName = str(body.displayName, '表示名').trim();
        const password = str(body.password, 'パスワード');
        const classId = uuid(body.classId, 'クラス');
        const err = validateLoginId(loginId) ?? validateDisplayName(displayName) ?? validatePassword(password, loginId);
        if (err) throw new HttpError(400, err);
        await assertRpcTrue(asCaller, 'teacher_teaches_class', { p_class: classId });

        const { data: existing } = await admin.from('profiles').select('id').eq('login_id', loginId).maybeSingle();
        if (existing) throw new HttpError(409, 'そのIDはすでに使われています');

        const { data: created, error: createErr } = await admin.auth.admin.createUser({
          email: loginIdToEmail(loginId, LOGIN_DOMAIN),
          password,
          email_confirm: true,
          app_metadata: { app_role: 'student' },
        });
        if (createErr || !created.user) {
          throw new HttpError(createErr?.status === 422 ? 409 : 500, 'アカウントを作成できませんでした（IDが使われている可能性があります）');
        }
        const uid = created.user.id;
        try {
          const { error: pErr } = await admin.from('profiles').insert({
            id: uid,
            login_id: loginId,
            display_name: displayName,
            role: 'student',
            created_by: me.id,
          });
          if (pErr) throw pErr;
          const { error: cErr } = await admin.from('class_students').insert({ class_id: classId, student_id: uid });
          if (cErr) throw cErr;
        } catch (e) {
          await admin.auth.admin.deleteUser(uid);
          console.error(JSON.stringify({ action, failed: 'profile', code: (e as { code?: string }).code ?? '' }));
          throw new HttpError(500, 'アカウントを作成できませんでした');
        }
        return json({ ok: true, studentId: uid, loginId }, 200, origin);
      }

      case 'resetPassword': {
        const studentId = uuid(body.studentId, '生徒');
        const password = str(body.password, 'パスワード');
        await assertRpcTrue(asCaller, 'teacher_can_manage_student', { p_student: studentId });
        const { data: target } = await admin.from('profiles').select('login_id').eq('id', studentId).single();
        const err = validatePassword(password, target?.login_id ?? '');
        if (err) throw new HttpError(400, err);
        const { error } = await admin.auth.admin.updateUserById(studentId, { password });
        if (error) throw new HttpError(500, 'パスワードを再設定できませんでした');
        await admin.rpc('admin_revoke_sessions', { p_user: studentId });
        return json({ ok: true }, 200, origin);
      }

      case 'setStatus': {
        const studentId = uuid(body.studentId, '生徒');
        const status = str(body.status, '状態');
        if (status !== 'active' && status !== 'suspended') throw new HttpError(400, '状態が正しくありません');
        await assertRpcTrue(asCaller, 'teacher_can_manage_student', { p_student: studentId });
        const { error } = await admin.auth.admin.updateUserById(studentId, {
          ban_duration: status === 'suspended' ? BAN_FOREVER : 'none',
        });
        if (error) throw new HttpError(500, '状態を変更できませんでした');
        const { error: pErr } = await admin.from('profiles').update({ status, updated_at: new Date().toISOString() }).eq('id', studentId);
        if (pErr) throw new HttpError(500, '状態を変更できませんでした');
        if (status === 'suspended') await admin.rpc('admin_revoke_sessions', { p_user: studentId });
        return json({ ok: true }, 200, origin);
      }

      case 'deleteStudent': {
        const studentId = uuid(body.studentId, '生徒');
        await assertRpcTrue(asCaller, 'teacher_can_manage_student', { p_student: studentId });
        // auth.users を削除すると、profiles・練習記録・設定も連鎖して削除されます
        const { error } = await admin.auth.admin.deleteUser(studentId);
        if (error) throw new HttpError(500, 'アカウントを削除できませんでした');
        return json({ ok: true }, 200, origin);
      }

      default:
        throw new HttpError(400, '不明な操作です');
    }
  } catch (e) {
    if (e instanceof HttpError) return json({ error: e.message }, e.status, origin);
    console.error(JSON.stringify({ error: 'unexpected' }));
    return json({ error: 'サーバーでエラーが起きました' }, 500, origin);
  }
});
