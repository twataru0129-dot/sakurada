import { beforeEach, describe, expect, it, vi } from 'vitest';
import { BOWIE_SOUND_DEFAULTS, BOWIE_SOUND_KEY, loadBowieSound, saveBowieSound } from './bowieSound';
import { BOWIE_VOLUME_KEY } from './bowieRecords';
import { kindOf, SOUNDS, type SoundKey } from '../ui/bowie/audio';

function memoryStorage() {
  const m = new Map<string, string>();
  return {
    getItem: (k: string) => (m.has(k) ? m.get(k)! : null),
    setItem: (k: string, v: string) => void m.set(k, String(v)),
    removeItem: (k: string) => void m.delete(k),
    clear: () => m.clear(),
    key: (i: number) => [...m.keys()][i] ?? null,
    get length() {
      return m.size;
    },
  };
}

describe('ボウイの爆弾遊戯のサウンド設定（端末に保存）', () => {
  beforeEach(() => {
    vi.stubGlobal('localStorage', memoryStorage());
  });
  it('初期値は音楽20％・効果音80％・ボイス100％', () => {
    expect(BOWIE_SOUND_DEFAULTS).toEqual({ music: 0.2, sfx: 0.8, voice: 1 });
    expect(loadBowieSound()).toEqual({ music: 0.2, sfx: 0.8, voice: 1 });
  });
  it('保存した音量を次回も読み込む。範囲外・壊れた値は直す', () => {
    expect(saveBowieSound({ music: 0, sfx: 0.35, voice: 0.6 })).toBe(true);
    expect(loadBowieSound()).toEqual({ music: 0, sfx: 0.35, voice: 0.6 });
    localStorage.setItem(BOWIE_SOUND_KEY, JSON.stringify({ version: 1, music: 3, sfx: -1, voice: 'x' }));
    expect(loadBowieSound()).toEqual({ music: 1, sfx: 0, voice: 1 });
    localStorage.setItem(BOWIE_SOUND_KEY, '{oops');
    expect(loadBowieSound()).toEqual(BOWIE_SOUND_DEFAULTS);
  });
  it('以前の「全体の音量」を保存していた場合は、その割合を3つの音量に引き継ぐ（初めて読むときだけ）', () => {
    localStorage.setItem(BOWIE_VOLUME_KEY, '0.4');
    expect(loadBowieSound()).toEqual({ music: 0.1, sfx: 0.4, voice: 0.5 });
    saveBowieSound({ music: 0.3, sfx: 0.3, voice: 0.3 });
    expect(loadBowieSound()).toEqual({ music: 0.3, sfx: 0.3, voice: 0.3 });
  });
});

describe('音の種類と音量', () => {
  it('音楽：通常の BGM・クリアの曲。ボイス：セリフ・声・VICTORY／DEFEAT。そのほかは効果音', () => {
    const music: SoundKey[] = ['bgm', 'hero_clear_bgm'];
    const voice: SoundKey[] = ['victory', 'defeat', 'loss_line', 'laugh', 'level_up', 'cutin_voice_02', 'cutin_voice_03', 'cutin_voice_04', 'hero_hit_voice', 'hero_cry'];
    const sfx: SoundKey[] = ['throw', 'disarm_v2', 'typo', 'danger', 'explosion', 'cutin_shine', 'cutin_rumble'];
    for (const k of music) expect(kindOf(k), k).toBe('music');
    for (const k of voice) expect(kindOf(k), k).toBe('voice');
    for (const k of sfx) expect(kindOf(k), k).toBe('sfx');
  });
  it('新しい音の長さ（実ファイル）と、クリアの曲は通常の BGM より大きい音源ゲイン', () => {
    expect(SOUNDS.bgm.duration).toBeCloseTo(116.32, 1);
    expect(SOUNDS.disarm_v2.duration).toBeCloseTo(1.2, 1);
    expect(SOUNDS.hero_hit_voice.duration).toBeCloseTo(3.37, 1);
    expect(SOUNDS.hero_cry.duration).toBeCloseTo(3.55, 1);
    expect(SOUNDS.hero_clear_bgm.duration).toBeCloseTo(5.9, 1);
    expect(SOUNDS.hero_clear_bgm.volume).toBeGreaterThan(SOUNDS.bgm.volume);
    // 大きく録音されていた VICTORY・DEFEAT は、ほかのボイスと同じくらいに下げています
    expect(SOUNDS.victory.volume).toBeLessThan(0.6);
    expect(SOUNDS.defeat.volume).toBeLessThan(0.8);
  });
});
