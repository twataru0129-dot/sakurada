/**
 * 文書作成モードの収録問題（v2.0.0）：exam_problems.json の30問を、document_order.json の順（やさしい順）に並べます。
 * 本文・タイトル・ID は変えません。級の段階（grade）は内部のデータとして残りますが、生徒向けの画面には出しません。
 */
import order from './exam/document_order.json';
import { BUILTIN_EXAM_PROBLEMS } from './examBuiltin';
import type { ExamProblem } from '../core/exam';

const byId = new Map(BUILTIN_EXAM_PROBLEMS.map((p) => [p.id, p]));

export const BUILTIN_DOC_PROBLEMS: readonly ExamProblem[] = order.order.map((id) => {
  const p = byId.get(id);
  if (!p) throw new Error(`並び順にない問題があります: ${id}`);
  return p;
});
if (BUILTIN_DOC_PROBLEMS.length !== BUILTIN_EXAM_PROBLEMS.length) throw new Error('並び順に入っていない収録問題があります');
