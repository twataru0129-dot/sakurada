/**
 * ボウイの爆弾遊戯の設定（試遊で調整するときは、このファイルだけを変えます）。
 * 元の値は assets/bowie-source/game_config.json（納品された設定）です。
 */

import type { RomajiRules } from '../romaji';

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
  /**
   * 加速のカットイン：入る・抜ける時間と、セリフのあとの余韻。
   * 画像が入りきったところでセリフを1回だけ流し、セリフが最後まで終わって余韻が過ぎてから画像が抜けます。
   * 保持の長さは回ごとのセリフの長さ（BOWIE_CUTINS）で決まります。
   */
  cutin: { entryMs: 250, exitMs: 250, tailMs: 160 },
  /** 一時停止から再開するときのカウント（3・2・1） */
  resumeCountMs: 1500,
  /** ミスタイプの音の最短の間隔 */
  typoSoundGapMs: 80,
  /** 解除の演出（光・+点数・主人公の笑顔）を見せる時間。次の投球はすぐに始まります */
  disarmFxMs: 650,
} as const;

/**
 * このモードだけのローマ字の決まり（ほかのモードの判定は変えません）。
 * - 「ん」はすべて nn で入力します（語末・母音・や行・な行の前も同じ。n 1回・n' では確定しません）。お手本も NN です。
 * - 「づ」は du・zu のどちらも正解（お手本は DU）。「ず」は zu だけです。
 */
export const BOWIE_ROMAJI_RULES: RomajiRules = { strictN: true, zuForDu: true };

/**
 * ゲームの選択からの画面の切り替え（タイトルコール）。
 * 選択 → 音声と同時に白へ（whiteInMs）→ 音声が終わるまで白のまま → 白から黒へ（toBlackMs）→ 黒のまま（blackHoldMs）→ ゲーム画面へ（fadeInMs）。
 * 白から黒へ移るのは音声の実際の終わり（ended）です。音を出さないとき・読み込めないとき・再生を拒否されたときは、
 * 音声の長さ（callSeconds）が過ぎたときに進めます。音声が終わらないまま止まったときも、callSeconds＋maxWaitExtraMs で先へ進めます。
 */
export const BOWIE_TITLE_CALL = {
  whiteInMs: 350,
  toBlackMs: 350,
  blackHoldMs: 150,
  fadeInMs: 400,
  /** bowie_title_call.mp3 の長さ（秒） */
  callSeconds: 3.864,
  maxWaitExtraMs: 2500,
  /** 白の間にゲーム画面の画像を読み込みます。読み込みが遅いときも、これ以上は待ちません */
  imageWaitMs: 2500,
} as const;

/**
 * 各回のカットイン（各段階の10問目を解除したあと＝通算10・30・50・70問目のあと）。回ごとに決まった画像とセリフで、ランダムにはしません。
 * - image：src/assets/bowie/scenes/ の画像、voice：セリフの音（src/ui/bowie/audio.ts の SoundKey）、voiceMs：セリフの長さ（ミリ秒）
 * - line：画像の中に書かれているセリフ（読み上げ用の説明だけに使い、画面には重ねません）。2〜4回目の画像には文字がありません
 * 音を出さないとき・読み込めないときも、voiceMs の長さだけ表示します。読み込めたときは、実際の音の長さが長ければそちらに合わせます。
 */
export const BOWIE_CUTINS = [
  { image: 'speed_cutin.webp', voice: 'level_up', voiceMs: 1541, line: '少しテンポを落とそうか' },
  { image: 'bowie_cutin_02.webp', voice: 'cutin_voice_02', voiceMs: 2429, line: '' },
  { image: 'bowie_cutin_03.webp', voice: 'cutin_voice_03', voiceMs: 3370, line: '' },
  { image: 'bowie_cutin_04.webp', voice: 'cutin_voice_04', voiceMs: 1776, line: '' },
] as const;

/** カットインの全体の長さ（入る＋セリフ＋余韻＋抜ける） */
export function cutinTotalMs(voiceMs: number): number {
  return BOWIE_CONFIG.cutin.entryMs + voiceMs + BOWIE_CONFIG.cutin.tailMs + BOWIE_CONFIG.cutin.exitMs;
}
/** 1回目のカットインの長さ（これまでと同じ約 2.2 秒） */
export const CUTIN_TOTAL_MS = cutinTotalMs(BOWIE_CUTINS[0].voiceMs);

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
