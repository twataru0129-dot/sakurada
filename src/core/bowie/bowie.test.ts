import { describe, expect, it } from 'vitest';
import data from '../../data/bowie/questions.json';
import { findUnsupportedChar, RomajiMatcher, tokenize } from '../romaji';
import { BOWIE_CONFIG, BOWIE_CUTINS, BOWIE_ROMAJI_RULES, CUTIN_TOTAL_MS, cutinTotalMs, landingMsFor, pointsFor, type StageNo } from './config';
import { BOWIE_POOLS, drawPlay, drawQuestions, type BowieQuestion } from './questions';
import { BowieGame, type BowieEvent } from './engine';
import { displaySegments } from './display';

const seeded = (seed: number) => () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const typeAll = (m: RomajiMatcher, s: string) => [...s].map((c) => m.input(c));
/** このモードの判定（「ん」は NN、「づ」は DU・ZU） */
const bm = (reading: string) => new RomajiMatcher(reading, 'hepburn', BOWIE_ROMAJI_RULES);

describe('問題データ（questions.json をそのまま使う）', () => {
  it('登録数は 111・106・113・110。ID は重複せず、読みはすべて既存のローマ字判定で入力できる', () => {
    expect([1, 2, 3, 4].map((s) => BOWIE_POOLS[s as StageNo].length)).toEqual([111, 106, 113, 110]);
    const all = Object.values(BOWIE_POOLS).flat();
    expect(new Set(all.map((q) => q.id)).size).toBe(440);
    for (const q of all) expect(findUnsupportedChar(q.reading), q.id).toBeNull();
  });
  it('単語は標準表示の打鍵数 5〜8・9〜12・13〜18 で段階分けされている', () => {
    const range: Record<number, [number, number]> = { 1: [5, 8], 2: [9, 12], 3: [13, 18] };
    for (const s of [1, 2, 3] as StageNo[])
      for (const q of BOWIE_POOLS[s]) {
        expect(q.keystrokes, q.id).toBeGreaterThanOrEqual(range[s]![0]);
        expect(q.keystrokes, q.id).toBeLessThanOrEqual(range[s]![1]);
      }
  });
  it('データの表示例のローマ字（例：SAMURAI）は、「ん」を NN にすればこのモードの判定でそのまま最後まで入力できる（「づ」の ZU も正解）', () => {
    // このモードの「ん」は NN だけです。表示例で N 1つになっている「ん」だけ N を足して打ちます（ほかの文字は表示例のまま）
    const zuIds: string[] = [];
    for (const st of data.stages)
      for (const q of st.questions as { id: string; reading: string; romaji: string }[]) {
        const m = bm(q.reading);
        for (const c of q.romaji.toLowerCase().replace(/[^a-z\-]/g, '')) {
          let r = m.input(c);
          if (r === 'miss' && m.units[m.unitIndex]!.isN && m.nextKey() === 'n') {
            expect(m.input('n'), q.id).toBe('correct');
            r = m.input(c);
          }
          expect(r, `${q.id} ${q.romaji} @${m.typedText}`).toBe('correct');
        }
        expect(m.done, q.id).toBe(true);
        if (q.reading.includes('づ')) zuIds.push(q.id);
        // お手本どおりに打っても最後まで入力できる。お手本の「ん」はすべて NN、「づ」は DU
        const g = bm(q.reading);
        const guide = g.remaining();
        expect(typeAll(g, guide).every((x) => x === 'correct') && g.done, q.id).toBe(true);
        const nn = [...q.reading].filter((c) => c === 'ん').length;
        expect(tokenize(q.reading, 'hepburn', BOWIE_ROMAJI_RULES).filter((u) => u.isN).every((u) => u.cands.join() === 'nn'), q.id).toBe(true);
        expect(nn === 0 || guide.includes('nn'), q.id).toBe(true);
      }
    // 表示例が「づ」を ZU と書いている3問も、ZU のまま入力できる（お手本は DU）
    expect(zuIds).toEqual(expect.arrayContaining(['sentence_030', 'sentence_056', 'sentence_057']));
    for (const id of zuIds) expect(bm(BOWIE_POOLS[4].find((x) => x.id === id)!.reading).remaining(), id).toContain('du');
    // ほかのモード（決まりを渡さない判定）は変わらない：「づ」は DU だけ
    const other = new RomajiMatcher('つづく', 'hepburn');
    expect(typeAll(other, 'tsuz')).toEqual(['correct', 'correct', 'correct', 'miss']);
  });
  it('文章の読みのまとまりをつなぐと読みと一致する。確認済みの読み（79・84・86・110）と原文（10の「賢い物」）を変えていない', () => {
    for (const q of BOWIE_POOLS[4]) expect(q.readingSegments.join(''), q.id).toBe(q.reading);
    const byNo = (n: number) => BOWIE_POOLS[4].find((q) => q.id === `sentence_${String(n).padStart(3, '0')}`)!;
    expect(byNo(79).reading).toContain('はかない');
    expect(byNo(84).reading).toBe('さんぜんせかいゆいがどくそん');
    expect(byNo(86).reading).toBe('ごうほうのきをごうまつよりしょうす');
    expect(byNo(110).reading).toContain('あじあわせ');
    expect(byNo(10).text).toContain('賢い物');
  });
});

