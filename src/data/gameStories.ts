/**
 * ゲーム「サクラダファミリアを完成させよ」の物語。
 *
 * - 標準コース：game_stories.json の stories の3本（物語の版 sakurada-stories-v1。v1.2.0 から変更なし）
 * - 短縮コース：game_stories_v2_short.json の3本（物語の版 sakurada-stories-v2。v1.3.0 から。標準の約半分）
 * - 旧短縮コース：game_stories.json の introductoryStories（約50打鍵）。もう遊べませんが、過去の記録の表示に使います。
 *
 * 比較・自己ベストの条件には物語の ID と物語の版が入るため、旧短縮と新短縮の記録は混ざりません。
 * 標準コースは物語の版・ID を変えていないため、v1.2.0 の記録とそのまま比べられます。
 */
import v1 from './game/game_stories.json';
import v2short from './game/game_stories_v2_short.json';
import type { CourseId, GameStory } from '../core/game/sakurada';

interface RawStory {
  id: string;
  title: string;
  sentences: Array<{ id: string; text: string; reading: string }>;
  metrics?: { japaneseCharacters?: number; readingCharacters?: number; guideKeystrokes?: { hepburn: number; kunrei: number } };
}
interface RawFile {
  schemaVersion: number;
  storySetVersion: string;
  stories: RawStory[];
  introductoryStories?: RawStory[];
}

export const GAME_STORY_FILE = v1 as RawFile;
export const SHORT_STORY_FILE = v2short as RawFile;

const toStory = (s: RawStory, courseId: CourseId, storySetVersion: string, legacy = false): GameStory => ({
  id: s.id,
  title: s.title,
  courseId,
  storySetVersion,
  legacy,
  sentences: s.sentences,
});

/** 遊べる物語（コースごとに3本） */
export const GAME_STORIES: Record<CourseId, readonly GameStory[]> = {
  standard: GAME_STORY_FILE.stories.map((s) => toStory(s, 'standard', GAME_STORY_FILE.storySetVersion)),
  short: SHORT_STORY_FILE.stories.map((s) => toStory(s, 'short', SHORT_STORY_FILE.storySetVersion)),
};

/** 旧短縮コース（約50打鍵）。記録の表示だけに使います */
export const LEGACY_SHORT_STORIES: readonly GameStory[] = (GAME_STORY_FILE.introductoryStories ?? []).map((s) =>
  toStory(s, 'short', GAME_STORY_FILE.storySetVersion, true),
);

export const COURSE_LABEL: Record<CourseId, string> = { standard: '標準コース', short: '短縮コース' };
export const LEGACY_SHORT_LABEL = '旧短縮コース（約50打鍵）';

/** コースの説明に使う、お手本（ヘボン式）の打鍵数の目安（実測値の範囲） */
export function courseKeystrokeRange(courseId: CourseId): { min: number; max: number } {
  const raw = courseId === 'standard' ? GAME_STORY_FILE.stories : SHORT_STORY_FILE.stories;
  const list = raw.map((s) => s.metrics?.guideKeystrokes?.hepburn ?? 0);
  return { min: Math.min(...list), max: Math.max(...list) };
}

export function findStory(id: string): GameStory | null {
  for (const list of [...Object.values(GAME_STORIES), LEGACY_SHORT_STORIES]) {
    const s = list.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
}

/** 記録のコースの表示（旧短縮コースの記録は区別して表示します） */
export function courseLabelOf(r: { courseId: CourseId; storyId: string }): string {
  if (r.courseId === 'short' && LEGACY_SHORT_STORIES.some((s) => s.id === r.storyId)) return LEGACY_SHORT_LABEL;
  return COURSE_LABEL[r.courseId];
}

/** コースの物語から、均等にランダムで1本を選びます（物語の途中では切り替えません） */
export function pickStory(courseId: CourseId, random: () => number = secureRandom): GameStory {
  const list = GAME_STORIES[courseId];
  const i = Math.min(list.length - 1, Math.floor(random() * list.length));
  return list[i]!;
}

function secureRandom(): number {
  try {
    const a = new Uint32Array(1);
    crypto.getRandomValues(a);
    return a[0]! / 2 ** 32;
  } catch {
    return Math.random();
  }
}
