import { describe, expect, it } from 'vitest';
import { SentenceJudge, countTargetChars } from './sentence';
import { ImeInputController } from './imeInput';

describe('文章入力の採点', () => {
  it('正しい途中入力は、後半が未入力でもミスにしない', () => {
    const j = new SentenceJudge('今日は晴れです。');
    const e = j.evaluate('今日は');
    expect(e.newMisses).toBe(0);
    expect(e.correctChars).toBe(3);
    expect(e.complete).toBe(false);
  });

  it('2文字の誤変換は2文字分のミス', () => {
    const j = new SentenceJudge('機関に連絡します。');
    const e = j.evaluate('期間');
    expect(e.newMisses).toBe(2);
    expect(e.errorIndexes).toEqual([0, 1]);
    expect(j.misses).toBe(2);
  });

  it('同じ誤りを残したまま続けて入力しても、ミスは重複して加算しない', () => {
    const j = new SentenceJudge('機関に連絡します。');
    j.evaluate('期間');
    const e = j.evaluate('期間に連絡');
    expect(e.newMisses).toBe(0);
    expect(j.misses).toBe(2);
    // 同じ値の再判定（イベントの二重発火）でも増えない
    j.evaluate('期間に連絡');
    expect(j.misses).toBe(2);
  });

  it('削除はミスにならず、修正すれば完成できる。誤確定の履歴は残る', () => {
    const j = new SentenceJudge('機関です');
    j.evaluate('期間');
    expect(j.evaluate('').newMisses).toBe(0);
    const e = j.evaluate('機関です');
    expect(e.complete).toBe(true);
    expect(e.correctChars).toBe(4);
    expect(j.misses).toBe(2);
  });

  it('修正後に新たに誤って確定したら新しいミスとして数える', () => {
    const j = new SentenceJudge('機関です');
    j.evaluate('期');
    j.evaluate('');
    j.evaluate('期');
    expect(j.misses).toBe(2);
  });

  it('余分な文字（挿入）は1文字、後ろの正しい文字はミスにしない', () => {
    const j = new SentenceJudge('ありがとう');
    expect(j.evaluate('ありあ').newMisses).toBe(1);
    const e = j.evaluate('ありあがとう');
    expect(e.newMisses).toBe(0);
    expect(e.correctChars).toBe(5);
    expect(e.errorIndexes).toEqual([2]);
  });

  it('抜けた文字（脱字）は、その後ろを確定したときに1文字のミス', () => {
    const j = new SentenceJudge('ありがとう');
    j.evaluate('あり');
    const e = j.evaluate('ありとう');
    expect(e.newMisses).toBe(1);
    expect(e.omissionBefore).toEqual([2]);
  });

  it('誤った文字を選んで別の誤った文字に置き換えたら、新しいミスとして数える', () => {
    const j = new SentenceJudge('あいう');
    j.evaluate('あXう');
    expect(j.misses).toBe(1);
    j.evaluate('あYう');
    expect(j.misses).toBe(2);
  });

  it('全角・半角の数字や英字は同じ文字として扱う', () => {
    const j = new SentenceJudge('3月10日');
    expect(j.evaluate('３月１０日').complete).toBe(true);
  });

  it('文字数は改行を数えない', () => {
    expect(countTargetChars('あい\nうえ')).toBe(4);
    const j = new SentenceJudge('あい\nうえ');
    expect(j.evaluate('あい\nうえ').correctChars).toBe(4);
  });

  it('削除と再入力で正しい文字数が重複して増えない', () => {
    const j = new SentenceJudge('さくら');
    j.evaluate('さく');
    j.evaluate('さ');
    const e = j.evaluate('さく');
    expect(e.correctChars).toBe(2);
  });
});

describe('IME の確定と Enter の扱い', () => {
  function setup(target: string) {
    let t = 1000;
    const judge = new SentenceJudge(target);
    const ctl = new ImeInputController(judge, () => t);
    return { judge, ctl, advance: (ms: number) => (t += ms) };
  }

  it('変換中は判定しない（Chrome の順序: input(isComposing) → compositionend）', () => {
    const { judge, ctl } = setup('機関');
    ctl.compositionStart();
    expect(ctl.input('きかん', true)).toBeNull();
    expect(ctl.input('期間', true)).toBeNull();
    expect(judge.misses).toBe(0);
    ctl.compositionEnd('期間');
    expect(judge.misses).toBe(2);
  });

  it('Safari の順序（compositionend → input(isComposing=false)）でも二重に数えない', () => {
    const { judge, ctl } = setup('機関');
    ctl.compositionStart();
    ctl.input('きかん', false); // composing フラグで除外
    ctl.compositionEnd('期間');
    ctl.input('期間', false);
    expect(judge.misses).toBe(2);
  });

  it('変換確定の Enter（keyCode 229 / 変換中）はアプリでは扱わない', () => {
    const { ctl, advance } = setup('あ\nい');
    ctl.compositionStart();
    expect(ctl.enterKey(true, 13, 0)).toBe('ime');
    ctl.compositionEnd('あ');
    expect(ctl.enterKey(false, 229, 1)).toBe('ime');
    // 確定直後に届く Enter は改行にしない
    expect(ctl.enterKey(false, 13, 1)).toBe('block');
    advance(500);
    expect(ctl.enterKey(false, 13, 1)).toBe('newline');
  });

  it('見本に改行がない位置の Enter は入力させない（ミスにもしない）', () => {
    const { judge, ctl, advance } = setup('あい');
    ctl.input('あ', false);
    advance(500);
    expect(ctl.enterKey(false, 13, 1)).toBe('block');
    expect(judge.misses).toBe(0);
  });

  it('タイムアップ時は未確定の文字を含めず、確定済みの正しい部分だけを数える', () => {
    const { judge, ctl } = setup('今日は晴れ');
    ctl.input('今日', false);
    ctl.compositionStart();
    ctl.input('今日はは', true); // 変換中
    expect(judge.current.correctChars).toBe(2);
  });
});
