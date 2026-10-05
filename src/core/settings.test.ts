import { describe, expect, it } from 'vitest';
import { APP_DEFAULT_SETTINGS, effectiveSettings, sanitizeSettings, settingsToJson } from './settings';

describe('学習設定', () => {
  it('初期状態はガイドすべてON・音OFF・3分', () => {
    expect(APP_DEFAULT_SETTINGS).toMatchObject({ romajiGuide: true, keyboardGuide: true, fingerGuide: true, sound: false, minutes: 3 });
  });
  it('先生の初期設定の上に本人の設定を重ねる', () => {
    const s = effectiveSettings({ minutes: 10, fingerGuide: false }, { fingerGuide: true });
    expect(s.minutes).toBe(10);
    expect(s.fingerGuide).toBe(true);
  });
  it('不正な値は無視する', () => {
    expect(sanitizeSettings({ minutes: 7, sound: 'yes', difficulty: '<x>' })).toEqual({});
    expect(sanitizeSettings(null)).toEqual({});
  });
  it('保存用の形', () => {
    expect(settingsToJson({ difficulty: 2 })).toEqual({ difficulty: '2' });
    expect(sanitizeSettings(settingsToJson({ difficulty: 2 }))).toEqual({ difficulty: 2 });
  });
});
