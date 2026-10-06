import { describe, expect, it } from 'vitest';
import { isStartKey } from './Practice';

const ev = (extra: Partial<KeyboardEvent> = {}) =>
  ({ key: ' ', code: 'Space', repeat: false, isComposing: false, keyCode: 32, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...extra }) as KeyboardEvent;

describe('スペースキーでの開始', () => {
  it('スペースキーで開始できる', () => expect(isStartKey(ev())).toBe(true));
  it('長押しのくり返し・IME 変換中・修飾キー付きでは開始しない', () => {
    expect(isStartKey(ev({ repeat: true }))).toBe(false);
    expect(isStartKey(ev({ isComposing: true }))).toBe(false);
    expect(isStartKey(ev({ keyCode: 229 }))).toBe(false);
    expect(isStartKey(ev({ ctrlKey: true }))).toBe(false);
    expect(isStartKey(ev({ shiftKey: true }))).toBe(false);
  });
  it('ほかのキーでは開始しない', () => expect(isStartKey(ev({ key: 'a', code: 'KeyA' }))).toBe(false));
});
