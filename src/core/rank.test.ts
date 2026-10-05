import { describe, expect, it } from 'vitest';
import { accuracyPercent, formatNumber1, judgeRank, nextRank, RANK_TABLE, speedPerMinute } from './rank';

const MIN3 = 180_000;
const MIN5 = 300_000;
const MIN10 = 600_000;

describe('ランク判定', () => {
  it('入力がなければ未判定、正確率は null', () => {
    expect(judgeRank('romaji', { correct: 0, miss: 0, elapsedMs: MIN3 })).toBe('未判定');
    expect(accuracyPercent({ correct: 0, miss: 0 })).toBeNull();
  });

  it('入力はあるが G に届かない場合は G−', () => {
    expect(judgeRank('romaji', { correct: 1, miss: 0, elapsedMs: MIN3 })).toBe('G−');
    expect(judgeRank('romaji', { correct: 0, miss: 5, elapsedMs: MIN3 })).toBe('G−');
  });

  it('速度の境界：ちょうど基準値は合格、わずかに下回ると不合格', () => {
    // S＋ ローマ字 900打/分 × 3分 = 2700 打、正確率 99% 以上
    expect(judgeRank('romaji', { correct: 2700, miss: 27, elapsedMs: MIN3 })).toBe('S＋'); // 2700/2727 = 99.0099%
    expect(judgeRank('romaji', { correct: 2699, miss: 0, elapsedMs: MIN3 })).toBe('S');
  });

  it('正確率の境界：ちょうど 99% は合格、丸めると 99% に見える 98.99% は不合格', () => {
    expect(judgeRank('romaji', { correct: 2970, miss: 30, elapsedMs: MIN3 })).toBe('S＋'); // 99.000%
    // 9899/10000 = 98.99% → 表示上は 99.0 に丸まりそうでも S＋ ではない
    expect(judgeRank('romaji', { correct: 9899, miss: 101, elapsedMs: MIN10 })).toBe('S');
  });

  it('0.5 刻みの正確率（98.5%）の境界', () => {
    // S: 800打/分, 98.5%。5分で 4000 打
    expect(judgeRank('romaji', { correct: 4000 * 1, miss: 0, elapsedMs: MIN5 })).toBe('S');
    // 8077/(8077+123) = 98.5% ちょうど（10分で 807.7 打/分）
    expect(judgeRank('romaji', { correct: 8077, miss: 123, elapsedMs: MIN10 })).toBe('S');
    // 8077/(8077+124) = 98.488...%
    expect(judgeRank('romaji', { correct: 8077, miss: 124, elapsedMs: MIN10 })).toBe('S−');
  });

  it('速度と正確率の両方を満たす最も高いランク', () => {
    // 速度は S＋ 相当でも正確率 90% なら D（90%）
    expect(judgeRank('romaji', { correct: 2700, miss: 300, elapsedMs: MIN3 })).toBe('D');
  });

  it('文章入力は文字数／分の基準を使う', () => {
    // C: 50字/分, 93%。10分で 500 字
    expect(judgeRank('sentence', { correct: 500, miss: 37, elapsedMs: MIN10 })).toBe('C'); // 93.1%
    expect(judgeRank('sentence', { correct: 499, miss: 0, elapsedMs: MIN10 })).toBe('C−');
  });

  it('全ランクの基準値ちょうどで、そのランクになる', () => {
    for (const row of RANK_TABLE) {
      // 10分間で基準値ちょうど、ミス0
      const c = { correct: row.romaji * 10, miss: 0, elapsedMs: MIN10 };
      expect(judgeRank('romaji', c)).toBe(row.name);
      const s = { correct: row.sentence * 10, miss: 0, elapsedMs: MIN10 };
      expect(judgeRank('sentence', s)).toBe(row.name);
    }
  });

  it('次のランクの条件', () => {
    expect(nextRank('romaji', '未判定')).toEqual({ name: 'G', speed: 5, accuracy: 60 });
    expect(nextRank('romaji', 'G−')).toEqual({ name: 'G', speed: 5, accuracy: 60 });
    expect(nextRank('sentence', 'S')).toEqual({ name: 'S＋', speed: 200, accuracy: 99 });
    expect(nextRank('romaji', 'S＋')).toBeNull();
  });
});

describe('速度と正確率の計算', () => {
  it('3分・5分・10分の速度', () => {
    expect(speedPerMinute({ correct: 300, elapsedMs: MIN3 })).toBe(100);
    expect(speedPerMinute({ correct: 300, elapsedMs: MIN5 })).toBe(60);
    expect(speedPerMinute({ correct: 300, elapsedMs: MIN10 })).toBe(30);
  });
  it('正確率', () => {
    expect(accuracyPercent({ correct: 95, miss: 5 })).toBe(95);
  });
  it('表示は切り捨て（基準を満たしていないのに満たしたように見せない）', () => {
    expect(formatNumber1(98.49)).toBe('98.4');
    expect(formatNumber1(100)).toBe('100.0');
  });
});
