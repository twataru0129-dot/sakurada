/**
 * ゲストの検定モードの記録（この端末・このブラウザの localStorage）。
 * タイピングの記録（GUEST_HISTORY_KEY）とは別のキーに、最新 100 回分を保存します。クラウドには送りません。
 * 記録には入力本文を含めません（成績の数値だけ）。
 */
import { EXAM_HISTORY_LIMIT, mergeExamRecords, parseExamRecord, type ExamRecord } from '../core/examResult';
import type { SaveOutcome } from './guestHistory';

export const GUEST_EXAM_HISTORY_KEY = 'sakura-type:guest-exam-history';
export const GUEST_EXAM_HISTORY_VERSION = 1;

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface ExamLoadResult {
  records: ExamRecord[];
  dropped: number;
  unavailable: boolean;
  incompatible: boolean;
}

export function loadGuestExamHistory(store?: Storage | null): ExamLoadResult {
  const s = storage(store);
  const none = { records: [], dropped: 0, unavailable: false, incompatible: false };
  if (!s) return { ...none, unavailable: true };
  let text: string | null;
  try {
    text = s.getItem(GUEST_EXAM_HISTORY_KEY);
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
  if (typeof d.version === 'number' && d.version > GUEST_EXAM_HISTORY_VERSION) return { ...none, incompatible: true };
  if (d.version !== GUEST_EXAM_HISTORY_VERSION || !Array.isArray(d.records)) return { ...none, dropped: 1 };
  const records: ExamRecord[] = [];
  let dropped = 0;
  for (const raw of d.records) {
    const r = parseExamRecord(raw);
    if (r) records.push(r);
    else dropped++;
  }
  return { records: mergeExamRecords(records), dropped, unavailable: false, incompatible: false };
}

export function saveGuestExamRecord(record: ExamRecord, store?: Storage | null): SaveOutcome {
  const s = storage(store);
  if (!s) return 'failed';
  const { records, unavailable, incompatible } = loadGuestExamHistory(s);
  if (unavailable || incompatible) return 'failed';
  if (records.some((r) => r.id === record.id)) return 'duplicate';
  const next = [record, ...records].slice(0, EXAM_HISTORY_LIMIT);
  try {
    s.setItem(GUEST_EXAM_HISTORY_KEY, JSON.stringify({ version: GUEST_EXAM_HISTORY_VERSION, records: next }));
  } catch {
    return 'failed';
  }
  return loadGuestExamHistory(s).records.some((r) => r.id === record.id) ? 'saved' : 'failed';
}

export function clearGuestExamHistory(store?: Storage | null): boolean {
  const s = storage(store);
  if (!s) return false;
  try {
    s.removeItem(GUEST_EXAM_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}
