import { describe, expect, it } from 'vitest';
import { BOWIE_RANKS } from '../../core/bowie/results';
import { emblemUrl } from './BowieResults';
import sprites from '../../data/bowie/sprites.json';

describe('勝利のランクのエンブレム（素材）', () => {
  it('10ランクすべてに、全体（ランク名入り）と一覧用の印の画像がある', () => {
    for (const r of BOWIE_RANKS) {
      expect(emblemUrl(r.id, 'full'), r.id).not.toBe('');
      expect(emblemUrl(r.id, 'mark'), r.id).not.toBe('');
      const e = (sprites as unknown as { emblems: Record<string, { w: number; h: number; markW: number; markH: number }> }).emblems[r.id]!;
      expect(e.w).toBeGreaterThan(200);
      // 一覧用の印は、下のランク名を切り落としてあるので全体より横長
      expect(e.markH / e.markW).toBeLessThan(e.h / e.w);
    }
  });
});
