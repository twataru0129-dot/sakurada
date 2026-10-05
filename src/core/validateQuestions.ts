import { findUnsupportedChar } from './romaji';
import { GENERAL_THEMES, SAKURA_THEMES, type Question } from './questions';
import { splitChars } from './sentence';

/** 本文に使える文字：ひらがな・カタカナ・漢字・英数字・よく使う記号 */
const TEXT_CHAR = /^[ぁ-ゖァ-ヺー一-鿿々〆0-9０-９A-Za-zＡ-Ｚａ-ｚ、。，．！？「」『』（）・ー〜：　 \n]$/u;
/** 文章入力の読みに使える文字 */
const SENTENCE_READING_CHAR = /^[ぁ-ゖァ-ヺー0-9０-９、。！？「」『』（）・〜：　 \n]$/u;
const PUNCT = /[、。！？「」『』（）・\n]/gu;
const SPECIAL_KANA = /[ゃゅょっんーぁぃぅぇぉゎ]/u;

export const SENTENCE_LENGTH: Record<1 | 2 | 3, [number, number]> = {
  1: [10, 32],
  2: [28, 85],
  3: [95, 320],
};

export interface Issue {
  id: string;
  message: string;
}

function charCount(s: string): number {
  return splitChars(s).filter((c) => c !== '\n').length;
}

/** 1問（または先生の追加教材1件）の検証 */
export function validateQuestion(q: Question, opts: { builtin: boolean } = { builtin: true }): string[] {
  const errors: string[] = [];
  const text = q.text;
  const reading = q.reading;

  if (text !== text.trim()) errors.push('本文の前後に空白や改行があります');
  if (text.trim().length === 0) errors.push('本文が空です');
  for (const ch of splitChars(text)) {
    if (!TEXT_CHAR.test(ch)) errors.push(`本文に使えない文字があります: 「${ch}」`);
  }
  if (![1, 2, 3].includes(q.difficulty)) errors.push('難易度は 1〜3 です');

  if (opts.builtin) {
    const themes = q.category === 'general' ? GENERAL_THEMES : q.category === 'sakura' ? SAKURA_THEMES : null;
    if (!themes || !(q.theme in themes)) errors.push(`テーマが正しくありません: ${q.theme}`);
  }

  if (q.kind === 'romaji') {
    if (!reading || reading.trim() === '') {
      errors.push('ローマ字の問題には読みが必要です');
    } else {
      const bad = findUnsupportedChar(reading);
      if (bad) errors.push(`読みにローマ字で入力できない文字があります: 「${bad}」`);
      if (/\n/.test(text) || /\n/.test(reading)) errors.push('ローマ字の問題に改行は使えません');
      const len = [...reading].length;
      if (len > 40) errors.push('ローマ字の読みが長すぎます（40文字まで）');
      if (opts.builtin) {
        if (q.difficulty === 1 && SPECIAL_KANA.test(reading)) errors.push('難易度1に小さい文字・ん・長音が含まれています');
        if (q.difficulty === 2 && !SPECIAL_KANA.test(reading)) errors.push('難易度2は小さい文字・ん・長音のいずれかを含めます');
        if (q.difficulty === 3 && !reading.endsWith('。')) errors.push('難易度3（短文）は「。」で終わります');
        if (q.difficulty !== 3 && /[、。]/.test(reading)) errors.push('単語の問題に句読点があります');
      }
    }
  } else {
    if (reading) {
      for (const ch of splitChars(reading)) {
        if (!SENTENCE_READING_CHAR.test(ch)) errors.push(`読みに使えない文字があります: 「${ch}」`);
      }
      const p1 = (text.match(PUNCT) ?? []).join('');
      const p2 = (reading.match(PUNCT) ?? []).join('');
      if (p1 !== p2) errors.push('本文と読みで句読点・かっこ・改行の並びが一致しません');
    } else if (opts.builtin) {
      errors.push('読みがありません');
    }
    const n = charCount(text);
    if (opts.builtin) {
      const [min, max] = SENTENCE_LENGTH[q.difficulty];
      if (n < min || n > max) errors.push(`文字数 ${n} が難易度${q.difficulty}の目安（${min}〜${max}）から外れています`);
      if (q.difficulty !== 3 && text.includes('\n')) errors.push('改行は上級の問題だけで使います');
    } else if (n > 300) {
      errors.push('文章は300文字までです');
    }
  }
  return errors;
}

/** 文字の2文字組（bigram）の Dice 係数。ほぼ同じ文章を見つけるために使います。 */
export function similarity(a: string, b: string): number {
  const grams = (s: string) => {
    const cs = [...s.replace(/[、。\s]/g, '')];
    const m = new Map<string, number>();
    for (let i = 0; i < cs.length - 1; i++) {
      const g = cs[i]! + cs[i + 1]!;
      m.set(g, (m.get(g) ?? 0) + 1);
    }
    return { m, total: Math.max(0, cs.length - 1) };
  };
  const A = grams(a);
  const B = grams(b);
  if (A.total === 0 || B.total === 0) return a === b ? 1 : 0;
  let inter = 0;
  for (const [g, c] of A.m) inter += Math.min(c, B.m.get(g) ?? 0);
  return (2 * inter) / (A.total + B.total);
}

/** 問題セット全体の検証（ID・本文・読みの重複、ほぼ同じ文章の検出を含む） */
export function validateQuestionSet(all: Question[]): Issue[] {
  const issues: Issue[] = [];
  const ids = new Set<string>();
  const texts = new Map<string, string>();
  const readings = new Map<string, string>();
  for (const q of all) {
    if (!/^[a-z]{2}\d{3}$/.test(q.id)) issues.push({ id: q.id, message: 'ID の形式が正しくありません' });
    if (ids.has(q.id)) issues.push({ id: q.id, message: 'ID が重複しています' });
    ids.add(q.id);
    for (const m of validateQuestion(q)) issues.push({ id: q.id, message: m });
    const tKey = `${q.kind}:${q.text}`;
    if (texts.has(tKey)) issues.push({ id: q.id, message: `本文が ${texts.get(tKey)} と重複しています` });
    texts.set(tKey, q.id);
    if (q.kind === 'romaji') {
      if (readings.has(q.reading)) issues.push({ id: q.id, message: `読みが ${readings.get(q.reading)} と重複しています` });
      readings.set(q.reading, q.id);
    }
  }
  // ほぼ同じ文章（語尾や固有名詞だけを変えたもの）の検出
  const longOnes = all.filter((q) => [...q.text].length >= 12);
  for (let i = 0; i < longOnes.length; i++) {
    for (let j = i + 1; j < longOnes.length; j++) {
      const a = longOnes[i]!;
      const b = longOnes[j]!;
      const s = similarity(a.text, b.text);
      if (s >= 0.6) issues.push({ id: b.id, message: `${a.id} とよく似ています（類似度 ${s.toFixed(2)}）` });
    }
  }
  return issues;
}
