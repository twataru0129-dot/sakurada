import { describe, expect, it } from 'vitest';
import { compactRows, keyForChar, keyForSentenceChar } from './keyboardLayout';

describe('キーと指', () => {
  it('ホームポジションと指', () => {
    expect(keyForChar('f')?.key.home).toBe(true);
    expect(keyForChar('j')?.key.home).toBe(true);
    expect(keyForChar('f')?.key.finger).toBe('L2');
    expect(keyForChar('k')?.key.finger).toBe('R3');
    expect(keyForChar('a')?.key.finger).toBe('L5');
    expect(keyForChar('-')?.key.finger).toBe('R5');
  });
  it('Shift が必要な文字は反対の手の Shift', () => {
    const t = keyForChar('!');
    expect(t?.key.char).toBe('1');
    expect(t?.shift?.special).toBe('shiftR');
    expect(keyForChar('?')?.shift?.special).toBe('shiftL');
  });
  it('文章入力では、押すキーが一意に決まる文字だけ案内する', () => {
    expect(keyForSentenceChar('、')?.key.char).toBe(',');
    expect(keyForSentenceChar('\n')?.key.special).toBe('enter');
    expect(keyForSentenceChar('３')?.key.char).toBe('3');
    expect(keyForSentenceChar('漢')).toBeNull();
    expect(keyForSentenceChar('あ')).toBeNull();
    expect(keyForSentenceChar(null)).toBeNull();
  });
  it('ローマ字の問題で使う文字はすべて画面のキーボードにある', () => {
    const chars = 'abcdefghijklmnopqrstuvwxyz-,.!?[]/~0123456789';
    for (const c of chars) expect(keyForChar(c), c).not.toBeNull();
    const compact = new Set(compactRows().flat().map((k) => k.char));
    for (const c of chars) expect(compact.has(c), c).toBe(true);
  });
});
