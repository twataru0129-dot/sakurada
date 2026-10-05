import { formatNumber1, rankOrder } from './rank';

export interface Comparable {
  id: string;
  startedAt: string;
  finished: boolean;
  rank: string;
  speed: number;
  accuracy: number | null;
  correct: number;
  miss: number;
}

/** a が b より良い記録か（ランクが上、同じランクなら速度が上） */
export function isBetter(a: Comparable, b: Comparable): boolean {
  const ra = rankOrder(a.rank);
  const rb = rankOrder(b.rank);
  if (ra !== rb) return ra > rb;
  return a.speed > b.speed;
}

export interface Comparison {
  previous: Comparable | null;
  bestBefore: Comparable | null;
  isNewBest: boolean;
  isFirst: boolean;
  growth: string[];
}

/**
 * 同じ条件の過去の記録と比べます。
 * 自己ベストは時間いっぱいまで練習した記録（完走）だけで比べます。
 */
export function compareWithHistory(current: Comparable, history: Comparable[], unit: string): Comparison {
  const past = history.filter((h) => h.id !== current.id).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const previous = past.find((h) => h.finished) ?? past[0] ?? null;
  let bestBefore: Comparable | null = null;
  for (const h of past) if (h.finished && (!bestBefore || isBetter(h, bestBefore))) bestBefore = h;
  const isFirst = !past.some((h) => h.finished);
  const isNewBest = current.finished && current.correct + current.miss > 0 && (!bestBefore || isBetter(current, bestBefore));

  const growth: string[] = [];
  if (previous) {
    if (rankOrder(current.rank) > rankOrder(previous.rank)) growth.push(`ランクが「${previous.rank}」から「${current.rank}」に上がりました。`);
    const ds = current.speed - previous.speed;
    if (ds > 0) growth.push(`速度が前回より ${formatNumber1(ds)} ${unit} 上がりました。`);
    if (current.accuracy !== null && previous.accuracy !== null && current.accuracy > previous.accuracy) {
      growth.push(`正確率が前回より ${formatNumber1(current.accuracy - previous.accuracy)} ポイント上がりました。`);
    }
    if (current.correct > previous.correct) growth.push(`正しく入力した数が前回より ${current.correct - previous.correct} 増えました。`);
    if (current.miss < previous.miss) growth.push(`ミスが前回より ${previous.miss - current.miss} 減りました。`);
  }
  return { previous, bestBefore, isNewBest, isFirst, growth };
}
