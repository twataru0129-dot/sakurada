/**
 * ゲストのゲームの記録（この端末・このブラウザの localStorage）。
 *
 * - 履歴：キー sakura-type:guest-game-history:v1 に最新 100 件。
 * - 自己ベスト：キー sakura-type:guest-game-bests:v1 に、条件（コース・物語・ルールの版・物語の版・入力のしかた・一時停止の有無）
 *   ごとの最も良い完成記録を別に持ちます（履歴の 100 件から消えても残ります）。
 * - タイピング・検定モードのゲスト記録とは別のキーで、クラウドには送りません。
 * - 読み込むときに形式・数値・版を検証し、壊れた値は読みません。保存できないときは「保存できた」と返しません。
 */
import { GAME_HISTORY_LIMIT, mergeGameResults, parseGameResult, updateBests, type GameResult } from '../core/game/result';
import type { SaveOutcome } from './guestHistory';

export const GUEST_GAME_HISTORY_KEY = 'sakura-type:guest-game-history:v1';
export const GUEST_GAME_BESTS_KEY = 'sakura-type:guest-game-bests:v1';
const VERSION = 1;

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface GameLoadResult {
  records: GameResult[];
  dropped: number;
  unavailable: boolean;
  incompatible: boolean;
}

function readList(s: Storage, key: string): GameLoadResult {
  const none: GameLoadResult = { records: [], dropped: 0, unavailable: false, incompatible: false };
  let text: string | null;
  try {
    text = s.getItem(key);
  } catch {
    return { ...none, unavailable: true };
  }
  if (!text) return none;
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return { ...none, dropped: 1 };
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return { ...none, dropped: 1 };
  const d = data as { version?: unknown; records?: unknown };
  if (typeof d.version === 'number' && d.version > VERSION) return { ...none, incompatible: true };
  if (d.version !== VERSION || !Array.isArray(d.records)) return { ...none, dropped: 1 };
  const records: GameResult[] = [];
  let dropped = 0;
  for (const raw of d.records) {
    const r = parseGameResult(raw);
    if (r) records.push(r);
    else dropped++;
  }
  return { ...none, records, dropped };
}

export function loadGuestGameHistory(store?: Storage | null): GameLoadResult {
  const s = storage(store);
  if (!s) return { records: [], dropped: 0, unavailable: true, incompatible: false };
  const r = readList(s, GUEST_GAME_HISTORY_KEY);
  return { ...r, records: mergeGameResults(r.records) };
}

export function loadGuestGameBests(store?: Storage | null): GameLoadResult {
  const s = storage(store);
  if (!s) return { records: [], dropped: 0, unavailable: true, incompatible: false };
  return readList(s, GUEST_GAME_BESTS_KEY);
}

/** 1件保存します（同じ ID は二重に保存しません）。履歴と自己ベストの両方を書き込めたときだけ saved */
export function saveGuestGameResult(r: GameResult, store?: Storage | null): SaveOutcome {
  const s = storage(store);
  if (!s) return 'failed';
  const hist = loadGuestGameHistory(s);
  const bests = loadGuestGameBests(s);
  if (hist.unavailable || hist.incompatible || bests.unavailable || bests.incompatible) return 'failed';
  if (hist.records.some((x) => x.id === r.id)) return 'duplicate';
  const nextHist = [r, ...hist.records].slice(0, GAME_HISTORY_LIMIT);
  const nextBests = updateBests(bests.records, r);
  try {
    s.setItem(GUEST_GAME_BESTS_KEY, JSON.stringify({ version: VERSION, records: nextBests }));
    s.setItem(GUEST_GAME_HISTORY_KEY, JSON.stringify({ version: VERSION, records: nextHist }));
  } catch {
    return 'failed';
  }
  return loadGuestGameHistory(s).records.some((x) => x.id === r.id) ? 'saved' : 'failed';
}

/** ゲストのゲームの記録を消します。履歴と自己ベストの両方を消します（ほかの記録には触れません） */
export function clearGuestGameHistory(store?: Storage | null): boolean {
  const s = storage(store);
  if (!s) return false;
  try {
    s.removeItem(GUEST_GAME_HISTORY_KEY);
    s.removeItem(GUEST_GAME_BESTS_KEY);
    return true;
  } catch {
    return false;
  }
}
