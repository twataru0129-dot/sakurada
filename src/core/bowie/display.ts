/**
 * 問題の表示：読みのまとまり（文章の reading_segments。単語は1つ）ごとに、入力単位の読み・ローマ字を並べます。
 * - 判定は RomajiMatcher のまま。入力済みは実際に打った文字、これからの部分はお手本の打ち方で表示します
 *   （別の打ち方を選ぶと、残りの表示もそれに合わせて変わります）。
 * - まとまりの間の空白は表示だけで、入力は続けて打ちます。
 */
import { displayLines, type DisplayUnit } from '../game/romajiDisplay';
import type { RomajiStyle } from '../romaji';
import type { BowieQuestion } from './questions';

export interface DisplaySegment {
  kana: string;
  units: DisplayUnit[];
}

export function displaySegments(q: Pick<BowieQuestion, 'reading' | 'readingSegments'>, style: RomajiStyle, typed: string): DisplaySegment[] {
  const units = displayLines(q.reading, style, typed).flat();
  const ends: number[] = [];
  let acc = 0;
  for (const s of q.readingSegments) ends.push((acc += [...s].length));
  const out: DisplaySegment[] = q.readingSegments.map((kana) => ({ kana, units: [] }));
  let pos = 0;
  for (const u of units) {
    // 単位の最初のかなが入っているまとまりに入れます
    const seg = Math.max(0, ends.findIndex((e) => pos < e));
    out[seg === -1 ? out.length - 1 : seg]!.units.push(u);
    pos += [...u.kana].length;
  }
  return out;
}

/** ローマ字の表示（大文字。打つのは小文字のままで、Shift は要りません） */
export const shown = (s: string): string => s.toUpperCase();
