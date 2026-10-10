/**
 * ボウイの爆弾遊戯の記録（ハイスコア）。この端末・ブラウザの localStorage に、プロフィールごとに分けて保存します。
 * - ゲストは 'guest'、ログイン利用者はアカウントの内部 ID ごとです（別の人の記録と混ざりません）。
 * - 新しいデータベースの設定は使いません（クラウドには送りません）。保存できなくてもゲームは続けられます。
 */
export const BOWIE_RECORD_KEY = 'sakura-type:bowie-records:v1';
/** 全体の音量（この端末に保存します） */
export const BOWIE_VOLUME_KEY = 'sakura-type:bowie-volume:v1';
const VERSION = 1;

export interface BowieRecord {
  best: number;
  bestSolved: number;
  cleared: number;
  plays: number;
  lastScore: number;
  lastAt: string;
}

const empty = (): BowieRecord => ({ best: 0, bestSolved: 0, cleared: 0, plays: 0, lastScore: 0, lastAt: '' });

function readAll(s: Storage | null): Record<string, BowieRecord> {
  if (!s) return {};
  try {
    const d = JSON.parse(s.getItem(BOWIE_RECORD_KEY) ?? 'null') as { version?: number; profiles?: Record<string, unknown> } | null;
    if (!d || d.version !== VERSION || !d.profiles || typeof d.profiles !== 'object') return {};
    const out: Record<string, BowieRecord> = {};
    for (const [k, v] of Object.entries(d.profiles)) {
      const r = v as Partial<BowieRecord>;
      const n = (x: unknown) => (typeof x === 'number' && Number.isFinite(x) && x >= 0 ? Math.floor(x) : 0);
      out[k] = { best: n(r.best), bestSolved: n(r.bestSolved), cleared: n(r.cleared), plays: n(r.plays), lastScore: n(r.lastScore), lastAt: typeof r.lastAt === 'string' ? r.lastAt : '' };
    }
    return out;
  } catch {
    return {};
  }
}

function storage(override?: Storage | null): Storage | null {
  if (override !== undefined) return override;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export function loadBowieRecord(profile: string, store?: Storage | null): BowieRecord {
  return readAll(storage(store))[profile] ?? empty();
}

/** 1回のプレイの結果を記録します。保存できたかと、新しい記録を返します（失敗してもゲームは止めません） */
export function saveBowieResult(profile: string, r: { score: number; solved: number; cleared: boolean }, store?: Storage | null): { saved: boolean; record: BowieRecord; newBest: boolean } {
  const s = storage(store);
  const all = readAll(s);
  const cur = all[profile] ?? empty();
  const newBest = r.score > cur.best;
  const next: BowieRecord = {
    best: Math.max(cur.best, r.score),
    bestSolved: Math.max(cur.bestSolved, r.solved),
    cleared: cur.cleared + (r.cleared ? 1 : 0),
    plays: cur.plays + 1,
    lastScore: r.score,
    lastAt: new Date().toISOString(),
  };
  all[profile] = next;
  if (!s) return { saved: false, record: next, newBest };
  try {
    s.setItem(BOWIE_RECORD_KEY, JSON.stringify({ version: VERSION, profiles: all }));
    return { saved: true, record: next, newBest };
  } catch {
    return { saved: false, record: next, newBest };
  }
}
