import type { Difficulty } from './questions';
import type { Minutes } from './result';

export interface LearningSettings {
  romajiGuide: boolean;
  keyboardGuide: boolean;
  fingerGuide: boolean;
  /** 音（初期状態は OFF） */
  sound: boolean;
  minutes: Minutes;
  difficulty: Difficulty | 'mixed';
}

export const APP_DEFAULT_SETTINGS: LearningSettings = {
  romajiGuide: true,
  keyboardGuide: true,
  fingerGuide: true,
  sound: false,
  minutes: 3,
  difficulty: 'mixed',
};

/** 保存された値（形が正しくない可能性がある）から、正しい項目だけを取り出します */
export function sanitizeSettings(raw: unknown): Partial<LearningSettings> {
  if (!raw || typeof raw !== 'object') return {};
  const r = raw as Record<string, unknown>;
  const out: Partial<LearningSettings> = {};
  for (const k of ['romajiGuide', 'keyboardGuide', 'fingerGuide', 'sound'] as const) {
    if (typeof r[k] === 'boolean') out[k] = r[k] as boolean;
  }
  const m = Number(r.minutes);
  if (m === 3 || m === 5 || m === 10) out.minutes = m;
  const d = r.difficulty;
  if (d === 'mixed') out.difficulty = 'mixed';
  else if (d === 1 || d === 2 || d === 3 || d === '1' || d === '2' || d === '3') out.difficulty = Number(d) as Difficulty;
  return out;
}

/** アプリの初期値 ← 先生が指定した初期設定 ← 本人が変更した設定 の順に重ねます */
export function effectiveSettings(teacherDefaults: unknown, own: unknown): LearningSettings {
  return { ...APP_DEFAULT_SETTINGS, ...sanitizeSettings(teacherDefaults), ...sanitizeSettings(own) };
}

/** データベースに保存する形（難易度は文字列） */
export function settingsToJson(s: Partial<LearningSettings>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...s };
  if (s.difficulty !== undefined) out.difficulty = String(s.difficulty);
  return out;
}
