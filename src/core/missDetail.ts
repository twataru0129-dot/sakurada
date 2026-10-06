import type { QuestionAttempt } from './result';

export interface PathChar {
  ch: string;
  /** この位置でのミスの回数 */
  missCount: number;
  /** typed：実際に打った部分、rest：入力途中で終わったときの残り（ガイド） */
  part: 'typed' | 'rest';
}

export interface MissExplanation {
  position: number;
  kana: string;
  /** ミスの時点でガイドに表示されていた文字 */
  guideChar: string;
  /** その時点で正しいと判定されたキー（別の正しい打ち方を含む） */
  acceptable: string[];
  pressed: string;
  count: number;
}

/** ミス詳細の表示用にまとめます（練習中に記録した内容だけを使い、推測はしません） */
export function summarizeAttempt(a: QuestionAttempt): { path: PathChar[]; explanations: MissExplanation[]; pressedKeys: string[] } {
  const byPos = new Map<number, number>();
  for (const m of a.misses) byPos.set(m.position, (byPos.get(m.position) ?? 0) + 1);
  const full = a.typed + (a.completed ? '' : a.remainingGuide);
  const path: PathChar[] = [...full].map((ch, i) => ({ ch, missCount: byPos.get(i) ?? 0, part: i < a.typed.length ? 'typed' : 'rest' }));
  const groups = new Map<string, MissExplanation>();
  for (const m of a.misses) {
    const key = `${m.position}|${m.pressed}`;
    const g = groups.get(key);
    if (g) g.count++;
    else groups.set(key, { position: m.position, kana: m.kana, guideChar: m.guideChar, acceptable: m.acceptable, pressed: m.pressed, count: 1 });
  }
  const pressedKeys = [...new Set(a.misses.map((m) => m.pressed))];
  return { path, explanations: [...groups.values()].sort((x, y) => x.position - y.position), pressedKeys };
}

/** キーの表示名（スペースや記号を読みやすく） */
export function keyName(k: string): string {
  if (k === ' ') return 'スペース';
  return k.length === 1 && /[a-z]/.test(k) ? k : k;
}