describe('出題', () => {
  it('各段階 20 問を重複なしで選び、順番もランダム。1回のプレイは 80 問', () => {
    const play = drawPlay(20, seeded(3));
    expect(play.map((s) => s.length)).toEqual([20, 20, 20, 20]);
    play.forEach((s, i) => {
      expect(new Set(s.map((q) => q.id)).size).toBe(20);
      expect(s.every((q) => q.stage === i + 1)).toBe(true);
    });
    expect(play.flat()).toHaveLength(80);
    const other = drawPlay(20, seeded(99));
    expect(other[0]!.map((q) => q.id)).not.toEqual(play[0]!.map((q) => q.id));
    // 同じ20問でも出題の順番が変わる
    const pool = BOWIE_POOLS[1].slice(0, 20);
    expect(drawQuestions(pool, 20, seeded(1)).map((q) => q.id)).not.toEqual(pool.map((q) => q.id));
  });
});

describe('着弾時間と得点', () => {
  it('段階ごとの前半（1〜10問目）・後半（11〜20問目）の着弾時間', () => {
    expect([1, 2, 3, 4].map((s) => [landingMsFor(s as StageNo, 1), landingMsFor(s as StageNo, 10), landingMsFor(s as StageNo, 11), landingMsFor(s as StageNo, 20)])).toEqual([
      [5000, 5000, 4500, 4500],
      [6000, 6000, 5500, 5500],
      [7000, 7000, 6500, 6500],
      [15000, 15000, 14000, 14000],
    ]);
  });
  it('単語は10段階（10〜1点）、文章は20段階（20〜1点）。境界は次の段階へ。p≥1 は衝突で得点なし', () => {
    for (let k = 0; k < 10; k++) {
      expect(pointsFor(10, k / 10)).toBe(10 - k);
      expect(pointsFor(10, k / 10 + 0.05)).toBe(10 - k);
      expect(pointsFor(10, (k + 1) / 10 - 1e-6)).toBe(10 - k);
    }
    for (let k = 0; k < 20; k++) expect(pointsFor(20, k / 20 + 0.01)).toBe(20 - k);
    expect(pointsFor(10, 0)).toBe(10);
    expect(pointsFor(20, 0.999999)).toBe(1);
    expect(pointsFor(10, 1)).toBeNull();
    expect(pointsFor(20, 1.2)).toBeNull();
    expect(new Set(Array.from({ length: 1000 }, (_, i) => pointsFor(20, i / 1000))).size).toBe(20);
  });
});

