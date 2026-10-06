/**
 * 練習の記録（履歴）の共通の形。
 * ゲスト（この端末に保存）とログイン利用者（クラウドに保存）のどちらの記録も、この形にそろえて表示・比較します。
 * 保存時のランク・速さ・正確率をそのまま持ち、あとから現在の基準で書き換えることはしません。
 */
import type { PracticeKind } from './rank';
import type { Difficulty } from './questions';
import type { RomajiStyle } from './romaji';
import { conditionKey, type EndMode, type InputMethod, type Minutes, type PracticeResult, type SetType, type TargetCount } from './result';

export interface HistoryRecord {
  id: string;
  /** 練習を始めた日時（ISO 形式） */
  startedAt: string;
  kind: PracticeKind;
  inputMethod: InputMethod;
  endMode: EndMode;
  minutes: Minutes | null;
  targetCount: TargetCount | null;
  setType: SetType;
  theme: string;
  difficulty: Difficulty | 'mixed';
  questionSetVersion: string;
  /** ローマ字のお手本（記録には残しますが、比較の条件は分けません） */
  romajiStyle: RomajiStyle | null;
  /** 正しい打鍵数（ローマ字）または正しい文字数（文章） */
  correct: number;
  /** ミス回数（ローマ字）またはミス文字数（文章） */
  miss: number;
  accuracy: number | null;
  speed: number;
  completedQuestions: number;
  elapsedMs: number;
  rank: string;
  rankVersion: string;
  official: boolean;
  /** 完了（時間いっぱい／目標の問題数を完成）。false は途中終了 */
  finished: boolean;
}

export const HISTORY_LIMIT = 100;

export function recordFromResult(r: PracticeResult): HistoryRecord {
  return {
    id: r.id,
    startedAt: r.startedAt,
    kind: r.kind,
    inputMethod: r.inputMethod,
    endMode: r.endMode,
    minutes: r.endMode === 'time' ? r.minutes : null,
    targetCount: r.endMode === 'count' ? r.targetCount : null,
    setType: r.setType,
    theme: r.theme,
    difficulty: r.difficulty,
    questionSetVersion: r.questionSetVersion,
    romajiStyle: r.kind === 'romaji' ? (r.romajiStyle ?? null) : null,
    correct: r.correct,
    miss: r.miss,
    accuracy: r.accuracy,
    speed: r.speed,
    completedQuestions: r.completedQuestions,
    elapsedMs: r.elapsedMs,
    rank: r.rank,
    rankVersion: r.rankVersion,
    official: r.official,
    finished: r.finished,
  };
}

/** 比較の条件（既存の conditionKey と同じ。ローマ字のお手本の違いでは分けません） */
export function recordConditionKey(r: HistoryRecord): string {
  return conditionKey({
    kind: r.kind,
    endMode: r.endMode,
    minutes: r.minutes,
    targetCount: r.targetCount,
    inputMethod: r.inputMethod,
    setType: r.setType,
    theme: r.theme,
    difficulty: r.difficulty,
    questionSetVersion: r.questionSetVersion,
  });
}

const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);

/**
 * 保存されていた値（形が正しくない可能性がある）を検証して、記録の形にします。正しくなければ null。
 * 終了条件を持たない古い形の記録は「時間制」として読み込みます。
 */
export function parseRecord(raw: unknown): HistoryRecord | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || r.id.length === 0 || r.id.length > 64) return null;
  if (typeof r.startedAt !== 'string' || Number.isNaN(Date.parse(r.startedAt))) return null;
  if (r.kind !== 'romaji' && r.kind !== 'sentence') return null;
  if (r.inputMethod !== 'keyboard' && r.inputMethod !== 'touch') return null;
  const endMode: EndMode = r.endMode === 'count' ? 'count' : 'time';
  const minutes = endMode === 'time' && (r.minutes === 3 || r.minutes === 5 || r.minutes === 10) ? r.minutes : null;
  const targetCount = endMode === 'count' && (r.targetCount === 25 || r.targetCount === 50) ? r.targetCount : null;
  if (endMode === 'time' && minutes === null) return null;
  if (endMode === 'count' && targetCount === null) return null;
  if (!['standard', 'general', 'sakura', 'teacher'].includes(String(r.setType))) return null;
  const difficulty = r.difficulty === 'mixed' ? 'mixed' : r.difficulty === 1 || r.difficulty === 2 || r.difficulty === 3 ? r.difficulty : null;
  if (difficulty === null) return null;
  if (typeof r.theme !== 'string' || typeof r.questionSetVersion !== 'string') return null;
  for (const k of ['correct', 'miss', 'speed', 'completedQuestions', 'elapsedMs'] as const) {
    if (!isNum(r[k]) || (r[k] as number) < 0) return null;
  }
  if (r.accuracy !== null && !(isNum(r.accuracy) && r.accuracy >= 0 && r.accuracy <= 100)) return null;
  if (typeof r.rank !== 'string' || typeof r.finished !== 'boolean' || typeof r.official !== 'boolean') return null;
  return {
    id: r.id,
    startedAt: r.startedAt,
    kind: r.kind,
    inputMethod: r.inputMethod,
    endMode,
    minutes,
    targetCount,
    setType: r.setType as SetType,
    theme: r.theme,
    difficulty,
    questionSetVersion: r.questionSetVersion,
    romajiStyle: r.romajiStyle === 'hepburn' || r.romajiStyle === 'kunrei' ? r.romajiStyle : null,
    correct: r.correct as number,
    miss: r.miss as number,
    accuracy: r.accuracy as number | null,
    speed: r.speed as number,
    completedQuestions: r.completedQuestions as number,
    elapsedMs: r.elapsedMs as number,
    rank: r.rank,
    rankVersion: typeof r.rankVersion === 'string' ? r.rankVersion : 'rank-v1',
    official: r.official,
    finished: r.finished,
  };
}

/** 記録 ID で重複を除き、新しい順に並べて上限までにします */
export function mergeRecords(...lists: HistoryRecord[][]): HistoryRecord[] {
  const byId = new Map<string, HistoryRecord>();
  for (const list of lists) for (const r of list) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, HISTORY_LIMIT);
}

/** 終了条件の表示（例：「3分」「25問」） */
export function recordEndLabel(r: Pick<HistoryRecord, 'endMode' | 'minutes' | 'targetCount'>): string {
  return r.endMode === 'count' ? `${r.targetCount}問` : `${r.minutes}分`;
}
