import { SentenceJudge, type SentenceEvaluation } from './sentence';

export type EnterDecision =
  /** IME の変換確定のための Enter。アプリは何もしない */
  | 'ime'
  /** 見本のこの位置に改行があるので、改行として入力させる */
  | 'newline'
  /** 改行が不要な位置の Enter。入力させず、ミスにもしない（問題のスキップや二重判定を防ぐ） */
  | 'block';

/**
 * 文章入力欄のイベントを受け取り、確定した文字だけを採点に渡します。
 *
 * ブラウザにより compositionend と input の順序が異なります
 * （Chrome: input → compositionend、Safari: compositionend → input など）。
 * どちらの順序でも、確定した値を「同じ値なら何度判定しても結果が変わらない」採点器に渡すことで、
 * 二重判定を防ぎます。
 */
export class ImeInputController {
  private composing = false;
  private lastCompositionEnd = Number.NEGATIVE_INFINITY;

  constructor(
    private judge: SentenceJudge,
    private readonly now: () => number = () => performance.now(),
  ) {}

  /** 次の問題に切り替えます（変換中かどうかの状態は引き継ぎます） */
  setJudge(judge: SentenceJudge): void {
    this.judge = judge;
  }

  get isComposing(): boolean {
    return this.composing;
  }

  compositionStart(): void {
    this.composing = true;
  }

  /** 変換の確定。value は確定後の入力欄の値 */
  compositionEnd(value: string): SentenceEvaluation {
    this.composing = false;
    this.lastCompositionEnd = this.now();
    return this.judge.evaluate(value);
  }

  /** input イベント。変換中なら判定しません（null を返す） */
  input(value: string, eventIsComposing: boolean): SentenceEvaluation | null {
    if (this.composing || eventIsComposing) return null;
    return this.judge.evaluate(value);
  }

  /**
   * keydown の Enter をどう扱うかを決めます。
   * @param caret 入力欄のカーソル位置（文字数）
   */
  enterKey(eventIsComposing: boolean, keyCode: number, caret: number): EnterDecision {
    if (this.composing || eventIsComposing || keyCode === 229) return 'ime';
    // 一部のブラウザでは、変換確定の直後に Enter の keydown が届くことがあります
    if (this.now() - this.lastCompositionEnd < 50) return 'block';
    return this.judge.expectedCharAt(caret) === '\n' ? 'newline' : 'block';
  }
}
