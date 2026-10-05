/**
 * 24段階ランク（アプリ独自の基準）。
 * 速度と正確率の両方を満たす、最も高いランクを付けます。数値はすべて「以上」です。
 * 判定は丸める前の値（整数の掛け算）で行い、表示の丸め方に左右されません。
 *
 * 基準を変えるときは RANK_VERSION を上げ、新しい表を追加してください。
 * 保存済みの結果には判定時の版が記録されており、過去の結果は書き換えません。
 */
export const RANK_VERSION = 'rank-v1';

export type PracticeKind = 'romaji' | 'sentence';

export interface RankRow {
  name: string;
  /** ローマ字：正しい打鍵数／分 */
  romaji: number;
  /** 文章：正しい日本語文字数／分 */
  sentence: number;
  /** 必要正確率（％）。0.5刻みのため10倍した整数で持ちます */
  accuracyX10: number;
}

export const RANK_TABLE: readonly RankRow[] = [
  { name: 'S＋', romaji: 900, sentence: 200, accuracyX10: 990 },
  { name: 'S', romaji: 800, sentence: 180, accuracyX10: 985 },
  { name: 'S−', romaji: 700, sentence: 160, accuracyX10: 980 },
  { name: 'A＋', romaji: 600, sentence: 140, accuracyX10: 975 },
  { name: 'A', romaji: 550, sentence: 120, accuracyX10: 970 },
  { name: 'A−', romaji: 500, sentence: 100, accuracyX10: 965 },
  { name: 'B＋', romaji: 450, sentence: 90, accuracyX10: 960 },
  { name: 'B', romaji: 400, sentence: 80, accuracyX10: 955 },
  { name: 'B−', romaji: 350, sentence: 70, accuracyX10: 950 },
  { name: 'C＋', romaji: 300, sentence: 60, accuracyX10: 940 },
  { name: 'C', romaji: 260, sentence: 50, accuracyX10: 930 },
  { name: 'C−', romaji: 220, sentence: 45, accuracyX10: 920 },
  { name: 'D＋', romaji: 180, sentence: 40, accuracyX10: 910 },
  { name: 'D', romaji: 150, sentence: 35, accuracyX10: 900 },
  { name: 'D−', romaji: 120, sentence: 30, accuracyX10: 890 },
  { name: 'E＋', romaji: 100, sentence: 25, accuracyX10: 880 },
  { name: 'E', romaji: 80, sentence: 20, accuracyX10: 870 },
  { name: 'E−', romaji: 60, sentence: 15, accuracyX10: 850 },
  { name: 'F＋', romaji: 45, sentence: 10, accuracyX10: 830 },
  { name: 'F', romaji: 30, sentence: 8, accuracyX10: 800 },
  { name: 'F−', romaji: 20, sentence: 6, accuracyX10: 750 },
  { name: 'G＋', romaji: 10, sentence: 4, accuracyX10: 700 },
  { name: 'G', romaji: 5, sentence: 2, accuracyX10: 600 },
];

export const RANK_LOWEST = 'G−';
export const RANK_NONE = '未判定';
export const ALL_RANKS = [...RANK_TABLE.map((r) => r.name), RANK_LOWEST];

export interface Counts {
  correct: number;
  miss: number;
  /** 実際に計測した時間（ミリ秒） */
  elapsedMs: number;
}

function meetsSpeed(c: Counts, perMinute: number): boolean {
  // correct / (elapsedMs / 60000) >= perMinute  ⇔  correct * 60000 >= perMinute * elapsedMs
  return c.correct * 60000 >= perMinute * c.elapsedMs;
}

function meetsAccuracy(c: Counts, accuracyX10: number): boolean {
  // correct / (correct + miss) * 100 >= accuracyX10 / 10  ⇔  correct * 1000 >= accuracyX10 * (correct + miss)
  return c.correct * 1000 >= accuracyX10 * (c.correct + c.miss);
}

export function hasInput(c: Counts): boolean {
  return c.correct + c.miss > 0;
}

/** ランクを判定します。入力がなければ「未判定」 */
export function judgeRank(kind: PracticeKind, c: Counts): string {
  if (!hasInput(c) || c.elapsedMs <= 0) return RANK_NONE;
  for (const row of RANK_TABLE) {
    if (meetsSpeed(c, row[kind]) && meetsAccuracy(c, row.accuracyX10)) return row.name;
  }
  return RANK_LOWEST;
}

/** 正確率（％）。入力がなければ null（画面では「—」） */
export function accuracyPercent(c: Pick<Counts, 'correct' | 'miss'>): number | null {
  const total = c.correct + c.miss;
  if (total === 0) return null;
  return (c.correct / total) * 100;
}

/** 1分あたりの速度 */
export function speedPerMinute(c: Pick<Counts, 'correct' | 'elapsedMs'>): number {
  if (c.elapsedMs <= 0) return 0;
  return (c.correct * 60000) / c.elapsedMs;
}

/** 次のランクとその条件。最上位なら null */
export function nextRank(kind: PracticeKind, current: string): { name: string; speed: number; accuracy: number } | null {
  let idx: number;
  if (current === RANK_NONE || current === RANK_LOWEST) idx = RANK_TABLE.length;
  else idx = RANK_TABLE.findIndex((r) => r.name === current);
  if (idx <= 0) return null;
  const row = RANK_TABLE[idx - 1]!;
  return { name: row.name, speed: row[kind], accuracy: row.accuracyX10 / 10 };
}

/** ランクの順位（大きいほど上位）。比較に使います */
export function rankOrder(name: string): number {
  const i = RANK_TABLE.findIndex((r) => r.name === name);
  if (i >= 0) return RANK_TABLE.length - i;
  if (name === RANK_LOWEST) return 0;
  return -1;
}

/** 表示用：小数第1位まで（切り捨て。判定には使いません） */
export function formatNumber1(n: number): string {
  return (Math.floor(n * 10) / 10).toFixed(1);
}
