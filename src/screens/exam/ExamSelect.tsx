import { useCallback, useEffect, useMemo, useState } from 'react';
import type { ExamProblem } from '../../core/exam';
import { docInfo, sortTeacherProblems, type DocProblemInfo } from '../../core/documentProblem';
import { BUILTIN_DOC_PROBLEMS } from '../../data/documentBuiltin';
import { examStore, StoreError } from '../../data/examStore';
import { useApp } from '../../state/AppContext';
import { canManageExamProblems } from '../../state/examAccess';
import { navigate } from '../../state/router';
import { BackLink } from '../../ui/common';
import { ImportPack } from '../../ui/exam/ImportPack';

type Source = 'builtin' | 'teacher';

/**
 * 文書作成モードの問題の選択（v2.0.0）。
 * 問題のタイトル・本文の文字数（改行を除く）・段落数を、やさしい順に表示します（級や時間の設定は表示しません）。
 */
export function ExamSelect() {
  const { account, setDocSession, docSession } = useApp();
  const [source, setSource] = useState<Source>(docSession?.problem.source ?? 'builtin');
  const [selectedId, setSelectedId] = useState<string | null>(docSession?.problem.id ?? null);
  const [teacher, setTeacher] = useState<ExamProblem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const manage = canManageExamProblems(account);

  const loadTeacher = useCallback(async () => {
    setLoadError(null);
    try {
      setTeacher(sortTeacherProblems((await examStore().listProblems()).filter((p) => p.visible)));
    } catch (e) {
      setTeacher([]);
      setLoadError(e instanceof StoreError ? e.message : 'この端末の問題を読み込めませんでした。');
    }
  }, []);
  useEffect(() => {
    void loadTeacher();
  }, [loadTeacher]);

  const builtin = useMemo(() => BUILTIN_DOC_PROBLEMS.map(docInfo).filter((x): x is DocProblemInfo => x !== null), []);
  // 先生の問題は、見本の文章を確認済みのものだけを出します（画像・PDF だけで見本の文章がない旧検定の問題は選べません）
  const teacherList = useMemo(() => (teacher ?? []).map(docInfo).filter((x): x is DocProblemInfo => x !== null), [teacher]);
  const hiddenCount = (teacher ?? []).length - teacherList.length;
  const list = source === 'builtin' ? builtin : teacherList;
  const selected = list.find((x) => x.problem.id === selectedId) ?? null;

  const start = () => {
    if (!selected) return;
    setDocSession({ problem: selected.problem, preview: false });
    navigate('/exam/practice');
  };

  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>文書作成モード</h1>
      <p>見本の文章を見ながら、段落ごとに日本語を入力して、一つの文書を完成させます。完成した文書は、印刷したり Word で保存したりできます。</p>
      <details className="details-box">
        <summary>この練習について</summary>
        <ul>
          <li>速さを競う練習ではありません。日本語入力（IME）で自分で漢字に変換し、改行・見直し・修正をして、文章を完成させる練習です。</li>
          <li>見本の段落の終わり（↵ 改行）では、Enter を押して改行します。画面の幅による折り返しは改行しなくてかまいません。</li>
          <li>入力中は誤りを知らせません。「チェック」を押すと、見本と違うところに赤い波線と印が付きます。間違っていても完成できます。</li>
          <li>スタートから「完成！」を押すまでの時間を測ります。制限時間はありません。</li>
          <li>文字の装飾・中央揃え、図・表・地図の作成は行いません。</li>
        </ul>
      </details>

      <nav className="tabs" aria-label="問題の種類">
        <button type="button" className="btn btn-small" aria-current={source === 'builtin' ? 'page' : undefined} onClick={() => setSource('builtin')} data-testid="doc-tab-builtin">
          収録問題（{builtin.length}問）
        </button>
        <button type="button" className="btn btn-small" aria-current={source === 'teacher' ? 'page' : undefined} onClick={() => setSource('teacher')} data-testid="doc-tab-teacher">
          先生の追加問題
        </button>
        {manage && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate('/exam/manage')} data-testid="doc-manage">
            先生の追加問題を管理する
          </button>
        )}
      </nav>

      <section className="panel" aria-labelledby="problem-title">
        <h2 id="problem-title">問題をえらぶ{source === 'builtin' && <span className="hint">（やさしい順）</span>}</h2>
        {source === 'teacher' && (
          <div className="msg msg-info">
            先生の追加問題は、この端末（ブラウザ）に保存されている問題です。ほかの端末には自動で届きません。先生から教材パックを受け取ったら、ここで読み込んでください。
            <div style={{ marginTop: 8 }}>
              <ImportPack onImported={() => void loadTeacher()} />
            </div>
          </div>
        )}
        {loadError && source === 'teacher' && (
          <p className="msg msg-ng" role="alert">
            {loadError}
          </p>
        )}
        {source === 'teacher' && teacher === null && <p>読み込んでいます…</p>}
        {source === 'teacher' && hiddenCount > 0 && manage && (
          <p className="hint" data-testid="doc-hidden-note">
            見本の文章が確認されていない問題が{hiddenCount}問あります。管理の画面で見本の文章を登録・確認すると使用できます。
          </p>
        )}
        {list.length === 0 && (source === 'builtin' || teacher !== null) && (
          <p className="hint" data-testid="no-problems">
            {source === 'teacher' ? 'この端末には、使える先生の追加問題がありません。' : '問題がありません。'}
          </p>
        )}
        <div className="exam-problem-list doc-problem-list" role="radiogroup" aria-label="問題">
          {list.map((x, n) => (
            <label key={x.problem.id} className={`exam-problem ${selectedId === x.problem.id ? 'is-selected' : ''}`} data-testid="exam-problem" data-problem-id={x.problem.id}>
              <input type="radio" name="problem" checked={selectedId === x.problem.id} onChange={() => setSelectedId(x.problem.id)} />
              <span className="doc-problem-no" aria-hidden="true">
                {n + 1}
              </span>
              <span className="exam-problem-title">{x.problem.title}</span>
              <span className="exam-problem-meta" data-testid="exam-problem-meta">
                <span>{x.chars}文字</span>
                <span>{x.paragraphs}段落</span>
              </span>
            </label>
          ))}
        </div>
      </section>

      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-large" disabled={!selected} onClick={start} data-testid="exam-start">
          {selected ? `「${selected.problem.title}」をはじめる` : '問題をえらんでください'}
        </button>
      </div>
    </main>
  );
}
