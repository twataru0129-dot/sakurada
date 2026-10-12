import { describe, expect, it } from 'vitest';
import { accuracyOf, BOWIE_RANKS, formatAccuracy, rankForScore, resultRank } from './results';

describe('勝利のランク（得点だけで判定）', () => {
  it('10段階の境界：199/200、299/300 … 949/950、1000', () => {
    const at = (s: number) => rankForScore(s)?.name;
    expect(at(80)).toBe('ウォリアー');
    expect(at(199)).toBe('ウォリアー');
    expect(at(200)).toBe('エリート');
    expect(at(299)).toBe('エリート');
    expect(at(300)).toBe('マスター');
    expect(at(399)).toBe('マスター');
    expect(at(400)).toBe('グランドマスター');
    expect(at(499)).toBe('グランドマスター');
    expect(at(500)).toBe('エピック');
    expect(at(599)).toBe('エピック');
    expect(at(600)).toBe('レジェンド');
    expect(at(699)).toBe('レジェンド');
    expect(at(700)).toBe('ミシック');
    expect(at(799)).toBe('ミシック');
    expect(at(800)).toBe('Gミシック');
    expect(at(879)).toBe('Gミシック');
    expect(at(880)).toBe('Hミシック');
    expect(at(949)).toBe('Hミシック');
    expect(at(950)).toBe('Iミシック');
    expect(at(1000)).toBe('Iミシック');
    expect(at(79)).toBeUndefined();
    expect(at(1001)).toBeUndefined();
  });
  it('範囲は低い順に、抜けも重なりもなく80〜1000をおおう。素材の名前は rank_01〜10', () => {
    expect(BOWIE_RANKS.map((r) => r.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(BOWIE_RANKS[0]!.min).toBe(80);
    expect(BOWIE_RANKS.at(-1)!.max).toBe(1000);
    for (let i = 1; i < BOWIE_RANKS.length; i++) expect(BOWIE_RANKS[i]!.min).toBe(BOWIE_RANKS[i - 1]!.max + 1);
    expect(BOWIE_RANKS.map((r) => r.id)).toEqual([
      'rank_01_warrior', 'rank_02_elite', 'rank_03_master', 'rank_04_grandmaster', 'rank_05_epic',
      'rank_06_legend', 'rank_07_mythic', 'rank_08_g_mythic', 'rank_09_h_mythic', 'rank_10_i_mythic',
    ]);
  });
  it('敗北はどんな得点でもランクなし。勝利は得点だけで決め、開発用の短縮（全問 < 80）で80点未満なら最下位', () => {
    expect(resultRank(990, false, 80)).toBeNull();
    expect(resultRank(0, false, 4)).toBeNull();
    expect(resultRank(836, true, 80)!.name).toBe('Gミシック');
    expect(resultRank(30, true, 4)!.name).toBe('ウォリアー');
    expect(resultRank(30, true, 80)).toBeNull();
  });
});

describe('正確率', () => {
  it('正しい入力 ÷（正しい入力＋ミスタイプ）× 100、小数第1位まで。0回は「—」', () => {
    expect(accuracyOf(985, 15)).toBe(98.5);
    expect(accuracyOf(2, 1)).toBe(66.7);
    expect(accuracyOf(10, 0)).toBe(100);
    expect(accuracyOf(0, 4)).toBe(0);
    expect(accuracyOf(0, 0)).toBeNull();
    expect(formatAccuracy(accuracyOf(0, 0))).toBe('—');
    expect(formatAccuracy(98.5)).toBe('98.5%');
    expect(formatAccuracy(100)).toBe('100.0%');
  });
});
