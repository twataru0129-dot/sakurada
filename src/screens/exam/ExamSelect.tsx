import { useCallback, useEffect, useState } from 'react';
import { countExamChars, GRADES, gradeInfo, isScorable, STANDARD_TIME_SECONDS, TIME_OPTIONS, timeLabel, type ExamGrade, type ExamProblem } from '../../core/exam';
import { BUILTIN_EXAM_DISCLAIMER, BUILTIN_EXAM_PROBLEMS } from '../../data/examBuiltin';
import { examStore, StoreError } from '../../data/examStore';
import { useApp } from '../../state/AppContext';
import { canManageExamProblems } from '../../state/examAccess';
import { navigate } from '../../state/router';
import { BackLink } from '../../ui/common';
import { ImportPack } from '../../ui/exam/ImportPack';

type Source = 'builtin' | 'teacher';

export const EXAM_NOTICE =
  '日本語ワープロ検定の速度分野を参考にした、桜打独自の練習です。採点は練習用の独自の規則で、公式の検定の採点とは異なります。公式検定の合格を認定するものではありません。';

export function ExamSelect() {
  const { account, setExamSession, examSession } = useApp();
  const [source, setSource] = useState<Source>(examSession?.problem.source ?? 'builtin');
  const [grade, setGrade] = useState<ExamGrade | 'all'>(examSession?.problem.grade ?? '4');
  const [selectedId, setSelectedId] = useState<string | null>(examSession?.problem.id ?? null);
  const [time, setTime] = useState<number | null>(examSession?.timeLimitSeconds ?? STANDARD_TIME_SECONDS);
  const [teacher, setTeacher] = useState<ExamProblem[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const manage = canManageExamProblems(account);

  const loadTeacher = useCallback(async () => {
    setLoadError(null);
    try {
      setTeacher((await examStore().listProblems()).filter((p) => p.visible));
    } catch (e) {
      setTeacher([]);
      setLoadError(e instanceof StoreError ? e.message : 'この端末の問題を読み込めませんでした。');
    }
  }, []);
  useEffect(() => {
    void loadTeacher();
  }, [loadTeacher]);

  const list = (source === 'builtin' ? BUILTIN_EXAM_PROBLEMS : (teacher ?? [])).filter((p) => grade === 'all' || p.grade === grade);
  const selected = list.find((p) => p.id === selectedId) ?? null;

  const pick = (p: ExamProblem) => {
    setSelectedId(p.id);
    setTime(p.timeLimitSeconds);
  };

  const start = () => {
    if (!selected) return;
    setExamSession({ problem: selected, timeLimitSeconds: time, preview: false });
    navigate('/exam/practice');
  };

  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>検定モード（文章入力）</h1>
      <p>お手本の文章を見ながら、白紙の A4 用紙に日本語の文章を入力します。日本語入力（IME）で漢字に変換しながら入力してください。</p>
      <details className="details-box">
        <summary>この練習について</summary>
        <ul>
          <li>{EXAM_NOTICE}</li>
          <li>扱うのは文章の入力・改行・段落だけです。図・表の作成、文字の装飾、中央揃えなどは行いません。</li>
          <li>本文は目安の文字数より長くしてあります。時間内に、先頭からどこまで正確に入力できるかを測ります。最後まで入力できなくても、それだけでミスにはなりません。</li>
          <li>入力中は誤りを知らせません。終わったあとに答え合わせをします。</li>
          <li>{BUILTIN_EXAM_DISCLAIMER}</li>
        </ul>
      </details>

      <nav className="tabs" aria-label="問題の種類">
        <button type="button" className="btn btn-small" aria-current={source === 'builtin' ? 'page' : undefined} onClick={() => { setSource('builtin'); if (grade === 'all') setGrade('4'); }}>
          収録問題（30問）
        </button>
        <button type="button" className="btn btn-small" aria-current={source === 'teacher' ? 'page' : undefined} onClick={() => setSource('teacher')}>
          先生の追加問題
        </button>
        {manage && (
          <button type="button" className="btn btn-quiet btn-small" onClick={() => navigate('/exam/manage')}>
            先生の追加問題を管理する
          </button>
        )}
      </nav>

      <section className="panel" aria-labelledby="grade-title">
        <h2 id="grade-title">① 段階をえらぶ</h2>
        <div className="choice-row" role="radiogroup" aria-label="段階">
          {source === 'teacher' && (
            <label className="choice">
              <input type="radio" name="grade" checked={grade === 'all'} onChange={() => setGrade('all')} />
              すべて
            </label>
          )}
          {GRADES.map((g) => (
            <label key={g.grade} className="choice">
              <input type="radio" name="grade" checked={grade === g.grade} onChange={() => setGrade(g.grade)} />
              {g.label}
            </label>
          ))}
        </div>
        {grade !== 'all' && (
          <p className="hint" style={{ marginTop: 8 }}>
            {gradeInfo(grade).label}：標準10分・目安 {gradeInfo(grade).targetCharacters}文字・1ミスで {gradeInfo(grade).penaltyPerError}文字を引きます（練習用の段階設定です）。
          </p>
        )}
      </section>

      <section className="panel" aria-labelledby="problem-title">
        <h2 id="problem-title">② 問題をえらぶ</h2>
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
        {list.length === 0 && (source === 'builtin' || teacher !== null) && (
          <p className="hint" data-testid="no-problems">
            {source === 'teacher' ? 'この端末には、この段階の先生の追加問題がありません。' : '問題がありません。'}
          </p>
        )}
        <div className="exam-problem-list" role="radiogroup" aria-label="問題">
          {list.map((p) => {
            const scored = isScorable(p);
            return (
              <label key={p.id} className={`exam-problem ${selectedId === p.id ? 'is-selected' : ''}`} data-testid="exam-problem">
                <input type="radio" name="problem" checked={selectedId === p.id} onChange={() => pick(p)} />
                <span className="exam-problem-title">{p.title}</span>
                <span className="exam-problem-meta">
                  <span className="badge badge-ref">{gradeInfo(p.grade).label}</span>
                  <span>制限時間：{timeLabel(p.timeLimitSeconds)}</span>
                  <span className={`badge ${scored ? 'badge-ok' : 'badge-soon'}`}>{scored ? '自動採点あり' : '採点なし'}</span>
                  {p.material.kind !== 'text' && <span>お手本：{p.material.kind === 'pdf' ? 'PDF' : '画像'}（{p.material.pages.length}ページ）</span>}
                  {scored && <span>本文 {countExamChars(p.answerText!)}文字</span>}
                </span>
              </label>
            );
          })}
        </div>
      </section>

      <section className="panel" aria-labelledby="time-title">
        <h2 id="time-title">③ 時間をえらぶ</h2>
        <div className="choice-row" role="radiogroup" aria-label="時間">
          {TIME_OPTIONS.map((t) => (
            <label key={String(t)} className="choice">
              <input type="radio" name="time" checked={time === t} onChange={() => setTime(t)} />
              {t === STANDARD_TIME_SECONDS ? '10分（標準）' : timeLabel(t)}
            </label>
          ))}
        </div>
        <p className="hint" style={{ marginTop: 8 }}>
          「目安達成」の判定は、標準の10分を最後まで計測したときだけ行います。3分・5分・時間制限なしは、入力文字数や正確さを確かめる練習です。
        </p>
      </section>

      <div className="btn-row">
        <button type="button" className="btn btn-primary btn-large" disabled={!selected} onClick={start} data-testid="exam-start">
          {selected ? `「${selected.title}」をはじめる` : '問題をえらんでください'}
        </button>
      </div>
      {selected && !isScorable(selected) && (
        <p className="msg msg-info" data-testid="no-scoring-note">
          この問題は「採点なし」です。終わったあとは、入力文字数・経過時間・入力した文章だけを表示します（ミス数や目安達成は出しません）。
        </p>
      )}
    </main>
  );
}
