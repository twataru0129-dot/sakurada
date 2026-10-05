import { useCallback, useEffect, useState, type FormEvent } from 'react';
import {
  addCoTeacher,
  adminAction,
  changeOwnPassword,
  createClass,
  deleteClass,
  listClassTeachers,
  listMyClasses,
  removeCoTeacher,
  renameClass,
  studentSummaries,
  type ClassRow,
  type StudentSummary,
} from '../../data/cloud';
import { generatePassword, normalizeLoginId, validateDisplayName, validateLoginId, validatePassword } from '../../../supabase/functions/_shared/accountRules';
import { formatNumber1 } from '../../core/rank';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { formatDate, Notice } from '../../ui/common';
import { MaterialsPanel } from './MaterialsPanel';

type Tab = 'classes' | 'materials' | 'account';

export function TeacherHome({ tab }: { tab: Tab }) {
  const { account } = useApp();
  if (account?.kind !== 'user' || account.profile.role !== 'teacher') {
    return (
      <main>
        <p className="msg msg-ng">この画面は先生のアカウントだけが使えます。</p>
      </main>
    );
  }
  const me = account.profile;
  return (
    <main>
      <Notice />
      <h1>先生用の画面</h1>
      <p className="hint">
        ここでは、担当するクラス・生徒の管理と学習設定の指定ができます。アプリの機能そのものを変えることはできません。
      </p>
      <nav className="tabs" aria-label="先生用のメニュー">
        <button type="button" className="btn btn-small" aria-current={tab === 'classes' ? 'page' : undefined} onClick={() => navigate('/teacher')}>
          クラスと生徒
        </button>
        <button type="button" className="btn btn-small" aria-current={tab === 'materials' ? 'page' : undefined} onClick={() => navigate('/teacher/materials')}>
          追加教材
        </button>
        <button type="button" className="btn btn-small" aria-current={tab === 'account' ? 'page' : undefined} onClick={() => navigate('/teacher/account')}>
          自分のアカウント
        </button>
        <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate('/home')}>
          練習する（ホーム）
        </button>
      </nav>
      {tab === 'classes' && <ClassesPanel teacherId={me.id} />}
      {tab === 'materials' && <MaterialsPanel teacherId={me.id} />}
      {tab === 'account' && <AccountPanel />}
    </main>
  );
}

