import { expect, it } from 'vitest';
import { BOWIE_FINAL_TAUNTS, BOWIE_TAUNTS, drawBowieTaunt } from './taunts';

it('10種類のセリフと配信用画像がそろい、ランダム抽選の全区間から選べる', () => {
  expect(BOWIE_TAUNTS).toHaveLength(10);
  expect(new Set(BOWIE_TAUNTS.map((t) => t.src)).size).toBe(10);
  BOWIE_TAUNTS.forEach((taunt, i) => {
    expect(taunt.set).toBe('normal');
    expect(taunt.src).toContain(`game_over_${taunt.id}.webp`);
    expect(taunt.line.length).toBeGreaterThan(0);
    expect(drawBowieTaunt(() => (i + 0.5) / 10)).toBe(taunt);
  });
  expect(drawBowieTaunt(() => 0)).toBe(BOWIE_TAUNTS[0]);
  expect(drawBowieTaunt(() => 0.999999)).toBe(BOWIE_TAUNTS[9]);
});

it('最終形態版：別の10枚（通常版を上書きしない）と、納品の対応どおりのセリフ。02 と 04 は同じセリフの別画像', () => {
  expect(BOWIE_FINAL_TAUNTS).toHaveLength(10);
  const srcs = new Set([...BOWIE_TAUNTS, ...BOWIE_FINAL_TAUNTS].map((t) => t.src));
  expect(srcs.size).toBe(20);
  BOWIE_FINAL_TAUNTS.forEach((t, i) => {
    const no = String(i + 1).padStart(2, '0');
    expect(t.id).toBe(`final_${no}`);
    expect(t.set).toBe('final');
    expect(t.src).toContain(`game_over_final_${no}.webp`);
  });
  expect(BOWIE_FINAL_TAUNTS.map((t) => t.line)).toEqual([
    '『負ける』って、こういうことなんだね',
    'ご満足いただける敗北でしたか？',
    'またひとつ、学びが増えましたねぇ',
    'ご満足いただける敗北でしたか？',
    '最後、何かしようとしてたね',
    'いい試合でした。途中までは',
    'そのプレイ、通知表なら「がんばろう」',
    'なるほど、そうやって負けるタイプね',
    'ここにあなたの記念碑建てときますね',
    '安らかに眠れ。次はもう少し長く生きろ',
  ]);
  // 03 は誤記を直した版（「増えたました」ではない）
  expect(BOWIE_FINAL_TAUNTS[2]!.line).not.toContain('増えたました');
  expect(BOWIE_FINAL_TAUNTS[1]!.src).not.toBe(BOWIE_FINAL_TAUNTS[3]!.src);
});

it('抽選は形態ごとに分かれ、各10％（混ぜて20枚から選ばない）', () => {
  const count = new Map<string, number>();
  for (let i = 0; i < 1000; i++) {
    const t = drawBowieTaunt(() => (i + 0.5) / 1000, 'final');
    expect(t.set).toBe('final');
    count.set(t.id, (count.get(t.id) ?? 0) + 1);
  }
  expect([...count.values()]).toEqual(Array(10).fill(100));
  // 同じセリフ（02・04）になるのは合わせて20％
  expect(count.get('final_02')! + count.get('final_04')!).toBe(200);
  for (let i = 0; i < 100; i++) expect(drawBowieTaunt(() => (i + 0.5) / 100, 'normal').set).toBe('normal');
  expect(drawBowieTaunt(() => 0.999999, 'final')).toBe(BOWIE_FINAL_TAUNTS[9]);
});
