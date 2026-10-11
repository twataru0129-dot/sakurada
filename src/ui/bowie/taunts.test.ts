import { expect, it } from 'vitest';
import { BOWIE_TAUNTS, drawBowieTaunt } from './taunts';

it('10種類のセリフと配信用画像がそろい、ランダム抽選の全区間から選べる', () => {
  expect(BOWIE_TAUNTS).toHaveLength(10);
  expect(new Set(BOWIE_TAUNTS.map((t) => t.src)).size).toBe(10);
  BOWIE_TAUNTS.forEach((taunt, i) => {
    expect(taunt.src).toContain(`game_over_${taunt.id}.webp`);
    expect(taunt.line.length).toBeGreaterThan(0);
    expect(drawBowieTaunt(() => (i + 0.5) / 10)).toBe(taunt);
  });
  expect(drawBowieTaunt(() => 0)).toBe(BOWIE_TAUNTS[0]);
  expect(drawBowieTaunt(() => 0.999999)).toBe(BOWIE_TAUNTS[9]);
});
