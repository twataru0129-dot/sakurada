import { useState } from 'react';
import { gradeInfo, STANDARD_TIME_SECONDS, timeLabel } from '../../core/exam';
import { examEndLabel, type ExamRecord } from '../../core/examResult';
import { formatDuration } from '../../screens/Result';
import { formatDate } from '../common';

const PAGE = 20;

/** 検定モードの記録の一覧（タイピングの記録とは別に表示します） */
export function ExamRecordTable({ records, unsaved }: { records: ExamRecord[]; unsaved?: Set<string> }) {
  const [shown, setShown] = useState(PAGE);
  if (records.length === 0) {
    return (
      <p className="hint" data-testid="exam-history-empty">
        検定モードで練習すると、ここに記録が残ります。
      </p>
    );
  }
  return (
    <>
      <div className="table-wrap">
        <table className="history-table exam-record-table" data-testid="exam-history-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>問題</th>
              <th>段階</th>
              <th>時間</th>
              <th>終わりかた</th>
              <th className="num">入力</th>
              <th className="num">ミス</th>
              <th className="num">得点</th>
              <th>目安</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(0, shown).map((r) => (
              <tr key={r.id} className="history-row" data-testid="exam-history-row">
                <td data-label="日時">
                  {formatDate(r.startedAt)}
                  {unsaved?.has(r.id) && <span className="badge badge-ref">　未保存</span>}
                </td>
                <td data-label="問題">
                  {r.problemTitle}
                  <div className="hint">
                    {r.problemSource === 'builtin' ? '収録問題' : '先生の追加問題'}・改訂{r.problemRevision}
                  </div>
                </td>
                <td data-label="段階">{gradeInfo(r.grade).label}</td>
                <td data-label="時間">
                  {r.timeLimitSeconds === STANDARD_TIME_SECONDS ? '10分（標準）' : timeLabel(r.timeLimitSeconds)}
                  <div className="hint">{formatDuration(r.elapsedMs)}</div>
                </td>
                <td data-label="終わりかた">{examEndLabel(r)}</td>
                <td data-label="入力" className="num">
                  {r.inputChars}文字
                </td>
                <td data-label="ミス" className="num">
                  {r.scoringEnabled ? r.missCount : '—'}
                </td>
                <td data-label="得点" className="num">
                  {r.scoringEnabled ? `${r.scoreChars}文字` : '採点なし'}
                </td>
                <td data-label="目安">{r.achieved === true ? '達成' : r.achieved === false ? '未達' : '判定なし'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {records.length > shown && (
        <button type="button" className="btn btn-small" onClick={() => setShown((n) => n + PAGE)}>
          もっと見る（あと{records.length - shown}件）
        </button>
      )}
    </>
  );
}