/** ゲームを時刻つきで動かす道具 */
function runner(perStage = 20, random = seeded(7), cutinVoiceMs?: (no: number) => number) {
  const g = new BowieGame(drawPlay(perStage, random), 'hepburn', { perStage, cutinVoiceMs });
  let t = 1000;
  const events: BowieEvent[] = [];
  const at = (ms: number) => {
    t = ms;
    events.push(...g.update(t));
  };
  const key = (c: string) => events.push(...g.input(c, t));
  /** 次の爆弾が放たれるまで時間を進めます */
  const toRelease = () => {
    for (let i = 0; i < 2000 && g.phase !== 'flying'; i++) at(t + 10);
  };
  const solve = (afterMs = 100) => {
    toRelease();
    at(t + afterMs);
    for (const c of g.matcher!.remaining()) key(c);
  };
  events.push(...g.start(t));
  return { g, events, at, key, solve, toRelease, now: () => t };
}

describe('進行', () => {
  it('80問をすべて解除すると勝利。カットインは各段階の10問目のあとに1回ずつ、全4回。得点は最大1000点', () => {
    const r = runner();
    for (let i = 0; i < 80; i++) r.solve(1);
    expect(r.g.phase).toBe('won');
    expect(r.g.solved).toBe(80);
    expect(r.events.filter((e) => e.type === 'cutin')).toHaveLength(4);
    expect(r.events.filter((e) => e.type === 'won')).toHaveLength(1);
    expect(r.events.filter((e) => e.type === 'disarm')).toHaveLength(80);
    expect(r.g.score).toBe(60 * 10 + 20 * 20);
    // カットインは10問目の解除の直後（11問目の投球の前）
    const order = r.events.filter((e) => e.type === 'disarm' || e.type === 'cutin').map((e) => e.type);
    expect(order.indexOf('cutin')).toBe(10);
  });
  it('着弾時間は前半・後半で切り替わり、カットインの時間は飛行時間に含まない', () => {
    const r = runner();
    const landings: number[] = [];
    for (let i = 0; i < 11; i++) {
      r.toRelease();
      landings.push(r.g.landingMs);
      r.solve(1);
    }
    expect(landings.slice(0, 10).every((v) => v === 5000)).toBe(true);
    expect(landings[10]).toBe(4500);
    // カットインの開始から、全体の長さ＋投球の動作のあとに11問目が放たれる
    const cut = r.events.find((e) => e.type === 'cutin')!;
    const rel = r.events.filter((e) => e.type === 'release')[10]!;
    expect(rel.at - cut.at).toBe(CUTIN_TOTAL_MS + BOWIE_CONFIG.throwMs);
  });
  it('着弾の時刻ちょうどの入力は衝突を優先する（得点なし・二重処理なし）', () => {
    const r = runner();
    r.toRelease();
    const rem = r.g.matcher!.remaining();
    for (const c of rem.slice(0, -1)) r.key(c);
    // 着弾のゲーム時刻ちょうどの実時刻へ
    r.at(r.g.releaseAt + r.g.landingMs + (r.now() - r.g.gameTime(r.now())));
    r.key(rem.slice(-1));
    expect(r.g.phase).toBe('hit');
    expect(r.events.filter((e) => e.type === 'hit')).toHaveLength(1);
    expect(r.events.filter((e) => e.type === 'disarm')).toHaveLength(0);
    expect(r.g.score).toBe(0);
    r.at(r.now() + 5000);
    expect(r.events.filter((e) => e.type === 'hit')).toHaveLength(1);
  });
  it('解除した時刻の進み具合で得点（早いほど高い）。危険の知らせは同じ爆弾で1回', () => {
    const r = runner();
    r.toRelease();
    const start = r.now();
    r.at(start + 2600); // p = 0.52 → 5点
    r.at(start + 4100); // p = 0.82 → 危険
    r.at(start + 4200);
    expect(r.events.filter((e) => e.type === 'danger')).toHaveLength(1);
    for (const c of r.g.matcher!.remaining()) r.key(c);
    const d = r.events.find((e) => e.type === 'disarm') as Extract<BowieEvent, { type: 'disarm' }>;
    expect(d.points).toBe(Math.max(1, Math.ceil(10 * (1 - 4200 / 5000) - 1e-9)));
  });
  it('投球中のキーは捨てる（次の問題へためない）。ミスは進まず減点なし。最後のキーが次の問題に入らない', () => {
    const r = runner();
    r.at(r.now() + BOWIE_CONFIG.stageIntroMs + 10);
    expect(r.g.phase).toBe('throwing');
    r.key('s');
    r.toRelease();
    expect(r.g.matcher!.typedText).toBe('');
    r.key('q');
    r.key(';');
    expect(r.events.filter((e) => e.type === 'typo').length).toBeGreaterThan(0);
    expect(r.g.score).toBe(0);
    const rem = r.g.matcher!.remaining();
    for (const c of rem) r.key(c);
    expect(r.g.phase).toBe('throwing');
    r.key(rem.slice(-1));
    r.toRelease();
    expect(r.g.matcher!.typedText).toBe('');
  });
  it('一時停止の時間は飛行時間に入らない（進み具合は止まり、再開後も同じ）', () => {
    const r = runner();
    r.toRelease();
    r.at(r.now() + 1000);
    const p = r.g.progress(r.now());
    expect(r.g.pause(r.now())).toBe(true);
    r.at(r.now() + 60_000);
    expect(r.g.progress(r.now())).toBeCloseTo(p, 6);
    expect(r.g.phase).toBe('paused');
    r.key('a');
    expect(r.g.resume(r.now())).toBe(true);
    expect(r.g.progress(r.now())).toBeCloseTo(p, 6);
    r.at(r.now() + 500);
    expect(r.g.progress(r.now())).toBeCloseTo(p + 0.1, 6);
    expect(r.g.phase).toBe('flying');
  });
  it('カットインは通算10・30・50・70問目のあとの4回。回ごとに決まったセリフの長さに合わせて保持し、そのあいだ爆弾・着弾・投球は止まる', () => {
    // 1回目は従来どおり約 2.2 秒（0.25＋1.541＋0.16＋0.25）。2〜4回目はセリフ（2.43・3.37・1.78 秒）が最後まで終わってから抜けます
    expect(CUTIN_TOTAL_MS).toBe(2201);
    expect(BOWIE_CUTINS.map((c) => c.image)).toEqual(['speed_cutin.webp', 'bowie_cutin_02.webp', 'bowie_cutin_03.webp', 'bowie_cutin_04.webp']);
    expect(BOWIE_CUTINS.map((c) => c.voice)).toEqual(['level_up', 'cutin_voice_02', 'cutin_voice_03', 'cutin_voice_04']);
    expect(BOWIE_CUTINS.slice(1).every((c) => c.line === '')).toBe(true);
    const r = runner();
    const solvedAt: number[] = [];
    for (let i = 0; i < 80; i++) {
      r.solve(1);
      if (r.g.phase === 'cutin') {
        solvedAt.push(r.g.solved);
        const no = r.g.cutinCount;
        const len = cutinTotalMs(BOWIE_CUTINS[no - 1]!.voiceMs);
        expect(r.g.cutinMs, `cutin ${no}`).toBe(len);
        expect(len).toBe(BOWIE_CONFIG.cutin.entryMs + BOWIE_CUTINS[no - 1]!.voiceMs + BOWIE_CONFIG.cutin.tailMs + BOWIE_CONFIG.cutin.exitMs);
        // カットインの終わりの直前まで：爆弾は出ず、進み具合 0、着弾しない。キーも受け付けない
        const start = r.now();
        r.at(start + len - 5);
        expect(r.g.phase).toBe('cutin');
        expect(r.g.progress(r.now())).toBe(0);
        r.key('a');
        expect(r.events.some((e) => e.type === 'hit')).toBe(false);
        r.at(start + len + 1);
        expect(r.g.phase).toBe('throwing');
        // 投げ直した爆弾は 0 から（カットインの時間は足されません）
        r.toRelease();
        expect(r.g.progress(r.now())).toBeLessThan(0.01);
      }
    }
    expect(solvedAt).toEqual([10, 30, 50, 70]);
    expect(r.events.filter((e) => e.type === 'cutin').map((e) => (e as { no: number }).no)).toEqual([1, 2, 3, 4]);
    expect(r.g.phase).toBe('won');
  });
  it('セリフの実際の長さが登録より長いときは、そちらに合わせる（短いときは登録の長さのまま）', () => {
    const r = runner(2, seeded(3), (no) => (no === 3 ? 4000 : 100));
    const lens: number[] = [];
    for (let i = 0; i < 8; i++) {
      r.solve(1);
      if (r.g.phase === 'cutin') lens.push(r.g.cutinMs);
      if (r.g.phase === 'cutin') r.at(r.now() + r.g.cutinMs + 1);
    }
    expect(lens).toEqual([cutinTotalMs(1541), cutinTotalMs(2429), cutinTotalMs(4000), cutinTotalMs(1776)]);
  });
  it('カットイン中は時間が進んでも投球しない。一時停止するとカットインの残りも止まる', () => {
    const r = runner(2);
    r.solve(1);
    expect(r.g.phase).toBe('cutin');
    const cutAt = r.now();
    r.at(cutAt + CUTIN_TOTAL_MS - 10);
    expect(r.g.phase).toBe('cutin');
    r.g.pause(r.now());
    r.at(r.now() + 10_000);
    r.g.resume(r.now());
    r.at(r.now() + 20);
    expect(r.g.phase).toBe('throwing');
  });
});

