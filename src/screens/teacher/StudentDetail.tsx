import { useCallback, useEffect, useState } from 'react';
import {
  adminAction,
  fetchResultsOf,
  getStudentDefaults,
  listMyClasses,
  resetStudentOwnSettings,
  setStudentClass,
  setStudentDefaults,
  studentClassIds,
  studentSummaries,
  updateStudentDisplayName,
  type ClassRow,
  type HistoryRow,
  type StudentSummary,
} from '../../data/cloud';
import { generatePassword, validateDisplayName, validatePassword } from '../../../supabase/functions/_shared/accountRules';
import { APP_DEFAULT_SETTINGS, type LearningSettings } from '../../core/settings';
import type { Difficulty } from '../../core/questions';
import type { Minutes } from '../../core/result';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { BackLink, Toggle } from '../../ui/common';
import { HistoryView } from '../../ui/HistoryView';

export function StudentDetail({ studentId }: { studentId: string }) {
  const { account } = useApp();
  const teacherId = account?.kind === 'user' && account.profile.role === 'teacher' ? account.profile.id : null;
  const [student, setStudent] = useState<StudentSummary | null | undefined>(undefined);
  const [classes, setClasses] = useState<ClassRow[]>([]);
  const [member, setMember] = useState<string[]>([]);
  const [defaults, setDefaults] = useState<LearningSettings>(APP_DEFAULT_SETTINGS);
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [newPw, setNewPw] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!teacherId) return;
    try {
      // RLS により、担当していない生徒の情報は返りません（URL の ID を書き換えても見られません）
      const all = await studentSummaries(null);
      const s = all.find((x) => x.studentId === studentId) ?? null;
      setStudent(s);
      if (!s) return;
      const [cls, mem, defs, hist] = await Promise.all([listMyClasses(teacherId), studentClassIds(studentId), getStudentDefaults(studentId), fetchResultsOf(studentId)]);
      setClasses(cls);
      setMember(mem);
      setDefaults({ ...APP_DEFAULT_SETTINGS, ...defs });
      setRows(hist);
    } catch {
      setStudent(null);
    }
  }, [studentId, teacherId]);

  useEffect(() => {
    void load();
  }, [load]);

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

  if (!teacherId) return <main className="msg msg-ng">この画面は先生のアカウントだけが使えます。</main>;
  if (student === undefined) return <main>読み込んでいます…</main>;
  if (student === null) {
    return (
      <main>
        <BackLink to="/teacher">生徒の一覧へ</BackLink>
        <p className="msg msg-ng">この生徒の情報は表示できません（担当していない生徒か、存在しない生徒です）。</p>
      </main>
    );
  }

  return (
    <main>
      <BackLink to="/teacher">生徒の一覧へ</BackLink>
      <h1 style={{ marginTop: 12 }}>
        {student.displayName}（<span className="mono">{student.loginId}</span>）
      </h1>
      {msg && (
        <p className={`msg ${msg.ok ? 'msg-ok' : 'msg-ng'}`} role="status">
          {msg.text}
        </p>
      )}

      <section className="panel">
        <h2>練習の記録と成長</h2>
        {rows ? <HistoryView rows={rows} /> : <p>読み込んでいます…</p>}
      </section>

      <section className="panel">
        <h2>学習の初期設定（この生徒用）</h2>
        <p className="hint">生徒が自分で設定を変えていないときに使われます。</p>
        <div className="field-inline">
          <label htmlFor="d-min">練習時間</label>
          <select id="d-min" value={defaults.minutes} onChange={(e) => setDefaults({ ...defaults, minutes: Number(e.target.value) as Minutes })}>
            <option value={3}>3分</option>
            <option value={5}>5分</option>
            <option value={10}>10分</option>
          </select>
          <label htmlFor="d-diff">難易度（一般問題・桜モード）</label>
          <select
            id="d-diff"
            value={String(defaults.difficulty)}
            onChange={(e) => setDefaults({ ...defaults, difficulty: e.target.value === 'mixed' ? 'mixed' : (Number(e.target.value) as Difficulty) })}
          >
            <option value="mixed">いろいろ</option>
            <option value="1">やさしい（1）</option>
            <option value="2">ふつう（2）</option>
            <option value="3">むずかしい（3）</option>
          </select>
        </div>
        <Toggle label="ローマ字ガイド（文章入力では読み）" checked={defaults.romajiGuide} onChange={(v) => setDefaults({ ...defaults, romajiGuide: v })} />
        <br />
        <Toggle label="キーボードガイド" checked={defaults.keyboardGuide} onChange={(v) => setDefaults({ ...defaults, keyboardGuide: v })} />
        <br />
        <Toggle label="指のガイド" checked={defaults.fingerGuide} onChange={(v) => setDefaults({ ...defaults, fingerGuide: v })} />
        <br />
        <Toggle label="音" checked={defaults.sound} onChange={(v) => setDefaults({ ...defaults, sound: v })} />
        <div className="btn-row" style={{ marginTop: 12 }}>
          <button type="button" className="btn btn-primary" onClick={() => void run(() => setStudentDefaults(studentId, defaults, teacherId), '初期設定を保存しました')}>
            初期設定を保存
          </button>
          <button
            type="button"
            className="btn btn-quiet"
            onClick={() => {
              if (window.confirm('生徒が自分で変えた設定を消して、初期設定に戻しますか？')) void run(() => resetStudentOwnSettings(studentId), '生徒の設定を初期設定に戻しました');
            }}
          >
            生徒の設定を初期設定に戻す
          </button>
        </div>
      </section>

      <section className="panel">
        <h2>アカウントの管理</h2>
        <div className="btn-row" style={{ marginBottom: 12 }}>
          <button
            type="button"
            className="btn"
            onClick={() => {
              const name = window.prompt('新しい表示名（ハンドルネーム）', student.displayName)?.trim();
              if (!name) return;
              const err = validateDisplayName(name);
              if (err) return setMsg({ ok: false, text: err });
              void run(() => updateStudentDisplayName(studentId, name), '表示名を変更しました').then(load);
            }}
          >
            表示名を変える
          </button>
          <button
            type="button"
            className="btn"
            onClick={async () => {
              const pw = generatePassword();
              if (validatePassword(pw, student.loginId)) return;
              if (!window.confirm('パスワードを新しく作って再設定しますか？ 今のパスワードは使えなくなり、ログイン中の端末もログアウトします。')) return;
              if (await run(() => adminAction({ action: 'resetPassword', studentId, password: pw }), 'パスワードを再設定しました')) setNewPw(pw);
            }}
          >
            パスワードを再設定
          </button>
          {student.status === 'active' ? (
            <button
              type="button"
              className="btn btn-danger"
              onClick={() => {
                if (window.confirm('このアカウントを停止しますか？ 停止中はログインできません。記録は残ります。'))
                  void run(() => adminAction({ action: 'setStatus', studentId, status: 'suspended' }), 'アカウントを停止しました').then(load);
              }}
            >
              アカウントを停止
            </button>
          ) : (
            <button type="button" className="btn" onClick={() => void run(() => adminAction({ action: 'setStatus', studentId, status: 'active' }), 'アカウントの停止を解除しました').then(load)}>
              停止を解除
            </button>
          )}
          <button
            type="button"
            className="btn btn-danger"
            onClick={async () => {
              const typed = window.prompt(`アカウントと練習の記録をすべて削除します。元に戻せません。\n削除する場合は、この生徒のID「${student.loginId}」を入力してください。`);
              if (typed?.trim() !== student.loginId) return;
              if (await run(() => adminAction({ action: 'deleteStudent', studentId }), '削除しました')) navigate('/teacher');
            }}
          >
            アカウントを削除
          </button>
        </div>
        {newPw && (
          <div className="msg msg-ok" role="status">
            新しいパスワード：<span className="mono">{newPw}</span>
            <br />
            生徒に伝えたら「閉じる」を押してください。このあとは表示できません。以前のパスワードや、ほかの生徒と同じパスワードは使わないでください。
            <br />
            <button type="button" className="btn btn-small" onClick={() => setNewPw(null)}>
              閉じる
            </button>
          </div>
        )}
        <h3>所属クラス</h3>
        {classes.map((c) => (
          <label key={c.id} className="switch" style={{ marginRight: 16 }}>
            <input
              type="checkbox"
              checked={member.includes(c.id)}
              onChange={(e) =>
                void run(() => setStudentClass(studentId, c.id, e.target.checked), e.target.checked ? `「${c.name}」に追加しました` : `「${c.name}」から外しました`).then(load)
              }
            />
            {c.name}
          </label>
        ))}
        <p className="hint">ほかの先生のクラスに入れるときは、その先生に共同担当として追加してもらってください。</p>
      </section>
    </main>
  );
}
