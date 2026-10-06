/**
 * 内蔵の検定モード問題（オリジナル文章 30 問。各段階 5 問）。
 * exam_problems.json の本文（answerText）を省略・要約・差し替えせずにそのまま使います。
 */
import raw from './exam/exam_problems.json';
import { isGrade, STANDARD_TIME_SECONDS, type ExamProblem } from '../core/exam';

export interface BuiltinExamJson {
  schemaVersion: number;
  name: string;
  disclaimer: string;
  problems: Array<{
    id: string;
    revision: number;
    title: string;
    grade: string;
    gradeLabel: string;
    timeLimitSeconds: number;
    targetCharacters: number;
    penaltyPerError: number;
    answerText: string;
    answerConfirmed: boolean;
    scoringEnabled: boolean;
    characterCount: number;
    createdDate: string;
  }>;
}

export const BUILTIN_EXAM_SOURCE = raw as BuiltinExamJson;

export const BUILTIN_EXAM_DISCLAIMER = BUILTIN_EXAM_SOURCE.disclaimer;

export const BUILTIN_EXAM_PROBLEMS: readonly ExamProblem[] = BUILTIN_EXAM_SOURCE.problems.map((p) => {
  if (!isGrade(p.grade)) throw new Error(`内蔵問題の段階が正しくありません: ${p.id}`);
  const date = new Date(`${p.createdDate}T00:00:00+09:00`).toISOString();
  return {
    id: p.id,
    revision: p.revision,
    title: p.title,
    grade: p.grade,
    source: 'builtin',
    timeLimitSeconds: p.timeLimitSeconds ?? STANDARD_TIME_SECONDS,
    scoringEnabled: p.scoringEnabled,
    answerText: p.answerText,
    answerConfirmed: p.answerConfirmed,
    visible: true,
    material: { kind: 'text' },
    createdAt: date,
    updatedAt: date,
  };
});
