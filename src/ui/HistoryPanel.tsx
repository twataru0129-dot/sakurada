import { useMemo, useState } from 'react';
import { completedSeries, growthMessages, movingAverage, summarize, MOVING_WINDOW } from '../core/growth';
import { recordConditionKey, recordEndLabel, type HistoryRecord } from '../core/history';
import { DIFFICULTY_LABEL, themeLabel } from '../core/questions';
import { formatNumber1 } from '../core/rank';
import { formatDate } from './common';

const PAGE = 20;

export function kindLabel(r: Pick<HistoryRecord, 'kind'>) {
  return r.kind === 'romaji' ? 'ローマ字' : '文章入力';
}
export function methodLabel(r: Pick<HistoryRecord, 'inputMethod'>) {
  return r.inputMethod === 'keyboard' ? '実物キーボード' : '画面入力';
}
export function setLabel(r: Pick<HistoryRecord, 'setType' | 'theme' | 'difficulty' | 'kind'>) {
  const diff = r.difficulty === 'mixed' ? 'いろいろ' : DIFFICULTY_LABEL[r.kind][r.difficulty];
  switch (r.setType) {
    case 'standard':
      return '標準問題';
    case 'general':
      return `一般問題（${diff}）`;
    case 'sakura':
      return `🌸桜モード（${r.theme === 'all' ? 'すべてのテーマ' : themeLabel('sakura', r.theme)}・${diff}）`;
    default:
      return '先生の追加教材';
  }
}
export function conditionLabel(r: HistoryRecord) {
  return `${kindLabel(r)}・${recordEndLabel(r)}・${methodLabel(r)}・${setLabel(r)}`;
}
const unitOf = (r: Pick<HistoryRecord, 'kind'>) => (r.kind === 'romaji' ? '打／分' : '字／分');
const missUnit = (r: Pick<HistoryRecord, 'kind'>) => (r.kind === 'romaji' ? '回' : '文字');
function durationText(ms: number) {
  const s = Math.floor(ms / 1000);
  return s >= 60 ? `${Math.floor(s / 60)}分${String(s % 60).padStart(2, '0')}秒` : `${s}秒`;
}

/** 目盛りのきりのよい最大値（0 から始めます） */
function niceMax(v: number): number {
  if (v <= 0) return 10;
  const p = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (m * p >= v) return m * p;
  return 10 * p;
}

interface ChartProps {
  title: string;
  unit: string;
  series: HistoryRecord[];
  value: (r: HistoryRecord) => number | null;
  yMax?: number;
  testId: string;
}

/**
 * 1つの指標の推移。実際の記録（実線と●）と、直近5回の平均（点線）を同じ軸で示します。
 * 縦軸は 0 から始め、変化を大げさに見せません。点を選ぶと日時・条件・数値を文字で表示します。
 */
