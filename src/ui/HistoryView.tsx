import { useMemo, useState } from 'react';
import type { HistoryRow } from '../data/cloud';
import { formatNumber1 } from '../core/rank';
import { formatDate } from './common';
import { setTypeLabel } from '../screens/Result';

interface ChartPoint {
  x: number;
  y: number;
  label: string;
}

/** 1系列の折れ線グラフ（成長グラフ）。値の読み取り用に、各点にツールチップを付けます */
function LineChart({ points, unit, title, yMax }: { points: ChartPoint[]; unit: string; title: string; yMax?: number }) {
  const W = 640;
  const H = 220;
  const pad = { l: 48, r: 16, t: 16, b: 28 };
  const max = yMax ?? Math.max(10, ...points.map((p) => p.y)) * 1.1;
  const sx = (i: number) => pad.l + (points.length <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (points.length - 1));
  const sy = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const [hover, setHover] = useState<number | null>(null);
  return (
    <figure style={{ margin: '0 0 16px' }}>
      <figcaption style={{ fontWeight: 700 }}>{title}</figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`${title}のグラフ。下の表でも数値を確認できます。`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#eadde2" strokeWidth={1} />
            <text x={pad.l - 6} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="#5f4f56">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text x={pad.l} y={H - 8} fontSize="11" fill="#5f4f56">古い</text>
        <text x={W - pad.r} y={H - 8} fontSize="11" fill="#5f4f56" textAnchor="end">新しい</text>
        {points.length > 1 && (
          <polyline fill="none" stroke="#a3173b" strokeWidth={2} strokeLinejoin="round" points={points.map((p, i) => `${sx(i)},${sy(p.y)}`).join(' ')} />
        )}
        {points.map((p, i) => (
          <g key={i} onPointerEnter={() => setHover(i)} onPointerLeave={() => setHover(null)}>
            <circle cx={sx(i)} cy={sy(p.y)} r={12} fill="transparent" />
            <circle cx={sx(i)} cy={sy(p.y)} r={4.5} fill="#a3173b" stroke="#fff" strokeWidth={2} />
            <title>{`${p.label}：${formatNumber1(p.y)} ${unit}`}</title>
          </g>
        ))}
        {hover !== null && points[hover] && (
          <text x={Math.min(Math.max(sx(hover), 90), W - 90)} y={Math.max(sy(points[hover]!.y) - 12, 14)} fontSize="12" textAnchor="middle" fill="#2a2226" fontWeight={700}>
            {`${points[hover]!.label}  ${formatNumber1(points[hover]!.y)} ${unit}`}
          </text>
        )}
      </svg>
    </figure>
  );
}

/** 条件ごとに分けて表示します（時間制と問題数制、25問と50問は別の条件） */
const condKey = (r: HistoryRow) =>
  `${r.kind}|${r.endMode === 'count' ? `count${r.targetCount}` : r.minutes}|${r.inputMethod}|${r.setType}|${r.theme}|${r.difficulty}`;

/** 練習履歴と成長グラフ。条件（種類・時間・入力方法・問題）ごとに分けて表示します */
export function HistoryView({ rows }: { rows: HistoryRow[] }) {
  const conds = useMemo(() => {
    const m = new Map<string, HistoryRow>();
    for (const r of rows) if (!m.has(condKey(r))) m.set(condKey(r), r);
    return [...m.entries()];
  }, [rows]);
  const [sel, setSel] = useState<string>('');
  const key = sel || conds[0]?.[0] || '';
  const list = rows.filter((r) => condKey(r) === key).slice().reverse();
  const finished = list.filter((r) => r.finished);
  const sample = conds.find(([k]) => k === key)?.[1];
  const unit = sample?.kind === 'romaji' ? '打／分' : '字／分';

  if (rows.length === 0) return <p>まだ練習の記録がありません。</p>;
  const label = (r: HistoryRow) =>
    `${r.kind === 'romaji' ? 'ローマ字' : '文章'}・${r.endMode === 'count' ? `${r.targetCount}問` : `${r.minutes}分`}・${r.inputMethod === 'keyboard' ? '実物キーボード' : '画面入力'}・${setTypeLabel({
      setType: r.setType as 'standard',
      theme: r.theme,
      difficulty: (r.difficulty === 'mixed' ? 'mixed' : Number(r.difficulty)) as 1,
      kind: r.kind,
    })}`;

  return (
    <div>
      <div className="field">
        <label htmlFor="cond">練習の条件（条件ごとに分けて表示します）</label>
        <select id="cond" value={key} onChange={(e) => setSel(e.target.value)}>
          {conds.map(([k, r]) => (
            <option key={k} value={k}>
              {label(r)}
            </option>
          ))}
        </select>
      </div>
      {finished.length > 0 ? (
        <div className="grid grid-2">
          <LineChart title={`速さ（${unit}）・完走した記録`} unit={unit} points={finished.map((r) => ({ x: 0, y: r.speed, label: formatDate(r.startedAt) }))} />
          <LineChart
            title="正確率（％）・完走した記録"
            unit="％"
            yMax={100}
            points={finished.filter((r) => r.accuracy !== null).map((r) => ({ x: 0, y: r.accuracy!, label: formatDate(r.startedAt) }))}
          />
        </div>
      ) : (
        <p className="hint">この条件で時間いっぱいまで練習した記録はまだありません。</p>
      )}
      <div className="table-wrap">
        <table>
          <thead>
            <tr>
              <th>日時</th>
              <th>ランク</th>
              <th className="num">速さ</th>
              <th className="num">正確率</th>
              <th className="num">正しい数</th>
              <th className="num">ミス</th>
              <th>完走／完了</th>
            </tr>
          </thead>
          <tbody>
            {list
              .slice()
              .reverse()
              .map((r) => (
                <tr key={r.id}>
                  <td>{formatDate(r.startedAt)}</td>
                  <td>
                    {r.rank} {r.official ? <span className="badge badge-official">正式</span> : <span className="badge badge-ref">参考</span>}
                  </td>
                  <td className="num">{formatNumber1(r.speed)}</td>
                  <td className="num">{r.accuracy === null ? '—' : `${formatNumber1(r.accuracy)}％`}</td>
                  <td className="num">{r.correct}</td>
                  <td className="num">{r.miss}</td>
                  <td>{r.finished ? (r.endMode === 'count' ? `${r.targetCount}問完了` : '完走') : '途中終了'}</td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
