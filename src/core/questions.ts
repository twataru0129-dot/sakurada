import type { PracticeKind } from './rank';

/** 内蔵問題セットの版。問題を追加・変更したら上げてください（過去の結果は書き換えません）。 */
export const QUESTION_SET_VERSION = 'qs-2026.10';

export type Difficulty = 1 | 2 | 3;
export type QuestionCategory = 'general' | 'sakura' | 'teacher';

export interface Question {
  id: string;
  kind: PracticeKind;
  category: QuestionCategory;
  theme: string;
  difficulty: Difficulty;
  /** 画面に表示する本文（漢字かな交じり） */
  text: string;
  /** 読み（ひらがな）。ローマ字入力はこれを打ちます */
  reading: string;
}

export const GENERAL_THEMES: Record<string, string> = {
  life: '身近な生活',
  food_nature: '食べ物・動物・自然',
  hobby: '趣味・音楽・スポーツ',
  shopping: '買い物・公共施設',
  it: '情報・パソコン',
  explain: '短い説明文',
};

export const SAKURA_THEMES: Record<string, string> = {
  school: '学校生活',
  commute: '通学・公共交通',
  work: '実習・仕事',
  events: '学校行事',
  friends: '友人関係・あいさつ',
  language: '国語・敬語・お礼状',
  career: '進路・就職',
  safety: '安全・防災',
  ict: '情報・ICT',
  money: 'お金・買い物・公共手続き',
};

export const DIFFICULTY_LABEL: Record<PracticeKind, Record<Difficulty, string>> = {
  romaji: { 1: 'やさしい単語', 2: '小さい文字・「ん」を含む単語', 3: '短文' },
  sentence: { 1: '初級（10〜30文字）', 2: '中級（30〜80文字）', 3: '上級（100〜300文字）' },
};

export function themeLabel(category: QuestionCategory, theme: string): string {
  if (category === 'general') return GENERAL_THEMES[theme] ?? theme;
  if (category === 'sakura') return SAKURA_THEMES[theme] ?? theme;
  return theme;
}
