/**
 * 桜ガーデンの練習問題（短い文章 500 文、src/data/garden/problems.json）と出題。
 *
 * - 判定は読み（reading）を既存のローマ字判定（RomajiMatcher）に渡すだけです。ローマ字の正解列は持ちません。
 * - カテゴリ・季節は出題の偏りを減らすためだけに使います（選ぶ画面はありません。現実の日付で絞りません）。
 * - 1回の練習の中では同じ問題を出しません。最近出た問題をできるだけ避け、同じカテゴリ・同じ主語・同じ文末の文が続かないようにします。
 */
import data from '../../data/garden/problems.json';

export interface GardenProblem {
  id: string;
  text: string;
  reading: string;
  category: string;
  season: string;
}

export const GARDEN_PROBLEMS = data.problems as GardenProblem[];
const BY_ID = new Map(GARDEN_PROBLEMS.map((p) => [p.id, p]));

export const problemById = (id: string): GardenProblem | undefined => BY_ID.get(id);

/** ごほうびに数える読みのかなの文字数（読みの文字数。打ち方の違い・打鍵数には関係しません） */
export const kanaCount = (p: GardenProblem): number => [...p.reading].length;

/** 主語のめやす：文の最初の助詞（の・が・は・を・に・で・も）より前 */
export function subjectOf(text: string): string {
  const m = /^(.+?)[のがはをにでも]/.exec(text);
  return m ? m[1]! : text.slice(0, 2);
}
/** 文末の形のめやす：最後の3文字 */
export const endingOf = (text: string): string => text.slice(-3);

export function secureRandom(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]! / 2 ** 32;
  } catch {
    return Math.random();
  }
}

function shuffled<T>(list: readonly T[], random: () => number): T[] {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a;
}

/**
 * 1回の練習の問題を選びます。
 * recent は最近出た問題の ID（新しい順）。できるだけ避け、足りないときだけ古いものから使います。
 */
export function pickProblems(count: number, recent: readonly string[], random: () => number = secureRandom, pool: readonly GardenProblem[] = GARDEN_PROBLEMS): GardenProblem[] {
  const recentSet = new Set(recent);
  const fresh = shuffled(pool.filter((p) => !recentSet.has(p.id)), random);
  // 最近の問題は、古いものほど先に使います
  const order = new Map(recent.map((id, i) => [id, i]));
  const old = pool.filter((p) => recentSet.has(p.id)).sort((a, b) => order.get(b.id)! - order.get(a.id)!);
  const candidates = [...fresh, ...old];
  const out: GardenProblem[] = [];
  const used = new Set<string>();
  const fits = (p: GardenProblem, prev: GardenProblem | undefined, strict: boolean) => {
    if (used.has(p.id)) return false;
    if (!prev) return true;
    if (subjectOf(p.text) === subjectOf(prev.text) || endingOf(p.text) === endingOf(prev.text)) return false;
    return !strict || p.category !== prev.category;
  };
  while (out.length < count && out.length < pool.length) {
    const prev = out[out.length - 1];
    const next = candidates.find((p) => fits(p, prev, true)) ?? candidates.find((p) => fits(p, prev, false)) ?? candidates.find((p) => !used.has(p.id));
    if (!next) break;
    used.add(next.id);
    out.push(next);
  }
  return out;
}
