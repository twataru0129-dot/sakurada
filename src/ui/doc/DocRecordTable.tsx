import { useState } from 'react';
import { formatElapsed } from '../../core/document';
import type { DocRecord } from '../../core/documentResult';
import { formatDate } from '../common';

const PAGE = 20;

/** 文書作成モードの記録の一覧（v2.0.0。タイピング・ゲーム・旧検定モードの記録とは別に表示します） */
export function DocRecordTable({ records, unsaved }: { records: DocRecord[]; unsaved?: Set<string> }) {
  const [shown, setShown] = useState(PAGE);
  if (records.length === 0) {
    return (
      <p className="hint" data-testid="doc-history-empty">
        文書作成モードで文書を完成させると、ここに記録が残ります。
      </p>
    );
  }
  return (
    <>
      <div className="table-wrap">
        <table className="history-table doc-record-table" data-testid="doc-history-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>問題</th>
              <th>結果</th>
              <th className="num">時間</th>
              <th className="num">入力</th>
              <th className="num">文字の誤り</th>
              <th className="num">空白・改行</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(0, shown).map((r) => (
              <tr key={r.id} className="history-row" data-testid="doc-history-row">
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
                <td data-label="結果">{r.status === 'completed' ? '完成' : '途中で終了'}</td>
                <td data-label="時間" className="num">
                  {formatElapsed(r.elapsedMs)}
                </td>
                <td data-label="入力" className="num">
                  {r.inputChars}文字
                </td>
                <td data-label="文字の誤り" className="num">
                  {r.textErrors}
                  <div className="hint">
                    違う{r.wrongChars}・余分{r.extraChars}・抜け{r.missingChars}
                  </div>
                </td>
                <td data-label="空白・改行" className="num">
                  空白{r.spaceErrors}・改行{r.breakErrors}
                </td>
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