function TrendChart({ title, unit, series, value, yMax, testId }: ChartProps) {
  const pts = series.map((r, i) => ({ r, i, v: value(r) })).filter((p): p is { r: HistoryRecord; i: number; v: number } => p.v !== null);
  const ma = movingAverage(pts.map((p) => p.v));
  const [sel, setSel] = useState<number | null>(null);
  if (pts.length === 0) return null;
  const W = 640;
  const H = 230;
  const pad = { l: 52, r: 18, t: 28, b: 34 };
  const max = yMax ?? niceMax(Math.max(...pts.map((p) => p.v)) * 1.1);
  const n = pts.length;
  const sx = (k: number) => pad.l + (n <= 1 ? (W - pad.l - pad.r) / 2 : (k * (W - pad.l - pad.r)) / (n - 1));
  const sy = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((t) => t * max);
  const maPath = ma
    .map((v, k) => (v === null ? null : `${sx(k)},${sy(v)}`))
    .filter(Boolean)
    .join(' ');
  const hasMa = ma.some((v) => v !== null);
  const selected = sel !== null ? pts[sel] : pts.length === 1 ? pts[0] : null;
  return (
    <figure className="trend" data-testid={testId}>
      <figcaption>
        <b>{title}</b>
        <span className="trend-legend">
          <span className="lg-actual" aria-hidden="true" /> 実際の記録
          <span className="lg-ma" aria-hidden="true" /> 直近{MOVING_WINDOW}回の平均{!hasMa && `（${MOVING_WINDOW}回たまると表示）`}
        </span>
      </figcaption>
      <svg className="chart" viewBox={`0 0 ${W} ${H}`} role="group" aria-label={`${title}の折れ線グラフ。古い記録から新しい記録へ並んでいます。点を選ぶと数値が表示されます。`}>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={W - pad.r} y1={sy(t)} y2={sy(t)} stroke="#eadde2" strokeWidth={1} />
            <text x={pad.l - 6} y={sy(t) + 4} fontSize="11" textAnchor="end" fill="#5f4f56">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <text x={8} y={12} fontSize="11" fill="#5f4f56">
          （{unit}）
        </text>
        <text x={sx(0)} y={H - 10} fontSize="11" textAnchor={n <= 1 ? 'middle' : 'start'} fill="#5f4f56">
          1回目
        </text>
        {n > 1 && (
          <text x={sx(n - 1)} y={H - 10} fontSize="11" textAnchor="end" fill="#5f4f56">
            {n}回目
          </text>
        )}
        {n > 1 && <polyline fill="none" stroke="#a3173b" strokeWidth={2} strokeLinejoin="round" points={pts.map((p, k) => `${sx(k)},${sy(p.v)}`).join(' ')} />}
        {hasMa && <polyline className="ma-line" fill="none" stroke="#2f69b3" strokeWidth={2} strokeDasharray="6 4" points={maPath} data-testid={`${testId}-ma`} />}
        {pts.map((p, k) => (
          <g
            key={p.r.id}
            role="button"
            tabIndex={0}
            className="trend-point"
            aria-label={`${k + 1}回目 ${formatDate(p.r.startedAt)} ${formatNumber1(p.v)}${unit}`}
            onClick={() => setSel(k)}
            onFocus={() => setSel(k)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setSel(k);
              }
            }}
          >
            <circle cx={sx(k)} cy={sy(p.v)} r={14} fill="transparent" />
            <circle cx={sx(k)} cy={sy(p.v)} r={sel === k ? 7 : 4.5} fill="#a3173b" stroke="#fff" strokeWidth={2} />
          </g>
        ))}
        {n === 1 && (
          <text x={sx(0)} y={sy(pts[0]!.v) - 12} fontSize="13" textAnchor="middle" fill="#2a2226" fontWeight={700}>
            {formatNumber1(pts[0]!.v)} {unit}
          </text>
        )}
      </svg>
      <p className="trend-detail" aria-live="polite" data-testid={`${testId}-detail`}>
        {selected
          ? `${selected.i + 1}回目　${formatDate(selected.r.startedAt)}　${conditionLabel(selected.r)}　速さ ${formatNumber1(selected.r.speed)} ${unitOf(selected.r)}・正確率 ${
              selected.r.accuracy === null ? '—' : `${formatNumber1(selected.r.accuracy)}％`
            }`
          : '点を選ぶと、そのときの日時・条件・速さ・正確率が表示されます。'}
      </p>
    </figure>
  );
}

