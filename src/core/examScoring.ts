/**
 * 検定モードの練習用の採点（アプリ独自の規則。版：exam-v1）。
 *
 * 比較の前に、入力本文と正解文をどちらも examChars()（NFC・改行／空白／タブを除く）にそろえます。
 * 全角と半角、異なる記号は別の文字として比べます。
 *
 * ■ 対応付け（アラインメント）
 *   正解文の先頭と入力本文の先頭をそろえ（先頭を固定）、入力本文はすべて使い切ります。
 *   正解文の末尾のまだ入力していない部分は比較しません（ミスに数えません）。
 *   入力本文を正解文の途中の都合のよい場所へ当てはめたり、入力の末尾を切り捨てたりはしません。
 *
 *   操作と費用：一致 0、置換 1、挿入（余分な文字）1、脱落（正解文の文字が抜けた）1。
 *   「入力本文のすべて」と「正解文の先頭から j 文字」の対応付けのうち、次の順で最もよいものを選びます。
 *     1. 費用（置換＋挿入＋脱落）が最も小さい
 *     2. 同じ費用なら、一致した文字数が最も多い
 *     3. それでも同じなら、正解文をより先まで使ったもの（j が大きい）
 *        例：正解「あいうえ」に入力「あいx」→「う を x と打った（置換）」とし、「x が余分で う は未入力」とはしません
 *   途中の各位置で同じ評価の候補があるときは、置換・一致（斜め）→ 脱落 → 挿入 の順に優先します。
 *
 * ■ 成績
 *   ミス数 ＝ 置換＋挿入＋途中の脱落
 *   得点文字数 ＝ 入力文字数 − ミス数 × 段階の減点（0 未満は 0）
 */
import { examChars } from './exam';

export const SCORING_VERSION = 'exam-v1';
/** 採点できる長さの上限（計算量と記憶域の目安。正解文・入力本文とも、これを超える分は登録・入力できません） */
export const MAX_ANSWER_CHARS = 5000;
export const MAX_INPUT_CHARS = 8000;

export type AlignOp =
  | { op: 'match'; ref: string; input: string; refIndex: number }
  | { op: 'sub'; ref: string; input: string; refIndex: number }
  | { op: 'ins'; input: string; refIndex: number }
  | { op: 'del'; ref: string; refIndex: number };

export interface ExamScore {
  /** 入力文字数（改行・空白を除く確定済みの文字） */
  inputChars: number;
  /** 一致した文字数 */
  matchedChars: number;
  substitutions: number;
  insertions: number;
  /** 途中の脱落（未入力の末尾は含みません） */
  deletions: number;
  missCount: number;
  scoreChars: number;
  /** 正解文のうち、比較に使った先頭からの文字数 */
  comparedRefChars: number;
  refChars: number;
  /** 正解文の最後の文字まで入力した */
  reachedEnd: boolean;
  ops: AlignOp[];
}

const DIAG = 1;
const DEL = 2;
const INS = 3;

/** 先頭を固定し、正解文の末尾だけを未入力として残せる対応付けを求めます */
export function alignExam(ref: readonly string[], input: readonly string[]): { ops: AlignOp[]; refEnd: number } {
  const n = input.length;
  const m = ref.length;
  const W = m + 1;
  // 各位置で選んだ操作（復元用）。費用・一致数は 2 行分だけ持ちます
  const choice = new Uint8Array((n + 1) * W);
  let prevCost = new Int32Array(W);
  let prevMatch = new Int32Array(W);
  let curCost = new Int32Array(W);
  let curMatch = new Int32Array(W);
  for (let j = 0; j <= m; j++) {
    prevCost[j] = j;
    prevMatch[j] = 0;
    if (j > 0) choice[j] = DEL;
  }
  for (let i = 1; i <= n; i++) {
    const ch = input[i - 1];
    const row = i * W;
    curCost[0] = i;
    curMatch[0] = 0;
    choice[row] = INS;
    for (let j = 1; j <= m; j++) {
      const eq = ref[j - 1] === ch;
      // 斜め（一致・置換）
      let bc = prevCost[j - 1]! + (eq ? 0 : 1);
      let bm = prevMatch[j - 1]! + (eq ? 1 : 0);
      let bo = DIAG;
      // 脱落（正解文の文字を飛ばす）
      const dc = curCost[j - 1]! + 1;
      const dm = curMatch[j - 1]!;
      if (dc < bc || (dc === bc && dm > bm)) {
        bc = dc;
        bm = dm;
        bo = DEL;
      }
      // 挿入（余分な文字）
      const ic = prevCost[j]! + 1;
      const im = prevMatch[j]!;
      if (ic < bc || (ic === bc && im > bm)) {
        bc = ic;
        bm = im;
        bo = INS;
      }
      curCost[j] = bc;
      curMatch[j] = bm;
      choice[row + j] = bo;
    }
    [prevCost, curCost] = [curCost, prevCost];
    [prevMatch, curMatch] = [curMatch, prevMatch];
  }
  // 入力本文をすべて使い切った行（prev）で、最もよい終点 j を選びます
  let best = 0;
  for (let j = 1; j <= m; j++) {
    const c = prevCost[j]!;
    const bc = prevCost[best]!;
    if (c < bc || (c === bc && prevMatch[j]! >= prevMatch[best]!)) best = j;
  }
  // 復元
  const ops: AlignOp[] = [];
  let i = n;
  let j = best;
  while (i > 0 || j > 0) {
    const o = choice[i * W + j];
    if (o === DIAG) {
      const r = ref[j - 1]!;
      const s = input[i - 1]!;
      ops.push(r === s ? { op: 'match', ref: r, input: s, refIndex: j - 1 } : { op: 'sub', ref: r, input: s, refIndex: j - 1 });
      i--;
      j--;
    } else if (o === DEL) {
      ops.push({ op: 'del', ref: ref[j - 1]!, refIndex: j - 1 });
      j--;
    } else {
      ops.push({ op: 'ins', input: input[i - 1]!, refIndex: j });
      i--;
    }
  }
  ops.reverse();
  return { ops, refEnd: best };
}

/** 確定済みの入力本文を、正解文と比べて採点します */
export function scoreExam(answerText: string, inputText: string, penaltyPerError: number): ExamScore {
  const ref = examChars(answerText).slice(0, MAX_ANSWER_CHARS);
  const input = examChars(inputText).slice(0, MAX_INPUT_CHARS);
  const { ops, refEnd } = alignExam(ref, input);
  let matched = 0;
  let sub = 0;
  let ins = 0;
  let del = 0;
  for (const o of ops) {
    if (o.op === 'match') matched++;
    else if (o.op === 'sub') sub++;
    else if (o.op === 'ins') ins++;
    else del++;
  }
  const miss = sub + ins + del;
  return {
    inputChars: input.length,
    matchedChars: matched,
    substitutions: sub,
    insertions: ins,
    deletions: del,
    missCount: miss,
    scoreChars: Math.max(0, input.length - miss * penaltyPerError),
    comparedRefChars: refEnd,
    refChars: ref.length,
    reachedEnd: ref.length > 0 && refEnd === ref.length,
    ops,
  };
}
