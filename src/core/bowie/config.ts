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
  /** 第1段階の始まりの表示 */
  stageIntroMs: 1300,
  /**
   * 段階アップ（第2〜4段階の始まり。通算20・40・60問の解除のあと）：帯と文字が出て（金属音）、voiceDelayMs のあとに
   * その段階のボウイのボイスを1回。ボイスが最後まで終わり、余韻（tailMs）のあとに次の問題の投球を始めます。
   */
  levelUp: { voiceDelayMs: 450, tailMs: 300 },
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
  // v1.6.1：2〜4回目は文字入りの画像（セリフは画像の中にあり、画面には重ねません。line は読み上げ用の説明だけに使います）
  { image: 'bowie_cutin_02_text.webp', voice: 'cutin_voice_02', voiceMs: 2429, line: '次の戦いの準備をしよう' },
  { image: 'bowie_cutin_03_text.webp', voice: 'cutin_voice_03', voiceMs: 3370, line: 'さて、私が流れを変えてみせよう' },
  // v1.8.0：4回目（通算70問のあと。いつも変身のあとの第4段階）は最終形態の文字入り画像（ボイスは同じ）
  { image: 'bowie_final_cutin_04.webp', voice: 'cutin_voice_04', voiceMs: 1776, line: '払いのける！' },
] as const;

/**
 * 段階アップ（v1.6.1）：第2〜4段階の始まり（通算20・40・60問の解除のあと）。第1段階の始まりには使いません。
 * - title・level：画面の中央の帯に出す文字（大きく・小さく）
 * - voice：ボウイのボイス（src/ui/bowie/audio.ts の SoundKey）、voiceMs：その長さ（ミリ秒。前後の無音は切ってあります）
 * - line：ボイスのセリフ（読み上げ用の説明だけ。字幕としては出しません）
 * 音を出さないとき・読み込めないときも voiceMs の長さだけ表示します。読み込めたときは、実際の長さが長ければそちらに合わせます。
 */
export const BOWIE_LEVEL_UPS: Record<2 | 3 | 4, { title: string; level: string; voice: 'levelup_voice_2' | 'levelup_voice_3' | 'levelup_voice_4'; voiceMs: number; line: string }> = {
  2: { title: 'ボウイ覚醒', level: 'LEVEL 02', voice: 'levelup_voice_2', voiceMs: 3500, line: '賢いものは私の邪魔をしませんよ' },
  3: { title: '力の解放', level: 'LEVEL 03', voice: 'levelup_voice_3', voiceMs: 3762, line: 'それで？反撃すらできないのですか？' },
  4: { title: '終焉の遊戯', level: 'FINAL LEVEL', voice: 'levelup_voice_4', voiceMs: 1541, line: '勝負を決めますよ！' },
};

/**
 * 最終形態への変身（v1.8.0）：第4段階（文章）へ進む段階アップ（通算60問の解除のあと）の中で、1プレイに1回だけ。
 * 時間は段階アップの始まりからのゲームの時間（一時停止の時間を除き、開発用の倍率を掛けます）。試遊で調整するときは、ここだけを変えます。
 * - chargeAtMs：赤い魔力がボウイの周りに集まり始める（段階のボイスの始まり＝levelUp.voiceDelayMs 付近）
 * - peakAtMs：閃光のピーク。この瞬間に背景（通常 → 赤い最終決戦）と姿（通常 → 最終形態の待機）を同時に切り替え、
 *   重い衝撃音と小さな画面の揺れを1回。chargeAtMs からここまでが魔力の強まる時間（約0.35秒）です
 * - flashMs：赤白の閃光と円形の衝撃波の長さ（ピークの前後）、settleMs：魔力の粒子と光が収まる時間
 * - shake：画面の揺れ（px・ms）。「視差効果を減らす」設定では揺れと強い閃光を使わず、fadeMs の短いフェードにします
 * - sound：効果音の音量（効果音の設定に従います。ボイスが聞き取れるように小さめ）と長さ
 * 段階アップの長さは「ボイスの終わり＋余韻」と「変身の余韻の終わり（peakAtMs＋settleMs）＋余韻」の長い方で、
 * ボイスも変身も終わってから第61問を投球します（セリフを途中で切りません）。
 */
export const BOWIE_TRANSFORM = {
  /** 変身する段階（第4段階の始まり） */
  stage: 4 as StageNo,
  bgmFadeMs: 1000,
  chargeAtMs: 1450,
  peakAtMs: 1820,
  flashMs: 260,
  settleMs: 520,
  fadeMs: 240,
  shake: { px: 6, ms: 320 },
  sound: { chargeGain: 0.5, impactGain: 0.85, impactMs: 700 },
} as const;

/** 変身のある段階アップの全体の長さ（ボイスの終わりと、変身の余韻の終わりの遅い方 → 余韻） */
export function transformIntroMs(voiceMs: number): number {
  return Math.max(BOWIE_TRANSFORM.bgmFadeMs + levelUpTotalMs(voiceMs), BOWIE_TRANSFORM.peakAtMs + BOWIE_TRANSFORM.settleMs + BOWIE_CONFIG.levelUp.tailMs);
}

/**
 * 最終形態の「放つ」動作（v1.8.0）：顔に手を添えた待機 → 構える → 送り出す → 放つ（このあと手を離れます）。
 * 投球の長さ（throwMs＝350ms）と、手を離れた瞬間に入力と飛行の計時を始める決まりは通常と同じです。
 * 各画像の長さの比（約110ms・120ms・120ms）。手を離れたあとは「放つ」の姿のまま余韻（followThroughMs）を見せます。
 */
export const FINAL_THROW_FRAMES = [0.314, 0.343, 0.343] as const;
/**
 * 最終形態で解除されたときの怒りの姿（bowie_final_angry）を出す時間（解除の時刻から。ゲームの時間）。
 * 次の投球はこれまでどおり解除と同時に始まり（テンポは変えません）、その構える〜放つ（350ms）の絵が先に出て、
 * そのあと（手を離れたあとの余韻の代わりに）この時間まで怒りの姿を見せてから、待機（危険なら高笑い）に戻ります。
 */
export const FINAL_ANGRY_MS = 950;

/** 段階アップの全体の長さ（文字が出る → ボイス → 余韻） */
export function levelUpTotalMs(voiceMs: number): number {
  return BOWIE_CONFIG.levelUp.voiceDelayMs + voiceMs + BOWIE_CONFIG.levelUp.tailMs;
}

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