function GrowthSection({ records, condKey }: { records: HistoryRecord[]; condKey: string }) {
  const series = useMemo(() => completedSeries(records, condKey), [records, condKey]);
  const sample = records.find((r) => recordConditionKey(r) === condKey);
  if (!sample) return null;
  const unit = unitOf(sample);
  if (series.length === 0) {
    return (
      <p className="msg msg-info" data-testid="growth-empty">
        この条件で最後まで練習した（完了した）記録はまだありません。途中終了の記録は、成長グラフ・平均・自己ベストに入れていません。
      </p>
    );
  }
  const s = summarize(series);
  const msgs = growthMessages(s, unit);
  return (
    <section aria-label="成長のようす" data-testid="growth">
      <div className="kv">
        <div>
          <div className="k">速さの自己ベスト</div>
          <div className="v" data-testid="best-speed">
            {formatNumber1(s.bestSpeed!.speed)}
            <span className="u"> {unit}</span>
          </div>
        </div>
        <div>
          <div className="k">正確率の自己ベスト</div>
          <div className="v" data-testid="best-accuracy">
            {s.bestAccuracy?.accuracy === null || !s.bestAccuracy ? '—' : formatNumber1(s.bestAccuracy.accuracy!)}
            {s.bestAccuracy && <span className="u"> ％</span>}
          </div>
        </div>
        <div>
          <div className="k">最近{MOVING_WINDOW}回の平均</div>
          <div className="v" data-testid="recent-avg">
            {s.recent ? (
              <>
                {formatNumber1(s.recent.speed)}
                <span className="u"> {unit}</span>
                <span className="u">／{s.recent.accuracy === null ? '—' : `${formatNumber1(s.recent.accuracy)}％`}</span>
              </>
            ) : (
              <span className="u">あと{MOVING_WINDOW - s.count}回で表示</span>
            )}
          </div>
        </div>
        <div>
          <div className="k">完了した記録</div>
          <div className="v">
            {s.count}
            <span className="u"> 回</span>
          </div>
        </div>
      </div>
      {s.firstVsRecent ? (
        <ul className="growth-msgs" data-testid="growth-msgs">
          {msgs.map((m) => (
            <li key={m}>{m}</li>
          ))}
          <li className="hint">
            最初の5回の平均：{formatNumber1(s.firstVsRecent.first.speed)} {unit}・
            {s.firstVsRecent.first.accuracy === null ? '—' : `${formatNumber1(s.firstVsRecent.first.accuracy)}％`}　／　最近の5回の平均：
            {formatNumber1(s.firstVsRecent.recent.speed)} {unit}・
            {s.firstVsRecent.recent.accuracy === null ? '—' : `${formatNumber1(s.firstVsRecent.recent.accuracy)}％`}
          </li>
        </ul>
      ) : (
        <p className="hint" data-testid="growth-wait">
          最初の5回と最近の5回の比べっこは、完了した記録が10回になると表示します（あと{MOVING_WINDOW * 2 - s.count}回）。
        </p>
      )}
      <p className="hint">※ 自己ベストや「最初の5回」は、全期間ではなく、保存・取得した直近100回の記録の中での値です。途中終了の記録は含めていません。</p>
      <div className="grid grid-2">
        <TrendChart title="①速さの推移" unit={unit} series={series} value={(r) => r.speed} testId="chart-speed" />
        <TrendChart title="②正確率の推移" unit="％" series={series} value={(r) => r.accuracy} yMax={100} testId="chart-accuracy" />
      </div>
    </section>
  );
}

function RecordList({ records, unsaved }: { records: HistoryRecord[]; unsaved: Set<string> }) {
  const [shown, setShown] = useState(PAGE);
  const [open, setOpen] = useState<string | null>(null);
  const list = records.slice(0, shown);
  return (
    <>
      <div className="history-table-wrap">
        <table className="history-table" data-testid="history-table">
          <thead>
            <tr>
              <th>日時</th>
              <th>モード</th>
              <th>条件</th>
              <th className="num">速さ</th>
              <th className="num">正確率</th>
              <th className="num">ミス</th>
              <th>ランク</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {list.map((r) => (
              <RecordRow key={r.id} r={r} open={open === r.id} onToggle={() => setOpen(open === r.id ? null : r.id)} unsaved={unsaved.has(r.id)} />
            ))}
          </tbody>
        </table>
      </div>
      <p className="hint">
        {records.length}件中 {list.length}件を表示
      </p>
      {shown < records.length && (
        <button type="button" className="btn" onClick={() => setShown((v) => v + PAGE)}>
          もっと見る（次の{Math.min(PAGE, records.length - shown)}件）
        </button>
      )}
    </>
  );
}

