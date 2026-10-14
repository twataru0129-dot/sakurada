/**
 * 文書作成モード（v2.0.0）で使う問題。
 * - 収録問題：exam_problems.json の30問（本文・タイトル・ID はそのまま）を、document_order.json の順（やさしい順）に並べます。
 * - 先生の問題：見本の文章（answerText）があり、確認済みで、空の行がないものだけ。並び順は sortOrder → 作成日時。
 *   旧検定モードの画像・PDF の問題も、見本の文章を確認済みなら使えます（原本のファイルは消さずに残します）。
 */
import type { ExamProblem } from './exam';
import { countDocChars, normalizeText, sampleParagraphs, sampleProblems } from './document';

/** この問題の見本の文章（使えないときは null） */
export function docSampleOf(p: ExamProblem): string | null {
  if (!p.answerConfirmed || typeof p.answerText !== 'string' || !p.answerText.trim()) return null;
  if (sampleProblems(p.answerText).length > 0) return null;
  return normalizeText(p.answerText);
}

/** 使えない理由（先生向けの案内）。使えるときは null */
export function docUnavailableReason(p: ExamProblem): string | null {
  if (typeof p.answerText !== 'string' || !p.answerText.trim()) return '見本の文章を登録・確認すると使用できます';
  if (!p.answerConfirmed) return '見本の文章を登録・確認すると使用できます（まだ確認していません）';
  const errs = sampleProblems(p.answerText);
  if (errs.length > 0) return `見本の文章を確認してください：${errs[0]}`;
  return null;
}

export interface DocProblemInfo {
  problem: ExamProblem;
  sample: string;
  chars: number;
  paragraphs: number;
}

export function docInfo(p: ExamProblem): DocProblemInfo | null {
  const sample = docSampleOf(p);
  if (sample === null) return null;
  return { problem: p, sample, chars: countDocChars(sample), paragraphs: sampleParagraphs(sample).length };
}

/** 先生の問題の並び順：sortOrder（ないものは後ろ）→ 作成日時 → タイトル */
export function sortTeacherProblems(list: readonly ExamProblem[]): ExamProblem[] {
  return [...list].sort((a, b) => (a.sortOrder ?? 10_000) - (b.sortOrder ?? 10_000) || a.createdAt.localeCompare(b.createdAt) || a.title.localeCompare(b.title, 'ja'));
}
