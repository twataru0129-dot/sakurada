/**
 * ボウイの爆弾遊戯の問題（src/data/bowie/questions.json。納品されたファイルをそのまま使います）。
 *
 * - 判定は読み（reading）を既存のローマ字判定（RomajiMatcher）に渡します。romaji・display_romaji は表示の例で、
 *   正解の文字列としては使いません。
 * - 段階分けは、データの標準表示の打鍵数（keystrokes）のままです（別の打ち方で打鍵数が変わっても段階は変えません）。
 * - 原文（source_text）・確認メモ（review_note など）はデータに残し、画面には出しません。
 */
import data from '../../data/bowie/questions.json';
import type { StageNo } from './config';

export interface BowieQuestion {
  id: string;
  stage: StageNo;
  text: string;
  reading: string;
  /** 文章の読みのまとまり（表示の区切り。単語は1つ） */
  readingSegments: string[];
  /** 標準表示の打鍵数（段階分けの基準） */
  keystrokes: number;
  topic: string;
}

interface RawQuestion {
  id: string;
  text: string;
  reading: string;
  keystrokes: number;
  topic: string;
  reading_segments?: string[];
}

export const BOWIE_POOLS: Record<StageNo, BowieQuestion[]> = Object.fromEntries(
  (data.stages as { stage: number; questions: RawQuestion[] }[]).map((s) => [
    s.stage,
    s.questions.map((q) => ({
      id: q.id,
      stage: s.stage as StageNo,
      text: q.text,
      reading: q.reading,
      readingSegments: q.reading_segments && q.reading_segments.length ? q.reading_segments : [q.reading],
      keystrokes: q.keystrokes,
      topic: q.topic,
    })),
  ]),
) as Record<StageNo, BowieQuestion[]>;

export function secureRandom(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]! / 2 ** 32;
  } catch {
    return Math.random();
  }
}

/** 重複なしで n 問を選び、順番もランダムにします（Fisher–Yates） */
export function drawQuestions<T>(pool: readonly T[], n: number, random: () => number = secureRandom): T[] {
  const a = [...pool];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, Math.min(n, a.length));
}

/** 1回のプレイの問題（段階1〜4の順に、各段階 perStage 問） */
export function drawPlay(perStage: number, random: () => number = secureRandom): BowieQuestion[][] {
  return ([1, 2, 3, 4] as StageNo[]).map((s) => drawQuestions(BOWIE_POOLS[s], perStage, random));
}
