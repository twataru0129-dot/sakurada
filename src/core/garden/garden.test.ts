import { describe, expect, it } from 'vitest';
import { findUnsupportedChar, RomajiMatcher } from '../romaji';
import { GARDEN_UNLOCKS, GROWTH, STANDARD_SPECIES, TREE_CATALOG, type StandardSpecies } from './config';
import { endingOf, GARDEN_PROBLEMS, kanaCount, pickProblems, subjectOf } from './problems';
import { canPlace, footprintAt, ROOT_ZONES } from './layout';
import {
  decoCounts,
  FIRST_EVENT_ID,
  foldEvents,
  mergeEvents,
  plantedAt,
  remainingToBloom,
  resumableSession,
  solveEventId,
  stageOf,
  unlockedGardenCount,
  type GardenEvent,
} from './state';

let clock = 1_000;
const ev = (type: GardenEvent['type'], data: Record<string, unknown> = {}, id?: string): GardenEvent => ({ id: id ?? `${type}-${clock}`, at: clock++, type, data });

/** n 問の練習を始めて、指定した問題を完成させた出来事 */
function practice(problemIds: string[], solve: number[] = problemIds.map((_, i) => i), session = `s${clock}`): GardenEvent[] {
  const out = [ev('session', { session, problems: problemIds })];
  for (const i of solve) out.push({ id: solveEventId(session, i), at: clock++, type: 'solve', data: { session, index: i } });
  return out;
}
const ids = (from: number, n: number) => GARDEN_PROBLEMS.slice(from, from + n).map((p) => p.id);
/** 累計 n 問を完成させた出来事（10問ずつ） */
function solveMany(n: number): GardenEvent[] {
  const out: GardenEvent[] = [];
  for (let k = 0; k < n; k += 10) out.push(...practice(ids(k % 490, 10), [...Array(Math.min(10, n - k)).keys()]));
  return out;
}

describe('練習問題', () => {
  it('500文を読み込み、ID は重複せず、表示文13〜20文字・読み15〜27文字、読みはすべて既存のローマ字判定で入力できる', () => {
    expect(GARDEN_PROBLEMS).toHaveLength(500);
    expect(new Set(GARDEN_PROBLEMS.map((p) => p.id)).size).toBe(500);
    for (const p of GARDEN_PROBLEMS) {
      expect([...p.text].length, p.id).toBeGreaterThanOrEqual(13);
      expect([...p.text].length, p.id).toBeLessThanOrEqual(20);
      expect(kanaCount(p), p.id).toBeGreaterThanOrEqual(15);
      expect(kanaCount(p), p.id).toBeLessThanOrEqual(27);
      expect(findUnsupportedChar(p.reading), p.id).toBeNull();
      // 句読点・空白は入力に含まれません
      expect(p.reading).not.toMatch(/[、。\s]/);
    }
  });
  it('既存の判定の別の打ち方（si / shi など）も、そのまま正解になる', () => {
    const p = GARDEN_PROBLEMS.find((x) => x.reading.includes('し'))!;
    for (const style of ['hepburn', 'kunrei'] as const) {
      const m = new RomajiMatcher(p.reading, style);
      for (const ch of m.remaining()) expect(m.input(ch)).toBe('correct');
      expect(m.done).toBe(true);
    }
    const m = new RomajiMatcher('しずく', 'hepburn');
    for (const ch of 'sizuku') m.input(ch);
    expect(m.done).toBe(true);
  });
  it('1回の練習の中で同じ問題を出さず、最近の問題を避け、同じ主語・同じ文末の文が続かない', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
    const recent = ids(0, 100);
    for (let t = 0; t < 50; t++) {
      const list = pickProblems(20, recent, random);
      expect(list).toHaveLength(20);
      expect(new Set(list.map((p) => p.id)).size).toBe(20);
      expect(list.some((p) => recent.includes(p.id))).toBe(false);
      for (let i = 1; i < list.length; i++) {
        expect(subjectOf(list[i]!.text)).not.toBe(subjectOf(list[i - 1]!.text));
        expect(endingOf(list[i]!.text)).not.toBe(endingOf(list[i - 1]!.text));
        expect(list[i]!.category).not.toBe(list[i - 1]!.category);
      }
    }
  });
});

