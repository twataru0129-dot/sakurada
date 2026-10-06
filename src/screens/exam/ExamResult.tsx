import { gradeInfo, STANDARD_TIME_SECONDS, timeLabel } from '../../core/exam';
import { examEndLabel } from '../../core/examResult';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { DiffLegend, ExamDiff } from '../../ui/exam/ExamDiff';
import { formatDuration } from '../Result';
import { EXAM_NOTICE } from './ExamSelect';

export function ExamResult() {
  const { currentExam: o, account, saves, retryExamSave, setExamSession, examSession, setHistoryFocus } = useApp();
  if (!o) {
    return (
      <main>
        <p>結果がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/exam')}>
          問題をえらぶ
        </button>
      </main>
    );
  }
  const r = o.record;
  const g = gradeInfo(r.grade);
  const save = saves[r.id];
  const standardDone = r.timeLimitSeconds === STANDARD_TIME_SECONDS && r.endReason === 'time_up';

  let judge: { cls: string; text: string; testid: string };
  if (!r.scoringEnabled) judge = { cls: 'badge-soon', text: '採点なしの問題のため、ミス数・目安達成は判定しません', testid: 'judge-none' };
  else if (r.achieved === true) judge = { cls: 'badge-ok', text: `目安達成（${g.label}の目安 ${g.targetCharacters}文字以上）`, testid: 'judge-achieved' };
  else if (r.achieved === false) judge = { cls: 'badge-ref', text: `目安まであと ${g.targetCharacters - (r.scoreChars ?? 0)}文字（${g.label}の目安 ${g.targetCharacters}文字）`, testid: 'judge-not-yet' };
  else if (r.fullTextCompleted) judge = { cls: 'badge-ok', text: '全文入力完了（10分間の計測ではないため、目安達成の判定はしません）', testid: 'judge-fulltext' };
  else
    judge = {
      cls: 'badge-soon',
      text:
        r.timeLimitSeconds === STANDARD_TIME_SECONDS
          ? '途中で終了したため、10分基準の目安達成は判定しません'
          : `${timeLabel(r.timeLimitSeconds)}の練習のため、10分基準の目安達成は判定しません`,
      testid: 'judge-skip',
    };

  return (
    <main>
      <h1>検定モードの結果</h1>
      {o.preview && (
        <p className="msg msg-info" data-testid="preview-note">
          先生のプレビューです。この結果は記録していません。
        </p>
      )}
      <section className="panel" aria-labelledby="er-title">
        <h2 id="er-title">
          {r.problemTitle}
          <span className="hint">　{g.label}・{r.timeLimitSeconds === STANDARD_TIME_SECONDS ? '10分（標準）' : timeLabel(r.timeLimitSeconds)}</span>
        </h2>
        <p>
          <span className="badge badge-official" data-testid="exam-end-label">
            {examEndLabel(r)}
          </span>{' '}
          {r.fullTextCompleted && r.endReason === 'time_up' && <span className="badge badge-ok">全文入力完了</span>}{' '}
          <span className={`badge ${judge.cls}`} data-testid={judge.testid}>
            {judge.text}
          </span>
        </p>
        <div className="kv" data-testid="exam-stats">
          <div>
            <div className="k">入力文字数</div>
            <div className="v" data-testid="stat-input">
              {r.inputChars}
              <span className="u"> 文字</span>
            </div>
          </div>
          {r.scoringEnabled && (
            <>
              <div>
                <div className="k">一致した文字数</div>
                <div className="v" data-testid="stat-matched">
                  {r.matchedChars}
                  <span className="u"> 文字</span>
                </div>
              </div>
              <div>
                <div className="k">ミス数</div>
                <div className="v" data-testid="stat-miss">
                  {r.missCount}
                  <span className="u"> 個</span>
                </div>
                {o.score && (
                  <div className="hint">
                    置換 {o.score.substitutions}・余分 {o.score.insertions}・抜け {o.score.deletions}
                  </div>
                )}
              </div>
              <div>
                <div className="k">得点文字数</div>
                <div className="v" data-testid="stat-score">
                  {r.scoreChars}
                  <span className="u"> 文字</span>
                </div>
                <div className="hint">
                  {r.inputChars} − {r.missCount} × {r.penaltyPerError}
                  {(r.scoreChars ?? 0) === 0 && r.inputChars - (r.missCount ?? 0) * r.penaltyPerError < 0 ? '（0未満は0）' : ''}
                </div>
              </div>
            </>
          )}
          <div>
            <div className="k">経過時間</div>
            <div className="v" data-testid="stat-elapsed">
              {formatDuration(r.elapsedMs)}
            </div>
          </div>
        </div>
        <p className="hint">
          文字数は、改行・スペース・タブを除いて数えています。{r.scoringEnabled && '未入力の部分はミスに数えません。'}
          {!standardDone && r.scoringEnabled && '目安達成の判定は、標準の10分を最後まで計測したときだけ行います。'}
        </p>
        <p className="hint">{EXAM_NOTICE}</p>
      </section>

      {o.score && o.answerText && (
        <section className="panel" aria-labelledby="diff-title">
          <h2 id="diff-title">お手本と入力した文章の違い</h2>
          <DiffLegend />
          <ExamDiff score={o.score} answerText={o.answerText} />
        </section>
      )}

      <section className="panel" aria-labelledby="input-title">
        <h2 id="input-title">入力した文章</h2>
        <div className="exam-input-text" data-testid="exam-input-text">
          {o.inputText.length > 0 ? o.inputText : <span className="hint">（入力した文字はありません）</span>}
        </div>
        <p className="hint">入力した文章は、この画面で見るためだけのもので、記録には保存しません。</p>
      </section>

      {!o.preview && (
        <section className="panel" aria-live="polite">
          <p className="save-state" data-testid="exam-save-state">
            {account?.kind === 'user' ? (
              <>
                {save === 'saving' && '記録を保存しています…'}
                {save === 'saved' && <span className="ok-text">✓ 記録を保存しました（検定モードの記録）</span>}
                {save === 'failed' && (
                  <span className="error-text">
                    × 記録を保存できませんでした。通信を確認して、もう一度保存してください。{' '}
                    <button type="button" className="btn btn-small" onClick={() => retryExamSave(r.id)}>
                      もう一度保存する
                    </button>
                  </span>
                )}
              </>
            ) : (
              <>
                {save === 'saved' && <span className="ok-text">✓ この端末・ブラウザに記録しました（ゲスト・検定モードの記録）</span>}
                {save === 'failed' && (
                  <span className="error-text">
                    × この端末に記録できませんでした（ブラウザの設定や空き容量を確認してください）。{' '}
                    <button type="button" className="btn btn-small" onClick={() => retryExamSave(r.id)}>
                      もう一度記録する
                    </button>
                  </span>
                )}
              </>
            )}
          </p>
        </section>
      )}

      <div className="btn-row result-actions">
        {examSession && (
          <button
            type="button"
            className="btn btn-primary"
            autoFocus
            onClick={() => {
              setExamSession({ ...examSession });
              navigate('/exam/practice');
            }}
          >
            同じ問題でもう一度
          </button>
        )}
        {o.preview ? (
          <button type="button" className="btn" onClick={() => navigate('/exam/manage')}>
            問題の管理にもどる
          </button>
        ) : (
          <>
            <button type="button" className="btn" onClick={() => navigate('/exam')}>
              問題をえらぶ
            </button>
            <button
              type="button"
              className="btn"
              onClick={() => {
                setHistoryFocus('exam');
                navigate('/history');
              }}
            >
              検定モードの記録
            </button>
          </>
        )}
        <button type="button" className="btn btn-quiet" onClick={() => navigate('/home')}>
          ホームへ
        </button>
      </div>
    </main>
  );
}