function RecordRow({ r, open, onToggle, unsaved }: { r: HistoryRecord; open: boolean; onToggle: () => void; unsaved: boolean }) {
  const detailId = `detail-${r.id}`;
  return (
    <>
      <tr className="history-row" data-testid="history-row">
        <td data-label="日時">
          {formatDate(r.startedAt)}
          {!r.finished && (
            <span className="badge badge-ref" style={{ marginLeft: 6 }}>
              途中終了
            </span>
          )}
          {unsaved && (
            <span className="badge badge-soon" style={{ marginLeft: 6 }}>
              未保存
            </span>
          )}
        </td>
        <td data-label="モード">
          {kindLabel(r)}・{methodLabel(r)}
        </td>
        <td data-label="条件">
          <b>{recordEndLabel(r)}</b>・{setLabel(r)}
        </td>
        <td data-label="速さ" className="num">
          {formatNumber1(r.speed)} {unitOf(r)}
        </td>
        <td data-label="正確率" className="num">
          {r.accuracy === null ? '—' : `${formatNumber1(r.accuracy)}％`}
        </td>
        <td data-label="ミス" className="num">
          {r.miss}
          {missUnit(r)}
        </td>
        <td data-label="ランク">
          {r.rank} {r.official ? <span className="badge badge-official">正式</span> : <span className="badge badge-ref">参考</span>}
        </td>
        <td className="history-detail-cell">
          <button type="button" className="btn btn-quiet btn-small" aria-expanded={open} aria-controls={detailId} onClick={onToggle}>
            {open ? '詳細を閉じる' : '詳細'}
          </button>
        </td>
      </tr>
      {open && (
        <tr className="history-detail" id={detailId}>
          <td colSpan={8}>
            <dl className="miss-stats">
              <div>
                <dt>かかった時間</dt>
                <dd>{durationText(r.elapsedMs)}</dd>
              </div>
              <div>
                <dt>完成した問題</dt>
                <dd>{r.completedQuestions}問</dd>
              </div>
              <div>
                <dt>{r.kind === 'romaji' ? '正しく打ったキー' : '正しく入力した文字'}</dt>
                <dd>
                  {r.correct}
                  {r.kind === 'romaji' ? '回' : '文字'}
                </dd>
              </div>
              <div>
                <dt>終わりかた</dt>
                <dd>{r.finished ? (r.endMode === 'count' ? `${r.targetCount}問完了` : '時間いっぱいまで練習') : '途中終了'}</dd>
              </div>
              {r.kind === 'romaji' && (
                <div>
                  <dt>ローマ字のお手本</dt>
                  <dd>{r.romajiStyle === 'kunrei' ? '訓令式' : r.romajiStyle === 'hepburn' ? 'ヘボン式' : '—'}</dd>
                </div>
              )}
              <div>
                <dt>問題セットの版</dt>
                <dd>{r.questionSetVersion}</dd>
              </div>
              <div>
                <dt>ランク基準</dt>
                <dd>{r.rankVersion}</dd>
              </div>
            </dl>
          </td>
        </tr>
      )}
    </>
  );
}

/**
 * 練習の記録（一覧）と成長グラフ。生徒本人の「練習の記録」と、先生の生徒詳細の両方で使います。
 * @param initialKey 最初に選ぶ条件（結果画面から開いたときは今回の条件）
 */
export function HistoryPanel({ records, initialKey, unsaved = new Set() }: { records: HistoryRecord[]; initialKey?: string | null; unsaved?: Set<string> }) {
  const conds = useMemo(() => {
    const m = new Map<string, HistoryRecord>();
    for (const r of records) if (!m.has(recordConditionKey(r))) m.set(recordConditionKey(r), r);
    return [...m.entries()];
  }, [records]);
  const [sel, setSel] = useState<string | null>(null);
  const [onlyCond, setOnlyCond] = useState(false);
  const key = sel ?? (initialKey && conds.some(([k]) => k === initialKey) ? initialKey : (conds[0]?.[0] ?? ''));

  if (records.length === 0) {
    return (
      <p className="msg msg-info" data-testid="history-empty">
        練習すると、ここに記録が残ります。
      </p>
    );
  }
  const listed = onlyCond ? records.filter((r) => recordConditionKey(r) === key) : records;
  return (
    <div className="history-panel">
      <section className="panel" aria-labelledby="growth-title">
        <h2 id="growth-title">成長グラフ</h2>
        <div className="field">
          <label htmlFor="cond">比べる条件（同じ条件の記録だけで比べます）</label>
          <select id="cond" value={key} onChange={(e) => setSel(e.target.value)} data-testid="cond-select">
            {conds.map(([k, r]) => (
              <option key={k} value={k}>
                {conditionLabel(r)}
                {r.questionSetVersion !== 'teacher' ? `（${r.questionSetVersion}）` : ''}
              </option>
            ))}
          </select>
        </div>
        <GrowthSection key={key} records={records} condKey={key} />
      </section>
      <section className="panel" aria-labelledby="list-title">
        <h2 id="list-title">記録の一覧（新しい順）</h2>
        <label className="switch">
          <input type="checkbox" checked={onlyCond} onChange={(e) => setOnlyCond(e.target.checked)} />
          選んだ条件の記録だけを表示
        </label>
        <RecordList key={`${onlyCond}-${key}`} records={listed} unsaved={unsaved} />
      </section>
    </div>
  );
}
