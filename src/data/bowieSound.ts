/**
 * ボウイの爆弾遊戯のサウンド設定（音楽・効果音・ボイスの音量）。この端末（localStorage）に保存します。
 * - 全体のサウンドの ON／OFF は、桜打の共通の「音」の設定（settings.sound）を使います（保存済みの OFF はそのまま）。
 * - 音量は 0〜1（画面では 0〜100％）。初期値は音楽 20％・効果音 80％・ボイス 100％。
 * - v1.5.x の「全体の音量」（sakura-type:bowie-volume:v1）を保存していた場合は、初めて読むときにその割合を3つの音量に引き継ぎます。
 */
import { BOWIE_VOLUME_KEY } from './bowieRecords';

export const BOWIE_SOUND_KEY = 'sakura-type:bowie-sound:v1';

export interface BowieSoundLevels {
  music: number;
  sfx: number;
  voice: number;
}

export const BOWIE_SOUND_DEFAULTS: Readonly<BowieSoundLevels> = { music: 0.2, sfx: 0.8, voice: 1 };

const clamp = (v: unknown, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(1, Math.max(0, Math.round(v * 100) / 100)) : fallback);

export function loadBowieSound(): BowieSoundLevels {
  const d = BOWIE_SOUND_DEFAULTS;
  try {
    const raw = localStorage.getItem(BOWIE_SOUND_KEY);
    if (raw) {
      const s = JSON.parse(raw) as Partial<BowieSoundLevels> & { version?: number };
      if (s && s.version === 1) return { music: clamp(s.music, d.music), sfx: clamp(s.sfx, d.sfx), voice: clamp(s.voice, d.voice) };
    }
    // 以前の「全体の音量」（初期値 0.8）を、3つの音量の割合として引き継ぎます
    const old = Number(localStorage.getItem(BOWIE_VOLUME_KEY));
    if (localStorage.getItem(BOWIE_VOLUME_KEY) !== null && Number.isFinite(old) && old >= 0 && old <= 1) {
      const k = Math.min(1, old / 0.8);
      return { music: clamp(d.music * k, d.music), sfx: clamp(d.sfx * k, d.sfx), voice: clamp(d.voice * k, d.voice) };
    }
  } catch {
    /* 読めなくても初期値で遊べます */
  }
  return { ...d };
}

export function saveBowieSound(s: BowieSoundLevels): boolean {
  try {
    localStorage.setItem(BOWIE_SOUND_KEY, JSON.stringify({ version: 1, music: clamp(s.music, 0), sfx: clamp(s.sfx, 0), voice: clamp(s.voice, 0) }));
    return true;
  } catch {
    return false;
  }
}
