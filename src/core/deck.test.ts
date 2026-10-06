import { describe, expect, it } from 'vitest';
import { Deck, STANDARD_PATTERN } from './deck';
import type { Question } from './questions';
import { PracticeClock } from './clock';
import { buildResult, conditionKey, type PracticeConfig } from './result';

function q(id: string, difficulty: 1 | 2 | 3): Question {
  return { id, kind: 'romaji', category: 'general', theme: 'life', difficulty, text: id, reading: 'あ' };
}

function seeded(seed: number) {
  return () => {
    seed = (seed * 1103515245 + 12345) % 2 ** 31;
    return seed / 2 ** 31;
  };
}

describe('出題', () => {
  const pool = [q('a1', 1), q('a2', 1), q('a3', 1), q('b1', 2), q('b2', 2), q('c1', 3), q('c2', 3)];

  it('標準問題は決められた難易度の順番で出題する', () => {
    const deck = new Deck(pool, { type: 'pattern', kind: 'romaji' }, seeded(1));
    const levels = Array.from({ length: 10 }, () => deck.next().difficulty);
    expect(levels).toEqual([...STANDARD_PATTERN.romaji, ...STANDARD_PATTERN.romaji]);
  });

  it('同じ問題が連続しない・問題が尽きない', () => {
    for (let s = 1; s < 30; s++) {
      const deck = new Deck(pool, { type: 'shuffle' }, seeded(s));
      let last = '';
      for (let i = 0; i < 500; i++) {
        const id = deck.next().id;
        expect(id).not.toBe(last);
        last = id;
      }
    }
  });

  it('同じ難易度の山を使い切るまで同じ問題は出ない', () => {
    const deck = new Deck(pool, { type: 'shuffle' }, seeded(7));
    const first = new Set(Array.from({ length: pool.length }, () => deck.next().id));
    expect(first.size).toBe(pool.length);
  });
});

describe('計時', () => {
  it('タブが非表示の間も時間は進み、延長されない', () => {
    let t = 0;
    const clock = new PracticeClock(180_000, () => t);
    clock.start();
    t = 100_000; // 非表示中も経過
    expect(clock.remainingMs()).toBe(80_000);
    t = 400_000;
    expect(clock.isOver()).toBe(true);
    expect(clock.elapsedMs()).toBe(180_000);
  });
  it('途中終了は止めた時点までの時間', () => {
    let t = 0;
    const clock = new PracticeClock(300_000, () => t);
    clock.start();
    t = 61_000;
    clock.stop();
    t = 200_000;
    expect(clock.elapsedMs()).toBe(61_000);
  });
});

describe('結果と記録の区別', () => {
  const base: PracticeConfig = { kind: 'romaji', endMode: 'time', minutes: 3, targetCount: null, inputMethod: 'keyboard', setType: 'standard', theme: 'all', difficulty: 'mixed', questionSetVersion: 'v' };
  const totals = { correct: 300, miss: 10, completedQuestions: 20, elapsedMs: 180_000, finished: true };

  it('標準問題を完走したときだけ正式ランク', () => {
    expect(buildResult('1', new Date(), base, totals).official).toBe(true);
    expect(buildResult('1', new Date(), base, { ...totals, finished: false }).official).toBe(false);
    expect(buildResult('1', new Date(), { ...base, setType: 'sakura' }, totals).official).toBe(false);
    expect(buildResult('1', new Date(), { ...base, setType: 'teacher' }, totals).official).toBe(false);
  });

  it('画面タップと実物キーボード、時間、種別、出題の種類で条件が分かれる', () => {
    const keys = new Set([
      conditionKey(base),
      conditionKey({ ...base, inputMethod: 'touch' }),
      conditionKey({ ...base, minutes: 5 }),
      conditionKey({ ...base, kind: 'sentence' }),
      conditionKey({ ...base, setType: 'teacher' }),
      conditionKey({ ...base, setType: 'general', difficulty: 2 }),
    ]);
    expect(keys.size).toBe(6);
  });

  it('入力ゼロは正確率「—」（null）・未判定', () => {
    const r = buildResult('1', new Date(), base, { correct: 0, miss: 0, completedQuestions: 0, elapsedMs: 180_000, finished: true });
    expect(r.accuracy).toBeNull();
    expect(r.rank).toBe('未判定');
  });
});
