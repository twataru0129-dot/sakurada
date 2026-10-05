import { describe, expect, it } from 'vitest';
import { compareWithHistory, type Comparable } from './compare';

const rec = (id: string, at: string, rank: string, speed: number, extra: Partial<Comparable> = {}): Comparable => ({
  id, startedAt: at, finished: true, rank, speed, accuracy: 95, correct: speed * 3, miss: 10, ...extra,
});

describe('前回比較と自己ベスト', () => {
  it('初めての記録は自己ベスト', () => {
    const c = compareWithHistory(rec('a', '2026-10-05T10:00:00Z', 'D', 150), [], '打／分');
    expect(c.isFirst).toBe(true);
    expect(c.isNewBest).toBe(true);
    expect(c.previous).toBeNull();
  });
  it('ランクが同じでも成長を伝える', () => {
    const prev = rec('p', '2026-10-01T10:00:00Z', 'D', 150, { accuracy: 90, miss: 20 });
    const c = compareWithHistory(rec('a', '2026-10-05T10:00:00Z', 'D', 160, { accuracy: 92, miss: 12 }), [prev], '打／分');
    expect(c.growth.some((g) => g.includes('速度'))).toBe(true);
    expect(c.growth.some((g) => g.includes('正確率'))).toBe(true);
    expect(c.growth.some((g) => g.includes('ミス'))).toBe(true);
    expect(c.isNewBest).toBe(true);
  });
  it('途中終了の記録は自己ベストにならない', () => {
    const prev = rec('p', '2026-10-01T10:00:00Z', 'D', 150);
    const c = compareWithHistory(rec('a', '2026-10-05T10:00:00Z', 'S', 900, { finished: false }), [prev], '打／分');
    expect(c.isNewBest).toBe(false);
  });
  it('ランクが上の記録が自己ベスト', () => {
    const best = rec('b', '2026-10-01T10:00:00Z', 'C', 260);
    const c = compareWithHistory(rec('a', '2026-10-05T10:00:00Z', 'D', 300), [best], '打／分');
    expect(c.isNewBest).toBe(false);
    expect(c.bestBefore?.id).toBe('b');
  });
});
