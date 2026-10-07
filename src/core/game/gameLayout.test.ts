import { describe, expect, it } from 'vitest';
import { RomajiMatcher } from '../romaji';
import { GAME_STORIES } from '../../data/gameStories';
import { GAME_KEY_CHARS, GAME_KEYS, GAME_KEYS_WIDTH } from './gameKeyboard';
import { displayLines, wordBreaks, wrapLines } from './romajiDisplay';

const ALL = [...GAME_STORIES.standard, ...GAME_STORIES.short];

describe('ゲームのキーボード', () => {
  it('英字26文字と , . - / だけを、重複なく表示する', () => {
    const chars = GAME_KEYS.map((k) => k.def.char);
    expect(new Set(chars).size).toBe(chars.length);
    expect([...chars].sort()).toEqual([...'abcdefghijklmnopqrstuvwxyz', ',', '.', '-', '/'].sort());
  });
  it('物語の入力に必要なキー（お手本と、別の正しい打ち方のキー）はすべて表示している', () => {
    const need = new Set<string>();
    for (const s of ALL) {
      for (const x of s.sentences) {
        for (const style of ['hepburn', 'kunrei'] as const) {
          for (const u of new RomajiMatcher(x.reading, style).units) for (const c of u.cands) for (const ch of c) need.add(ch);
        }
      }
    }
    // 促音・ん の別の打ち方（xtu・ltu・n'）の「'」は表示しないキー。お手本は必ず表示するキーで打てます
    need.delete("'");
    for (const ch of need) expect(GAME_KEY_CHARS.has(ch), ch).toBe(true);
    for (const s of ALL) for (const x of s.sentences) for (const style of ['hepburn', 'kunrei'] as const) {
      for (const ch of new RomajiMatcher(x.reading, style).remaining()) expect(GAME_KEY_CHARS.has(ch), `${x.id} ${ch}`).toBe(true);
    }
  });
  it('実物のキーボードの位置関係（段のずれ）を保つ：Q→A→Z は右へずれ、- は P の右上、/ は . の右', () => {
    const at = (c: string) => GAME_KEYS.find((k) => k.def.char === c)!;
    expect(at('q').x).toBe(0);
    expect(at('a').x - at('q').x).toBeCloseTo(0.25);
    expect(at('z').x - at('a').x).toBeCloseTo(0.5);
    expect(at('-').row).toBe(0);
    expect(at('-').x - at('p').x).toBeCloseTo(0.5);
    expect(at('/').x - at('.').x).toBe(1);
    expect(GAME_KEYS_WIDTH).toBeCloseTo(10.75);
    expect(at('f').def.home && at('j').def.home).toBe(true);
    expect(at('f').def.finger).toBe('L2');
  });
});

