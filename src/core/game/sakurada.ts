/**
 * ゲーム「サクラダファミリアを完成させよ」の進行（画面から独立した処理）。
 *
 * - ローマ字の判定は既存の RomajiMatcher をそのまま使います（shi / si などの別の打ち方もすべて正解）。
 * - 工事の進み具合は「読み（reading）の文字数」で数えます。日本語の表示文の文字数や、実際の打鍵数とは別です。
 *   ローマ字の入力単位（「きゃ」「っか」「ん」など）が確定したときに、その単位のかなの文字数を加えます。
 *   どの打ち方（shi / si など）を選んでも、総量と残り文字数は変わりません。
 * - ミスでは工事は進まず、戻りもしません。記録に 5 秒を加えます。時間切れ・ゲームオーバーはありません。
 */
import { RomajiMatcher, type RomajiStyle } from '../romaji';

export const GAME_ID = 'sakurada-familia';
/** 適用するルールの版（ミス 1 回 5 秒・完成年の換算・工程の区切り） */
export const GAME_RULE_VERSION = 'sakurada-rule-v1';
export const MISS_PENALTY_MS = 5000;
export const START_YEAR = 1882;
/** 記録タイム 2 秒ごとに、ゲーム内の完成年が 1 年進みます */
export const MS_PER_YEAR = 2000;

export type CourseId = 'standard' | 'short';

export interface GameSentence {
  id: string;
  text: string;
  reading: string;
}

export interface GameStory {
  id: string;
  title: string;
  courseId: CourseId;
  sentences: GameSentence[];
}

// ---------------------------------------------------------------------
// 工程（建物の画像）
// ---------------------------------------------------------------------

export interface Stage {
  index: number;
  name: string;
  /** この工程になる完成率（％）。この値以上で切り替えます */
  fromPercent: number;
}

export const STAGES: readonly Stage[] = [
  { index: 0, name: '準備', fromPercent: 0 },
  { index: 1, name: '基礎工事', fromPercent: 5 },
  { index: 2, name: '壁の建築', fromPercent: 20 },
  { index: 3, name: '本体の建築', fromPercent: 40 },
  { index: 4, name: '塔の建築', fromPercent: 70 },
  { index: 5, name: '完成', fromPercent: 100 },
];

/** 進み具合から工程を求めます（整数の掛け算で比べるため、端数の丸めに左右されません） */
export function stageFor(completed: number, total: number): Stage {
  const c = Math.max(0, Math.min(completed, total));
  let s = STAGES[0]!;
  for (const st of STAGES) if (total > 0 && c * 100 >= st.fromPercent * total) s = st;
  return s;
}

/** 表示用の完成率（％・整数）。100％は全部入力し終えたときだけ（途中で 99.6％ を 100％ に丸めません） */
export function percentFor(completed: number, total: number): number {
  if (total <= 0) return 0;
  const c = Math.max(0, Math.min(completed, total));
  if (c >= total) return 100;
  return Math.min(99, Math.floor((c * 100) / total));
}

// ---------------------------------------------------------------------
// 時間と完成年
// ---------------------------------------------------------------------

export function penaltyMsFor(missCount: number): number {
  return Math.max(0, Math.floor(missCount)) * MISS_PENALTY_MS;
}

export function recordTimeMsFor(elapsedMs: number, missCount: number): number {
  return Math.max(0, Math.round(elapsedMs)) + penaltyMsFor(missCount);
}

/** ゲーム内の完成年 = 1882 + floor(記録タイム ÷ 2 秒)。上限は設けません（遅くても失敗にはしません） */
export function completionYearFor(recordTimeMs: number): number {
  return START_YEAR + Math.floor(Math.max(0, recordTimeMs) / MS_PER_YEAR);
}

/** 表示用：分と秒（例：3分46秒）。小数は切り捨てて表示するだけで、計算には生のミリ秒を使います */
export function formatGameTime(ms: number): string {
  const sec = Math.floor(Math.max(0, ms) / 1000);
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return m > 0 ? `${m}分${String(s).padStart(2, '0')}秒` : `${s}秒`;
}

/** 正確率（％）：正しい打鍵 ÷（正しい打鍵＋ミス）× 100。入力がなければ null */
export function accuracyFor(correct: number, miss: number): number | null {
  return correct + miss === 0 ? null : (correct * 100) / (correct + miss);
}

// ---------------------------------------------------------------------
// 進行
// ---------------------------------------------------------------------

/** 読みの文字数（Unicode の文字数。句読点も含む） */
export function readingLength(reading: string): number {
  return [...reading.normalize('NFC')].length;
}

export function totalReadingOf(story: Pick<GameStory, 'sentences'>): number {
  return story.sentences.reduce((n, s) => n + readingLength(s.reading), 0);
}

