/**
 * 成長グラフと「成長を伝える表示」の計算。
 * - 同じ条件（recordConditionKey）の記録だけで計算します。
 * - 途中終了の記録は、グラフ・平均・自己ベストに含めません（履歴の一覧には残します）。
 * - 範囲は保存・取得した直近 100 回の記録の中だけです。データを作り足すことはしません。
 */
import { recordConditionKey, type HistoryRecord } from './history';
import { formatNumber1 } from './rank';

export const MOVING_WINDOW = 5;

/** 同じ条件の完了記録を、古い順に並べます */
export function completedSeries(records: HistoryRecord[], key: string): HistoryRecord[] {
  return records
    .filter((r) => r.finished && recordConditionKey(r) === key)
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

/** 直近 n 回の移動平均。n 回そろわない位置は null（5回未満の区間に平均は作りません） */
export function movingAverage(values: Array<number | null>, n = MOVING_WINDOW): Array<number | null> {
  return values.map((_, i) => {
    if (i < n - 1) return null;
    const win = values.slice(i - n + 1, i + 1);
    if (win.some((v) => v === null)) return null;
    return (win as number[]).reduce((s, v) => s + v, 0) / n;
  });
}

const avg = (xs: number[]) => xs.reduce((s, v) => s + v, 0) / xs.length;

export interface GrowthSummary {
  count: number;
  bestSpeed: HistoryRecord | null;
  bestAccuracy: HistoryRecord | null;
  /** 最近 5 回の平均（5 回以上あるときだけ） */
  recent: { speed: number; accuracy: number | null } | null;
  /** 最初の 5 回と最近の 5 回の比較（10 回以上あるときだけ。重ならない 5 回ずつ） */
  firstVsRecent: { first: { speed: number; accuracy: number | null }; recent: { speed: number; accuracy: number | null }; speedDiff: number; accuracyDiff: number | null } | null;
}

function avgOf(rs: HistoryRecord[]) {
  const accs = rs.map((r) => r.accuracy).filter((a): a is number => a !== null);
  return { speed: avg(rs.map((r) => r.speed)), accuracy: accs.length === rs.length ? avg(accs) : null };
}

export function summarize(series: HistoryRecord[]): GrowthSummary {
  const count = series.length;
  let bestSpeed: HistoryRecord | null = null;
  let bestAccuracy: HistoryRecord | null = null;
  for (const r of series) {
    if (!bestSpeed || r.speed > bestSpeed.speed) bestSpeed = r;
    if (r.accuracy !== null && (!bestAccuracy || r.accuracy > (bestAccuracy.accuracy ?? -1))) bestAccuracy = r;
  }
  const recent = count >= MOVING_WINDOW ? avgOf(series.slice(-MOVING_WINDOW)) : null;
  let firstVsRecent: GrowthSummary['firstVsRecent'] = null;
  if (count >= MOVING_WINDOW * 2) {
    const first = avgOf(series.slice(0, MOVING_WINDOW));
    const last = avgOf(series.slice(-MOVING_WINDOW));
    firstVsRecent = {
      first,
      recent: last,
      speedDiff: last.speed - first.speed,
      accuracyDiff: first.accuracy !== null && last.accuracy !== null ? last.accuracy - first.accuracy : null,
    };
  }
  return { count, bestSpeed, bestAccuracy, recent, firstVsRecent };
}

/** 小数第1位に丸めた差（表示用。0.05 未満は「変わらない」とみなします） */
function diff1(v: number): string {
  return (Math.round(Math.abs(v) * 10) / 10).toFixed(1);
}

/**
 * 最初の 5 回と最近の 5 回の比較を、事実どおりのことばで伝えます。
 * 速さが上がっても正確率が下がったときは両方を示し、正確率の向上も肯定的に伝えます。
 */
export function growthMessages(s: GrowthSummary, unit: string): string[] {
  const c = s.firstVsRecent;
  if (!c) return [];
  const out: string[] = [];
  const sd = Math.round(c.speedDiff * 10) / 10;
  if (sd > 0) out.push(`最初の5回と比べて、最近の5回は${diff1(c.speedDiff)}${unit}アップ！`);
  else if (sd < 0) out.push(`最初の5回と比べて、最近の5回の速さは${diff1(c.speedDiff)}${unit}下がりました。`);
  else out.push('最初の5回と最近の5回の速さは、ほぼ同じです。');
  if (c.accuracyDiff !== null) {
    const ad = Math.round(c.accuracyDiff * 10) / 10;
    if (ad > 0) out.push(`正確率が${diff1(c.accuracyDiff)}ポイント上がりました！`);
    else if (ad < 0) out.push(`正確率は${diff1(c.accuracyDiff)}ポイント下がりました。`);
    else out.push('正確率は、ほぼ同じです。');
  }
  return out;
}

export { formatNumber1 };
