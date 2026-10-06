import { describe, expect, it } from 'vitest';
import { clearGuestHistory, GUEST_HISTORY_KEY, loadGuestHistory, saveGuestRecord } from './guestHistory';
import { recordFromResult, type HistoryRecord } from '../core/history';
import { buildResult, type PracticeConfig } from '../core/result';

class MemStorage implements Storage {
  m = new Map<string, string>();
  quota = Infinity;
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    if (v.length > this.quota) throw new DOMException('quota', 'QuotaExceededError');
    this.m.set(k, v);
  }
}

const config: PracticeConfig = { kind: 'romaji', endMode: 'time', minutes: 3, targetCount: null, inputMethod: 'keyboard', setType: 'standard', theme: 'all', difficulty: 'mixed', questionSetVersion: 'qs-2026.10', romajiStyle: 'hepburn' };
function rec(i: number, extra: Partial<HistoryRecord> = {}): HistoryRecord {
  const r = buildResult(`id-${i}`, new Date(Date.UTC(2026, 9, 1, 0, i)), config, { correct: 100 + i, miss: 3, completedQuestions: 10, elapsedMs: 180_000, finished: true });
  return { ...recordFromResult(r), ...extra };
}

describe('ゲストの記録（この端末に保存）', () => {
  it('保存して読み直せる（項目がそのまま残る）', () => {
    const s = new MemStorage();
    expect(saveGuestRecord(rec(1), s)).toBe('saved');
    const { records } = loadGuestHistory(s);
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual(rec(1));
    expect(records[0]!.romajiStyle).toBe('hepburn');
    expect(JSON.parse(s.getItem(GUEST_HISTORY_KEY)!).version).toBe(1);
  });
  it('同じ記録 ID は二重に保存しない', () => {
    const s = new MemStorage();
    saveGuestRecord(rec(1), s);
    expect(saveGuestRecord(rec(1), s)).toBe('duplicate');
    expect(loadGuestHistory(s).records).toHaveLength(1);
  });
  it('最新 100 回まで。101 回目で一番古い記録から入れ替わる', () => {
    const s = new MemStorage();
    for (let i = 1; i <= 100; i++) saveGuestRecord(rec(i), s);
    expect(loadGuestHistory(s).records).toHaveLength(100);
    expect(saveGuestRecord(rec(101), s)).toBe('saved');
    const ids = loadGuestHistory(s).records.map((r) => r.id);
    expect(ids).toHaveLength(100);
    expect(ids[0]).toBe('id-101');
    expect(ids).not.toContain('id-1');
    expect(ids).toContain('id-2');
  });
  it('保存できない（容量不足）ときは failed を返し、例外を出さない', () => {
    const s = new MemStorage();
    s.quota = 10;
    expect(saveGuestRecord(rec(1), s)).toBe('failed');
  });
  it('保存場所が使えない環境でも止まらない', () => {
    expect(saveGuestRecord(rec(1), null)).toBe('failed');
    expect(loadGuestHistory(null).unavailable).toBe(true);
    const throwing = { getItem: () => { throw new Error('denied'); } } as unknown as Storage;
    expect(loadGuestHistory(throwing).records).toEqual([]);
  });
  it('壊れたデータは読み飛ばし、正しい記録だけを読む', () => {
    const s = new MemStorage();
    s.setItem(GUEST_HISTORY_KEY, '{not json');
    expect(loadGuestHistory(s).records).toEqual([]);
    expect(saveGuestRecord(rec(1), s)).toBe('saved');
    s.setItem(GUEST_HISTORY_KEY, JSON.stringify({ version: 1, records: [rec(2), { id: 'x', kind: 'evil' }, 'str', null, { ...rec(3), accuracy: 900 }] }));
    const r = loadGuestHistory(s);
    expect(r.records.map((x) => x.id)).toEqual(['id-2']);
    expect(r.dropped).toBe(4);
  });
  it('終了条件を持たない古い形の記録は時間制として読み込む', () => {
    const s = new MemStorage();
    const old = { ...rec(5) } as Record<string, unknown>;
    delete old.endMode;
    delete old.targetCount;
    delete old.romajiStyle;
    s.setItem(GUEST_HISTORY_KEY, JSON.stringify([old]));
    const r = loadGuestHistory(s).records[0]!;
    expect(r.endMode).toBe('time');
    expect(r.minutes).toBe(3);
    expect(r.romajiStyle).toBeNull();
  });
  it('新しい版の形式は上書きしない（データを守る）', () => {
    const s = new MemStorage();
    const future = JSON.stringify({ version: 99, records: [{ anything: true }] });
    s.setItem(GUEST_HISTORY_KEY, future);
    expect(saveGuestRecord(rec(1), s)).toBe('failed');
    expect(s.getItem(GUEST_HISTORY_KEY)).toBe(future);
  });
  it('保存時のランクを書き換えない', () => {
    const s = new MemStorage();
    saveGuestRecord(rec(1, { rank: 'Z（古い基準）', rankVersion: 'rank-v0' }), s);
    expect(loadGuestHistory(s).records[0]!.rank).toBe('Z（古い基準）');
    expect(loadGuestHistory(s).records[0]!.rankVersion).toBe('rank-v0');
  });
  it('削除はゲストの記録だけ', () => {
    const s = new MemStorage();
    s.setItem('other-setting', 'keep');
    saveGuestRecord(rec(1), s);
    expect(clearGuestHistory(s)).toBe(true);
    expect(loadGuestHistory(s).records).toEqual([]);
    expect(s.getItem('other-setting')).toBe('keep');
  });
});
