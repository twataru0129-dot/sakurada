import { describe, expect, it } from 'vitest';
import { completedSeries, growthMessages, movingAverage, summarize } from './growth';
import { recordConditionKey, recordFromResult, type HistoryRecord } from './history';
import { buildResult, type PracticeConfig } from './result';

const base: PracticeConfig = { kind: 'romaji', endMode: 'time', minutes: 3, targetCount: null, inputMethod: 'keyboard', setType: 'standard', theme: 'all', difficulty: 'mixed', questionSetVersion: 'v' };
let n = 0;
function rec(speedPerMin: number, missPct = 5, cfg: Partial<PracticeConfig> = {}, finished = true): HistoryRecord {
  n++;
  const correct = Math.round(speedPerMin * 3);
  const miss = Math.round((correct * missPct) / (100 - missPct));
  const c = { ...base, ...cfg };
  const elapsed = c.endMode === 'count' ? 200_000 : 180_000;
  const r = buildResult(`r${n}`, new Date(Date.UTC(2026, 9, 1, 0, n)), c, { correct, miss, completedQuestions: c.targetCount ?? 10, elapsedMs: finished ? elapsed : 60_000, finished });
  return recordFromResult(r);
}

describe('成長グラフの計算', () => {
  it('同じ条件の完了記録だけを古い順に並べる（途中終了・別の条件は含めない）', () => {
    const a = rec(100);
    const others = [
      rec(500, 5, { inputMethod: 'touch' }),
      rec(500, 5, { minutes: 5 }),
      rec(500, 5, { endMode: 'count', minutes: null, targetCount: 25 }),
      rec(500, 5, { kind: 'sentence' }),
      rec(500, 5, { theme: 'x' }),
      rec(500, 5, { difficulty: 2 }),
      rec(500, 5, { questionSetVersion: 'v2' }),
      rec(500, 5, {}, false),
    ];
    const b = rec(110);
    const s = completedSeries([b, ...others, a], recordConditionKey(a));
    expect(s.map((r) => r.id)).toEqual([a.id, b.id]);
  });
  it('ヘボン式・訓令式の違いでは条件を分けない', () => {
    expect(recordConditionKey(rec(1, 5, { romajiStyle: 'hepburn' }))).toBe(recordConditionKey(rec(1, 5, { romajiStyle: 'kunrei' })));
  });
  it('5回の移動平均は5回そろってから', () => {
    expect(movingAverage([1, 2, 3, 4])).toEqual([null, null, null, null]);
    expect(movingAverage([1, 2, 3, 4, 5, 6])).toEqual([null, null, null, null, 3, 4]);
  });
  it('0件・1件・5件未満・10件以上', () => {
    expect(summarize([]).bestSpeed).toBeNull();
    const one = summarize([rec(100)]);
    expect(one.bestSpeed?.speed).toBe(100);
    expect(one.recent).toBeNull();
    expect(summarize([rec(1), rec(2), rec(3), rec(4)]).recent).toBeNull();
    const five = summarize([rec(100), rec(110), rec(120), rec(130), rec(140)]);
    expect(five.recent?.speed).toBe(120);
    expect(five.firstVsRecent).toBeNull();
    const ten = summarize([100, 100, 100, 100, 100, 110, 115, 120, 112.5, 105].map((v) => rec(v)));
    // テスト用の記録は打鍵数を整数に丸めて作るため、差は 12.5 前後になります
    expect(ten.firstVsRecent?.speedDiff).toBeCloseTo(12.5, 0);
  });
  it('速さが上がって正確率が下がったら両方を伝える', () => {
    const series = [...Array(5)].map(() => rec(100, 2)).concat([...Array(5)].map(() => rec(120, 6)));
    const msgs = growthMessages(summarize(series), '打／分');
    expect(msgs[0]).toBe('最初の5回と比べて、最近の5回は20.0打／分アップ！');
    expect(msgs[1]).toMatch(/^正確率は.*ポイント下がりました。$/);
  });
  it('正確率が上がったことを肯定的に伝える', () => {
    const series = [...Array(5)].map(() => rec(100, 8)).concat([...Array(5)].map(() => rec(100, 4)));
    const msgs = growthMessages(summarize(series), '打／分');
    expect(msgs[0]).toBe('最初の5回と最近の5回の速さは、ほぼ同じです。');
    expect(msgs[1]).toMatch(/^正確率が.*ポイント上がりました！$/);
  });
  it('10回未満では比較を出さない', () => {
    expect(growthMessages(summarize([...Array(9)].map(() => rec(100))), '打／分')).toEqual([]);
  });
});
