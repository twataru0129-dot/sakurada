import { accuracyPercent, judgeRank, RANK_VERSION, speedPerMinute, type PracticeKind } from './rank';
import type { Difficulty } from './questions';

export type InputMethod = 'keyboard' | 'touch';
export type Minutes = 3 | 5 | 10;

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
  minutes: Minutes;
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
  /** 時間いっぱいまで練習したか（途中終了は false） */
  finished: boolean;
}

export interface PracticeResult extends PracticeConfig, PracticeTotals {
  id: string;
  startedAt: string;
  accuracy: number | null;
  speed: number;
  rank: string;
  rankVersion: string;
  /** 正式ランク（標準問題を完走） */
  official: boolean;
  conditionKey: string;
}

/** 自己ベストや前回比較に使う「同じ条件」のキー。条件の違う記録は混ぜません。 */
export function conditionKey(c: PracticeConfig): string {
  return [c.kind, c.minutes, c.inputMethod, c.setType, c.theme, c.difficulty, c.questionSetVersion].join('|');
}

export function buildResult(id: string, startedAt: Date, config: PracticeConfig, totals: PracticeTotals): PracticeResult {
  const counts = { correct: totals.correct, miss: totals.miss, elapsedMs: totals.elapsedMs };
  return {
    ...config,
    ...totals,
    id,
    startedAt: startedAt.toISOString(),
    accuracy: accuracyPercent(counts),
    speed: speedPerMinute(counts),
    rank: judgeRank(config.kind, counts),
    rankVersion: RANK_VERSION,
    official: config.setType === 'standard' && totals.finished,
    conditionKey: conditionKey(config),
  };
}

export function speedUnit(kind: PracticeKind): string {
  return kind === 'romaji' ? '打／分（正しい打鍵数）' : '字／分（正しい日本語文字数）';
}

export function newResultId(): string {
  return crypto.randomUUID();
}
