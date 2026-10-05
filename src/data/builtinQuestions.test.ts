import { describe, expect, it } from 'vitest';
import { BUILTIN_QUESTIONS } from './builtinQuestions';
import { validateQuestionSet } from '../core/validateQuestions';
import { RomajiMatcher } from '../core/romaji';

describe('初期問題データ', () => {
  it('件数の目安を満たす', () => {
    const count = (kind: string, category: string) => BUILTIN_QUESTIONS.filter((q) => q.kind === kind && q.category === category).length;
    expect(count('romaji', 'general')).toBeGreaterThanOrEqual(300);
    expect(count('romaji', 'sakura')).toBeGreaterThanOrEqual(300);
    expect(count('sentence', 'general')).toBeGreaterThanOrEqual(100);
    expect(count('sentence', 'sakura')).toBeGreaterThanOrEqual(100);
  });

  it('各難易度に問題がある（標準問題の出題が成り立つ）', () => {
    for (const kind of ['romaji', 'sentence'] as const) {
      for (const category of ['general', 'sakura'] as const) {
        for (const d of [1, 2, 3]) {
          const n = BUILTIN_QUESTIONS.filter((q) => q.kind === kind && q.category === category && q.difficulty === d).length;
          expect(n, `${kind}/${category}/${d}`).toBeGreaterThanOrEqual(10);
        }
      }
    }
  });

  it('重複・読み・使えない文字・文字数・よく似た問題がない', () => {
    const issues = validateQuestionSet(BUILTIN_QUESTIONS);
    expect(issues).toEqual([]);
  });

  it('すべてのローマ字問題が標準の打ち方で最後まで入力できる', () => {
    for (const q of BUILTIN_QUESTIONS.filter((x) => x.kind === 'romaji')) {
      const m = new RomajiMatcher(q.reading);
      const guide = m.remaining();
      for (const k of guide) expect(m.input(k), `${q.id} ${q.reading}`).toBe('correct');
      expect(m.done, q.id).toBe(true);
    }
  });

  it('10分間の練習に十分な量の長文がある', () => {
    const chars = BUILTIN_QUESTIONS.filter((q) => q.kind === 'sentence' && q.category === 'general').reduce((s, q) => s + [...q.text].length, 0);
    // 文章入力 S＋（200字/分）で10分間でも 2000 字。どの速さでも問題が尽きない量
    expect(chars).toBeGreaterThan(4000);
  });
});