describe('ローマ字の別表記・ん・促音・長音・文節の表示', () => {
  const m = bm;
  it('し・ち・つ・ふ・じ・しゃ の別表記', () => {
    for (const [reading, typed] of [['しちつふじしゃ', 'sitituhuzisya'], ['しちつふじしゃ', 'shichitsufujisha']] as const) {
      const x = m(reading);
      expect(typeAll(x, typed).every((r) => r === 'correct')).toBe(true);
      expect(x.done).toBe(true);
    }
  });
  it('「ん」はすべて NN：語末・子音・母音・や行・な行の前も同じ。N 1回・N\' では確定せず、1回目の N は入力の途中', () => {
    const cases: [string, string][] = [
      ['かん', 'kann'],
      ['かんい', 'kanni'],
      ['しんよう', 'shinnyou'],
      ['きんにく', 'kinnniku'],
      ['かんな', 'kannna'],
      ['さんぜん', 'sannzenn'],
    ];
    for (const [reading, typed] of cases) {
      const x = bm(reading);
      expect(typeAll(x, typed).every((r) => r === 'correct'), reading).toBe(true);
      expect(x.done, reading).toBe(true);
    }
    // 1回目の N は正しい入力の途中。2回目の N で「ん」が確定します
    const a = bm('かん');
    typeAll(a, 'kan');
    expect(a.done).toBe(false);
    expect(a.unitIndex).toBe(1);
    expect(a.remaining()).toBe('n');
    expect(a.input('n')).toBe('correct');
    expect(a.done).toBe(true);
    // N 1回のあとに次の文字・N' ・XN は受け付けません（語末も、子音の前も）
    for (const [reading, typed, bad] of [
      ['さんぜん', 'san', 'z'],
      ['かんい', 'kan', 'i'],
      ['しんよう', 'shin', 'y'],
      ['かん', 'kan', "'"],
    ] as const) {
      const x = bm(reading);
      typeAll(x, typed);
      expect(x.input(bad), `${reading} ${typed}+${bad}`).toBe('miss');
      expect(x.remaining().startsWith('n'), reading).toBe(true);
    }
    expect(typeAll(bm('かん'), 'kaxn')).toEqual(['correct', 'correct', 'miss', 'correct']);
    // 「きんにく」の NNN：ん の NN と に の N を混同しない（N 2回で ん、3回目は に の N）
    const k = bm('きんにく');
    typeAll(k, 'kinn');
    expect(k.unitIndex).toBe(2);
    expect(k.remaining()).toBe('niku');
    // ほかのモード（決まりを渡さない判定）は変わらない：子音の前は N 1回でもよい
    const other = new RomajiMatcher('さんぜん', 'hepburn');
    expect(typeAll(other, 'sanzenn').every((r) => r === 'correct') && other.done).toBe(true);
  });
  it('「づ」は DU・ZU のどちらも正解で、ZU で打つと表示も追従する。「ず」は ZU だけ（DU は不正解）', () => {
    for (const t of ['tsuduku', 'tsuzuku']) {
      const x = bm('つづく');
      expect(typeAll(x, t).every((r) => r === 'correct') && x.done, t).toBe(true);
    }
    const x = bm('つづく');
    expect(x.remaining()).toBe('tsuduku');
    typeAll(x, 'tsuz');
    expect(x.remaining()).toBe('uku');
    const q = { reading: 'つづく', readingSegments: ['つづく'] } as BowieQuestion;
    expect(displaySegments(q, 'hepburn', '')[0]!.units.map((u) => u.typed + u.next + u.rest).join('')).toBe('tsuduku');
    const d = displaySegments(q, 'hepburn', 'tsuz')[0]!.units;
    expect(d[1]).toMatchObject({ state: 'current', typed: 'z', next: 'u', rest: '' });
    const z = bm('すずめ');
    expect(typeAll(z, 'sud')).toEqual(['correct', 'correct', 'miss']);
    expect(typeAll(z, 'zume').every((r) => r === 'correct') && z.done).toBe(true);
    // 促音つき（っづ）も DDU・ZZU
    for (const t of ['kadduku', 'kazzuku']) expect(typeAll(bm('かっづく'), t).every((r) => r === 'correct'), t).toBe(true);
  });
  it('促音（っ）と長音（ー → -）', () => {
    const a = m('ちってもぴあのそなーた');
    expect(typeAll(a, 'chittemopianosona-ta').every((r) => r === 'correct')).toBe(true);
    expect(a.done).toBe(true);
    const b = m('ちっても');
    expect(typeAll(b, 'chixtutemo').every((r) => r === 'correct')).toBe(true);
  });
  it('文章のまとまりの表示も NN：1回目の N は「ん」の入力済み、次の N も同じ「ん」。まとまりの境目で隣の N と混ざらない', () => {
    const q = { reading: 'さんぜんなみだ', readingSegments: ['さんぜん', 'なみだ'] } as BowieQuestion;
    const all = (t: string) => displaySegments(q, 'hepburn', t).map((s) => s.units.map((u) => u.typed + u.next + u.rest).join(''));
    expect(all('')).toEqual(['sannzenn', 'namida']);
    const s1 = displaySegments(q, 'hepburn', 'san');
    expect(s1[0]!.units[1]).toMatchObject({ kana: 'ん', state: 'current', typed: 'n', next: 'n' });
    // 語末の「ん」の N 2回で前のまとまりが終わり、3回目の N は「な」の N
    const s2 = displaySegments(q, 'hepburn', 'sannzenn');
    expect(s2[0]!.units.every((u) => u.state === 'done')).toBe(true);
    expect(s2[1]!.units[0]).toMatchObject({ kana: 'な', state: 'current', typed: '', next: 'n', rest: 'a' });
    const s3 = displaySegments(q, 'hepburn', 'sannzennn');
    expect(s3[1]!.units[0]).toMatchObject({ kana: 'な', typed: 'n', next: 'a' });
    expect(all('sannzennn')).toEqual(['sannzenn', 'namida']);
  });
  it('文章は読みのまとまりで表示し、別表記で打つと残りの表示も追従する', () => {
    const q = { reading: 'さむらいがしろをまもる', readingSegments: ['さむらいが', 'しろを', 'まもる'] } as BowieQuestion;
    const s0 = displaySegments(q, 'hepburn', '');
    expect(s0.map((s) => s.units.map((u) => u.typed + u.next + u.rest).join(''))).toEqual(['samuraiga', 'shirowo', 'mamoru']);
    const s1 = displaySegments(q, 'hepburn', 'samuraigasi');
    expect(s1[1]!.units.map((u) => u.typed + u.next + u.rest).join('')).toBe('sirowo');
    expect(s1[0]!.units.every((u) => u.state === 'done')).toBe(true);
  });
});
