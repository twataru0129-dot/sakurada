/**
 * ゲームの記録（GameResult）。タイピングの練習記録・ランク・検定モードの記録とは別に保存します。
 * 入力した文章・打鍵の記録は保存せず、集計した値だけを持ちます。
 */
import type { RomajiStyle } from '../romaji';
import type { InputMethod } from '../result';
import {
  accuracyFor,
  completionYearFor,
  GAME_ID,
  GAME_RULE_VERSION,
  penaltyMsFor,
  recordTimeMsFor,
  type CourseId,
} from './sakurada';

export interface GameResult {
  /** プレイを始めるときに1回だけ作る ID（再送しても二重に保存されません） */
  id: string;
  gameId: string;
  ruleVersion: string;
  storySetVersion: string;
  storyId: string;
  courseId: CourseId;
  inputMethod: InputMethod;
  romajiStyle: RomajiStyle;
  startedAt: string;
  finishedAt: string;
  elapsedMs: number;
  missCount: number;
  penaltyMs: number;
  recordTimeMs: number;
  completionYear: number;
  correctKeystrokes: number;
  accuracy: number | null;
  completedReadingCharacters: number;
  totalReadingCharacters: number;
  pauseCount: number;
  /** 完成した（false は完成前の途中終了。この版では途中終了は記録しません） */
  finished: boolean;
}

export const GAME_HISTORY_LIMIT = 100;

export function buildGameResult(a: {
  id: string;
  storySetVersion: string;
  storyId: string;
  courseId: CourseId;
  inputMethod: InputMethod;
  romajiStyle: RomajiStyle;
  startedAt: Date;
  finishedAt: Date;
  elapsedMs: number;
  missCount: number;
  correctKeystrokes: number;
  completedReadingCharacters: number;
  totalReadingCharacters: number;
  pauseCount: number;
  finished: boolean;
}): GameResult {
  const elapsedMs = Math.max(0, Math.round(a.elapsedMs));
  const recordTimeMs = recordTimeMsFor(elapsedMs, a.missCount);
  return {
    id: a.id,
    gameId: GAME_ID,
    ruleVersion: GAME_RULE_VERSION,
    storySetVersion: a.storySetVersion,
    storyId: a.storyId,
    courseId: a.courseId,
    inputMethod: a.inputMethod,
    romajiStyle: a.romajiStyle,
    startedAt: a.startedAt.toISOString(),
    finishedAt: a.finishedAt.toISOString(),
    elapsedMs,
    missCount: a.missCount,
    penaltyMs: penaltyMsFor(a.missCount),
    recordTimeMs,
    completionYear: completionYearFor(recordTimeMs),
    correctKeystrokes: a.correctKeystrokes,
    accuracy: accuracyFor(a.correctKeystrokes, a.missCount),
    completedReadingCharacters: a.completedReadingCharacters,
    totalReadingCharacters: a.totalReadingCharacters,
    pauseCount: a.pauseCount,
    finished: a.finished,
  };
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const isIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const isSlug = (v: unknown): v is string => typeof v === 'string' && /^[a-z0-9._-]{1,64}$/.test(v);

/**
 * 保存されていた値を検証します。ミス加算・記録タイム・完成年・正確率は、保存された値を信用せず、
 * 記録のルールの版に従って計算し直した値と一致することを確かめます（一致しなければ読み込みません）。
 */
export function parseGameResult(raw: unknown): GameResult | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r.id !== 'string' || !/^[0-9a-f-]{8,64}$/i.test(r.id)) return null;
  if (r.gameId !== GAME_ID || r.ruleVersion !== GAME_RULE_VERSION) return null;
  if (!isSlug(r.storySetVersion) || !isSlug(r.storyId)) return null;
  if (r.courseId !== 'standard' && r.courseId !== 'short') return null;
  if (r.inputMethod !== 'keyboard' && r.inputMethod !== 'touch') return null;
  if (r.romajiStyle !== 'hepburn' && r.romajiStyle !== 'kunrei') return null;
  if (!isIso(r.startedAt) || !isIso(r.finishedAt) || Date.parse(r.finishedAt) < Date.parse(r.startedAt)) return null;
  for (const k of ['elapsedMs', 'missCount', 'penaltyMs', 'recordTimeMs', 'completionYear', 'correctKeystrokes', 'completedReadingCharacters', 'totalReadingCharacters', 'pauseCount'] as const) {
    if (!isInt(r[k])) return null;
  }
  if (typeof r.finished !== 'boolean') return null;
  const n = r as unknown as GameResult;
  if (n.totalReadingCharacters <= 0 || n.completedReadingCharacters > n.totalReadingCharacters) return null;
  if (n.finished && n.completedReadingCharacters !== n.totalReadingCharacters) return null;
  if (n.penaltyMs !== penaltyMsFor(n.missCount)) return null;
  if (n.recordTimeMs !== recordTimeMsFor(n.elapsedMs, n.missCount)) return null;
  if (n.completionYear !== completionYearFor(n.recordTimeMs)) return null;
  const acc = accuracyFor(n.correctKeystrokes, n.missCount);
  return {
    id: n.id,
    gameId: n.gameId,
    ruleVersion: n.ruleVersion,
    storySetVersion: n.storySetVersion,
    storyId: n.storyId,
    courseId: n.courseId,
    inputMethod: n.inputMethod,
    romajiStyle: n.romajiStyle,
    startedAt: n.startedAt,
    finishedAt: n.finishedAt,
    elapsedMs: n.elapsedMs,
    missCount: n.missCount,
    penaltyMs: n.penaltyMs,
    recordTimeMs: n.recordTimeMs,
    completionYear: n.completionYear,
    correctKeystrokes: n.correctKeystrokes,
    accuracy: acc,
    completedReadingCharacters: n.completedReadingCharacters,
    totalReadingCharacters: n.totalReadingCharacters,
    pauseCount: n.pauseCount,
    finished: n.finished,
  };
}