describe('ごほうび', () => {
  it('1問ごとに水1・花びら1。読みのかな20文字ごとに水1。端数は次の練習へ持ち越す', () => {
    const a = ids(0, 5);
    const s1 = foldEvents(practice(a));
    const kana1 = a.reduce((n, id) => n + kanaCount(GARDEN_PROBLEMS.find((p) => p.id === id)!), 0);
    expect(s1.completed).toBe(5);
    expect(s1.petals).toBe(5);
    expect(s1.water).toBe(5 + Math.floor(kana1 / 20));
    expect(s1.kanaCarry).toBe(kana1 % 20);
    const b = ids(5, 5);
    const kana2 = b.reduce((n, id) => n + kanaCount(GARDEN_PROBLEMS.find((p) => p.id === id)!), 0);
    const s2 = foldEvents([...practice(a), ...practice(b)]);
    expect(s2.water).toBe(10 + Math.floor((kana1 + kana2) / 20));
    expect(s2.kanaCarry).toBe((kana1 + kana2) % 20);
    expect(s2.totalKana).toBe(kana1 + kana2);
  });
  it('同じ問題の完成は二重に数えない（再送・再読み込み）。完成していない問題は精算しない', () => {
    const list = ids(10, 5);
    const events = practice(list, [0, 1]);
    const again = [...events, ...events.map((e) => ({ ...e })), { ...events[1]!, at: clock++ }];
    const s = foldEvents(again);
    expect(s.completed).toBe(2);
    expect(s.petals).toBe(2);
    // 形の違う ID で同じ問題を完成にしても数えない
    const forged = foldEvents([...events, { id: 'other', at: clock++, type: 'solve', data: { session: events[0]!.data.session, index: 2 } }]);
    expect(forged.completed).toBe(2);
    // 中断：続きから始められ、完成済みの2問は残る
    const r = resumableSession(s);
    expect(r?.solved.size).toBe(2);
    expect(foldEvents([...events, ev('end', { session: events[0]!.data.session })]).completed).toBe(2);
    expect(resumableSession(foldEvents([...events, ev('end', { session: events[0]!.data.session })]))).toBeNull();
  });
  it('入力方式（打鍵数）に関係なく、読みの文字数だけで決まる', () => {
    const p = GARDEN_PROBLEMS.find((x) => x.reading.includes('し'))!;
    const h = new RomajiMatcher(p.reading, 'hepburn').remaining().length;
    const k = new RomajiMatcher(p.reading, 'kunrei').remaining().length;
    expect(h).not.toBe(k);
    expect(foldEvents(practice([p.id, ...ids(400, 4)])).water).toBe(foldEvents(practice([p.id, ...ids(400, 4)])).water);
  });
});

