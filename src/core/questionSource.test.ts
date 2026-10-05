import { describe, expect, it } from 'vitest';
import { BUILTIN_QUESTIONS } from '../data/builtinQuestions';
import { deckModeFor, selectQuestions } from './questionSource';
import type { PracticeConfig } from './result';

const base: PracticeConfig = { kind: 'romaji', minutes: 3, inputMethod: 'keyboard', setType: 'standard', theme: 'all', difficulty: 'mixed', questionSetVersion: 'x' };

describe('出題する問題の選択', () => {
  it('標準問題は一般問題の全難易度から、決まった配分で出題', () => {
    const qs = selectQuestions(BUILTIN_QUESTIONS, base);
    expect(qs.every((q) => q.category === 'general' && q.kind === 'romaji')).toBe(true);
    expect(new Set(qs.map((q) => q.difficulty)).size).toBe(3);
    expect(deckModeFor(base)).toEqual({ type: 'pattern', kind: 'romaji' });
  });
  it('桜モードはテーマで絞り込める', () => {
    const qs = selectQuestions(BUILTIN_QUESTIONS, { ...base, setType: 'sakura', theme: 'safety', kind: 'sentence' });
    expect(qs.length).toBeGreaterThan(0);
    expect(qs.every((q) => q.category === 'sakura' && q.theme === 'safety' && q.kind === 'sentence')).toBe(true);
  });
  it('難易度を選ぶとその難易度だけ・シャッフル', () => {
    const c = { ...base, setType: 'general' as const, difficulty: 2 as const };
    expect(selectQuestions(BUILTIN_QUESTIONS, c).every((q) => q.difficulty === 2)).toBe(true);
    expect(deckModeFor(c)).toEqual({ type: 'shuffle' });
  });
  it('追加教材は先生の教材だけ', () => {
    const t = [{ id: 'm1', kind: 'romaji' as const, category: 'teacher' as const, theme: '春', difficulty: 1 as const, text: '桜', reading: 'さくら' }];
    expect(selectQuestions(BUILTIN_QUESTIONS, { ...base, setType: 'teacher', theme: 'teacher' }, t)).toEqual(t);
  });
});
