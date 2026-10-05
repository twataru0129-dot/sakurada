/**
 * 文章入力〈変換あり〉の採点。
 *
 * - 判定するのは「確定済みの文字列」だけです（IME の変換途中の文字は呼び出し側で除外します）。
 * - 前回判定した文字列との差分から「今回新しく確定した範囲」を求め、
 *   見本との最適な対応付け（編集距離）で誤りになった文字のうち、新しく確定した範囲にあるものだけをミスに加えます。
 *   → 同じ誤りを残しているだけでは増えず、削除しても増えず、修正後に新たに誤れば増えます。
 * - 誤変換は文字数分（2文字の誤変換は2）、余分な文字（挿入）や抜け（脱字）も1文字ずつ数えます。
 * - 見本の後半が未入力であることは誤りにしません（見本の「先頭部分」との対応で判定します）。
 */

/** 比較用の正規化：全角英数記号→半角、波ダッシュの統一、改行コードの統一 */
export function normalizeChar(ch: string): string {
  const c = ch.codePointAt(0)!;
  if (c >= 0xff01 && c <= 0xff5e) return String.fromCodePoint(c - 0xfee0);
  if (ch === '～') return '〜';
  if (ch === '　') return ' ';
  return ch;
}

export function splitChars(s: string): string[] {
  return [...s.replace(/\r\n?/g, '\n').normalize('NFC')];
}

export type AlignOp =
  | { type: 'match'; vi: number; ti: number }
  | { type: 'sub'; vi: number; ti: number }
  | { type: 'ins'; vi: number }
  | { type: 'omit'; ti: number; before: number };

/**
 * 入力 v を見本 t の先頭部分に対応付けます（見本の末尾の未入力は誤りにしません）。
 * 同じ誤り数になる対応が複数あるときは、前の文字をできるだけ一致させる対応を選びます。
 */
export function align(v: string[], t: string[]): { cost: number; ops: AlignOp[] } {
  const n = v.length;
  const m = t.length;
  const vn = v.map(normalizeChar);
  const tn = t.map(normalizeChar);
  const W = m + 1;
  // f[i][j] = v[i..] を t[j..] の先頭部分に対応付ける最小の誤り数
  const f = new Int32Array((n + 1) * W);
  for (let j = 0; j <= m; j++) f[n * W + j] = 0;
  for (let i = n - 1; i >= 0; i--) {
    f[i * W + m] = n - i;
    for (let j = m - 1; j >= 0; j--) {
      const diag = f[(i + 1) * W + j + 1]! + (vn[i] === tn[j] ? 0 : 1);
      const ins = f[(i + 1) * W + j]! + 1;
      const omit = f[i * W + j + 1]! + 1;
      f[i * W + j] = Math.min(diag, ins, omit);
    }
  }
  const ops: AlignOp[] = [];
  let i = 0;
  let j = 0;
  while (i < n) {
    const cur = f[i * W + j]!;
    if (j < m && vn[i] === tn[j] && f[(i + 1) * W + j + 1] === cur) {
      ops.push({ type: 'match', vi: i, ti: j });
      i++;
      j++;
    } else if (j < m && f[(i + 1) * W + j + 1]! + 1 === cur) {
      ops.push({ type: 'sub', vi: i, ti: j });
      i++;
      j++;
    } else if (f[(i + 1) * W + j]! + 1 === cur) {
      ops.push({ type: 'ins', vi: i });
      i++;
    } else {
      ops.push({ type: 'omit', ti: j, before: i });
      j++;
    }
  }
  return { cost: f[0]!, ops };
}

export interface SentenceEvaluation {
  /** 今回の確定で新しく加わったミス（誤って確定した文字数） */
  newMisses: number;
  /** この問題で正しく受理されている文字数（改行を除く・重複なし） */
  correctChars: number;
  /** 見本どおりに完成したか */
  complete: boolean;
  /** 入力中で誤りになっている文字の位置 */
  errorIndexes: number[];
  /** 抜けている文字がある位置（その位置の文字の前が抜けている） */
  omissionBefore: number[];
  /** 先頭から正しく入力できている文字数 */
  correctPrefix: number;
}

export function countTargetChars(target: string): number {
  return splitChars(target).filter((c) => c !== '\n').length;
}

/** 1問分の文章入力の採点状態 */
export class SentenceJudge {
  readonly target: string[];
  private last: string[] = [];
  private totalMisses = 0;
  private lastEval: SentenceEvaluation;

  constructor(target: string) {
    this.target = splitChars(target);
    this.lastEval = {
      newMisses: 0,
      correctChars: 0,
      complete: this.target.length === 0,
      errorIndexes: [],
      omissionBefore: [],
      correctPrefix: 0,
    };
  }

  /** この問題で累積した誤確定文字数（修正後も残ります） */
  get misses(): number {
    return this.totalMisses;
  }

  get current(): SentenceEvaluation {
    return this.lastEval;
  }

  /**
   * 確定済みの文字列を判定します。同じ値で何度呼ばれても、ミスは重複して加算されません。
   */
  evaluate(committedValue: string): SentenceEvaluation {
    const v = splitChars(committedValue);
    const old = this.last;
    // 差分：前後の共通部分を除いた範囲が今回新しく確定した文字
    let p = 0;
    while (p < old.length && p < v.length && old[p] === v[p]) p++;
    let s = 0;
    while (s < old.length - p && s < v.length - p && old[old.length - 1 - s] === v[v.length - 1 - s]) s++;
    const insStart = p;
    const insEnd = v.length - s;

    const { ops } = align(v, this.target);
    const inNew = (idx: number) => idx >= insStart && idx < insEnd;
    let newMisses = 0;
    let correct = 0;
    const errorIndexes: number[] = [];
    const omissionBefore: number[] = [];
    for (const op of ops) {
      if (op.type === 'match') {
        if (this.target[op.ti] !== '\n') correct++;
      } else if (op.type === 'sub' || op.type === 'ins') {
        errorIndexes.push(op.vi);
        if (inNew(op.vi)) newMisses++;
      } else {
        omissionBefore.push(op.before);
        if (inNew(op.before)) newMisses++;
      }
    }
    let prefix = 0;
    while (prefix < v.length && prefix < this.target.length && normalizeChar(v[prefix]!) === normalizeChar(this.target[prefix]!)) prefix++;

    const complete = v.length === this.target.length && prefix === v.length;
    this.totalMisses += newMisses;
    this.last = v;
    this.lastEval = { newMisses, correctChars: correct, complete, errorIndexes, omissionBefore, correctPrefix: prefix };
    return this.lastEval;
  }

  /** 入力欄の位置 pos で次に入力すべき見本の文字（先頭から正しく入力できている場合のみ） */
  expectedCharAt(pos: number): string | null {
    if (pos !== this.lastEval.correctPrefix) return null;
    if (this.lastEval.errorIndexes.length > 0 || this.lastEval.omissionBefore.length > 0) return null;
    return this.target[pos] ?? null;
  }
}