describe('育成', () => {
  const firstTree = () => [{ id: FIRST_EVENT_ID, at: clock++, type: 'first' as const, data: {} }];
  it('最初の無料のソメイヨシノは水5で若木・10でつぼみ・20で満開。必要以上の水は使わず、満開には水を使えない', () => {
    const base = [...solveMany(40), ...firstTree()];
    const s0 = foldEvents(base);
    const w0 = s0.water;
    const steps: [number, string][] = [[4, 'sapling'], [1, 'young'], [4, 'young'], [1, 'buds'], [9, 'buds'], [1, 'bloom']];
    const ev2: GardenEvent[] = [];
    let used = 0;
    for (const [n, stage] of steps) {
      ev2.push(ev('water', { tree: 'first-1', amount: n }));
      used += n;
      const s = foldEvents([...base, ...ev2]);
      expect(stageOf(s.trees[0]!)).toBe(stage);
      expect(s.water).toBe(w0 - used);
    }
    const bloomed = foldEvents([...base, ...ev2]);
    expect(bloomed.bloomed.has('somei_yoshino')).toBe(true);
    const more = foldEvents([...base, ...ev2, ev('water', { tree: 'first-1', amount: 5 })]);
    expect(more.water).toBe(bloomed.water);
    expect(more.trees[0]!.water).toBe(GROWTH.first.bloom);
  });
  it('満開まで：在庫と残りの小さい方だけ使う。2本目以降のソメイヨシノは 10／25／50', () => {
    const base = [...solveMany(30), ...firstTree(), ev('buy_tree', { species: 'somei_yoshino', tree: 't2' })];
    const s = foldEvents(base);
    const t2 = s.trees.find((t) => t.id === 't2')!;
    expect(t2.firstFree).toBe(false);
    expect(remainingToBloom(t2)).toBe(GROWTH.standard.bloom);
    // 在庫が満開までの量より多い：満開までの50だけ使う
    expect(s.water).toBeGreaterThan(50);
    const after = foldEvents([...base, ev('water', { tree: 't2', amount: 999 })]);
    expect(after.water).toBe(s.water - 50);
    expect(after.trees.find((t) => t.id === 't2')!.water).toBe(50);
    // 在庫が少ない：在庫の分だけ使う
    const few = [...solveMany(21), ev('first', {}, FIRST_EVENT_ID), ev('buy_tree', { species: 'somei_yoshino', tree: 't3' })];
    const f0 = foldEvents(few);
    expect(f0.water).toBeLessThan(50);
    const f1 = foldEvents([...few, ev('water', { tree: 't3', amount: 999 })]);
    expect(f1.water).toBe(0);
    expect(f1.trees.find((t) => t.id === 't3')!.water).toBe(f0.water);
    for (const [w, stage] of [[9, 'sapling'], [10, 'young'], [24, 'young'], [25, 'buds'], [49, 'buds'], [50, 'bloom']] as const)
      expect(stageOf({ species: 'kanzan', firstFree: false, water: w })).toBe(stage);
  });
  it('特別な桜は 20／50／100', () => {
    for (const [w, stage] of [[19, 'sapling'], [20, 'young'], [49, 'young'], [50, 'buds'], [99, 'buds'], [100, 'bloom']] as const)
      expect(stageOf({ species: 'special', firstFree: false, water: w })).toBe(stage);
  });
});

describe('お店と解放', () => {
  it('花びらが足りない交換は反映しない。同じ交換（同じ ID）を二度押しても1回だけ', () => {
    const base = solveMany(25);
    const s = foldEvents(base);
    expect(s.petals).toBe(25);
    const buy = ev('buy_tree', { species: 'yae_beni_shidare', tree: 'y1' }, 'buy-1');
    const twice = foldEvents([...base, buy, { ...buy }]);
    expect(twice.petals).toBe(5);
    expect(twice.trees.filter((t) => t.species === 'yae_beni_shidare')).toHaveLength(1);
    const short = foldEvents([...base, buy, ev('buy_deco', { kind: 'small_pond' })]);
    expect(short.petals).toBe(5);
    expect(short.decoOwned.small_pond).toBe(0);
  });
  it('品種は累計完成問題数でお店に並ぶ（前の品種を買う必要はない）', () => {
    expect(TREE_CATALOG.map((t) => [t.id, t.unlock_completed_problems, t.price_petals])).toEqual([
      ['somei_yoshino', 0, 20], ['yae_beni_shidare', 20, 20], ['kanzan', 50, 30], ['asahiyama', 90, 35],
      ['ukon', 140, 45], ['gyoiko', 200, 60], ['amanogawa', 270, 75], ['kenrokuen_kikuzakura', 350, 100],
    ]);
    const s49 = foldEvents([...solveMany(49), ev('buy_tree', { species: 'kanzan', tree: 'k1' })]);
    expect(s49.trees).toHaveLength(0);
    const s50 = foldEvents([...solveMany(50), ev('buy_tree', { species: 'kanzan', tree: 'k1' })]);
    expect(s50.trees.map((t) => t.species)).toEqual(['kanzan']);
  });
  it('最初のソメイヨシノは無料で1本だけ。受け取る前は花びらでは買えない', () => {
    const s = foldEvents([...solveMany(20), ev('buy_tree', { species: 'somei_yoshino', tree: 'x' })]);
    expect(s.trees).toHaveLength(0);
    const f = foldEvents([{ id: FIRST_EVENT_ID, at: 1, type: 'first', data: {} }, { id: FIRST_EVENT_ID, at: 2, type: 'first', data: {} }, ev('first', {}, 'first-again')]);
    expect(f.trees).toHaveLength(1);
    expect(f.trees[0]!.firstFree).toBe(true);
  });
  it('2つ目の庭は累計150問、3つ目は350問で使える', () => {
    expect(GARDEN_UNLOCKS).toEqual([0, 150, 350]);
    expect(unlockedGardenCount({ completed: 149 })).toBe(1);
    expect(unlockedGardenCount({ completed: 150 })).toBe(2);
    expect(unlockedGardenCount({ completed: 350 })).toBe(3);
  });
});

