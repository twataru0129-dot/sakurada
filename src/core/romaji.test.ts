import { describe, expect, it } from 'vitest';
import { RomajiMatcher, findUnsupportedChar, tokenize } from './romaji';

/** keys を順に打ち、ミス数と完了したかを返します */
function type(reading: string, keys: string) {
  const m = new RomajiMatcher(reading);
  let miss = 0;
  let correct = 0;
  for (const k of keys) {
    const r = m.input(k);
    if (r === 'miss') miss++;
    if (r === 'correct') correct++;
  }
  return { done: m.done, miss, correct, m };
}

function accepts(reading: string, keys: string) {
  const r = type(reading, keys);
  return r.done && r.miss === 0;
}

describe('複数の正しい打ち方', () => {
  it.each([
    ['し', 'shi'], ['し', 'si'], ['し', 'ci'],
    ['ち', 'chi'], ['ち', 'ti'],
    ['つ', 'tsu'], ['つ', 'tu'],
    ['ふ', 'fu'], ['ふ', 'hu'],
    ['しゃ', 'sha'], ['しゃ', 'sya'], ['しゃ', 'shixya'], ['しゃ', 'silya'],
    ['じゃ', 'ja'], ['じゃ', 'jya'], ['じゃ', 'zya'],
    ['ちょ', 'cho'], ['ちょ', 'tyo'], ['ちょ', 'cyo'],
    ['か', 'ca'], ['く', 'qu'], ['せ', 'ce'],
    ['じ', 'ji'], ['じ', 'zi'],
    ['ふぁ', 'fa'], ['ふぁ', 'fuxa'], ['てぃ', 'thi'], ['でぃ', 'dhi'], ['うぃ', 'wi'],
    ['ゔぁ', 'va'], ['きゃ', 'kixya'], ['ぁ', 'xa'], ['ぁ', 'la'],
  ])('%s を %s で入力できる', (reading, keys) => {
    expect(accepts(reading, keys)).toBe(true);
  });

  it('入力途中で表記を切り替えると、ガイドも実際の入力に合わせて更新される', () => {
    const m = new RomajiMatcher('しゃしん');
    expect(m.remaining()).toBe('shashinn');
    m.input('s');
    m.input('y'); // sya を選んだ
    expect(m.remaining()).toBe('ashinn');
    m.input('a');
    m.input('s');
    m.input('i'); // si を選んだ
    expect(m.remaining()).toBe('nn');
  });

  it('大文字（CapsLock）でも小文字と同じに扱う', () => {
    expect(accepts('すし', 'SUSHI')).toBe(true);
  });
});

describe('「ん」の判定', () => {
  it('子音の前では n 1回で確定できる', () => {
    expect(accepts('かんじ', 'kanji')).toBe(true);
    expect(accepts('しんぶん', 'shinbunn')).toBe(true);
    expect(accepts('せんせい', 'sensei')).toBe(true);
  });
  it('nn / xn でも入力できる', () => {
    expect(accepts('かんじ', 'kannji')).toBe(true);
    expect(accepts('かんじ', 'kaxnji')).toBe(true);
  });
  it('母音の前では n 1回では確定しない（かんい を kani と打つとミス）', () => {
    const r = type('かんい', 'kani');
    expect(r.miss).toBe(1);
    expect(r.done).toBe(false);
    expect(accepts('かんい', 'kanni')).toBe(true);
    expect(accepts('かんい', "kan'i")).toBe(true);
  });
  it('な行・や行の前では n 1回では確定しない', () => {
    expect(accepts('こんにちは', 'konnnichiha')).toBe(true);
    const r = type('こんにちは', 'konnichiha');
    expect(r.done).toBe(false); // konni は こんい ではなく「こん」+「に」の途中、最後まで届かない
    expect(accepts('きんようび', 'kinnyoubi')).toBe(true);
    expect(type('きんようび', 'kinyoubi').miss).toBeGreaterThan(0);
  });
  it('「う」の前では nwu の w で確定できるが、nu は ぬ になるのでミス', () => {
    expect(accepts('きんう', 'kinwu')).toBe(true);
    expect(type('きんう', 'kinu').miss).toBe(1);
  });
  it('最後の「ん」は n 1回では終わらない', () => {
    const r = type('ほん', 'hon');
    expect(r.done).toBe(false);
    expect(r.miss).toBe(0);
    r.m.input('n');
    expect(r.m.done).toBe(true);
  });
  it('「ん」のあとの句読点・長音は n 1回でよい', () => {
    expect(accepts('ぱん、', 'pan,')).toBe(true);
  });
});

describe('促音・拗音・長音・小さい文字', () => {
  it('子音を重ねて促音を入力できる', () => {
    expect(accepts('がっこう', 'gakkou')).toBe(true);
    expect(accepts('きって', 'kitte')).toBe(true);
    expect(accepts('ざっし', 'zasshi')).toBe(true);
    expect(accepts('ざっし', 'zassi')).toBe(true);
    expect(accepts('まっちゃ', 'maccha')).toBe(true);
    expect(accepts('まっちゃ', 'matcha')).toBe(true);
    expect(accepts('まっちゃ', 'mattya')).toBe(true);
  });
  it('促音を単独で入力できる', () => {
    expect(accepts('がっこう', 'gaxtukou')).toBe(true);
    expect(accepts('がっこう', 'galtsukou')).toBe(true);
    expect(accepts('あっ', 'axtu')).toBe(true);
  });
  it('長音・句読点', () => {
    expect(accepts('らーめん', 'ra-menn')).toBe(true);
    expect(accepts('はい、そうです。', 'hai,soudesu.')).toBe(true);
  });
  it('カタカナの読みもひらがなとして扱う', () => {
    expect(accepts('パソコン', 'pasokonn')).toBe(true);
    expect(accepts('ヴァイオリン', 'vaiorinn')).toBe(true);
  });
});

describe('ミスの扱い', () => {
  it('間違ったキーでは入力位置が進まず、正しいキーで続行できる', () => {
    const m = new RomajiMatcher('ねこ');
    expect(m.input('n')).toBe('correct');
    expect(m.input('x')).toBe('miss');
    expect(m.snapshot().buffer).toBe('n');
    expect(m.input('e')).toBe('correct');
    expect(m.input('k')).toBe('correct');
    expect(m.input('o')).toBe('correct');
    expect(m.done).toBe(true);
    expect(m.snapshot().missAt).toEqual([true, false]);
  });
  it('正しい途中入力はミスにならない', () => {
    const r = type('しゃしん', 'sh');
    expect(r.miss).toBe(0);
    expect(r.correct).toBe(2);
  });
  it('文字ではないキー名は無視する', () => {
    const m = new RomajiMatcher('ねこ');
    expect(m.input('Shift')).toBe('ignored');
    expect(m.input('Enter')).toBe('ignored');
  });
});

describe('対応文字', () => {
  it('未対応の文字を見つける', () => {
    expect(findUnsupportedChar('ねこ')).toBeNull();
    expect(findUnsupportedChar('猫')).toBe('猫');
    expect(findUnsupportedChar('abc')).toBe('a');
  });
  it('すべてのひらがな（ぁ〜ゖ）を入力できる', () => {
    for (let c = 0x3041; c <= 0x3096; c++) {
      const ch = String.fromCodePoint(c);
      expect(findUnsupportedChar(ch), ch).toBeNull();
      const units = tokenize(ch);
      const keys = units[0]!.cands[0]!;
      if (ch === 'ん') expect(accepts(ch, 'nn')).toBe(true);
      else expect(accepts(ch, keys), ch).toBe(true);
    }
  });
});
