/**
 * ゲストの練習記録（この端末・このブラウザの localStorage に保存）。
 *
 * - 最新 100 回分まで。101 回目からは古い記録から入れ替えます（すべての条件を合わせて 100 回）。
 * - クラウド（Supabase）には送りません。ほかの端末・ブラウザには引き継がれません。
 * - ログイン利用者の記録はここに書き込みません（呼び出し側で区別します）。
 * - 保存できない環境・容量不足・保存データの破損でも例外を外に出さず、結果（saved / failed など）を返します。
 * - 保存形式に版（version）を持たせ、読み込むときに 1 件ずつ検証します。
 */
import { HISTORY_LIMIT, mergeRecords, parseRecord, type HistoryRecord } from '../core/history';

export const GUEST_HISTORY_KEY = 'sakura-type:guest-history';
export const GUEST_HISTORY_VERSION = 1;

interface StoredV1 {
  version: 1;
  records: unknown[];
}

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface LoadResult {
  records: HistoryRecord[];
  /** 読めなかった記録（破損など）の件数 */
  dropped: number;
  /** 保存場所が使えない */
  unavailable: boolean;
  /** 新しい版のアプリが保存した、この版では読めない形式（上書きして消さないようにします） */
  incompatible: boolean;
}

export function loadGuestHistory(store?: Storage | null): LoadResult {
  const s = storage(store);
  if (!s) return { records: [], dropped: 0, unavailable: true, incompatible: false };
  let text: string | null;
  try {
    text = s.getItem(GUEST_HISTORY_KEY);
  } catch {
    return { records: [], dropped: 0, unavailable: true, incompatible: false };
  }
  if (!text) return { records: [], dropped: 0, unavailable: false, incompatible: false };
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    // 壊れていて読めないデータ（次の保存で正しい形に置き換えます）
    return { records: [], dropped: 1, unavailable: false, incompatible: false };
  }
  if (!Array.isArray(data) && data && typeof data === 'object' && typeof (data as { version?: unknown }).version === 'number' && (data as StoredV1).version > GUEST_HISTORY_VERSION) {
    return { records: [], dropped: 0, unavailable: false, incompatible: true };
  }
  // 版のない配列（古い形）も 1 件ずつ検証して読み込みます
  const list: unknown[] = Array.isArray(data)
    ? data
    : data && typeof data === 'object' && (data as StoredV1).version === GUEST_HISTORY_VERSION && Array.isArray((data as StoredV1).records)
      ? (data as StoredV1).records
      : [];
  const records: HistoryRecord[] = [];
  let dropped = 0;
  for (const raw of list) {
    const r = parseRecord(raw);
    if (r) records.push(r);
    else dropped++;
  }
  if (!Array.isArray(data) && list.length === 0 && !(data && typeof data === 'object' && 'records' in data)) dropped++;
  return { records: mergeRecords(records), dropped, unavailable: false, incompatible: false };
}

export type SaveOutcome = 'saved' | 'duplicate' | 'failed';

/** 1 件追加します。同じ記録 ID がすでにあれば何もしません（二重保存の防止） */
export function saveGuestRecord(record: HistoryRecord, store?: Storage | null): SaveOutcome {
  const s = storage(store);
  if (!s) return 'failed';
  const { records, unavailable, incompatible } = loadGuestHistory(s);
  if (unavailable || incompatible) return 'failed';
  if (records.some((r) => r.id === record.id)) return 'duplicate';
  // 新しい記録を先頭に入れ、上限を超えた分は古い（後ろの）記録から外します。端末の時計がずれていても今回の記録は残します
  const next = [record, ...records].slice(0, HISTORY_LIMIT);
  const payload: StoredV1 = { version: GUEST_HISTORY_VERSION, records: next };
  try {
    s.setItem(GUEST_HISTORY_KEY, JSON.stringify(payload));
  } catch {
    // 容量不足・保存の禁止など
    return 'failed';
  }
  // 書き込めたことを読み直して確かめます
  return loadGuestHistory(s).records.some((r) => r.id === record.id) ? 'saved' : 'failed';
}

/** ゲストの記録だけを削除します（ほかの設定やログインの記録には触れません） */
export function clearGuestHistory(store?: Storage | null): boolean {
  const s = storage(store);
  if (!s) return false;
  try {
    s.removeItem(GUEST_HISTORY_KEY);
    return true;
  } catch {
    return false;
  }
}

/** ゲストの記録についての説明（画面に表示します） */
export const GUEST_HISTORY_NOTICE =
  'ゲストの記録は、この端末・ブラウザに保存されます。ブラウザのデータを削除すると消えます。共用端末では、ほかの人の記録も表示される場合があります。';