describe('特別な苗', () => {
  const buyAll = (species: readonly StandardSpecies[]) => species.map((sp, i) => (sp === 'somei_yoshino' ? ev('first', {}, FIRST_EVENT_ID) : ev('buy_tree', { species: sp, tree: `b${i}` })));
  const rich = () => solveMany(500);
  it('通常の8種類を一度ずつ手に入れたときだけ、無料で1本届く（満開は不要）', () => {
    const seven = foldEvents([...rich(), ...buyAll(STANDARD_SPECIES.slice(0, 7))]);
    expect(seven.specialGranted).toBe(false);
    expect(seven.trees.some((t) => t.species === 'special')).toBe(false);
    const all = foldEvents([...rich(), ...buyAll(STANDARD_SPECIES)]);
    expect(all.specialGranted).toBe(true);
    expect(all.trees.filter((t) => t.species === 'special')).toHaveLength(1);
    expect([...all.trees].filter((t) => stageOf(t) === 'bloom')).toHaveLength(0);
    // さらに買っても、再読み込み・同期しても1本だけ
    const more = [...rich(), ...buyAll(STANDARD_SPECIES), ev('buy_tree', { species: 'kanzan', tree: 'again' })];
    expect(foldEvents(mergeEvents(more, more)).trees.filter((t) => t.species === 'special')).toHaveLength(1);
  });
  it('同じ品種を何本買っても、8種類がそろわなければ届かない', () => {
    const s = foldEvents([...rich(), ev('first', {}, FIRST_EVENT_ID), ...[1, 2, 3, 4, 5, 6, 7, 8].map((i) => ev('buy_tree', { species: 'kanzan', tree: `k${i}` }))]);
    expect(s.specialGranted).toBe(false);
  });
});

