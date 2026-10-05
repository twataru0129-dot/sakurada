/**
 * 教員アカウントの作成（最初の教員を含む）と、教員の二段階認証の登録解除。
 *
 * サービスロールの鍵を使うため、管理者が自分のパソコンで実行します。
 * 鍵はファイルに保存せず、実行するときだけ環境変数で渡してください（README「最初の教員アカウント」）。
 *
 *   SUPABASE_URL=https://xxxx.supabase.co SUPABASE_SERVICE_ROLE_KEY=（管理用の鍵） npm run create-teacher
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm run create-teacher -- --reset-mfa teacher01
 *
 * 画面上では、教員アカウントを作ったり、生徒を教員に変えたりすることはできません。
 */
import { createClient } from '@supabase/supabase-js';
import { createInterface } from 'node:readline';
import { stdin, stdout } from 'node:process';
import {
  DEFAULT_LOGIN_DOMAIN,
  loginIdToEmail,
  normalizeLoginId,
  validateDisplayName,
  validateLoginId,
  validatePassword,
} from '../supabase/functions/_shared/accountRules';

const url = process.env.SUPABASE_URL ?? '';
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';
const domain = process.env.LOGIN_EMAIL_DOMAIN || DEFAULT_LOGIN_DOMAIN;

function ask(question: string, hidden = false): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface({ input: stdin, output: stdout, terminal: true });
    if (hidden) {
      // 入力した文字を画面に表示しません
      (rl as unknown as { _writeToOutput: (s: string) => void })._writeToOutput = (s: string) => {
        if (s.includes(question)) stdout.write(s);
      };
    }
    rl.question(question, (answer) => {
      rl.close();
      if (hidden) stdout.write('\n');
      resolve(answer);
    });
  });
}

async function main() {
  if (!/^https:\/\//.test(url) && !/^http:\/\/(localhost|127\.0\.0\.1)/.test(url)) {
    console.error('環境変数 SUPABASE_URL を設定してください（例: https://xxxx.supabase.co）');
    process.exit(1);
  }
  if (!key) {
    console.error('環境変数 SUPABASE_SERVICE_ROLE_KEY を設定してください（Supabase の管理用の鍵。ファイルには保存しないでください）');
    process.exit(1);
  }
  const admin = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  const resetIdx = process.argv.indexOf('--reset-mfa');
  if (resetIdx >= 0) {
    const loginId = normalizeLoginId(process.argv[resetIdx + 1] ?? '');
    const { data: prof } = await admin.from('profiles').select('id, role').eq('login_id', loginId).maybeSingle();
    if (!prof || prof.role !== 'teacher') {
      console.error('その教員のIDは見つかりません');
      process.exit(1);
    }
    const { data, error } = await admin.auth.admin.mfa.listFactors({ userId: prof.id });
    if (error) throw error;
    for (const f of data.factors) await admin.auth.admin.mfa.deleteFactor({ userId: prof.id, id: f.id });
    console.log(`二段階認証の登録を解除しました（${data.factors.length}件）。次のログインで登録し直します。`);
    return;
  }

  console.log('教員アカウントを作成します。');
  const loginId = normalizeLoginId(await ask('ログインID（英字で始まる英小文字と数字 4〜20文字）: '));
  const idErr = validateLoginId(loginId);
  if (idErr) throw new Error(idErr);
  const name = (await ask('表示名（生徒にも表示されます。例：さくら先生）: ')).trim();
  const nameErr = validateDisplayName(name);
  if (nameErr) throw new Error(nameErr);
  const pw = await ask('パスワード（12文字以上を推奨・表示されません）: ', true);
  const pwErr = validatePassword(pw, loginId);
  if (pwErr) throw new Error(pwErr);
  if ((await ask('パスワード（確認）: ', true)) !== pw) throw new Error('パスワードが一致しません');

  const { data: created, error } = await admin.auth.admin.createUser({
    email: loginIdToEmail(loginId, domain),
    password: pw,
    email_confirm: true,
    app_metadata: { app_role: 'teacher' },
  });
  if (error || !created.user) throw new Error(`作成できませんでした: ${error?.message ?? ''}`);
  const { error: pErr } = await admin.from('profiles').insert({ id: created.user.id, login_id: loginId, display_name: name, role: 'teacher' });
  if (pErr) {
    await admin.auth.admin.deleteUser(created.user.id);
    throw new Error(`プロフィールを作成できませんでした: ${pErr.message}（データベースの設定が済んでいるか確認してください）`);
  }
  console.log(`作成しました。ID: ${loginId}`);
  console.log('アプリでログインすると、二段階認証（認証アプリ）の登録画面が表示されます。');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : '失敗しました');
  process.exit(1);
});
