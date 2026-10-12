import { describe, expect, it } from 'vitest';
import data from '../../data/bowie/questions.json';
import { findUnsupportedChar, RomajiMatcher, tokenize } from '../romaji';
import { BOWIE_CONFIG, BOWIE_CUTINS, BOWIE_LEVEL_UPS, BOWIE_ROMAJI_RULES, BOWIE_TRANSFORM, CUTIN_TOTAL_MS, cutinTotalMs, FINAL_THROW_FRAMES, levelUpTotalMs, landingMsFor, pointsFor, transformIntroMs, type StageNo } from './config';
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
function runner(perStage = 20, random = seeded(7), cutinVoiceMs?: (no: number) => number, levelUpVoiceMs?: (stage: 2 | 3 | 4) => number) {
  const g = new BowieGame(drawPlay(perStage, random), 'hepburn', { perStage, cutinVoiceMs, levelUpVoiceMs });
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
    // 2〜4回目は文字入りの画像（v1.6.1）。4回目（通算70問のあと）は最終形態の「払いのける！」（v1.8.0）。ボイスはこれまでどおり
    expect(BOWIE_CUTINS.map((c) => c.image)).toEqual(['speed_cutin.webp', 'bowie_cutin_02_text.webp', 'bowie_cutin_03_text.webp', 'bowie_final_cutin_04.webp']);
    expect(BOWIE_CUTINS.map((c) => c.voice)).toEqual(['level_up', 'cutin_voice_02', 'cutin_voice_03', 'cutin_voice_04']);
    expect(BOWIE_CUTINS.map((c) => c.line)).toEqual(['少しテンポを落とそうか', '次の戦いの準備をしよう', 'さて、私が流れを変えてみせよう', '払いのける！']);
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
  it('段階アップは通算20・40・60問の解除のあとの3回（第1段階の始まりは従来の表示）。ボイスが終わるまで投球・爆弾・着弾・入力は止まり、終わってから投球', () => {
    // 段階とボイスの対応（ファイル名で厳守）：第2段階＝212302、第3段階＝212407、第4段階＝212220
    expect(BOWIE_LEVEL_UPS[2]).toMatchObject({ title: 'ボウイ覚醒', level: 'LEVEL 02', voice: 'levelup_voice_2', voiceMs: 3500 });
    expect(BOWIE_LEVEL_UPS[3]).toMatchObject({ title: '力の解放', level: 'LEVEL 03', voice: 'levelup_voice_3', voiceMs: 3762 });
    expect(BOWIE_LEVEL_UPS[4]).toMatchObject({ title: '終焉の遊戯', level: 'FINAL LEVEL', voice: 'levelup_voice_4', voiceMs: 1541 });
    const r = runner();
    const first = r.events.find((e) => e.type === 'stage') as Extract<BowieEvent, { type: 'stage' }>;
    expect(first).toMatchObject({ stage: 1, levelUp: false });
    expect(r.g.introMs).toBe(BOWIE_CONFIG.stageIntroMs);
    const ups: { solved: number; stage: number; ms: number }[] = [];
    for (let i = 0; i < 80; i++) {
      r.solve(1);
      if (r.g.phase === 'intro') {
        const stage = r.g.stage as 2 | 3 | 4;
        const len = stage === 4 ? transformIntroMs(BOWIE_LEVEL_UPS[stage].voiceMs) : levelUpTotalMs(BOWIE_LEVEL_UPS[stage].voiceMs);
        ups.push({ solved: r.g.solved, stage, ms: r.g.introMs });
        expect(r.g.introMs).toBe(len);
        // 演出の終わりの直前まで：投球しない・爆弾は出ない・キーは捨てる（次の問題へ持ち越さない）
        const start = r.now();
        r.at(start + len - 5);
        expect(r.g.phase).toBe('intro');
        expect(r.g.progress(r.now())).toBe(0);
        for (const c of 'abcdefg') r.key(c);
        expect(r.g.matcher).toBeNull();
        r.at(start + len + 1);
        expect(r.g.phase).toBe('throwing');
        r.toRelease();
        // 次の問題は最初から（途中の入力・時間を持ち越さない）
        expect(r.g.matcher!.typedText).toBe('');
        expect(r.g.progress(r.now())).toBeLessThan(0.01);
      }
    }
    expect(ups.map((u) => [u.solved, u.stage])).toEqual([[20, 2], [40, 3], [60, 4]]);
    expect(r.events.filter((e) => e.type === 'stage').map((e) => (e as { levelUp: boolean }).levelUp)).toEqual([false, true, true, true]);
    expect(r.g.phase).toBe('won');
  });
  it('段階アップのボイスの実際の長さが登録より長いときは、そちらに合わせる', () => {
    const r = runner(2, seeded(5), undefined, (st) => (st === 3 ? 5000 : 10));
    const lens: number[] = [];
    for (let i = 0; i < 8; i++) {
      r.solve(1);
      if (r.g.phase === 'intro') {
        lens.push(r.g.introMs);
        r.at(r.now() + r.g.introMs + 1);
      }
      if (r.g.phase === 'cutin') r.at(r.now() + r.g.cutinMs + 1);
    }
    expect(lens).toEqual([levelUpTotalMs(3500), levelUpTotalMs(5000), transformIntroMs(1541)]);
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

describe('最終形態への変身（v1.8.0）', () => {
  it('59問の解除までは通常。60問の解除のあとの段階アップ（第4段階の始まり）の中で、閃光のピークに1回だけ変身し、勝敗が決まるまで続く', () => {
    const r = runner();
    let transforms = 0;
    for (let i = 0; i < 80; i++) {
      r.solve(1);
      transforms = r.events.filter((e) => e.type === 'transform').length;
      if (r.g.solved <= 59) {
        expect(r.g.finalForm, `solved ${r.g.solved}`).toBe(false);
        expect(transforms).toBe(0);
      }
      if (r.g.solved === 60) {
        // 段階アップが始まった時点ではまだ通常。ピークの直前まで通常で、ピークで最終形態
        expect(r.g.phase).toBe('intro');
        expect(r.g.stage).toBe(4);
        const stageEv = r.events.filter((e) => e.type === 'stage').at(-1) as Extract<BowieEvent, { type: 'stage' }>;
        expect(stageEv).toMatchObject({ stage: 4, levelUp: true, transform: true });
        expect(r.g.finalForm).toBe(false);
        const start = r.now();
        r.at(start + BOWIE_TRANSFORM.peakAtMs - 1);
        expect(r.g.finalForm).toBe(false);
        r.at(start + BOWIE_TRANSFORM.peakAtMs);
        expect(r.g.finalForm).toBe(true);
        const tf = r.events.filter((e) => e.type === 'transform');
        expect(tf).toHaveLength(1);
        expect((tf[0] as { at: number }).at).toBe(stageEv.at + BOWIE_TRANSFORM.peakAtMs);
      }
      if (r.g.solved >= 60) expect(r.g.finalForm).toBe(true);
    }
    expect(r.g.phase).toBe('won');
    expect(r.g.finalForm).toBe(true);
    expect(r.events.filter((e) => e.type === 'transform')).toHaveLength(1);
    // 第2・第3段階の段階アップでは変身しない
    expect(r.events.filter((e) => e.type === 'stage').map((e) => (e as { transform: boolean }).transform)).toEqual([false, false, false, true]);
  });
  it('段階アップの長さは、ボイスの終わりと変身の余韻の終わりの遅い方（ボイスを途中で切らない）。そのあいだの入力は判定・ミス数・次の問題へ持ち越さない', () => {
    // 登録の長さ（1.541秒）：ボイスの終わり（0.45＋1.541＋0.3）が変身の余韻の終わり（0.82＋0.52＋0.3）より遅い
    expect(transformIntroMs(1541)).toBe(BOWIE_TRANSFORM.bgmFadeMs + levelUpTotalMs(1541));
    expect(transformIntroMs(100)).toBe(BOWIE_TRANSFORM.peakAtMs + BOWIE_TRANSFORM.settleMs + BOWIE_CONFIG.levelUp.tailMs);
    // ボイスが短く読み込まれた場合でも、変身の余韻が終わるまで投球しない
    const r = runner(1, seeded(9), undefined, () => 50);
    for (let i = 0; i < 3; i++) {
      r.solve(1);
      if (r.g.phase === 'intro' && r.g.stage !== 4) r.at(r.now() + r.g.introMs + 1);
    }
    expect(r.g.stage).toBe(4);
    expect(r.g.introMs).toBe(transformIntroMs(BOWIE_LEVEL_UPS[4].voiceMs));
    const start = r.now();
    const before = { c: r.g.correctKeyCount, m: r.g.mistypeCount };
    for (const ms of [100, BOWIE_TRANSFORM.peakAtMs, BOWIE_TRANSFORM.peakAtMs + 200]) {
      r.at(start + ms);
      for (const c of 'zzqxa') r.key(c);
    }
    expect({ c: r.g.correctKeyCount, m: r.g.mistypeCount }).toEqual(before);
    expect(r.g.matcher).toBeNull();
    r.at(start + r.g.introMs - 1);
    expect(r.g.phase).toBe('intro');
    r.at(start + r.g.introMs + 1);
    expect(r.g.phase).toBe('throwing');
    r.toRelease();
    expect(r.g.matcher!.typedText).toBe('');
  });
  it('一時停止すると変身のピークも止まる（再開後に1回だけ）。再挑戦（新しいゲーム）は通常から', () => {
    const r = runner(1);
    for (let i = 0; i < 3; i++) {
      r.solve(1);
      if (r.g.phase === 'intro' && r.g.stage !== 4) r.at(r.now() + r.g.introMs + 1);
    }
    const start = r.now();
    r.at(start + 300);
    expect(r.g.pause(r.now())).toBe(true);
    r.at(r.now() + 10_000);
    expect(r.g.finalForm).toBe(false);
    r.g.resume(r.now());
    r.at(r.now() + BOWIE_TRANSFORM.peakAtMs - 300 - 1);
    expect(r.g.finalForm).toBe(false);
    r.at(r.now() + 2);
    expect(r.g.finalForm).toBe(true);
    r.at(r.now() + 5000);
    expect(r.events.filter((e) => e.type === 'transform')).toHaveLength(1);
    const again = runner(1);
    expect(again.g.finalForm).toBe(false);
    expect(again.g.transformPending).toBe(false);
  });
  it('最終形態の投球も 350ms（構える約110ms・送り出す約120ms・放つ約120ms）。手を離れた瞬間に入力と飛行の計時が始まる', () => {
    expect(BOWIE_CONFIG.throwMs).toBe(350);
    expect(FINAL_THROW_FRAMES.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 6);
    expect(FINAL_THROW_FRAMES.map((f) => Math.round(f * BOWIE_CONFIG.throwMs))).toEqual([110, 120, 120]);
    const r = runner(1);
    for (let i = 0; i < 3; i++) {
      r.solve(1);
      if (r.g.phase === 'intro') r.at(r.now() + r.g.introMs + 1);
    }
    expect(r.g.finalForm).toBe(true);
    expect(r.g.phase).toBe('throwing');
    const throwAt = r.g.phaseStart;
    r.toRelease();
    const rel = r.events.filter((e) => e.type === 'release').at(-1) as Extract<BowieEvent, { type: 'release' }>;
    expect(rel.at - throwAt).toBe(BOWIE_CONFIG.throwMs);
    expect(r.g.releaseAt).toBe(rel.at);
    expect(r.g.matcher).not.toBeNull();
  });
});

describe('戦績の集計（正しい入力・ミスタイプ）', () => {
  it('飛行中に判定が受け付けたキーは正しい入力、ミスはミスタイプ。無視・投球前・カットイン・段階アップのキーは数えない。最後の解除のキーを含める', () => {
    const r = runner(2);
    // 投球前（段階の表示中）のキーは数えない
    for (const c of 'abc') r.key(c);
    expect([r.g.correctKeyCount, r.g.mistypeCount]).toEqual([0, 0]);
    r.toRelease();
    const rem = r.g.matcher!.remaining();
    r.key(';'); // ミスタイプ
    r.key('ab'); // 2文字は判定に届かず無視（数えない）
    for (const c of rem) r.key(c); // 最後の解除のキーまで
    expect(r.g.solved).toBe(1);
    expect(r.g.mistypeCount).toBe(1);
    expect(r.g.correctKeyCount).toBe(rem.length);
    // カットイン中のキーは数えない
    expect(r.g.phase).toBe('cutin');
    for (const c of 'zzz') r.key(c);
    expect([r.g.correctKeyCount, r.g.mistypeCount]).toEqual([rem.length, 1]);
  });
  it('別の正しい打ち方（si / shi など）はミスにしない。着弾と同時のキーは数えない。勝敗のあとは変わらない。新しいゲームは0から', () => {
    const r = runner(2);
    r.toRelease();
    const units = r.g.matcher!.units;
    const rem = r.g.matcher!.remaining();
    expect(units.length).toBeGreaterThan(0);
    // 最後の1文字の手前まで打ち、着弾の時刻ちょうどに最後のキー（衝突が優先され、数えません）
    for (const c of rem.slice(0, -1)) r.key(c);
    const before = r.g.correctKeyCount;
    r.at(r.g.releaseAt + r.g.landingMs + (r.now() - r.g.gameTime(r.now())));
    r.key(rem.at(-1)!);
    expect(r.g.phase).toBe('hit');
    expect(r.g.correctKeyCount).toBe(before);
    r.key('a');
    expect(r.g.correctKeyCount).toBe(before);
    expect(r.g.mistypeCount).toBe(0);
    const again = runner(2);
    expect([again.g.correctKeyCount, again.g.mistypeCount]).toEqual([0, 0]);
    // 別表記
    const m = new BowieGame([[{ id: 't', text: '詩', reading: 'し', readingSegments: ['し'], kind: 'word', keystrokes: 3 } as unknown as BowieQuestion], [], [], []], 'hepburn', { perStage: 1 });
    let t = 0;
    m.start(t);
    for (; m.phase !== 'flying' && t < 5000; t += 10) m.update(t);
    m.input('s', t);
    m.input('i', t);
    expect([m.correctKeyCount, m.mistypeCount]).toEqual([2, 0]);
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
