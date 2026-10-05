import { describe, expect, it } from 'vitest';
import { generatePassword, loginIdToEmail, normalizeLoginId, validateDisplayName, validateLoginId, validatePassword } from './accountRules';

describe('アカウントの規則', () => {
  it('ID は英字で始まる英小文字・数字', () => {
    expect(validateLoginId('sakura01')).toBeNull();
    expect(validateLoginId('1sakura')).not.toBeNull();
    expect(validateLoginId('abc')).not.toBeNull();
    expect(validateLoginId('sakura_01')).not.toBeNull();
    expect(validateLoginId("a' or 1=1")).not.toBeNull();
  });
  it('全角や大文字の ID はそろえる', () => {
    expect(normalizeLoginId(' ＳａｋｕＲＡ０１ ')).toBe('sakura01');
    expect(loginIdToEmail('Sakura01', 'id.example.invalid')).toBe('sakura01@id.example.invalid');
  });
  it('表示名にタグや制御文字は使えない', () => {
    expect(validateDisplayName('さくら')).toBeNull();
    expect(validateDisplayName('<script>')).not.toBeNull();
    expect(validateDisplayName('')).not.toBeNull();
    expect(validateDisplayName('あ'.repeat(21))).not.toBeNull();
  });
  it('パスワードの規則', () => {
    expect(validatePassword('abcd1234')).toBeNull();
    expect(validatePassword('abc123')).not.toBeNull();
    expect(validatePassword('abcdefgh')).not.toBeNull();
    expect(validatePassword('sakura0123', 'sakura01')).not.toBeNull();
  });
  it('自動作成のパスワードは規則を満たし、毎回違う', () => {
    const set = new Set<string>();
    for (let i = 0; i < 200; i++) {
      const p = generatePassword();
      expect(validatePassword(p)).toBeNull();
      expect(p).toMatch(/^[a-km-np-z2-9]{10}$/);
      set.add(p);
    }
    expect(set.size).toBe(200);
  });
});