describe('読み・ローマ字の表示上の改行', () => {
  it('「、」「。」のあとで行を分け、読みとローマ字の改行位置が対応する（文章・判定は変えない）', () => {
    const lines = displayLines('うつくしいかたちには、たてものをささえるやくわりもあります。', 'hepburn', '');
    expect(lines.map((l) => l.map((u) => u.kana).join(''))).toEqual(['うつくしいかたちには、', 'たてものをささえるやくわりもあります。']);
    expect(lines.map((l) => l.map((u) => u.typed + u.next + u.rest).join(''))).toEqual(['utsukushiikatachiniha,', 'tatemonowosasaeruyakuwarimoarimasu.']);
  });
  it('拗音・促音などは1つの単位のまま（分断しない）', () => {
    const lines = displayLines('きょうかいのしゅっぱつ。', 'hepburn', '');
    expect(lines[0]!.map((u) => u.kana)).toEqual(['きょ', 'う', 'か', 'い', 'の', 'しゅ', 'っぱ', 'つ', '。']);
  });
  it('入力済みは実際に打った文字（si など）、入力中は次のキーを分けて示す。全体はガイドと一致する', () => {
    const reading = 'しんぶん、きゃく。';
    const m = new RomajiMatcher(reading, 'hepburn');
    for (const k of 'sinb') m.input(k);
    const lines = displayLines(reading, 'hepburn', m.typedText);
    const units = lines.flat();
    expect(units[0]).toMatchObject({ kana: 'し', state: 'done', typed: 'si' });
    expect(units[1]).toMatchObject({ kana: 'ん', state: 'done', typed: 'n' }); // n 1回の「ん」
    expect(units[2]).toMatchObject({ kana: 'ぶ', state: 'current', typed: 'b', next: 'u' });
    expect(units.map((u) => u.typed + u.next + u.rest).join('')).toBe(m.typedText + m.remaining());
    expect(units.find((u) => u.state === 'current')!.next).toBe(m.nextKey());
  });
  it('全部の物語・両方式で、表示の合計は判定のガイドと一致し、改行で文字数が変わらない', () => {
    for (const s of ALL) for (const x of s.sentences) for (const style of ['hepburn', 'kunrei'] as const) {
      const m = new RomajiMatcher(x.reading, style);
      const g = m.remaining();
      // 途中まで打った状態でも確かめます
      for (const k of g.slice(0, Math.floor(g.length / 2))) m.input(k);
      const units = displayLines(x.reading, style, m.typedText).flat();
      expect(units.map((u) => u.kana).join('')).toBe(x.reading);
      expect(units.map((u) => u.typed + u.next + u.rest).join(''), x.id).toBe(m.typedText + m.remaining());
      expect(units.filter((u) => u.state === 'current')).toHaveLength(1);
    }
  });

  // かな1文字を幅2、ローマ字1文字を幅1として測ります
  const kw = (s: string) => s.length * 2;
  const rw = (s: string) => s.length;
  it('長い行は、幅に収まるように単位の切れ目で分け、助詞などのあとを優先する（読みとローマ字は同じ位置）', () => {
    const base = displayLines('このきょうかいのこうじがせんはっぴゃくはちじゅうにねんにはじまったとしりました。', 'hepburn', '');
    const wrapped = wrapLines(base, kw, rw, 24);
    expect(wrapped.length).toBeGreaterThan(1);
    expect(wrapped.flat().map((u) => u.kana).join('')).toBe(base.flat().map((u) => u.kana).join(''));
    for (const line of wrapped) {
      expect(line.reduce((n, u) => n + kw(u.kana), 0)).toBeLessThanOrEqual(24);
      expect(line.reduce((n, u) => n + rw(u.model), 0)).toBeLessThanOrEqual(24);
    }
    // 最初の行は「…の」「…が」など、区切りのよいところで終わる
    expect(['の', 'が', 'に', 'は']).toContain(wrapped[0]!.at(-1)!.kana);
  });
  it('入力の途中で打ち方（si / shi）が変わっても、改行の位置は変わらない', () => {
    const reading = 'しずかなまちのしろいいしのみちをしずかにあるいていきました。';
    const shape = (typed: string) => wrapLines(displayLines(reading, 'hepburn', typed), kw, rw, 20).map((l) => l.length);
    expect(shape('si')).toEqual(shape(''));
    expect(shape('shizu')).toEqual(shape(''));
    expect(shape('sizukanamatinosiro')).toEqual(shape(''));
  });
  it('全部の物語で、分けても読みの文字数・単位の並びは変わらない', () => {
    for (const x of ALL) for (const s of x.sentences) {
      const base = displayLines(s.reading, 'hepburn', '');
      const w = wrapLines(base, kw, rw, 30);
      expect(w.flat().map((u) => u.index)).toEqual(base.flat().map((u) => u.index));
    }
  });
  it('文と読みを対応づけて、言葉の切れ目（送りがな・助詞のあとに漢字・カタカナが始まる位置）を求める', () => {
    const mark = (text: string, reading: string) => {
      const b = wordBreaks(text, reading)!;
      return [...reading].map((c, i) => (b.has(i) ? '|' : '') + c).join('');
    };
    expect(mark('案内を読み、この教会の工事が千八百八十二年に始まったと知りました。', 'あんないをよみ、このきょうかいのこうじがせんはっぴゃくはちじゅうにねんにはじまったとしりました。')).toBe(
      'あんないを|よみ、この|きょうかいの|こうじが|せんはっぴゃくはちじゅうにねんに|はじまったと|しりました。',
    );
    expect(mark('スペインのバルセロナに、大きな教会があります。', 'すぺいんのばるせろなに、おおきなきょうかいがあります。')).toBe('すぺいんの|ばるせろなに、おおきな|きょうかいがあります。');
    // 全部の物語で対応づけられる
    for (const x of ALL) for (const s of x.sentences) expect(wordBreaks(s.text, s.reading), s.id).not.toBeNull();
  });
  it('言葉の切れ目があるときは、そこで分ける（数字の読みの途中では分けない）', () => {
    const text = '案内を読み、この教会の工事が千八百八十二年に始まったと知りました。';
    const reading = 'あんないをよみ、このきょうかいのこうじがせんはっぴゃくはちじゅうにねんにはじまったとしりました。';
    const wrapped = wrapLines(displayLines(reading, 'hepburn', ''), kw, rw, 40, wordBreaks(text, reading));
    const kana = wrapped.map((l) => l.map((u) => u.kana).join(''));
    expect(kana.join('')).toBe(reading);
    expect(kana.some((l) => l.startsWith('せんはっぴゃく') || l.startsWith('こうじが'))).toBe(true);
    expect(kana.some((l) => l.endsWith('はちじゅう') || l.endsWith('はっぴゃく'))).toBe(false);
  });
});
