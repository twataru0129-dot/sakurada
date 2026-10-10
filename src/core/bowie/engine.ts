/**
 * ボウイの爆弾遊戯の進行（画面から独立。時刻は呼び出し側から渡します）。
 *
 * 状態：待機（ready）→ 段階の表示（intro）→ 投球（throwing）→ 飛行（flying）→ 解除で次の投球へ …
 *       各段階の10問目を解除したあとはカットイン（cutin）、段階の20問目のあとは次の段階の表示、最後の問題で勝利（won）。
 *       爆弾が衝突ラインに届くと被弾（hit）。一時停止（paused）の間はゲームの時間が止まります。
 *
 * - 時間は1つの時計（ゲームの時間＝実時間から一時停止の時間を引いたもの）だけで決めます。フレーム数には依存しません。
 * - 爆弾の進み具合 p ＝ 飛行の経過時間 ÷ 着弾時間（0〜1）。得点は解除した時刻の p で決めます。
 * - 入力のときは、まずその時刻までの出来事（衝突など）を処理してから判定します。同じ時刻の解除と衝突は衝突を優先します。
 * - 投球中・カットイン中・段階の表示中のキーは捨てます（次の問題へためません）。
 * - 解除・被弾・加点・次の問題への切り替えは、1つの爆弾につき1回だけです。
 */
import { RomajiMatcher, type RomajiStyle } from '../romaji';
import { BOWIE_CONFIG, CUTIN_TOTAL_MS, landingMsFor, pointsFor, STAGES, type StageNo } from './config';
import type { BowieQuestion } from './questions';

export type Phase = 'ready' | 'intro' | 'throwing' | 'flying' | 'cutin' | 'paused' | 'hit' | 'won';

export type BowieEvent =
  | { type: 'stage'; stage: StageNo; at: number }
  | { type: 'throw'; at: number }
  | { type: 'release'; at: number; landingMs: number; question: BowieQuestion }
  | { type: 'correct' }
  | { type: 'typo' }
  | { type: 'disarm'; points: number; progress: number; at: number; question: BowieQuestion }
  | { type: 'danger'; at: number }
  | { type: 'cutin'; at: number }
  | { type: 'cutinEnd'; at: number }
  | { type: 'hit'; at: number }
  | { type: 'won'; at: number };

export interface BowieOptions {
  perStage?: number;
  /** 着弾時間などの倍率（開発用の確認だけで使います。通常は 1） */
  timeScale?: number;
}

export class BowieGame {
  readonly perStage: number;
  readonly total: number;
  private readonly timeScale: number;
  phase: Phase = 'ready';
  private resumePhase: Phase = 'ready';
  stageIndex = 0;
  /** 段階の中で、いま出題している（または次に出す）問題の番号（0始まり） */
  qIndex = 0;
  solved = 0;
  score = 0;
  matcher: RomajiMatcher | null = null;
  /** いまの状態が始まったゲームの時刻 */
  phaseStart = 0;
  releaseAt = 0;
  landingMs = 0;
  private dangerFired = false;
  private cutinsShown = 0;
  /** 実時間 → ゲームの時間 */
  private clockStart: number | null = null;
  private pausedTotal = 0;
  private pauseStartReal = 0;

  constructor(
    readonly questions: BowieQuestion[][],
    readonly style: RomajiStyle,
    opts: BowieOptions = {},
  ) {
    this.perStage = opts.perStage ?? BOWIE_CONFIG.questionsPerStage;
    this.timeScale = opts.timeScale ?? 1;
    this.total = questions.reduce((n, s) => n + Math.min(this.perStage, s.length), 0);
  }

  get stage(): StageNo {
    return STAGES[this.stageIndex]!.no;
  }
  get kind(): 'word' | 'sentence' {
    return STAGES[this.stageIndex]!.kind;
  }
  get question(): BowieQuestion | null {
    return this.questions[this.stageIndex]?.[this.qIndex] ?? null;
  }
  get maxPoints(): number {
    return BOWIE_CONFIG.maxPoints[this.kind];
  }
  get cutinCount(): number {
    return this.cutinsShown;
  }
  /** ゲームの時間（一時停止の時間を除く） */
  gameTime(real: number): number {
    if (this.clockStart === null) return 0;
    const pausing = this.phase === 'paused' ? real - this.pauseStartReal : 0;
    return real - this.clockStart - this.pausedTotal - pausing;
  }
  private ms(v: number) {
    return v * this.timeScale;
  }
  /** 投球の動作・段階の表示・カットイン・余韻の長さ（ゲームの時間。開発用の倍率を含みます） */
  get throwMs(): number {
    return this.ms(BOWIE_CONFIG.throwMs);
  }
  get introMs(): number {
    return this.ms(BOWIE_CONFIG.stageIntroMs);
  }
  get cutinMs(): number {
    return this.ms(CUTIN_TOTAL_MS);
  }
  scaled(v: number): number {
    return this.ms(v);
  }

  /** 爆弾の進み具合（飛行中だけ。0〜1） */
  progress(real: number): number {
    const ph = this.phase === 'paused' ? this.resumePhase : this.phase;
    if (ph === 'hit') return 1;
    if (ph !== 'flying') return 0;
    return Math.min(1, Math.max(0, (this.gameTime(real) - this.releaseAt) / this.landingMs));
  }

