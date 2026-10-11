/**
 * ボウイの爆弾遊戯の戦績（v1.7.0）：勝利のランクと正確率。画面から独立した純粋な関数です。
 *
 * - ランクは全問クリア（勝利）のときだけ、得点だけで決めます（ミスタイプ・正確率で加減しません）。敗北はランクなし。
 * - 通常の80問では得点は最低80・最高1000点。開発用の短縮（出題数を減らした確認）では80点より低いクリアもあるため、
 *   そのときだけ最下位（ウォリアー）を表示します（通常の判定には影響しません）。
 */

export interface BowieRank {
  /** 1〜10（低い順） */
  no: number;
  /** 素材の名前（src/assets/bowie/emblems/{id}.webp・{id}_mark.webp） */
  id: string;
  /** 画面に出す名前 */
  name: string;
  /** この得点以上（含む） */
  min: number;
  /** この得点以下（含む） */
  max: number;
}

/** 勝利のランク（得点の範囲は重なりも抜けもありません。G → H → I の順） */
export const BOWIE_RANKS: readonly BowieRank[] = [
  { no: 1, id: 'rank_01_warrior', name: 'ウォリアー', min: 80, max: 199 },
  { no: 2, id: 'rank_02_elite', name: 'エリート', min: 200, max: 299 },
  { no: 3, id: 'rank_03_master', name: 'マスター', min: 300, max: 399 },
  { no: 4, id: 'rank_04_grandmaster', name: 'グランドマスター', min: 400, max: 499 },
  { no: 5, id: 'rank_05_epic', name: 'エピック', min: 500, max: 599 },
  { no: 6, id: 'rank_06_legend', name: 'レジェンド', min: 600, max: 699 },
  { no: 7, id: 'rank_07_mythic', name: 'ミシック', min: 700, max: 799 },
  { no: 8, id: 'rank_08_g_mythic', name: 'Gミシック', min: 800, max: 879 },
  { no: 9, id: 'rank_09_h_mythic', name: 'Hミシック', min: 880, max: 949 },
  { no: 10, id: 'rank_10_i_mythic', name: 'Iミシック', min: 950, max: 1000 },
];

/** 得点だけでランクを決めます（範囲外は null） */
export function rankForScore(score: number): BowieRank | null {
  return BOWIE_RANKS.find((r) => score >= r.min && score <= r.max) ?? null;
}

/**
 * 戦績に出すランク。敗北は必ず null。
 * 勝利で得点が80点未満になるのは開発用の短縮（全問 < 80）のときだけで、そのときは最下位を表示します。
 */
export function resultRank(score: number, cleared: boolean, total: number): BowieRank | null {
  if (!cleared) return null;
  const r = rankForScore(score);
  if (r) return r;
  if (total < 80 && score < BOWIE_RANKS[0]!.min) return BOWIE_RANKS[0]!;
  return null;
}

/** 正確率（％、小数第1位まで）。入力が0回のときは null（画面では「—」） */
export function accuracyOf(correct: number, mistypes: number): number | null {
  const all = correct + mistypes;
  if (!(all > 0)) return null;
  return Math.round((correct / all) * 1000) / 10;
}

export function formatAccuracy(a: number | null): string {
  return a === null ? '—' : `${a.toFixed(1)}%`;
}

/** 勝敗が決まったときの戦績（あとから変わりません） */
export interface BowieStats {
  score: number;
  solved: number;
  total: number;
  correctKeyCount: number;
  mistypeCount: number;
  /** 正確率（％）。入力が0回なら null */
  accuracy: number | null;
}