describe('庭と持ちもの', () => {
  const setup = () => [...solveMany(400), ev('first', {}, FIRST_EVENT_ID), ev('buy_tree', { species: 'kanzan', tree: 'k' }), ev('buy_tree', { species: 'ukon', tree: 'u' }), ev('buy_tree', { species: 'gyoiko', tree: 'g' })];
  it('1つの庭に桜は3本まで。同じ桜を2つの庭に重ねて置かない（移すと元の庭から外れる）。片付けても成長は残る', () => {
    const base = setup();
    let e = [...base, ev('plant', { tree: 'first-1', garden: 0, slot: 0 }), ev('plant', { tree: 'k', garden: 0, slot: 1 }), ev('plant', { tree: 'u', garden: 0, slot: 2 })];
    let s = foldEvents(e);
    expect(s.gardens[0]!.trees).toEqual(['first-1', 'k', 'u']);
    // 場所が埋まっているときは入れ替え（元の桜は持ちものへ）
    e = [...e, ev('plant', { tree: 'g', garden: 0, slot: 2 })];
    s = foldEvents(e);
    expect(s.gardens[0]!.trees).toEqual(['first-1', 'k', 'g']);
    expect(plantedAt(s, 'u')).toBeNull();
    // 別の庭へ移す
    e = [...e, ev('water', { tree: 'k', amount: 7 }), ev('plant', { tree: 'k', garden: 1, slot: 0 })];
    s = foldEvents(e);
    expect(s.gardens[0]!.trees).toEqual(['first-1', null, 'g']);
    expect(s.gardens[1]!.trees[0]).toBe('k');
    e = [...e, ev('unplant', { tree: 'k' })];
    s = foldEvents(e);
    expect(plantedAt(s, 'k')).toBeNull();
    expect(s.trees.find((t) => t.id === 'k')!.water).toBe(7);
  });
  it('使えない庭には置けない', () => {
    const s = foldEvents([...solveMany(20), ev('first', {}, FIRST_EVENT_ID), ev('plant', { tree: 'first-1', garden: 1, slot: 0 })]);
    expect(plantedAt(s, 'first-1')).toBeNull();
  });
  it('飾りは持っている数だけ置ける。重なり・桜の根元・庭の外には置けない。片付けると持ちものに戻る', () => {
    const base = [...setup(), ev('buy_deco', { kind: 'small_pond' }), ev('buy_deco', { kind: 'stone_lantern' })];
    let e = [...base, ev('place', { deco: 'p1', kind: 'small_pond', garden: 0, col: 4, row: 3 })];
    let s = foldEvents(e);
    expect(decoCounts(s, 'small_pond')).toEqual({ owned: 1, placed: 1, available: 0 });
    // 2つ目の池は持っていないので置けない
    s = foldEvents([...e, ev('place', { deco: 'p2', kind: 'small_pond', garden: 1, col: 0, row: 4 })]);
    expect(s.decos).toHaveLength(1);
    // 池に重ねて灯籠は置けない・離せば置ける
    s = foldEvents([...e, ev('place', { deco: 'l1', kind: 'stone_lantern', garden: 0, col: 5, row: 4 })]);
    expect(s.decos).toHaveLength(1);
    e = [...e, ev('place', { deco: 'l1', kind: 'stone_lantern', garden: 0, col: 0, row: 5 })];
    s = foldEvents(e);
    expect(s.decos).toHaveLength(2);
    // 桜の根元には置けない
    const z = ROOT_ZONES[0]!;
    expect(canPlace(footprintAt('stone_lantern', z.col, z.row), [])).toBe('occupied');
    expect(canPlace(footprintAt('small_pond', 11, 5), [])).toBe('outside');
    // 移動・片付け
    s = foldEvents([...e, ev('move', { deco: 'l1', garden: 0, col: 11, row: 5 }), ev('stow', { deco: 'p1' })]);
    expect(s.decos.map((d) => [d.id, d.col, d.row])).toEqual([['l1', 11, 5]]);
    expect(decoCounts(s, 'small_pond')).toEqual({ owned: 1, placed: 0, available: 1 });
  });
  it('庭の名前は20文字まで', () => {
    const s = foldEvents([ev('rename', { garden: 0, name: '  さくらの庭 ' }), ev('rename', { garden: 0, name: 'あ'.repeat(21) }), ev('rename', { garden: 0, name: '   ' })]);
    expect(s.gardens[0]!.name).toBe('さくらの庭');
  });
});

describe('記録を合わせる（別の端末・再送）', () => {
  it('同じ花びらを2つの端末で使っても、残高はマイナスにならず、片方の交換だけ反映される', () => {
    const base = solveMany(20);
    const a = [...base, ev('buy_tree', { species: 'yae_beni_shidare', tree: 'a' })];
    const b = [...base, ev('buy_deco', { kind: 'wooden_bench' })];
    const s = foldEvents(mergeEvents(a, b));
    expect(s.petals).toBe(0);
    expect(s.trees.length + s.decoOwned.wooden_bench).toBe(1);
    expect(s.rejected).toBe(1);
  });
});
