import { describe, expect, it } from 'vitest';
import { appendGuestGarden, GUEST_GARDEN_KEY, loadGuestGarden } from './guestGarden';
import { foldEvents, solveEventId, type GardenEvent } from '../core/garden/state';
import { GARDEN_PROBLEMS } from '../core/garden/problems';

function memoryStorage(): Storage {
  const m = new Map<string, string>();
  return {
    get length() {
      return m.size;
    },
    clear: () => m.clear(),
    getItem: (k) => m.get(k) ?? null,
    key: (i) => [...m.keys()][i] ?? null,
    removeItem: (k) => void m.delete(k),
    setItem: (k, v) => void m.set(k, v),
  };
}
const session: GardenEvent = { id: 'session:s1', at: 1, type: 'session', data: { session: 's1', problems: GARDEN_PROBLEMS.slice(0, 5).map((p) => p.id) } };
const solve = (i: number): GardenEvent => ({ id: solveEventId('s1', i), at: 2 + i, type: 'solve', data: { session: 's1', index: i } });

describe('ゲストの桜ガーデンの保存', () => {
  it('完成した問題ごとに保存し、読み直しても同じ。同じ出来事を何度保存しても1回分', () => {
    const s = memoryStorage();
    expect(appendGuestGarden([session, solve(0)], s)).toBe(true);
    expect(appendGuestGarden([solve(0), solve(1)], s)).toBe(true);
    expect(appendGuestGarden([solve(1)], s)).toBe(true);
    const r = loadGuestGarden(s);
    expect(r.events.map((e) => e.id)).toEqual(['session:s1', solveEventId('s1', 0), solveEventId('s1', 1)]);
    expect(foldEvents(r.events).completed).toBe(2);
  });
  it('壊れた出来事は読まず、ほかの記録は残す', () => {
    const s = memoryStorage();
    s.setItem(GUEST_GARDEN_KEY, JSON.stringify({ version: 1, events: [session, { id: 1 }, solve(0)] }));
    const r = loadGuestGarden(s);
    expect(r.events).toHaveLength(2);
    expect(r.dropped).toBe(1);
  });
  it('新しい版の記録は読まず、上書きもしない', () => {
    const s = memoryStorage();
    s.setItem(GUEST_GARDEN_KEY, JSON.stringify({ version: 99, events: [] }));
    expect(loadGuestGarden(s).incompatible).toBe(true);
    expect(appendGuestGarden([session], s)).toBe(false);
    expect(JSON.parse(s.getItem(GUEST_GARDEN_KEY)!).version).toBe(99);
  });
  it('保存できない環境では保存できたと返さない', () => {
    const s = memoryStorage();
    s.setItem = () => {
      throw new Error('quota');
    };
    expect(appendGuestGarden([session], s)).toBe(false);
    expect(appendGuestGarden([session], null)).toBe(false);
  });
});
