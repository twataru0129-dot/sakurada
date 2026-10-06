/**
 * 検定モード（文章入力）の共通の定義。
 *
 * 日本語ワープロ検定の速度分野を参考にした、アプリ独自の練習モードです。
 * 公式検定の採点を再現するものではなく、合格を認定するものでもありません。
 */

export type ExamGrade = '4' | '3' | 'pre2' | '2' | 'pre1' | '1';

export interface GradeInfo {
  grade: ExamGrade;
  label: string;
  /** 10分の標準設定で「目安達成」とする得点文字数 */
  targetCharacters: number;
  /** 1ミスあたりに入力文字数から引く文字数 */
  penaltyPerError: number;
}

/** 段階ごとの標準設定（練習用。公式の基準ではありません） */
export const GRADES: readonly GradeInfo[] = [
  { grade: '4', label: '4級相当', targetCharacters: 200, penaltyPerError: 1 },
  { grade: '3', label: '3級相当', targetCharacters: 300, penaltyPerError: 1 },
  { grade: 'pre2', label: '準2級相当', targetCharacters: 400, penaltyPerError: 3 },
  { grade: '2', label: '2級相当', targetCharacters: 500, penaltyPerError: 3 },
  { grade: 'pre1', label: '準1級相当', targetCharacters: 600, penaltyPerError: 5 },
  { grade: '1', label: '1級相当', targetCharacters: 700, penaltyPerError: 5 },
];

export const GRADE_IDS: readonly ExamGrade[] = GRADES.map((g) => g.grade);

export function isGrade(v: unknown): v is ExamGrade {
  return typeof v === 'string' && (GRADE_IDS as readonly string[]).includes(v);
}

export function gradeInfo(g: ExamGrade): GradeInfo {
  const info = GRADES.find((x) => x.grade === g);
  if (!info) throw new Error(`不明な段階: ${g}`);
  return info;
}

/** 標準の制限時間（秒）。「目安達成」の判定はこの時間で計測を完了したときだけ行います */
export const STANDARD_TIME_SECONDS = 600;
/** 選べる制限時間（秒）。null は時間制限なし */
export const TIME_OPTIONS: readonly (number | null)[] = [600, 300, 180, null];

export function timeLabel(seconds: number | null): string {
  if (seconds === null) return '時間制限なし';
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return s === 0 ? `${m}分` : `${m}分${s}秒`;
}

export function isTimeOption(v: unknown): v is number | null {
  return v === null || (typeof v === 'number' && TIME_OPTIONS.includes(v));
}

/** ページの向き（右回りの角度） */
export type Rotation = 0 | 90 | 180 | 270;

/** お手本（左側に表示するもの） */
export type ExamMaterial =
  | { kind: 'text' }
  | { kind: 'image'; pages: Array<{ fileId: string; rotation: Rotation }> }
  | { kind: 'pdf'; fileId: string; pages: Array<{ page: number; rotation: Rotation }> };

export interface ExamProblem {
  id: string;
  /** 改訂番号。本文・正解文・設定を変えるたびに 1 増えます（記録に残し、あとから再採点しません） */
  revision: number;
  title: string;
  grade: ExamGrade;
  source: 'builtin' | 'teacher';
  /** 標準の制限時間（秒）。null は時間制限なし */
  timeLimitSeconds: number | null;
  /** 自動採点する（正解文あり・確認済み） */
  scoringEnabled: boolean;
  /** 採点用の正解文（お手本とは別に保存します）。採点なしの問題は null */
  answerText: string | null;
  /** 正解文を先生が確認済み */
  answerConfirmed: boolean;
  /** 生徒向けに表示する（内蔵の問題は常に表示） */
  visible: boolean;
  material: ExamMaterial;
  createdAt: string;
  updatedAt: string;
}

/** 採点に使えるか（正解文があり、確認済み） */
export function isScorable(p: Pick<ExamProblem, 'scoringEnabled' | 'answerText' | 'answerConfirmed'>): boolean {
  return p.scoringEnabled && p.answerConfirmed && typeof p.answerText === 'string' && countExamChars(p.answerText) > 0;
}

// ---------------------------------------------------------------------
// 文字の扱い
// ---------------------------------------------------------------------

/** 文字数・比較から外す文字：改行、半角・全角スペース、タブ（ほかの記号・句読点・数字は比較します） */
const IGNORED = /[\t\n\r\v\f 　]/gu;

/** 採点に使う形：NFC にそろえ、改行・空白・タブを除いて 1 文字ずつ（サロゲートペアも 1 文字）に分けます */
export function examChars(text: string): string[] {
  return Array.from(text.normalize('NFC').replace(IGNORED, ''));
}

export function countExamChars(text: string): number {
  return examChars(text).length;
}

/**
 * お手本の文字（examChars の位置）ごとに、その文字のあとで段落が終わるか（改行があるか）を返します。
 * 結果画面で、違いの表示を段落ごとに区切るために使います。
 */
export function paragraphEnds(text: string): boolean[] {
  const ends: boolean[] = [];
  for (const ch of Array.from(text.normalize('NFC'))) {
    if (ch === '\n') {
      if (ends.length > 0) ends[ends.length - 1] = true;
    } else if (!/[\t\r\v\f 　]/u.test(ch)) {
      ends.push(false);
    }
  }
  return ends;
}
