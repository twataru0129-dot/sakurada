/**
 * ゲストの桜ガーデンの記録（この端末・このブラウザの localStorage）。
 *
 * - キー sakura-type:guest-garden:v1 に、出来事（イベント）の一覧を保存します。クラウドには送りません。
 * - 書き込むたびに今の内容を読み直して合わせるため、別のタブで遊んでいても記録は消えません（同じ ID は一度だけ）。
 * - 読み込むときに形を確かめ、壊れた出来事は読みません。保存できないときは「保存できた」と返しません。
 */
import { mergeEvents, parseEvent, type GardenEvent } from '../core/garden/state';

export const GUEST_GARDEN_KEY = 'sakura-type:guest-garden:v1';
const VERSION = 1;

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export interface GardenLoadResult {
  events: GardenEvent[];
  dropped: number;
  unavailable: boolean;
  /** 新しい版のアプリで保存された記録（この版では読めません。上書きもしません） */
  incompatible: boolean;
}

export function loadGuestGarden(store?: Storage | null): GardenLoadResult {
  const none: GardenLoadResult = { events: [], dropped: 0, unavailable: false, incompatible: false };
  const s = storage(store);
  if (!s) return { ...none, unavailable: true };
  let text: string | null;
  try {
    text = s.getItem(GUEST_GARDEN_KEY);
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
  const d = (data ?? {}) as { version?: unknown; events?: unknown };
  if (typeof d.version === 'number' && d.version > VERSION) return { ...none, incompatible: true };
  if (d.version !== VERSION || !Array.isArray(d.events)) return { ...none, dropped: 1 };
  const events: GardenEvent[] = [];
  let dropped = 0;
  for (const raw of d.events) {
    const e = parseEvent(raw);
    if (e) events.push(e);
    else dropped++;
  }
  return { ...none, events: mergeEvents(events, []), dropped };
}

/** 出来事を追加して保存します。読み直して、すべて保存できたときだけ true */
export function appendGuestGarden(add: readonly GardenEvent[], store?: Storage | null): boolean {
  const s = storage(store);
  if (!s) return false;
  const cur = loadGuestGarden(s);
  if (cur.unavailable || cur.incompatible) return false;
  const next = mergeEvents(cur.events, add);
  try {
    s.setItem(GUEST_GARDEN_KEY, JSON.stringify({ version: VERSION, events: next }));
  } catch {
    return false;
  }
  const back = new Set(loadGuestGarden(s).events.map((e) => e.id));
  return add.every((e) => back.has(e.id));
}
