import { accuracyPercent, judgeRank, RANK_VERSION, speedPerMinute, type PracticeKind } from './rank';
import type { Difficulty } from './questions';
import type { RomajiStyle } from './romaji';

export type InputMethod = 'keyboard' | 'touch';
export type Minutes = 3 | 5 | 10;
/** 終了条件：時間で練習／問題数で練習 */
export type EndMode = 'time' | 'count';
export type TargetCount = 25 | 50;

/**
 * 出題の種類
 * - standard: 標準問題（一般問題・決められた難易度配分）。完走すると正式ランク
 * - general: 一般問題で難易度を選んだ練習（参考ランク）
 * - sakura: 🌸桜モード（参考ランク）
 * - teacher: 先生の追加教材（参考ランク）
 */
export type SetType = 'standard' | 'general' | 'sakura' | 'teacher';

export interface PracticeConfig {
  kind: PracticeKind;
  /** 終了条件。v1.0.1 までの記録はすべて時間制（'time'）として扱います */
  endMode: EndMode;
  /** 練習時間（時間制のとき）。問題数制では null */
  minutes: Minutes | null;
  /** 目標の問題数（問題数制のとき）。時間制では null */
  targetCount: TargetCount | null;
  /** ローマ字のお手本（ガイドに優先表示する表記）。判定には影響しません */
  romajiStyle?: RomajiStyle;
  inputMethod: InputMethod;
  setType: SetType;
  /** テーマ（'all' はすべて）。追加教材ではクラスの ID */
  theme: string;
  /** 'mixed' は難易度配分どおり */
  difficulty: Difficulty | 'mixed';
  /** 問題セットの版（内蔵は QUESTION_SET_VERSION、追加教材は 'teacher'） */
  questionSetVersion: string;
}

export interface PracticeTotals {
  correct: number;
  miss: number;
  completedQuestions: number;
  elapsedMs: number;
  /** 時間制：時間いっぱいまで練習した／問題数制：目標の問題数を完成した（途中終了は false） */
  finished: boolean;
}

/** ミスした時点の記録（練習中の判定時に記録します。あとから推測しません） */
export interface MissEvent {
  /** 入力済み文字列の中の位置（この位置の文字を打つところでミスした） */
  position: number;
  /** かなの単位の番号と、そのかな（例：「しゃ」） */
  unitIndex: number;
  kana: string;
  /** ミスした時点で入力済みだった文字列 */
  typedBefore: string;
  /** ミスした時点でガイドに表示されていた次の文字 */
  guideChar: string;
  /** その時点で正しいと判定されるキー（別の正しい打ち方も含む） */
  acceptable: string[];
  /** 実際に押したキー */
  pressed: string;
}

/** 出題回ごとの記録（ローマ字入力）。ミス詳細の表示に使い、クラウドには保存しません */
export interface QuestionAttempt {
  /** 何問目に出たか（同じ問題が複数回出ても別の記録になります） */
  seq: number;
  questionId: string;
  text: string;
  reading: string;
  /** かなの単位（例：['し', 'ゃ'] ではなく ['しゃ']） */
  units: string[];
  /** 練習開始からの時刻（ミリ秒）。開始待ちの時間は含みません */
  startMs: number;
  endMs: number;
  /** 最後まで入力したか（false は時間切れ・途中終了の「入力途中」） */
  completed: boolean;
  correct: number;
  miss: number;
  /** 実際に打った入力経路と、入力途中のときの残りのガイド */
  typed: string;
  remainingGuide: string;
  misses: MissEvent[];
}

export interface PracticeResult extends PracticeConfig, PracticeTotals {
  id: string;
  startedAt: string;
  accuracy: number | null;
  speed: number;
  rank: string;
  rankVersion: string;
  /** 正式ランク（時間制の標準問題を時間いっぱいまで練習） */
  official: boolean;
  conditionKey: string;
  /** ミスがあった出題回の詳細（任意。ローマ字入力のみ。クラウドには保存しません） */
  missDetails?: QuestionAttempt[];
}

/** 保存済みの記録など、終了条件を持たない古いデータを時間制として読み込みます */
export function withEndMode<T extends Partial<PracticeConfig>>(c: T): T & Pick<PracticeConfig, 'endMode' | 'targetCount'> {
  const endMode: EndMode = c.endMode === 'count' ? 'count' : 'time';
  return { ...c, endMode, targetCount: endMode === 'count' ? (c.targetCount ?? null) : null };
}

/** 終了条件の表示（例：「3分」「25問」） */
export function endLabel(c: Pick<PracticeConfig, 'endMode' | 'minutes' | 'targetCount'>): string {
  return c.endMode === 'count' ? `${c.targetCount}問` : `${c.minutes}分`;
}

/**
 * 自己ベストや前回比較に使う「同じ条件」のキー。条件の違う記録は混ぜません。
 * 時間制（3・5・10分）と問題数制（25問・50問）は、それぞれ別の条件です。
 */
export function conditionKey(c: PracticeConfig): string {
  const end = c.endMode === 'count' ? `count${c.targetCount}` : String(c.minutes);
  return [c.kind, end, c.inputMethod, c.setType, c.theme, c.difficulty, c.questionSetVersion].join('|');
}

export function buildResult(
  id: string,
  startedAt: Date,
  config: PracticeConfig,
  totals: PracticeTotals,
  attempts: QuestionAttempt[] = [],
): PracticeResult {
  const counts = { correct: totals.correct, miss: totals.miss, elapsedMs: totals.elapsedMs };
  const missDetails = attempts.filter((a) => a.miss > 0);
  return {
    ...config,
    ...totals,
    ...(missDetails.length > 0 ? { missDetails } : {}),
    id,
    startedAt: startedAt.toISOString(),
    accuracy: accuracyPercent(counts),
    speed: speedPerMinute(counts),
    rank: judgeRank(config.kind, counts),
    rankVersion: RANK_VERSION,
    // 正式ランクは時間制の標準問題を時間いっぱいまで練習した記録だけ（問題数制は参考ランク）
    official: config.endMode === 'time' && config.setType === 'standard' && totals.finished,
    conditionKey: conditionKey(config),
  };
}

export function speedUnit(kind: PracticeKind): string {
  return kind === 'romaji' ? '打／分（正しい打鍵数）' : '字／分（正しい日本語文字数）';
}

export function newResultId(): string {
  return crypto.randomUUID();
}

/** 出題回の正確率（％）：正しい打鍵数 ÷（正しい打鍵数＋ミス数）×100 */
export function attemptAccuracy(a: Pick<QuestionAttempt, 'correct' | 'miss'>): number | null {
  const total = a.correct + a.miss;
  return total === 0 ? null : (a.correct / total) * 100;
}