function ClassesPanel({ teacherId }: { teacherId: string }) {
  const [classes, setClasses] = useState<ClassRow[] | null>(null);
  const [selected, setSelected] = useState<string>('');
  const [students, setStudents] = useState<StudentSummary[] | null>(null);
  const [teachers, setTeachers] = useState<Array<{ id: string; displayName: string; loginId: string }>>([]);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newClass, setNewClass] = useState('');
  const [coTeacher, setCoTeacher] = useState('');

  const reloadClasses = useCallback(async () => {
    try {
      const list = await listMyClasses(teacherId);
      setClasses(list);
      setSelected((cur) => (cur && list.some((c) => c.id === cur) ? cur : (list[0]?.id ?? '')));
    } catch {
      setMsg({ ok: false, text: 'クラスを読み込めませんでした。二段階認証が済んでいるか確認してください。' });
      setClasses([]);
    }
  }, [teacherId]);

  const reloadStudents = useCallback(async () => {
    if (!selected) {
      setStudents([]);
      return;
    }
    setStudents(null);
    try {
      setStudents(await studentSummaries(selected));
      setTeachers(await listClassTeachers(selected));
    } catch {
      setStudents([]);
      setMsg({ ok: false, text: '生徒の一覧を読み込めませんでした。' });
    }
  }, [selected]);

  useEffect(() => {
    void reloadClasses();
  }, [reloadClasses]);
  useEffect(() => {
    void reloadStudents();
  }, [reloadStudents]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      return true;
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : '操作できませんでした' });
      return false;
    }
  };

  const current = classes?.find((c) => c.id === selected);

  return (
    <>
      {msg && (
        <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-ng'}`} role="status">
          {msg.text}
        </p>
      )}
      <section className="panel">
        <h2>担当クラス</h2>
        {classes === null && <p>読み込んでいます…</p>}
        {classes && classes.length === 0 && <p>担当しているクラスはまだありません。下でクラスを作成してください。</p>}
        {classes && classes.length > 0 && (
          <div className="field-inline">
            <label htmlFor="class-sel">クラス</label>
            <select id="class-sel" value={selected} onChange={(e) => setSelected(e.target.value)}>
              {classes.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {current && (
              <>
                <button
                  type="button"
                  className="btn btn-quiet btn-small"
                  onClick={() => {
                    const name = window.prompt('新しいクラス名', current.name)?.trim();
                    if (name) void run(() => renameClass(current.id, name), 'クラス名を変更しました').then(reloadClasses);
                  }}
                >
                  名前を変える
                </button>
                <button
                  type="button"
                  className="btn btn-danger btn-small"
                  onClick={() => {
                    if (window.confirm(`クラス「${current.name}」を削除しますか？ 生徒のアカウントと記録は削除されません。`)) {
                      void run(() => deleteClass(current.id), 'クラスを削除しました').then(reloadClasses);
                    }
                  }}
                >
                  クラスを削除
                </button>
              </>
            )}
          </div>
        )}
        <form
          className="field-inline"
          style={{ marginTop: 16 }}
          onSubmit={async (e) => {
            e.preventDefault();
            const name = newClass.trim();
            if (!name) return;
            if (await run(() => createClass(name), `クラス「${name}」を作成しました`)) {
              setNewClass('');
              await reloadClasses();
            }
          }}
        >
          <label htmlFor="new-class">新しいクラス</label>
          <input id="new-class" type="text" maxLength={40} value={newClass} onChange={(e) => setNewClass(e.target.value)} placeholder="例：1年A組 情報" />
          <button type="submit" className="btn btn-small">
            作成
          </button>
        </form>
      </section>

      {current && (
        <>
          <section className="panel">
            <h2>「{current.name}」の生徒</h2>
            {students === null && <p>読み込んでいます…</p>}
            {students && students.length === 0 && <p>このクラスにはまだ生徒がいません。</p>}
            {students && students.length > 0 && (
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      <th>ID</th>
                      <th>表示名</th>
                      <th>状態</th>
                      <th className="num">練習回数</th>
                      <th>最終練習日</th>
                      <th className="num">ローマ字 最高速度（正式）</th>
                      <th className="num">ローマ字 正確率（最新）</th>
                      <th className="num">文章 最高速度（正式）</th>
                      <th className="num">文章 正確率（最新）</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {students.map((s) => (
                      <tr key={s.studentId}>
                        <td className="mono">{s.loginId}</td>
                        <td>{s.displayName}</td>
                        <td>{s.status === 'active' ? '利用中' : '停止中'}</td>
                        <td className="num">{s.practiceCount}</td>
                        <td>{formatDate(s.lastPracticedAt)}</td>
                        <td className="num">{s.romajiBestSpeed === null ? '—' : `${formatNumber1(s.romajiBestSpeed)} 打/分`}</td>
                        <td className="num">{s.romajiLastAccuracy === null ? '—' : `${formatNumber1(s.romajiLastAccuracy)}％`}</td>
                        <td className="num">{s.sentenceBestSpeed === null ? '—' : `${formatNumber1(s.sentenceBestSpeed)} 字/分`}</td>
                        <td className="num">{s.sentenceLastAccuracy === null ? '—' : `${formatNumber1(s.sentenceLastAccuracy)}％`}</td>
                        <td>
                          <button type="button" className="btn btn-small" onClick={() => navigate(`/teacher/student/${s.studentId}`)}>
                            くわしく・管理
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <CreateStudent classId={current.id} className={current.name} onCreated={reloadStudents} />

          <section className="panel">
            <h2>このクラスを担当する先生</h2>
            <ul>
              {teachers.map((t) => (
                <li key={t.id}>
                  {t.displayName}（{t.loginId}）
                  {t.id !== teacherId && (
                    <button
                      type="button"
                      className="btn btn-quiet btn-small"
                      style={{ marginLeft: 8 }}
                      onClick={() => void run(() => removeCoTeacher(current.id, t.id), '担当から外しました').then(reloadStudents)}
                    >
                      担当から外す
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="field-inline"
              onSubmit={async (e) => {
                e.preventDefault();
                if (await run(() => addCoTeacher(current.id, normalizeLoginId(coTeacher)), '共同で担当する先生を追加しました')) {
                  setCoTeacher('');
                  await reloadStudents();
                }
              }}
            >
              <label htmlFor="co-teacher">先生のIDで追加</label>
              <input id="co-teacher" type="text" autoCapitalize="none" value={coTeacher} onChange={(e) => setCoTeacher(e.target.value)} />
              <button type="submit" className="btn btn-small" disabled={!coTeacher}>
                追加
              </button>
            </form>
            <p className="hint">追加した先生は、このクラスの生徒の記録を見たり管理したりできるようになります。</p>
          </section>
        </>
      )}
    </>
  );
}

function CreateStudent({ classId, className, onCreated }: { classId: string; className: string; onCreated: () => void }) {
  const [loginId, setLoginId] = useState('');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ loginId: string; password: string } | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const id = normalizeLoginId(loginId);
    const err = validateLoginId(id) ?? validateDisplayName(name) ?? validatePassword(password, id);
    if (err) return setError(err);
    setBusy(true);
    setError(null);
    try {
      await adminAction({ action: 'createStudent', loginId: id, displayName: name.trim(), password, classId });
      setCreated({ loginId: id, password });
      setLoginId('');
      setName('');
      setPassword('');
      onCreated();
    } catch (e2) {
      setError(e2 instanceof Error ? e2.message : '作成できませんでした');
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="panel">
      <h2>生徒のアカウントを発行（{className}）</h2>
      <p className="hint">生徒のメールアドレスや本名は登録しません。表示名にはハンドルネームを使ってください。</p>
      {created && (
        <div className="msg msg-ok" role="status">
          発行しました。ID：<span className="mono">{created.loginId}</span>　パスワード：<span className="mono">{created.password}</span>
          <br />
          生徒に伝えたら「閉じる」を押してください。パスワードはこのあと表示できません（先生も見ることはできず、再設定だけができます）。
          <br />
          <button type="button" className="btn btn-small" onClick={() => setCreated(null)}>
            閉じる
          </button>
        </div>
      )}
      <form onSubmit={submit} noValidate>
        <div className="grid grid-3">
          <div className="field">
            <label htmlFor="ns-id">ID</label>
            <input id="ns-id" type="text" autoCapitalize="none" autoComplete="off" value={loginId} onChange={(e) => setLoginId(e.target.value)} />
            <span className="hint">英字で始まる英小文字と数字 4〜20文字（例：sakura01）</span>
          </div>
          <div className="field">
            <label htmlFor="ns-name">表示名（ハンドルネーム）</label>
            <input id="ns-name" type="text" maxLength={20} autoComplete="off" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="ns-pw">初期パスワード</label>
            <input id="ns-pw" type="text" autoComplete="off" className="mono" value={password} onChange={(e) => setPassword(e.target.value)} />
            <button type="button" className="btn btn-quiet btn-small" onClick={() => setPassword(generatePassword())}>
              自動で作る
            </button>
            <span className="hint">8文字以上・英字と数字を入れる。生徒ごとに別のパスワードにしてください。</span>
          </div>
        </div>
        {error && (
          <p className="msg msg-ng" role="alert">
            {error}
          </p>
        )}
        <button type="submit" className="btn btn-primary" disabled={busy}>
          {busy ? '発行しています…' : '発行する'}
        </button>
      </form>
    </section>
  );
}

function AccountPanel() {
  const [pw, setPw] = useState('');
  const [pw2, setPw2] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const { account } = useApp();
  const loginId = account?.kind === 'user' ? account.profile.loginId : '';
  return (
    <section className="panel">
      <h2>自分のアカウント</h2>
      <p>二段階認証：有効（ログインのたびに確認コードが必要です）。認証アプリの端末をなくしたときは、管理者に README の手順で登録の解除を依頼してください。</p>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          const err = validatePassword(pw, loginId) ?? (pw !== pw2 ? '確認用のパスワードが一致しません' : null);
          if (err) return setMsg({ ok: false, text: err });
          const r = await changeOwnPassword(pw);
          setMsg(r ? { ok: false, text: r } : { ok: true, text: 'パスワードを変更しました' });
          setPw('');
          setPw2('');
        }}
      >
        <h3>パスワードの変更</h3>
        <div className="field">
          <label htmlFor="np1">新しいパスワード</label>
          <input id="np1" type="password" autoComplete="new-password" value={pw} onChange={(e) => setPw(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="np2">新しいパスワード（確認）</label>
          <input id="np2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
        </div>
        {msg && <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-ng'}`}>{msg.text}</p>}
        <button type="submit" className="btn">
          変更する
        </button>
      </form>
    </section>
  );
}
