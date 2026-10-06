/**
 * ゲーム「サクラダファミリアを完成させよ」の物語（game_stories.json をそのまま使います）。
 * 標準コースは stories の3本、短縮コースは introductoryStories の3本です。
 */
import raw from './game/game_stories.json';
import type { CourseId, GameStory } from '../core/game/sakurada';

interface RawStory {
  id: string;
  title: string;
  sentences: Array<{ id: string; text: string; reading: string }>;
  metrics?: { readingCharacters?: number; guideKeystrokes?: { hepburn: number; kunrei: number } };
}
interface RawFile {
  schemaVersion: number;
  storySetVersion: string;
  gameId: string;
  displayName: string;
  stories: RawStory[];
  introductoryStories: RawStory[];
}

export const GAME_STORY_FILE = raw as RawFile;
export const STORY_SET_VERSION = GAME_STORY_FILE.storySetVersion;

const toStory = (s: RawStory, courseId: CourseId): GameStory => ({ id: s.id, title: s.title, courseId, sentences: s.sentences });

export const GAME_STORIES: Record<CourseId, readonly GameStory[]> = {
  standard: GAME_STORY_FILE.stories.map((s) => toStory(s, 'standard')),
  short: GAME_STORY_FILE.introductoryStories.map((s) => toStory(s, 'short')),
};

export const COURSE_LABEL: Record<CourseId, string> = { standard: '標準コース', short: '短縮コース' };

export function findStory(id: string): GameStory | null {
  for (const list of Object.values(GAME_STORIES)) {
    const s = list.find((x) => x.id === id);
    if (s) return s;
  }
  return null;
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
