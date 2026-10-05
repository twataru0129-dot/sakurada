import type { DeckMode } from './deck';
import type { Question } from './questions';
import type { PracticeConfig } from './result';

/** 練習の条件に合う問題を選びます */
export function selectQuestions(all: Question[], c: PracticeConfig, teacherMaterials: Question[] = []): Question[] {
  if (c.setType === 'teacher') return teacherMaterials.filter((q) => q.kind === c.kind);
  const category = c.setType === 'sakura' ? 'sakura' : 'general';
  return all.filter(
    (q) =>
      q.kind === c.kind &&
      q.category === category &&
      (c.theme === 'all' || q.theme === c.theme) &&
      (c.difficulty === 'mixed' || q.difficulty === c.difficulty),
  );
}

/** 難易度を混ぜる練習は標準問題と同じ順番の決まり、難易度を選んだ練習はシャッフル */
export function deckModeFor(c: PracticeConfig): DeckMode {
  if (c.setType !== 'teacher' && c.difficulty === 'mixed') return { type: 'pattern', kind: c.kind };
  return { type: 'shuffle' };
}
