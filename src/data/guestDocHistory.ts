/**
 * ゲストの文書作成モードの記録（この端末・このブラウザの localStorage）。v2.0.0
 * タイピング・旧検定モード・ゲームの記録とは別のキーに、最新 100 回分を保存します。クラウドには送りません。
 * 記録には入力した本文を含めません（成績の数値と、問題の ID・タイトル・改訂番号だけ）。
 */
import { DOC_HISTORY_LIMIT, mergeDocRecords, parseDocRecord, type DocRecord } from '../core/documentResult';
import type { SaveOutcome } from './guestHistory';

export const GUEST_DOC_HISTORY_KEY = 'sakura-type:guest-document-history';
export const GUEST_DOC_HISTORY_VERSION = 1;

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface DocLoadResult {
  records: DocRecord[];
  dropped: number;
  unavailable: boolean;
  incompatible: boolean;
}

export function loadGuestDocHistory(store?: Storage | null): DocLoadResult {
  const s = storage(store);
  const none = { records: [], dropped: 0, unavailable: false, incompatible: false };
  if (!s) return { ...none, unavailable: true };
  let text: string | null;
  try {
    text = s.getItem(GUEST_DOC_HISTORY_KEY);
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
  if (typeof d.version === 'number' && d.version > GUEST_DOC_HISTORY_VERSION) return { ...none, incompatible: true };
  if (d.version !== GUEST_DOC_HISTORY_VERSION || !Array.isArray(d.records)) return { ...none, dropped: 1 };
  const records: DocRecord[] = [];
  let dropped = 0;
  for (const raw of d.records) {
    const r = parseDocRecord(raw);
    if (r) records.push(r);
    else dropped++;
  }
  return { records: mergeDocRecords(records), dropped, unavailable: false, incompatible: false };
}

export function saveGuestDocRecord(record: DocRecord, store?: Storage | null): SaveOutcome {
  const s = storage(store);
  if (!s) return 'failed';
  const { records, unavailable, incompatible } = loadGuestDocHistory(s);
  if (unavailable || incompatible) return 'failed';
  if (records.some((r) => r.id === record.id)) return 'duplicate';
  const next = [record, ...records].slice(0, DOC_HISTORY_LIMIT);
  try {
    s.setItem(GUEST_DOC_HISTORY_KEY, JSON.stringify({ version: GUEST_DOC_HISTORY_VERSION, records: next }));
  } catch {
    return 'failed';
  }
  return loadGuestDocHistory(s).records.some((r) => r.id === record.id) ? 'saved' : 'failed';
}

export function clearGuestDocHistory(store?: Storage | null): boolean {
  const s = storage(store);
  if (!s) return false;
  try {
    s.removeItem(GUEST_DOC_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}