  start(real: number): BowieEvent[] {
    if (this.phase !== 'ready') return [];
    this.clockStart = real;
    this.pausedTotal = 0;
    this.phase = 'intro';
    this.phaseStart = 0;
    return [{ type: 'stage', stage: this.stage, at: 0 }];
  }

  /** その時刻までの、時間で起きる出来事を順に処理します */
  update(real: number): BowieEvent[] {
    const out: BowieEvent[] = [];
    if (this.phase === 'paused' || this.phase === 'ready' || this.phase === 'hit' || this.phase === 'won') return out;
    const g = this.gameTime(real);
    for (let guard = 0; guard < 10; guard++) {
      if (this.phase === 'intro') {
        const end = this.phaseStart + this.ms(BOWIE_CONFIG.stageIntroMs);
        if (g < end) break;
        this.beginThrow(end, out);
      } else if (this.phase === 'throwing') {
        const end = this.phaseStart + this.ms(BOWIE_CONFIG.throwMs);
        if (g < end) break;
        this.release(end, out);
      } else if (this.phase === 'cutin') {
        const end = this.phaseStart + this.ms(CUTIN_TOTAL_MS);
        if (g < end) break;
        out.push({ type: 'cutinEnd', at: end });
        this.beginThrow(end, out);
      } else if (this.phase === 'flying') {
        const landing = this.releaseAt + this.landingMs;
        if (!this.dangerFired && g >= this.releaseAt + this.landingMs * (1 - BOWIE_CONFIG.dangerRemaining)) {
          this.dangerFired = true;
          out.push({ type: 'danger', at: this.releaseAt + this.landingMs * (1 - BOWIE_CONFIG.dangerRemaining) });
        }
        if (g < landing) break;
        // 衝突：入力を終えます
        this.phase = 'hit';
        this.phaseStart = landing;
        this.matcher = null;
        out.push({ type: 'hit', at: landing });
        break;
      } else break;
    }
    return out;
  }

  private beginThrow(at: number, out: BowieEvent[]) {
    this.phase = 'throwing';
    this.phaseStart = at;
    this.matcher = null;
    out.push({ type: 'throw', at });
  }

  private release(at: number, out: BowieEvent[]) {
    const q = this.question!;
    this.phase = 'flying';
    this.phaseStart = at;
    this.releaseAt = at;
    this.landingMs = this.ms(landingMsFor(this.stage, this.qIndex + 1, this.perStage));
    this.dangerFired = false;
    // 爆弾が手を離れた瞬間に、問題の表示と入力・制限時間を同時に始めます
    this.matcher = new RomajiMatcher(q.reading, this.style);
    out.push({ type: 'release', at, landingMs: this.landingMs, question: q });
  }

  /** 1文字の入力（英字は小文字にします）。repeat のキーは呼び出し側で捨ててください */
  input(ch: string, real: number): BowieEvent[] {
    const out = this.update(real);
    if (this.phase !== 'flying' || !this.matcher) return out;
    const r = this.matcher.input(ch.toLowerCase());
    if (r === 'ignored') return out;
    if (r === 'miss') {
      // ミスは減点・時間短縮なし。入力は進みません
      out.push({ type: 'typo' });
      return out;
    }
    out.push({ type: 'correct' });
    if (!this.matcher.done) return out;
    const g = this.gameTime(real);
    const p = (g - this.releaseAt) / this.landingMs;
    const points = pointsFor(this.maxPoints, p);
    if (points === null) return out; // update で衝突を先に処理しているため、ここには来ません
    const q = this.question!;
    this.score += points;
    this.solved += 1;
    this.matcher = null;
    out.push({ type: 'disarm', points, progress: p, at: g, question: q });
    const half = Math.floor(this.perStage / 2);
    const stageLen = Math.min(this.perStage, this.questions[this.stageIndex]!.length);
    this.qIndex += 1;
    if (this.qIndex >= stageLen) {
      if (this.stageIndex >= this.questions.length - 1) {
        this.phase = 'won';
        this.phaseStart = g;
        out.push({ type: 'won', at: g });
        return out;
      }
      this.stageIndex += 1;
      this.qIndex = 0;
      this.phase = 'intro';
      this.phaseStart = g;
      out.push({ type: 'stage', stage: this.stage, at: g });
      return out;
    }
    if (this.qIndex === half && half > 0) {
      // 各段階の10問目を解除した直後、11問目の投球の前に1回だけ
      this.cutinsShown += 1;
      this.phase = 'cutin';
      this.phaseStart = g;
      out.push({ type: 'cutin', at: g });
      return out;
    }
    this.beginThrow(g, out);
    return out;
  }

  pause(real: number): boolean {
    if (!['intro', 'throwing', 'flying', 'cutin'].includes(this.phase)) return false;
    this.update(real);
    if (!['intro', 'throwing', 'flying', 'cutin'].includes(this.phase)) return false;
    this.resumePhase = this.phase;
    this.phase = 'paused';
    this.pauseStartReal = real;
    return true;
  }

  resume(real: number): boolean {
    if (this.phase !== 'paused') return false;
    this.pausedTotal += real - this.pauseStartReal;
    this.phase = this.resumePhase;
    return true;
  }

  /** 一時停止の前の状態（画面の表示用） */
  get activePhase(): Phase {
    return this.phase === 'paused' ? this.resumePhase : this.phase;
  }
}
