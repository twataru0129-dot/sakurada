import type { Difficulty, Question } from './questions';
import type { PracticeKind } from './rank';

/**
 * 標準問題の出題ルール（正式ランクの対象）
 *
 * 一般問題から、次の難易度の順番をくり返して出題します。
 *   ローマ字入力： 1, 1, 2, 2, 3（やさしい単語2問 → 小さい文字などを含む単語2問 → 短文1問）
 *   文章入力　　： 1, 2, 1, 2, 3（初級 → 中級 → 初級 → 中級 → 上級）
 * 各難易度の問題はシャッフルして順に使い、使い切ったら並べ直します。
 * 直前と同じ問題は続けて出しません。どの時間（3・5・10分）でも問題が尽きることはありません。
 */
export const STANDARD_PATTERN: Record<PracticeKind, Difficulty[]> = {
  romaji: [1, 1, 2, 2, 3],
  sentence: [1, 2, 1, 2, 3],
};

export type Rng = () => number;

export function cryptoRng(): number {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return a[0]! / 0x1_0000_0000;
}

export function shuffle<T>(list: readonly T[], rng: Rng): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/** シャッフルした山から1問ずつ取り出します。使い切ったら並べ直し、直前と同じ問題を避けます。 */
class Pile {
  private queue: Question[] = [];
  constructor(private readonly pool: Question[], private readonly rng: Rng) {}
  get size() {
    return this.pool.length;
  }
  draw(lastId: string | null): Question {
    if (this.queue.length === 0) {
      this.queue = shuffle(this.pool, this.rng);
      if (this.queue.length > 1 && this.queue[0]!.id === lastId) {
        this.queue.push(this.queue.shift()!);
      }
    }
    let q = this.queue.shift()!;
    if (q.id === lastId && this.queue.length > 0) {
      const other = this.queue.shift()!;
      this.queue.push(q);
      q = other;
    }
    return q;
  }
}

export type DeckMode = { type: 'pattern'; kind: PracticeKind } | { type: 'shuffle' };

export class Deck {
  private piles = new Map<Difficulty, Pile>();
  private all: Pile;
  private step = 0;
  private lastId: string | null = null;

  constructor(questions: Question[], private readonly mode: DeckMode, rng: Rng = cryptoRng) {
    if (questions.length === 0) throw new Error('出題できる問題がありません');
    for (const d of [1, 2, 3] as Difficulty[]) {
      const pool = questions.filter((q) => q.difficulty === d);
      if (pool.length > 0) this.piles.set(d, new Pile(pool, rng));
    }
    this.all = new Pile(questions, rng);
  }

  next(): Question {
    let q: Question;
    if (this.mode.type === 'pattern') {
      const pattern = STANDARD_PATTERN[this.mode.kind];
      const want = pattern[this.step % pattern.length]!;
      this.step++;
      const pile = this.piles.get(want);
      q = pile ? pile.draw(this.lastId) : this.all.draw(this.lastId);
    } else {
      q = this.all.draw(this.lastId);
    }
    this.lastId = q.id;
    return q;
  }
}
