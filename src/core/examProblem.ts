/**
 * 先生が追加する検定問題の確認（保存・教材パックの読み込みの両方で使います）。
 */
import { countExamChars, gradeInfo, isGrade, isTimeOption, type ExamMaterial, type ExamProblem, type Rotation } from './exam';
import { MAX_IMAGE_FILES, MAX_PDF_PAGES } from './examFiles';
import { MAX_ANSWER_CHARS } from './examScoring';

export const MAX_TITLE_CHARS = 60;

const ROTATIONS: readonly Rotation[] = [0, 90, 180, 270];
const isRotation = (v: unknown): v is Rotation => ROTATIONS.includes(v as Rotation);
const isIsoDate = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
export const isFileId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);
export const isProblemId = (v: unknown): v is string => typeof v === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(v);

export function newTeacherProblemId(): string {
  return `tp-${crypto.randomUUID()}`;
}
export function newFileId(): string {
  return `f-${crypto.randomUUID()}`;
}

/** 題名の確認（制御文字・山かっこは使えません） */
export function titleError(title: string): string | null {
  const t = title.trim();
  if (!t) return '問題名を入力してください';
  if ([...t].length > MAX_TITLE_CHARS) return `問題名は${MAX_TITLE_CHARS}文字までです`;
  // eslint-disable-next-line no-control-regex
  if (/[\u0000-\u001f\u007f<>]/.test(t)) return '問題名に改行・制御文字・< > は使えません';
  return null;
}

/** 正解文が目安文字数より短いときの通知（保存はできます） */
export function shortAnswerNotice(p: Pick<ExamProblem, 'grade' | 'answerText'>): string | null {
  if (!p.answerText) return null;
  const n = countExamChars(p.answerText);
  const target = gradeInfo(p.grade).targetCharacters;
  return n < target ? `正解文は${n}文字で、${gradeInfo(p.grade).label}の目安（${target}文字）より短い教材です。短い教材として保存できます。` : null;
}

function materialErrors(m: unknown): string[] {
  if (!m || typeof m !== 'object') return ['お手本の情報がありません'];
  const x = m as Record<string, unknown>;
  if (x.kind === 'image') {
    const pages = x.pages;
    if (!Array.isArray(pages) || pages.length === 0) return ['お手本の画像を選んでください'];
    if (pages.length > MAX_IMAGE_FILES) return [`画像は${MAX_IMAGE_FILES}枚までです`];
    if (!pages.every((p) => p && typeof p === 'object' && isFileId((p as { fileId?: unknown }).fileId) && isRotation((p as { rotation?: unknown }).rotation))) {
      return ['画像の情報が正しくありません'];
    }
    return [];
  }
  if (x.kind === 'pdf') {
    if (!isFileId(x.fileId)) return ['PDF の情報が正しくありません'];
    const pages = x.pages;
    if (!Array.isArray(pages) || pages.length === 0) return ['使う PDF のページを1ページ以上選んでください'];
    if (pages.length > MAX_PDF_PAGES) return [`PDF のページは${MAX_PDF_PAGES}ページまでです`];
    const ok = pages.every((p) => {
      const q = p as { page?: unknown; rotation?: unknown };
      return p && typeof p === 'object' && Number.isInteger(q.page) && (q.page as number) >= 1 && (q.page as number) <= 10000 && isRotation(q.rotation);
    });
    return ok ? [] : ['PDF のページの情報が正しくありません'];
  }
  return ['お手本は画像または PDF にしてください'];
}

/** 先生の問題として正しいか。誤りの説明を返します（空なら正しい） */
export function validateTeacherProblem(p: unknown): string[] {
  if (!p || typeof p !== 'object') return ['問題の情報が正しくありません'];
  const x = p as Record<string, unknown>;
  const errors: string[] = [];
  if (!isProblemId(x.id)) errors.push('問題のIDが正しくありません');
  if (!Number.isInteger(x.revision) || (x.revision as number) < 1 || (x.revision as number) > 1_000_000) errors.push('改訂番号が正しくありません');
  if (typeof x.title !== 'string') errors.push('問題名を入力してください');
  else {
    const e = titleError(x.title);
    if (e) errors.push(e);
  }
  if (!isGrade(x.grade)) errors.push('級相当の段階を選んでください');
  if (!isTimeOption(x.timeLimitSeconds ?? null)) errors.push('制限時間が正しくありません');
  if (x.source !== 'teacher') errors.push('問題の種類が正しくありません');
  if (typeof x.scoringEnabled !== 'boolean' || typeof x.answerConfirmed !== 'boolean' || typeof x.visible !== 'boolean') errors.push('設定の値が正しくありません');
  if (x.answerText !== null && typeof x.answerText !== 'string') errors.push('正解文が正しくありません');
  if (typeof x.answerText === 'string' && countExamChars(x.answerText) > MAX_ANSWER_CHARS) errors.push(`正解文は${MAX_ANSWER_CHARS}文字までです`);
  if (x.scoringEnabled === true) {
    if (typeof x.answerText !== 'string' || countExamChars(x.answerText) === 0) errors.push('自動採点するには、採点用の正解文を入力してください（または「採点なし」を選んでください）');
    else if (x.answerConfirmed !== true) errors.push('正解文の読み順・タイトル・ページ番号などを確認し、「正解文を確認済み」にしてください');
  }
  if (!isIsoDate(x.createdAt) || !isIsoDate(x.updatedAt)) errors.push('日時の情報が正しくありません');
  errors.push(...materialErrors(x.material));
  return errors;
}

/** 問題が参照するファイルの ID */
export function materialFileIds(m: ExamMaterial): string[] {
  if (m.kind === 'image') return [...new Set(m.pages.map((p) => p.fileId))];
  if (m.kind === 'pdf') return [m.fileId];
  return [];
}
