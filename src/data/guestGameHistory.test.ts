import { describe, expect, it } from 'vitest';
import { buildGameResult, compareGame, parseGameResult, type GameResult } from '../core/game/result';
import { clearGuestGameHistory, GUEST_GAME_BESTS_KEY, GUEST_GAME_HISTORY_KEY, loadGuestGameBests, loadGuestGameHistory, saveGuestGameResult } from './guestGameHistory';
import { GUEST_HISTORY_KEY } from './guestHistory';

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

const uuid = (i: number) => `00000000-0000-4000-8000-${String(i).padStart(12, '0')}`;
function game(i: number, extra: Partial<Parameters<typeof buildGameResult>[0]> = {}): GameResult {
  return buildGameResult({
    id: uuid(i),
    storySetVersion: 'sakurada-stories-v1',
    storyId: 'inherited-dream',
    courseId: 'standard',
    inputMethod: 'keyboard',
    romajiStyle: 'hepburn',
    startedAt: new Date(Date.UTC(2026, 9, 1, 0, i)),
    finishedAt: new Date(Date.UTC(2026, 9, 1, 0, i, 50)),
    elapsedMs: 200_000 + i * 1000,
    missCount: 2,
    correctKeystrokes: 1800,
    completedReadingCharacters: 967,
    totalReadingCharacters: 967,
    pauseCount: 0,
    finished: true,
    ...extra,
  });
}

describe('ゲームの記録の検証', () => {
  it('保存した値を読み直せる', () => {
    const g = game(1);
    expect(parseGameResult(JSON.parse(JSON.stringify(g)))).toEqual(g);
    expect(g.recordTimeMs).toBe(211_000);
    expect(g.completionYear).toBe(1882 + 105);
  });
  it('ルールと合わない値（記録タイム・完成年・ミス加算の改ざん）は読まない', () => {
    const g = game(1);
    expect(parseGameResult({ ...g, recordTimeMs: 1000 })).toBeNull();
    expect(parseGameResult({ ...g, completionYear: 1900 })).toBeNull();
    expect(parseGameResult({ ...g, penaltyMs: 0 })).toBeNull();
    expect(parseGameResult({ ...g, missCount: -1 })).toBeNull();
    expect(parseGameResult({ ...g, ruleVersion: 'v99' })).toBeNull();
    expect(parseGameResult({ ...g, completedReadingCharacters: 10 })).toBeNull(); // 完成なのに途中まで
    expect(parseGameResult({ ...g, elapsedMs: 1.5 })).toBeNull();
  });
});

describe('ゲストのゲームの記録（この端末）', () => {
  it('最新100件まで。同じIDは二重に保存しない。ほかの記録のキーには触れない', () => {
    const s = new MemStorage();
    s.setItem(GUEST_HISTORY_KEY, '{"version":1,"records":[]}');
    for (let i = 1; i <= 105; i++) expect(saveGuestGameResult(game(i), s)).toBe('saved');
    expect(saveGuestGameResult(game(105), s)).toBe('duplicate');
    const h = loadGuestGameHistory(s).records;
    expect(h).toHaveLength(100);
    expect(h[0]!.id).toBe(uuid(105));
    expect(s.getItem(GUEST_HISTORY_KEY)).toBe('{"version":1,"records":[]}');
  });
  it('自己ベストは、履歴の100件から消えても残る', () => {
    const s = new MemStorage();
    // 最初の記録が最速
    saveGuestGameResult(game(1, { elapsedMs: 120_000 }), s);
    for (let i = 2; i <= 102; i++) saveGuestGameResult(game(i), s);
    const h = loadGuestGameHistory(s).records;
    expect(h.some((r) => r.id === uuid(1))).toBe(false);
    const bests = loadGuestGameBests(s).records;
    expect(bests).toHaveLength(1);
    expect(bests[0]!.id).toBe(uuid(1));
    const cmp = compareGame(game(200, { startedAt: new Date(Date.UTC(2026, 9, 2)), finishedAt: new Date(Date.UTC(2026, 9, 2, 0, 5)) }), h, bests);
    expect(cmp.bestBefore?.id).toBe(uuid(1));
    expect(cmp.previous?.id).toBe(uuid(102));
  });
  it('一時停止あり・なし、物語・コースごとに自己ベストを分ける', () => {
    const s = new MemStorage();
    saveGuestGameResult(game(1, { elapsedMs: 100_000, pauseCount: 1 }), s);
    saveGuestGameResult(game(2, { elapsedMs: 150_000 }), s);
    saveGuestGameResult(game(3, { elapsedMs: 50_000, storyId: 'visit-barcelona', totalReadingCharacters: 951, completedReadingCharacters: 951 }), s);
    saveGuestGameResult(game(4, { elapsedMs: 10_000, courseId: 'short', storyId: 'inherited-dream-intro', totalReadingCharacters: 28, completedReadingCharacters: 28 }), s);
    const bests = loadGuestGameBests(s).records;
    expect(bests).toHaveLength(4);
    const now = game(5, { elapsedMs: 160_000, startedAt: new Date(Date.UTC(2026, 9, 3)), finishedAt: new Date(Date.UTC(2026, 9, 3, 0, 5)) });
    const cmp = compareGame(now, loadGuestGameHistory(s).records, bests);
    // 同じ物語・一時停止なしのベストは 2（一時停止ありの 1 と、別の物語の 3・短縮の 4 は混ぜない）
    expect(cmp.bestBefore?.id).toBe(uuid(2));
    // コース全体（3本）の参考値には、同じコースの別の物語 3 が入る
    expect(cmp.courseBestBefore?.id).toBe(uuid(3));
    expect(cmp.isNewBest).toBe(false);
    expect(cmp.firstTime).toBe(false);
  });
  it('初めての完成', () => {
    const cmp = compareGame(game(1), [], []);
    expect(cmp.firstTime).toBe(true);
    expect(cmp.isNewBest).toBe(true);
  });
  it('壊れたデータ・新しい版・保存できない環境・容量不足でも止まらず、保存できたと偽らない', () => {
    const s = new MemStorage();
    s.setItem(GUEST_GAME_HISTORY_KEY, '{broken');
    expect(loadGuestGameHistory(s)).toMatchObject({ records: [], dropped: 1 });
    expect(saveGuestGameResult(game(1), s)).toBe('saved');
    s.setItem(GUEST_GAME_HISTORY_KEY, JSON.stringify({ version: 9, records: [] }));
    expect(loadGuestGameHistory(s).incompatible).toBe(true);
    expect(saveGuestGameResult(game(2), s)).toBe('failed');
    expect(JSON.parse(s.getItem(GUEST_GAME_HISTORY_KEY)!).version).toBe(9); // 上書きしない
    expect(saveGuestGameResult(game(3), null)).toBe('failed');
    const full = new MemStorage();
    full.quota = 10;
    expect(saveGuestGameResult(game(4), full)).toBe('failed');
  });
  it('削除すると履歴と自己ベストの両方が消える', () => {
    const s = new MemStorage();
    saveGuestGameResult(game(1), s);
    expect(clearGuestGameHistory(s)).toBe(true);
    expect(s.getItem(GUEST_GAME_HISTORY_KEY)).toBeNull();
    expect(s.getItem(GUEST_GAME_BESTS_KEY)).toBeNull();
  });
});
