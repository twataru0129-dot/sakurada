/**
 * ボウイの爆弾遊戯の設定（試遊で調整するときは、このファイルだけを変えます）。
 * 元の値は assets/bowie-source/game_config.json（納品された設定）です。
 */

export const BOWIE_TITLE = 'ボウイの爆弾遊戯';
export const BOWIE_RULE_VERSION = 'bowie-rule-v1';

/** 段階（1〜3：単語、4：文章） */
export type StageNo = 1 | 2 | 3 | 4;

export const STAGES: readonly { no: StageNo; name: string; kind: 'word' | 'sentence' }[] = [
  { no: 1, name: '短い単語', kind: 'word' },
  { no: 2, name: '中くらいの単語', kind: 'word' },
  { no: 3, name: '長い単語', kind: 'word' },
  { no: 4, name: '文章', kind: 'sentence' },
];

export const BOWIE_CONFIG = {
  /** 各段階の出題数（登録された問題から重複なしで抽選） */
  questionsPerStage: 20,
  /** 着弾までの時間（秒）：各段階の前半（1〜10問目）と後半（11〜20問目） */
  landingSeconds: {
    1: { first: 5, last: 4.5 },
    2: { first: 6, last: 5.5 },
    3: { first: 7, last: 6.5 },
    4: { first: 15, last: 14 },
  } as Record<StageNo, { first: number; last: number }>,
  /** 得点の上限：単語・文章（残りの距離で 1〜上限点） */
  maxPoints: { word: 10, sentence: 20 },
  /** 投げる動作（構える → 腕を出す → 放つ）の長さ。終わった瞬間に爆弾が手を離れます */
  throwMs: 350,
  /** 放つ動作の各画像の長さの比（構える・腕を出す・放つ） */
  throwFrames: [0.34, 0.34, 0.32],
  /** 手を離したあとの余韻（空の手）の表示時間 */
  followThroughMs: 420,
  /** 危険エリア：衝突まで残りの距離の割合 */
  dangerRemaining: 0.2,
  /** 段階の始まりの表示 */
  stageIntroMs: 1300,
  /** 加速のカットイン：入る・抜ける時間と、保持（セリフの長さ＋余韻） */
  cutin: { entryMs: 250, exitMs: 250, holdMs: 1541 + 160 },
  /** 一時停止から再開するときのカウント（3・2・1） */
  resumeCountMs: 1500,
  /** ミスタイプの音の最短の間隔 */
  typoSoundGapMs: 80,
  /** 解除の演出（光・+点数・主人公の笑顔）を見せる時間。次の投球はすぐに始まります */
  disarmFxMs: 650,
} as const;

/** カットインの全体の長さ */
export const CUTIN_TOTAL_MS = BOWIE_CONFIG.cutin.entryMs + BOWIE_CONFIG.cutin.holdMs + BOWIE_CONFIG.cutin.exitMs;

/** その段階の何問目（1始まり）の着弾時間（ミリ秒） */
export function landingMsFor(stage: StageNo, indexInStage: number, perStage: number = BOWIE_CONFIG.questionsPerStage): number {
  const t = BOWIE_CONFIG.landingSeconds[stage];
  return Math.round((indexInStage <= perStage / 2 ? t.first : t.last) * 1000);
}

/** 解除したときの得点：points = max(1, ceil(M × (1 − p)))。p ≥ 1 は衝突（得点なし） */
export function pointsFor(maxPoints: number, progress: number): number | null {
  if (!(progress < 1)) return null;
  const p = Math.max(0, progress);
  return Math.max(1, Math.ceil(maxPoints * (1 - p) - 1e-9));
}