export type GameKeyResult = 'correct' | 'miss' | 'ignored';

export interface GameSnapshot {
  sentenceIndex: number;
  sentence: GameSentence;
  matcher: RomajiMatcher;
  completedReadingCharacters: number;
  totalReadingCharacters: number;
  correctKeystrokes: number;
  missCount: number;
  stage: Stage;
  done: boolean;
}

/** 1回のプレイの進行（物語の文を順番に入力します） */
export class SakuradaGame {
  readonly totalReadingCharacters: number;
  private index = 0;
  private matcher: RomajiMatcher;
  /** これまでに入力し終えた文の読みの文字数 */
  private finishedSentencesChars = 0;
  private correct = 0;
  private miss = 0;
  /** これまでの最も進んだ工程（後戻りしません） */
  private stageIndex = 0;

  constructor(
    readonly story: GameStory,
    readonly style: RomajiStyle,
  ) {
    if (story.sentences.length === 0) throw new Error('物語に文がありません');
    this.totalReadingCharacters = totalReadingOf(story);
    this.matcher = new RomajiMatcher(story.sentences[0]!.reading, style);
  }

  get done(): boolean {
    return this.index >= this.story.sentences.length;
  }

  /** いまの文で確定した入力単位のかなの文字数 */
  private currentSentenceChars(): number {
    if (this.done) return 0;
    let n = 0;
    const units = this.matcher.units;
    for (let i = 0; i < this.matcher.unitIndex && i < units.length; i++) n += [...units[i]!.kana].length;
    return n;
  }

  get completedReadingCharacters(): number {
    return Math.min(this.totalReadingCharacters, this.finishedSentencesChars + this.currentSentenceChars());
  }

  get correctKeystrokes(): number {
    return this.correct;
  }

  get missCount(): number {
    return this.miss;
  }

  /** 1文字を入力します。終わったあとは何も変えません */
  input(key: string): GameKeyResult {
    if (this.done) return 'ignored';
    const r = this.matcher.input(key);
    if (r === 'ignored') return 'ignored';
    if (r === 'miss') {
      this.miss++;
      return 'miss';
    }
    this.correct++;
    if (this.matcher.done) {
      // 文を入力し終えたら、待たずに次の文へ（それまでの進み具合を引き継ぎます）
      this.finishedSentencesChars += readingLength(this.story.sentences[this.index]!.reading);
      this.index++;
      if (!this.done) this.matcher = new RomajiMatcher(this.story.sentences[this.index]!.reading, this.style);
    }
    const st = stageFor(this.completedReadingCharacters, this.totalReadingCharacters);
    // 完成の画像は、全文を入力し終えたときだけ
    const idx = this.done ? 5 : Math.min(st.index, 4);
    if (idx > this.stageIndex) this.stageIndex = idx;
    return 'correct';
  }

  snapshot(): GameSnapshot {
    const i = Math.min(this.index, this.story.sentences.length - 1);
    return {
      sentenceIndex: this.index,
      sentence: this.story.sentences[i]!,
      matcher: this.matcher,
      completedReadingCharacters: this.completedReadingCharacters,
      totalReadingCharacters: this.totalReadingCharacters,
      correctKeystrokes: this.correct,
      missCount: this.miss,
      stage: STAGES[this.stageIndex]!,
      done: this.done,
    };
  }
}

// ---------------------------------------------------------------------
// 計時（一時停止つき）
// ---------------------------------------------------------------------

/**
 * プレイの経過時間。単調に増える時計（performance.now）で測り、タイマーが動いた回数は使いません。
 * タブを切り替えたりフォーカスが外れたりしても止めません。止まるのは「一時停止」を押している間だけです。
 */
export class GameClock {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedTotal = 0;
  private stoppedAt: number | null = null;
  pauseCount = 0;

  constructor(private readonly now: () => number = () => performance.now()) {}

  get started(): boolean {
    return this.startedAt !== null;
  }
  get paused(): boolean {
    return this.pausedAt !== null;
  }

  start(): void {
    if (this.startedAt === null) this.startedAt = this.now();
  }

  pause(): void {
    if (this.startedAt === null || this.pausedAt !== null || this.stoppedAt !== null) return;
    this.pausedAt = this.now();
    this.pauseCount++;
  }

  resume(): void {
    if (this.pausedAt === null) return;
    this.pausedTotal += this.now() - this.pausedAt;
    this.pausedAt = null;
  }

  stop(): void {
    if (this.startedAt === null || this.stoppedAt !== null) return;
    this.resume();
    this.stoppedAt = this.now();
  }

  elapsedMs(): number {
    if (this.startedAt === null) return 0;
    const end = this.stoppedAt ?? this.pausedAt ?? this.now();
    return Math.max(0, end - this.startedAt - this.pausedTotal);
  }
}
