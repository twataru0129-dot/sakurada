/**
 * 権限（RLS）のテスト。scripts/test-db.mjs から呼び出されます。
 * 生徒・教員の役割で実際に SQL を実行し、他人の記録が見えない・変更できないことを確かめます。
 */
import { randomUUID } from 'node:crypto';
import { judgeRank } from '../../src/core/rank.ts';

export async function runRlsTests(db) {
  const id = () => randomUUID();
  const T_A = id(); // 教員A（クラスAを担当）
  const T_B = id(); // 教員B（クラスBを担当）
  const S_A1 = id(); // 生徒A1（クラスA）
  const S_A2 = id(); // 生徒A2（クラスA）
  const S_B1 = id(); // 生徒B1（クラスB）
  const S_ORPHAN = id(); // 教員Aが発行し、まだクラスに入っていない生徒
  const S_SUSP = id(); // 停止中の生徒（クラスA）
  const C_A = id();
  const C_B = id();

  // --- 初期データ（管理者として投入） ---
  const users = [
    [T_A, 'teachera1', 'A先生', 'teacher', 'active', null],
    [T_B, 'teacherb1', 'B先生', 'teacher', 'active', null],
    [S_A1, 'stua01', 'さくら', 'student', 'active', T_A],
    [S_A2, 'stua02', 'もみじ', 'student', 'active', T_A],
    [S_B1, 'stub01', 'あおば', 'student', 'active', T_B],
    [S_ORPHAN, 'stuo01', 'つばき', 'student', 'active', T_A],
    [S_SUSP, 'stus01', 'かえで', 'student', 'suspended', T_A],
  ];
  for (const [uid, login, name, role, status, by] of users) {
    await db.query('insert into auth.users (id, email) values ($1, $2)', [uid, `${login}@id.test`]);
    await db.query(
      'insert into public.profiles (id, login_id, display_name, role, status, created_by) values ($1,$2,$3,$4,$5,$6)',
      [uid, login, name, role, status, by],
    );
  }
  await db.query('insert into public.classes (id, name, created_by) values ($1, $2, $3), ($4, $5, $6)', [C_A, '1年A組', T_A, C_B, '1年B組', T_B]);
  await db.query('insert into public.class_teachers (class_id, teacher_id) values ($1, $2), ($3, $4)', [C_A, T_A, C_B, T_B]);
  await db.query(
    'insert into public.class_students (class_id, student_id) values ($1,$2), ($1,$3), ($4,$5), ($1,$6)',
    [C_A, S_A1, S_A2, C_B, S_B1, S_SUSP],
  );
  const result = (user, extra = {}) => ({
    id: id(), user_id: user, started_at: new Date().toISOString(), kind: 'romaji', set_type: 'standard', theme: 'all',
    difficulty: 'mixed', question_set_version: 'qs-2026.10', rank_version: 'rank-v1', minutes: 3, elapsed_ms: 180000,
    finished: true, input_method: 'keyboard', correct_count: 300, miss_count: 10, completed_questions: 30, ...extra,
  });
  const insertResult = (r) => {
    const cols = Object.keys(r);
    return db.query(
      `insert into public.practice_results (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => r[c]),
    );
  };
  for (const u of [S_A1, S_A2, S_B1]) await insertResult(result(u));

  // --- テストの道具 ---
  let passed = 0;
  let failed = 0;
  const check = (name, ok, detail = '') => {
    if (ok) {
      passed++;
      console.log(`  ✔ ${name}`);
    } else {
      failed++;
      console.log(`  ✘ ${name} ${detail}`);
    }
  };
  /** 指定した利用者としてトランザクション内で実行し、最後に取り消します */
  async function as(uid, aal, fn) {
    await db.query('begin');
    try {
      if (uid === 'anon') {
        await db.query("select set_config('request.jwt.claims', '{\"role\":\"anon\"}', true)");
        await db.query('set local role anon');
      } else {
        await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: uid, role: 'authenticated', aal })]);
        await db.query('set local role authenticated');
      }
      return await fn();
    } finally {
      await db.query('rollback');
    }
  }
  /** SQL がエラーになることを確かめます（セーブポイントで巻き戻します） */
  async function fails(sql, params = []) {
    await db.query('savepoint t');
    try {
      await db.query(sql, params);
      await db.query('release savepoint t');
      return false;
    } catch (e) {
      await db.query('rollback to savepoint t');
      return e.code || true;
    }
  }
  const rows = async (sql, params = []) => (await db.query(sql, params)).rows;

  console.log('生徒の記録');
  await as(S_A1, 'aal1', async () => {
    const r = await rows('select user_id from public.practice_results');
    check('生徒A1は自分の記録だけ見える', r.length === 1 && r[0].user_id === S_A1, JSON.stringify(r));
    const other = await rows('select * from public.practice_results where user_id = $1', [S_B1]);
    check('生徒A1が生徒B1の記録をIDで指定しても見えない', other.length === 0);
    check('生徒A1は生徒B1として記録を追加できない', !!(await fails(...ins(result(S_B1)))));
    const fake = result(S_A1, { correct_count: 30, miss_count: 0 });
    await db.query('savepoint s');
    await db.query(...ins({ ...fake }));
    const saved = await rows('select rank, speed, official, accuracy from public.practice_results where id = $1', [fake.id]);
    check('記録のランク・速度・正式ランクはサーバー側で計算される', saved[0]?.rank === 'G＋' && Number(saved[0].speed) === 10 && saved[0].official === true, JSON.stringify(saved));
    const dup = await fails(...ins({ ...fake }));
    check('同じIDの再送は重複登録されない（一意制約で拒否）', dup === '23505', String(dup));
    const cnt = await rows('select count(*)::int n from public.practice_results where id = $1', [fake.id]);
    check('再送後も記録は1件', cnt[0].n === 1);
    check('ありえない速さの記録は拒否', !!(await fails(...ins(result(S_A1, { correct_count: 99999 })))));
    check('完走なのに時間が足りない記録は拒否', !!(await fails(...ins(result(S_A1, { elapsed_ms: 1000 })))));
    check('自分の記録を書き換えられない', !!(await fails('update public.practice_results set correct_count = 9999 where user_id = $1', [S_A1])));
    check('自分の記録を削除できない', !!(await fails('delete from public.practice_results where user_id = $1', [S_A1])));
  });

  console.log('権限の不正な変更');
  await as(S_A1, 'aal2', async () => {
    check('生徒は自分を教員に変更できない', !!(await fails("update public.profiles set role = 'teacher' where id = $1", [S_A1])));
    check('生徒は profiles を追加できない', !!(await fails("insert into public.profiles (id, login_id, display_name, role) values ($1, 'hacker1', 'x', 'teacher')", [id()])));
    check('生徒はクラスを作れない', !!(await fails("select public.create_class('にせクラス')")));
    check('生徒は自分をクラスに追加できない', !!(await fails('select public.set_student_class($1, $2, true)', [S_A1, C_B])));
    check('生徒は表示名変更の関数を使えない', !!(await fails("select public.update_student_display_name($1, 'x')", [S_A1])));
    check('生徒は他の生徒のプロフィールを見られない', (await rows('select id from public.profiles')).length === 1);
    check('生徒は自分の初期設定を変えられない', !!(await fails("insert into public.student_defaults (student_id, settings) values ($1, '{}')", [S_A1])));
    check('生徒はセッション削除の関数を使えない', !!(await fails('select public.admin_revoke_sessions($1)', [S_B1])));
    check('生徒はログイン制限フックを直接呼べない', !!(await fails("select public.hook_password_verification_attempt('{}'::jsonb)")));
  });

  console.log('学習設定');
  await as(S_A1, 'aal1', async () => {
    await db.query("insert into public.user_settings (user_id, settings) values ($1, '{\"sound\":true,\"minutes\":5}')", [S_A1]);
    check('自分の設定を保存できる', (await rows('select * from public.user_settings')).length === 1);
    check('他人の設定は保存できない', !!(await fails("insert into public.user_settings (user_id, settings) values ($1, '{}')", [S_A2])));
    check('不正な設定値は保存できない', !!(await fails("update public.user_settings set settings = '{\"minutes\":7}' where user_id = $1", [S_A1])));
    check('想定外の項目は保存できない', !!(await fails("update public.user_settings set settings = '{\"evil\":\"<script>\"}' where user_id = $1", [S_A1])));
  });

  console.log('停止中のアカウント');
  await as(S_SUSP, 'aal1', async () => {
    check('停止中の生徒は記録を追加できない', !!(await fails(...ins(result(S_SUSP)))));
  });

  console.log('未ログイン');
  await as('anon', null, async () => {
    check('未ログインでは記録を読めない', !!(await fails('select * from public.practice_results')));
    check('未ログインではプロフィールを読めない', !!(await fails('select * from public.profiles')));
  });

  console.log('教員（二段階認証前）');
  await as(T_A, 'aal1', async () => {
    check('二段階認証前の教員は生徒の記録を見られない', (await rows('select * from public.practice_results')).length === 0);
    check('二段階認証前の教員は生徒のプロフィールを見られない', (await rows("select * from public.profiles where role = 'student'")).length === 0);
    check('二段階認証前の教員はクラスを作れない', !!(await fails("select public.create_class('x')")));
  });

  console.log('教員（担当クラス）');
  await as(T_A, 'aal2', async () => {
    const seen = (await rows('select user_id from public.practice_results')).map((r) => r.user_id).sort();
    check('教員Aは担当クラスの生徒の記録を見られる', seen.length === 2 && seen.includes(S_A1) && seen.includes(S_A2), JSON.stringify(seen));
    check('教員Aは担当外の生徒B1の記録を見られない', (await rows('select * from public.practice_results where user_id = $1', [S_B1])).length === 0);
    check('教員Aは担当外の生徒B1のプロフィールを見られない', (await rows('select * from public.profiles where id = $1', [S_B1])).length === 0);
    check('教員Aは担当外のクラスBを見られない', (await rows('select * from public.classes where id = $1', [C_B])).length === 0);
    const summary = (await rows('select student_id from public.teacher_student_summaries()')).map((r) => r.student_id);
    check('生徒一覧の集計は担当の生徒だけ', summary.length === 4 && !summary.includes(S_B1), JSON.stringify(summary));
    check('教員Aは生徒B1を自分のクラスに入れられない', !!(await fails('select public.set_student_class($1, $2, true)', [S_B1, C_A])));
    check('教員Aは担当外のクラスBに自分の生徒を入れられない', !!(await fails('select public.set_student_class($1, $2, true)', [S_A1, C_B])));
    check('教員AはクラスBの名前を変えられない', (await db.query("update public.classes set name = 'x' where id = $1", [C_B])).rowCount === 0);
    check('教員Aは生徒B1の表示名を変えられない', !!(await fails("select public.update_student_display_name($1, 'x')", [S_B1])));
    check('教員Aは生徒B1の初期設定を変えられない', !!(await fails("insert into public.student_defaults (student_id, settings) values ($1, '{}')", [S_B1])));
    check('教員Aはまだクラスにいない自分の発行した生徒を管理できる', (await rows('select public.teacher_can_manage_student($1) ok', [S_ORPHAN]))[0].ok === true);
    await db.query("insert into public.student_defaults (student_id, settings) values ($1, '{\"minutes\":10,\"fingerGuide\":false}')", [S_A1]);
    check('教員Aは担当生徒の初期設定を指定できる', (await rows('select * from public.student_defaults where student_id = $1', [S_A1])).length === 1);
    await db.query("select public.update_student_display_name($1, 'さくら2')", [S_A1]);
    check('教員Aは担当生徒の表示名を変えられる', (await rows('select display_name from public.profiles where id = $1', [S_A1]))[0].display_name === 'さくら2');
    check('表示名にタグ文字は使えない', !!(await fails("select public.update_student_display_name($1, '<b>x</b>')", [S_A1])));
    check('教員は生徒の記録を書き換えられない', !!(await fails('update public.practice_results set correct_count = 1 where user_id = $1', [S_A1])));
    check('教員は自分を生徒・他人を教員に変えられない', !!(await fails("update public.profiles set role = 'teacher' where id = $1", [S_A1])));
    check('教員は教員アカウントを作れない（profiles に追加できない）', !!(await fails("insert into public.profiles (id, login_id, display_name, role) values ($1, 'newt01', 'x', 'teacher')", [id()])));
    check('教員Bのプロフィールは見えない（共同担当でない）', (await rows('select * from public.profiles where id = $1', [T_B])).length === 0);
  });
  await as(T_B, 'aal2', async () => {
    check('教員Bは教員Aが発行したクラス未所属の生徒を管理できない', (await rows('select public.teacher_can_manage_student($1) ok', [S_ORPHAN]))[0].ok === false);
    check('教員Bは生徒A1の記録を見られない', (await rows('select * from public.practice_results where user_id = $1', [S_A1])).length === 0);
  });

  console.log('クラスの共同担当（明示的な共有）');
  await as(T_B, 'aal2', async () => {
    check('担当外のクラスに共同担当を追加できない', !!(await fails("select public.add_class_teacher($1, 'teacherb1')", [C_A])));
    await db.query("select public.add_class_teacher($1, 'teachera1')", [C_B]);
    await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: T_A, role: 'authenticated', aal: 'aal2' })]);
    check('共同担当に追加された教員Aは生徒B1の記録を見られる', (await rows('select * from public.practice_results where user_id = $1', [S_B1])).length === 1);
    check('共同担当の教員どうしは表示名を見られる', (await rows('select * from public.profiles where id = $1', [T_B])).length === 1);
  });

  console.log('追加教材');
  let matId = null;
  await as(T_A, 'aal2', async () => {
    check('読みのないローマ字教材は登録できない', !!(await fails("insert into public.materials (kind, text, reading, theme, difficulty) values ('romaji', '桜', '', '春', 1)")));
    check('ローマ字で打てない読みは登録できない', !!(await fails("insert into public.materials (kind, text, reading, theme, difficulty) values ('romaji', '桜', 'sakura', '春', 1)")));
    check('タグ文字を含む教材は登録できない', !!(await fails("insert into public.materials (kind, text, reading, theme, difficulty) values ('sentence', '<script>alert(1)</script>', '', '春', 1)")));
    check('長すぎる教材は登録できない', !!(await fails("insert into public.materials (kind, text, reading, theme, difficulty) values ('sentence', repeat('あ', 301), '', '春', 1)")));
  });
  // 教材の作成と公開（コミットして生徒側で確認）
  await db.query('begin');
  await db.query("select set_config('request.jwt.claims', $1, true)", [JSON.stringify({ sub: T_A, role: 'authenticated', aal: 'aal2' })]);
  await db.query('set local role authenticated');
  matId = (await db.query("insert into public.materials (kind, text, reading, theme, difficulty) values ('romaji', '桜並木', 'さくらなみき', '春', 1) returning id")).rows[0].id;
  const hiddenId = (await db.query("insert into public.materials (kind, text, reading, theme, difficulty, is_published) values ('romaji', '若葉', 'わかば', '春', 1, false) returning id")).rows[0].id;
  await db.query('insert into public.material_classes (material_id, class_id) values ($1, $2), ($3, $2)', [matId, C_A, hiddenId]);
  const cannotAssign = await fails('insert into public.material_classes (material_id, class_id) values ($1, $2)', [matId, id()]);
  await db.query('commit');
  check('担当していないクラスに教材を割り当てられない', !!cannotAssign);

  await as(S_A1, 'aal1', async () => {
    const ids = (await rows('select id from public.materials')).map((r) => r.id);
    check('クラスAの生徒は公開中の教材を使える', ids.includes(matId));
    check('非公開の教材は生徒に見えない', !ids.includes(hiddenId));
    check('生徒は教材を作れない', !!(await fails("insert into public.materials (kind, text, reading, theme, difficulty) values ('romaji', 'x', 'えっくす', 't', 1)")));
  });
  await as(S_B1, 'aal1', async () => {
    check('割り当てのないクラスの生徒には教材が見えない', (await rows('select id from public.materials')).length === 0);
  });
  await as(T_B, 'aal2', async () => {
    check('他の教員の教材は書き換えられない', (await db.query("update public.materials set text = 'x' where id = $1", [matId])).rowCount === 0);
  });

  console.log('ログイン失敗の連続試行の制限');
  {
    const u = S_A2;
    const hook = async (valid) => (await rows('select public.hook_password_verification_attempt($1::jsonb) r', [JSON.stringify({ user_id: u, valid })]))[0].r;
    for (let i = 0; i < 5; i++) await hook(false);
    check('5回失敗すると正しいパスワードでも一時的に拒否', (await hook(true)).decision === 'reject');
    await db.query("update private.login_failures set last_failed_at = now() - interval '16 minutes' where user_id = $1", [u]);
    check('15分たつと再びログインできる', (await hook(true)).decision === 'continue');
    check('成功すると失敗回数が消える', (await rows('select * from private.login_failures where user_id = $1', [u])).length === 0);
  }

  console.log('問題数で練習（v1.0.2）');
  await as(S_A1, 'aal1', async () => {
    const countRec = result(S_A1, { end_mode: 'count', target_count: 25, minutes: null, elapsed_ms: 400000, completed_questions: 25, finished: true });
    await db.query('savepoint c');
    await db.query(...ins(countRec));
    const saved = await rows('select end_mode, target_count, minutes, official, rank from public.practice_results where id = $1', [countRec.id]);
    check('問題数制（25問）の記録を保存できる', saved.length === 1 && saved[0].end_mode === 'count' && saved[0].target_count === 25 && saved[0].minutes === null, JSON.stringify(saved));
    check('問題数制の標準問題は正式ランクにならない（参考ランク）', saved[0]?.official === false);
    check('50問の記録も保存できる', !(await fails(...ins(result(S_A1, { end_mode: 'count', target_count: 50, minutes: null, elapsed_ms: 900000, completed_questions: 50, finished: true })))));
    check('問題数制の途中終了（目標に届かない）も保存できる', !(await fails(...ins(result(S_A1, { end_mode: 'count', target_count: 25, minutes: null, elapsed_ms: 60000, completed_questions: 7, finished: false })))));
    check('完了なのに目標の問題数と合わない記録は拒否', !!(await fails(...ins(result(S_A1, { end_mode: 'count', target_count: 25, minutes: null, elapsed_ms: 400000, completed_questions: 24, finished: true })))));
    check('問題数制で minutes を入れた記録は拒否（代用しない）', !!(await fails(...ins(result(S_A1, { end_mode: 'count', target_count: 25, minutes: 3, elapsed_ms: 180000, completed_questions: 25, finished: true })))));
    check('25・50 以外の問題数は拒否', !!(await fails(...ins(result(S_A1, { end_mode: 'count', target_count: 30, minutes: null, elapsed_ms: 400000, completed_questions: 30, finished: true })))));
    const timeRec = result(S_A1);
    await db.query(...ins(timeRec));
    const t = await rows('select end_mode, official from public.practice_results where id = $1', [timeRec.id]);
    check('end_mode を送らない時間制の記録は時間制として保存され、正式ランク', t[0]?.end_mode === 'time' && t[0]?.official === true, JSON.stringify(t));
    check('時間制で minutes がない記録は拒否', !!(await fails(...ins(result(S_A1, { minutes: null })))));
    check('ローマ字のお手本（訓令式）を設定に保存できる', !(await fails("insert into public.user_settings (user_id, settings) values ($1, '{\"romajiStyle\":\"kunrei\"}')", [S_A1])));
    check('お手本に不正な値は保存できない', !!(await fails("update public.user_settings set settings = '{\"romajiStyle\":\"x\"}' where user_id = $1", [S_A1])));
  });
  await db.query('select 1');
  {
    const legacy = await rows("select count(*)::int n from public.practice_results where end_mode = 'time'");
    check('これまでの記録は時間制として読み込まれる', legacy[0].n >= 3);
  }

  console.log('練習の記録（v1.0.3）');
  await as(S_A1, 'aal1', async () => {
    const r1 = result(S_A1, { romaji_style: 'kunrei' });
    check('ローマ字のお手本を記録に残せる', !(await fails(...ins(r1))));
    check('お手本に不正な値は保存できない', !!(await fails(...ins(result(S_A1, { romaji_style: 'x' })))));
    check('文章入力の記録にお手本は保存できない', !!(await fails(...ins(result(S_A1, { kind: 'sentence', romaji_style: 'hepburn', correct_count: 50 })))));
    check('お手本なし（文章入力・古い記録）も保存できる', !(await fails(...ins(result(S_A1, { kind: 'sentence', correct_count: 50 })))));
    const latest = await rows('select id, romaji_style from public.practice_results order by started_at desc limit 100');
    check('本人の記録を新しい順に100件まで取得できる（ほかの人の記録は含まれない）', latest.length > 0 && latest.length <= 100);
    const others = await rows('select count(*)::int n from public.practice_results where user_id <> $1', [S_A1]);
    check('取得結果にほかの人の記録が混ざらない', others[0].n === 0);
  });
  await as(S_B1, 'aal1', async () => {
    const mine = await rows('select user_id from public.practice_results');
    check('別のアカウントでは自分の記録だけが見える', mine.length > 0 && mine.every((r) => r.user_id === S_B1));
  });

  console.log('ランク判定（アプリとデータベースで同じ結果になるか）');
  {
    let mismatch = 0;
    let seed = 42;
    const rnd = (n) => {
      seed = (seed * 1103515245 + 12345) % 2 ** 31;
      return seed % n;
    };
    const cases = [];
    for (let i = 0; i < 400; i++) {
      const kind = i % 2 ? 'romaji' : 'sentence';
      const minutes = [3, 5, 10][rnd(3)];
      const elapsed = rnd(4) === 0 ? 1 + rnd(minutes * 60000) : minutes * 60000;
      const max = kind === 'romaji' ? 1000 : 220;
      const correct = Math.floor((rnd(max) * elapsed) / 60000);
      const miss = rnd(4) === 0 ? 0 : rnd(Math.max(1, Math.floor(correct / 5)) + 1);
      cases.push([kind, correct, miss, elapsed]);
    }
    // 境界ちょうどの値
    cases.push(['romaji', 2700, 27, 180000], ['romaji', 8077, 123, 600000], ['romaji', 8077, 124, 600000], ['sentence', 500, 37, 600000], ['romaji', 0, 0, 180000]);
    for (const [kind, correct, miss, elapsed] of cases) {
      const sql = (await rows('select private.judge_rank($1, $2, $3, $4, $5) r', ['rank-v1', kind, correct, miss, elapsed]))[0].r;
      const js = judgeRank(kind, { correct, miss, elapsedMs: elapsed });
      if (sql !== js) {
        mismatch++;
        console.log(`    ${kind} ${correct} ${miss} ${elapsed}: SQL=${sql} アプリ=${js}`);
      }
    }
    check(`${cases.length}通りの値でランクが一致`, mismatch === 0);
  }

  console.log('検定モードの記録（exam_results）');
  {
    const exam = (user, extra = {}) => ({
      id: id(), user_id: user, started_at: new Date().toISOString(), problem_id: 'exam-original-4-01', problem_title: '朝の準備',
      problem_revision: 1, problem_source: 'builtin', grade: '4', time_limit_seconds: 600, elapsed_ms: 600000, end_reason: 'time_up',
      full_text_completed: false, scoring_enabled: true, input_chars: 250, matched_chars: 245, miss_count: 5,
      penalty_per_error: 1, target_characters: 200, scoring_version: 'exam-v1', ...extra,
    });
    const insE = (r) => {
      const cols = Object.keys(r);
      return [`insert into public.exam_results (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map((c) => r[c])];
    };
    for (const u of [S_A1, S_B1]) await db.query(...insE(exam(u)));
    await as(S_A1, 'aal1', async () => {
      const r = await rows('select user_id from public.exam_results');
      check('生徒A1は自分の検定記録だけ見える', r.length === 1 && r[0].user_id === S_A1, JSON.stringify(r));
      check('生徒A1が生徒B1の検定記録をIDで指定しても見えない', (await rows('select * from public.exam_results where user_id = $1', [S_B1])).length === 0);
      check('生徒A1は生徒B1として検定記録を追加できない', !!(await fails(...insE(exam(S_B1)))));
      const mine = exam(S_A1, { score_chars: 9999, achieved: true, input_chars: 150, matched_chars: 140, miss_count: 10 });
      await db.query(...insE(mine));
      const saved = await rows('select score_chars, achieved from public.exam_results where id = $1', [mine.id]);
      check('得点文字数・目安達成はサーバー側で計算し直す（送った値は使わない）', saved[0]?.score_chars === 140 && saved[0]?.achieved === false, JSON.stringify(saved));
      const pre2 = exam(S_A1, { grade: 'pre2', penalty_per_error: 3, target_characters: 400, input_chars: 10, matched_chars: 5, miss_count: 5 });
      await db.query(...insE(pre2));
      const s2 = await rows('select score_chars from public.exam_results where id = $1', [pre2.id]);
      check('得点文字数の下限は0', s2[0]?.score_chars === 0, JSON.stringify(s2));
      const short = exam(S_A1, { time_limit_seconds: 300, elapsed_ms: 300000 });
      await db.query(...insE(short));
      check('短縮練習では目安達成を判定しない（null）', (await rows('select achieved from public.exam_results where id = $1', [short.id]))[0]?.achieved === null);
      const quit = exam(S_A1, { end_reason: 'user_end', elapsed_ms: 300000, full_text_completed: true });
      await db.query(...insE(quit));
      check('途中終了・全文入力完了では目安達成を判定しない（null）', (await rows('select achieved from public.exam_results where id = $1', [quit.id]))[0]?.achieved === null);
      const none = exam(S_A1, { problem_source: 'teacher', problem_id: 'tp-x', scoring_enabled: false, matched_chars: null, miss_count: null, time_limit_seconds: null, end_reason: 'user_end', elapsed_ms: 1000000, input_chars: 100 });
      await db.query(...insE(none));
      const ns = await rows('select score_chars, achieved from public.exam_results where id = $1', [none.id]);
      check('採点なしの記録は得点・目安達成を持たない', ns[0]?.score_chars === null && ns[0]?.achieved === null, JSON.stringify(ns));
      check('同じIDの検定記録の再送は重複しない', (await fails(...insE(mine))) === '23505');
      check('段階と減点が合わない記録は拒否', !!(await fails(...insE(exam(S_A1, { penalty_per_error: 5 })))));
      check('時間切れなのに時間が足りない記録は拒否', !!(await fails(...insE(exam(S_A1, { elapsed_ms: 1000 })))));
      check('制限時間を超えた記録は拒否', !!(await fails(...insE(exam(S_A1, { end_reason: 'user_end', elapsed_ms: 700000 })))));
      check('選べない制限時間は拒否', !!(await fails(...insE(exam(S_A1, { time_limit_seconds: 1200, elapsed_ms: 1200000 })))));
      check('一致数が入力文字数を超える記録は拒否', !!(await fails(...insE(exam(S_A1, { matched_chars: 300 })))));
      check('採点なしでミス数を持つ記録は拒否', !!(await fails(...insE(exam(S_A1, { scoring_enabled: false })))));
      check('ありえない入力の速さは拒否', !!(await fails(...insE(exam(S_A1, { input_chars: 9000, matched_chars: 9000 })))));
      check('問題名にタグを含む記録は拒否', !!(await fails(...insE(exam(S_A1, { problem_title: '<script>' })))));
      check('検定記録を書き換えられない', !!(await fails('update public.exam_results set miss_count = 0 where user_id = $1', [S_A1])));
      check('検定記録を削除できない', !!(await fails('delete from public.exam_results where user_id = $1', [S_A1])));
      check('検定記録はタイピングの記録に混ざらない', (await rows('select id from public.practice_results where id = $1', [mine.id])).length === 0);
    });
    await as(S_SUSP, 'aal1', async () => {
      check('停止中の生徒は検定記録を追加できない', !!(await fails(...insE(exam(S_SUSP)))));
    });
    await as(T_A, 'aal2', async () => {
      const r = await rows('select distinct user_id from public.exam_results');
      check('教員A（二段階認証済み）は担当の生徒の検定記録だけ見える', r.length === 1 && r[0].user_id === S_A1, JSON.stringify(r));
      check('教員Aは担当外の生徒B1の検定記録を見られない', (await rows('select * from public.exam_results where user_id = $1', [S_B1])).length === 0);
      check('教員は生徒の検定記録を書き換えられない', !!(await fails('update public.exam_results set miss_count = 0 where user_id = $1', [S_A1])));
    });
    await as(T_A, 'aal1', async () => {
      check('教員Aは二段階認証なしでは生徒の検定記録を見られない', (await rows('select * from public.exam_results where user_id = $1', [S_A1])).length === 0);
    });
    await as(T_B, 'aal2', async () => {
      const r = await rows('select distinct user_id from public.exam_results');
      check('教員Bは担当の生徒B1の検定記録だけ見える', r.length === 1 && r[0].user_id === S_B1, JSON.stringify(r));
    });
    await as('anon', null, async () => {
      check('未ログインでは検定記録を読めない', !!(await fails('select * from public.exam_results')));
    });
  }

  console.log('ゲームの記録（game_results）');
  {
    const gm = (user, extra = {}) => ({
      id: id(), user_id: user, game_id: 'sakurada-familia', rule_version: 'sakurada-rule-v1', story_set_version: 'sakurada-stories-v1',
      story_id: 'inherited-dream', course_id: 'standard', input_method: 'keyboard', romaji_style: 'hepburn',
      started_at: new Date(Date.now() - 300000).toISOString(), finished_at: new Date().toISOString(),
      elapsed_ms: 180000, miss_count: 6, correct_keystrokes: 1800, completed_reading_characters: 967, total_reading_characters: 967,
      pause_count: 0, finished: true, ...extra,
    });
    const insG = (r) => {
      const cols = Object.keys(r);
      return [`insert into public.game_results (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`, cols.map((c) => r[c])];
    };
    for (const u of [S_A1, S_B1]) await db.query(...insG(gm(u)));
    await as(S_A1, 'aal1', async () => {
      const r = await rows('select user_id from public.game_results');
      check('生徒A1は自分のゲーム記録だけ見える', r.length === 1 && r[0].user_id === S_A1, JSON.stringify(r));
      check('生徒A1が生徒B1のゲーム記録をIDで指定しても見えない', (await rows('select * from public.game_results where user_id = $1', [S_B1])).length === 0);
      check('生徒A1は生徒B1としてゲーム記録を追加できない', !!(await fails(...insG(gm(S_B1)))));
      const mine = gm(S_A1, { penalty_ms: 0, record_time_ms: 1, completion_year: 1882, accuracy: 100 });
      await db.query(...insG(mine));
      const saved = (await rows('select penalty_ms, record_time_ms, completion_year, accuracy from public.game_results where id = $1', [mine.id]))[0];
      check(
        'ミス加算・記録タイム・完成年・正確率はサーバー側で計算し直す（6ミス・3分 → 3分30秒・1987年）',
        Number(saved?.penalty_ms) === 30000 && Number(saved?.record_time_ms) === 210000 && saved?.completion_year === 1987 && Math.abs(Number(saved?.accuracy) - 99.6678) < 0.001,
        JSON.stringify(saved),
      );
      const y = gm(S_A1, { elapsed_ms: 226000, miss_count: 0 });
      await db.query(...insG(y));
      check('記録3分46秒 → 1995年', (await rows('select completion_year from public.game_results where id = $1', [y.id]))[0]?.completion_year === 1995);
      const y2 = gm(S_A1, { elapsed_ms: 266000, miss_count: 6 });
      await db.query(...insG(y2));
      check('入力4分26秒＋ミス6回 → 4分56秒 → 2030年', (await rows('select completion_year from public.game_results where id = $1', [y2.id]))[0]?.completion_year === 2030);
      check('同じIDのゲーム記録の再送は重複しない', (await fails(...insG(mine))) === '23505');
      check('完成なのに読みの文字数が足りない記録は拒否', !!(await fails(...insG(gm(S_A1, { completed_reading_characters: 500 })))));
      check('物語と読みの総数が合わない記録は拒否', !!(await fails(...insG(gm(S_A1, { total_reading_characters: 100, completed_reading_characters: 100 })))));
      check('物語とコースが合わない記録は拒否', !!(await fails(...insG(gm(S_A1, { course_id: 'short' })))));
      check('知らない物語の記録は拒否', !!(await fails(...insG(gm(S_A1, { story_id: 'unknown-story' })))));
      check('負のミス数は拒否', !!(await fails(...insG(gm(S_A1, { miss_count: -1 })))));
      check('ありえない速さは拒否', !!(await fails(...insG(gm(S_A1, { elapsed_ms: 1000 })))));
      check('終了が開始より前の記録は拒否', !!(await fails(...insG(gm(S_A1, { finished_at: new Date(Date.now() - 600000).toISOString() })))));
      check('知らないルールの版は拒否', !!(await fails(...insG(gm(S_A1, { rule_version: 'v99' })))));
      const unfinished = gm(S_A1, { finished: false, completed_reading_characters: 300 });
      await db.query(...insG(unfinished));
      // 自己ベスト：古い記録を含めて、条件ごとに最も良い完成記録。途中終了は含めない
      const fast = gm(S_A1, { elapsed_ms: 150000, miss_count: 0, started_at: '2026-01-01T00:00:00Z', finished_at: '2026-01-01T00:03:00Z' });
      await db.query(...insG(fast));
      const paused = gm(S_A1, { elapsed_ms: 140000, miss_count: 0, pause_count: 2 });
      await db.query(...insG(paused));
      const bests = await rows('select id, pause_count from public.game_bests($1)', [S_A1]);
      check('自己ベストは古い記録を含め、一時停止の有無で分けて取得できる', bests.length === 2 && bests.some((b) => b.id === fast.id) && bests.some((b) => b.id === paused.id), JSON.stringify(bests));
      check('自己ベストに途中終了は含めない', !bests.some((b) => b.id === unfinished.id));
      check('他人の自己ベストは取得できない', (await rows('select * from public.game_bests($1)', [S_B1])).length === 0);
      check('ゲーム記録を書き換えられない', !!(await fails('update public.game_results set miss_count = 0 where user_id = $1', [S_A1])));
      check('ゲーム記録を削除できない', !!(await fails('delete from public.game_results where user_id = $1', [S_A1])));
      check('ゲーム記録はタイピング・検定の記録に混ざらない', (await rows('select id from public.practice_results where id = $1 union all select id from public.exam_results where id = $1', [mine.id])).length === 0);
    });
    await as(S_SUSP, 'aal1', async () => {
      check('停止中の生徒はゲーム記録を追加できない', !!(await fails(...insG(gm(S_SUSP)))));
    });
    await as(T_A, 'aal2', async () => {
      const r = await rows('select distinct user_id from public.game_results');
      check('教員A（二段階認証済み）は担当の生徒のゲーム記録だけ見える', r.length === 1 && r[0].user_id === S_A1, JSON.stringify(r));
      check('教員Aは担当生徒の自己ベストを取得できる', (await rows('select * from public.game_bests($1)', [S_A1])).length === 1);
      check('教員Aは担当外の生徒B1のゲーム記録を見られない', (await rows('select * from public.game_results where user_id = $1', [S_B1])).length === 0);
      check('教員Aは担当外の生徒B1の自己ベストを取得できない', (await rows('select * from public.game_bests($1)', [S_B1])).length === 0);
      check('教員は生徒のゲーム記録を書き換えられない', !!(await fails('update public.game_results set miss_count = 0 where user_id = $1', [S_A1])));
      check('教員は生徒としてゲーム記録を追加できない', !!(await fails(...insG(gm(S_A1)))));
    });
    await as(T_A, 'aal1', async () => {
      check('教員Aは二段階認証なしでは生徒のゲーム記録を見られない', (await rows('select * from public.game_results where user_id = $1', [S_A1])).length === 0);
    });
    await as(T_B, 'aal2', async () => {
      const r = await rows('select distinct user_id from public.game_results');
      check('教員Bは担当の生徒B1のゲーム記録だけ見える', r.length === 1 && r[0].user_id === S_B1, JSON.stringify(r));
    });
    await as('anon', null, async () => {
      check('未ログインではゲーム記録を読めない', !!(await fails('select * from public.game_results')));
      check('未ログインではゲーム記録を追加できない', !!(await fails(...insG(gm(S_A1)))));
      check('未ログインでは自己ベストの関数を使えない', !!(await fails('select * from public.game_bests($1)', [S_A1])));
    });
  }

  console.log('アカウント削除');
  await db.query('delete from auth.users where id = $1', [S_A2]);
  check('アカウントを削除すると記録も消える', (await rows('select * from public.practice_results where user_id = $1', [S_A2])).length === 0);

  console.log(`\n${passed} 件成功 / ${failed} 件失敗`);
  return failed;

  function ins(r) {
    const cols = Object.keys(r);
    return [
      `insert into public.practice_results (${cols.join(',')}) values (${cols.map((_, i) => `$${i + 1}`).join(',')})`,
      cols.map((c) => r[c]),
    ];
  }
}