export function mergeGameResults(...lists: GameResult[][]): GameResult[] {
  const byId = new Map<string, GameResult>();
  for (const list of lists) for (const r of list) if (!byId.has(r.id)) byId.set(r.id, r);
  return [...byId.values()].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, GAME_HISTORY_LIMIT);
}

// ---------------------------------------------------------------------
// 比較の条件と自己ベスト
// ---------------------------------------------------------------------

/**
 * 物語ごとの比較の条件：ゲーム・ルールの版・物語のセットの版・コース・物語・入力のしかた・一時停止の有無。
 * 一時停止した記録としなかった記録は、別々に比べます。
 */
export function storyKey(r: Pick<GameResult, 'gameId' | 'ruleVersion' | 'storySetVersion' | 'courseId' | 'storyId' | 'inputMethod' | 'pauseCount'>): string {
  return [r.gameId, r.ruleVersion, r.storySetVersion, r.courseId, r.storyId, r.inputMethod, r.pauseCount > 0 ? 'paused' : 'nopause'].join('|');
}

/** コース全体（3本の物語をまとめた参考値）の条件 */
export function courseKey(r: Pick<GameResult, 'gameId' | 'ruleVersion' | 'storySetVersion' | 'courseId' | 'inputMethod' | 'pauseCount'>): string {
  return [r.gameId, r.ruleVersion, r.storySetVersion, r.courseId, '*', r.inputMethod, r.pauseCount > 0 ? 'paused' : 'nopause'].join('|');
}

/** より良い記録か（記録タイムが短い。同じなら先に出した記録を残します） */
export function isBetter(a: GameResult, b: GameResult | null | undefined): boolean {
  if (!b) return true;
  return a.recordTimeMs < b.recordTimeMs;
}

export interface GameComparison {
  /** 同じ条件（物語ごと）の前回の完成記録 */
  previous: GameResult | null;
  /** 今回より前の、同じ条件（物語ごと）の自己ベスト */
  bestBefore: GameResult | null;
  /** 今回より前の、同じコース全体（3本）の自己ベスト（参考） */
  courseBestBefore: GameResult | null;
  firstTime: boolean;
  isNewBest: boolean;
}

/**
 * 今回の記録を、条件が同じ過去の記録と比べます。
 * history は新しい順の記録、bests は「履歴から消えても残る」自己ベスト（条件ごと）です。
 */
export function compareGame(current: GameResult, history: GameResult[], bests: GameResult[]): GameComparison {
  const sk = storyKey(current);
  const ck = courseKey(current);
  const past = history.filter((r) => r.id !== current.id && r.finished && Date.parse(r.startedAt) <= Date.parse(current.startedAt));
  const previous = past.filter((r) => storyKey(r) === sk).sort((a, b) => b.startedAt.localeCompare(a.startedAt))[0] ?? null;
  const pool = [...past, ...bests.filter((b) => b.id !== current.id && b.finished)];
  let bestBefore: GameResult | null = null;
  let courseBestBefore: GameResult | null = null;
  for (const r of pool) {
    if (storyKey(r) === sk && isBetter(r, bestBefore)) bestBefore = r;
    if (courseKey(r) === ck && isBetter(r, courseBestBefore)) courseBestBefore = r;
  }
  return {
    previous,
    bestBefore,
    courseBestBefore,
    firstTime: bestBefore === null && previous === null,
    isNewBest: current.finished && isBetter(current, bestBefore),
  };
}

/** 自己ベストの集計（条件ごとに最も良い完成記録）を更新します */
export function updateBests(bests: GameResult[], r: GameResult): GameResult[] {
  if (!r.finished) return bests;
  const out: GameResult[] = [];
  let placed = false;
  // 物語ごとのベストだけを持てば、コース全体のベストはその中の最小として求められます
  const sk = storyKey(r);
  for (const b of bests) {
    if (storyKey(b) === sk) {
      out.push(isBetter(r, b) ? r : b);
      placed = true;
    } else out.push(b);
  }
  if (!placed) out.push(r);
  return out;
}
