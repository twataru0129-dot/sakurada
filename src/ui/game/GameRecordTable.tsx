import { useState } from 'react';
import type { GameResult } from '../../core/game/result';
import { formatGameTime } from '../../core/game/sakurada';
import { formatNumber1 } from '../../core/rank';
import { courseLabelOf, findStory } from '../../data/gameStories';
import { formatDate } from '../common';

const PAGE = 20;

/** ゲームの記録の一覧（新しい順。タイピング・検定の記録とは別に表示します） */
export function GameRecordTable({ records, unsaved }: { records: GameResult[]; unsaved?: Set<string> }) {
  const [shown, setShown] = useState(PAGE);
  if (records.length === 0) {
    return (
      <p className="hint" data-testid="game-history-empty">
        ゲームで遊ぶと、ここに記録が残ります。
      </p>
    );
  }
  return (
    <>
      <div className="table-wrap">
        <table className="history-table" data-testid="game-history-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>物語</th>
              <th>コース</th>
              <th className="num">記録タイム</th>
              <th className="num">完成年（ゲーム内）</th>
              <th className="num">正確率</th>
              <th className="num">ミス</th>
            </tr>
          </thead>
          <tbody>
            {records.slice(0, shown).map((r) => (
              <tr key={r.id} className="history-row" data-testid="game-history-row">
                <td data-label="日時">
                  {formatDate(r.startedAt)}
                  {unsaved?.has(r.id) && <span className="badge badge-ref">　未保存</span>}
                </td>
                <td data-label="物語">
                  {findStory(r.storyId)?.title ?? r.storyId}
                  {r.pauseCount > 0 && <div className="hint">一時停止 {r.pauseCount}回</div>}
                </td>
                <td data-label="コース">{courseLabelOf(r)}</td>
                <td data-label="記録タイム" className="num">
                  {formatGameTime(r.recordTimeMs)}
                </td>
                <td data-label="完成年" className="num">
                  {r.finished ? `${r.completionYear}年` : '未完成'}
                </td>
                <td data-label="正確率" className="num">
                  {r.accuracy === null ? '—' : `${formatNumber1(r.accuracy)}％`}
                </td>
                <td data-label="ミス" className="num">
                  {r.missCount}回
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
