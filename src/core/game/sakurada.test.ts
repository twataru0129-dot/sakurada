import { describe, expect, it } from 'vitest';
import { RomajiMatcher, tokenize } from '../romaji';
import { GAME_STORIES, GAME_STORY_FILE, pickStory } from '../../data/gameStories';
import {
  accuracyFor,
  completionYearFor,
  formatGameTime,
  GameClock,
  percentFor,
  penaltyMsFor,
  readingLength,
  recordTimeMsFor,
  SakuradaGame,
  stageFor,
  totalReadingOf,
  type GameStory,
} from './sakurada';

const ALL = [...GAME_STORIES.standard, ...GAME_STORIES.short];

/** ガイドどおりに1文字ずつ打ち、各打鍵後の状態を記録します */
function playGuide(story: GameStory, style: 'hepburn' | 'kunrei') {
  const g = new SakuradaGame(story, style);
  const progress: number[] = [g.completedReadingCharacters];
  const stages: number[] = [g.snapshot().stage.index];
  let keys = 0;
  while (!g.done) {
    const k = g.snapshot().matcher.nextKey()!;
    expect(g.input(k)).toBe('correct');
    keys++;
    progress.push(g.completedReadingCharacters);
    stages.push(g.snapshot().stage.index);
  }
  return { g, progress, stages, keys };
}

describe('物語データ', () => {
  it('標準3本・短縮3本。ID が重複せず、文と読みが空でない', () => {
    expect(GAME_STORIES.standard).toHaveLength(3);
    expect(GAME_STORIES.short).toHaveLength(3);
    const ids = ALL.flatMap((s) => [s.id, ...s.sentences.map((x) => x.id)]);
    expect(new Set(ids).size).toBe(ids.length);
    for (const s of ALL) for (const x of s.sentences) expect(x.text && x.reading).toBeTruthy();
  });
  it('年月などの数字は表示文でも漢数字（読みと対応させるため、算用数字を使っていない）', () => {
    for (const s of ALL) for (const x of s.sentences) expect(x.text, x.id).not.toMatch(/[0-9０-９]/);
  });
  it('読みの文字数・お手本の打鍵数が JSON の計測値と一致する', () => {
    for (const raw of [...GAME_STORY_FILE.stories, ...GAME_STORY_FILE.introductoryStories]) {
      const s = ALL.find((x) => x.id === raw.id)!;
      expect(totalReadingOf(s)).toBe(raw.metrics!.readingCharacters);
      for (const style of ['hepburn', 'kunrei'] as const) {
        const keys = s.sentences.reduce((n, x) => n + new RomajiMatcher(x.reading, style).remaining().length, 0);
        expect(keys, `${s.id} ${style}`).toBe(raw.metrics!.guideKeystrokes![style]);
      }
    }
  });
  it('読みの文字数は、入力単位のかなの文字数の合計と同じ（進み具合の総量が打ち方で変わらない）', () => {
    for (const s of ALL) for (const x of s.sentences) {
      expect(tokenize(x.reading).reduce((n, u) => n + [...u.kana].length, 0)).toBe(readingLength(x.reading));
    }
  });
  it('コースの3本から均等に選ぶ', () => {
    expect(pickStory('standard', () => 0).id).toBe(GAME_STORIES.standard[0]!.id);
    expect(pickStory('standard', () => 0.5).id).toBe(GAME_STORIES.standard[1]!.id);
    expect(pickStory('standard', () => 0.9999).id).toBe(GAME_STORIES.standard[2]!.id);
    expect(pickStory('short', () => 0.4).courseId).toBe('short');
  });
});

describe('最後まで入力できる', () => {
  for (const s of ALL) {
    for (const style of ['hepburn', 'kunrei'] as const) {
      it(`${s.title}（${style}）：ガイドどおりに最後まで入力でき、0％→100％・残り0文字・完成`, () => {
        const { g, progress, stages } = playGuide(s, style);
        expect(progress[0]).toBe(0);
        expect(progress.at(-1)).toBe(g.totalReadingCharacters);
        // 進み具合は戻らない・総量を超えない
        for (let i = 1; i < progress.length; i++) expect(progress[i]!).toBeGreaterThanOrEqual(progress[i - 1]!);
        expect(Math.max(...progress)).toBe(g.totalReadingCharacters);
        // 工程は後戻りせず、完成は最後の1打鍵だけ
        for (let i = 1; i < stages.length; i++) expect(stages[i]!).toBeGreaterThanOrEqual(stages[i - 1]!);
        expect(stages.filter((x) => x === 5)).toHaveLength(1);
        expect(stages.at(-1)).toBe(5);
        expect(new Set(stages)).toEqual(new Set([0, 1, 2, 3, 4, 5]));
        expect(g.snapshot().done).toBe(true);
        expect(percentFor(g.completedReadingCharacters, g.totalReadingCharacters)).toBe(100);
      });
    }
  }
});

describe('別の打ち方でも正解・進み具合は同じ', () => {
  const story: GameStory = {
    id: 't',
    title: 't',
    courseId: 'short',
    sentences: [
      { id: 'a', text: '', reading: 'しんぶん、きゃく。' },
      { id: 'b', text: '', reading: 'がっこうで、ちず。' },
    ],
  };
  const typeAll = (keys: string) => {
    const g = new SakuradaGame(story, 'hepburn');
    const trace: number[] = [];
    for (const k of keys) {
      expect(g.input(k), `key ${k}`).toBe('correct');
      trace.push(g.completedReadingCharacters);
    }
    return { g, trace };
  };
  it('shi / si、chi / ti、ji / zi、nn / n、kya / kilya、促音の重ね打ちと xtu', () => {
    const a = typeAll('shinbun,kyaku.gakkoude,chizu.');
    const b = typeAll("sinnbunn,kilyaku.gaxtukoude,tizu.");
    for (const r of [a, b]) {
      expect(r.g.done).toBe(true);
      expect(r.g.completedReadingCharacters).toBe(18);
    }
  });
  it('拗音「きゃ」は確定時に読み2文字、促音「っこ」も2文字、「ん」は次のキーで確定', () => {
    const g = new SakuradaGame(story, 'hepburn');
    for (const k of 'shi') g.input(k);
    expect(g.completedReadingCharacters).toBe(1); // し
    g.input('n');
    expect(g.completedReadingCharacters).toBe(1); // 「ん」はまだ確定していない
    g.input('b'); // n 1回の「ん」が確定し、b は「ぶ」の入力
    expect(g.completedReadingCharacters).toBe(2);
    for (const k of 'un,') g.input(k);
    expect(g.completedReadingCharacters).toBe(5); // しんぶん、（「ん」は「、」の入力で確定）
    g.input('k');
    g.input('y');
    expect(g.completedReadingCharacters).toBe(5); // 途中のローマ字では増えない
    g.input('a');
    expect(g.completedReadingCharacters).toBe(7); // きゃ ＝ 2文字
    for (const k of 'ku.') g.input(k);
    expect(g.completedReadingCharacters).toBe(9); // 1文目が終わり、2文目へ引き継ぐ
    expect(g.snapshot().sentenceIndex).toBe(1);
    for (const k of 'ga') g.input(k);
    for (const k of 'kko') g.input(k);
    expect(g.completedReadingCharacters).toBe(12); // が ＋ っこ（2文字）
  });
  it('ミスでは進まず、戻らず、残りも変わらない（ミス回数だけ増える）', () => {
    const g = new SakuradaGame(story, 'hepburn');
    for (const k of 'shi') g.input(k);
    const before = g.completedReadingCharacters;
    expect(g.input('q')).toBe('miss');
    expect(g.input('z')).toBe('miss');
    expect(g.completedReadingCharacters).toBe(before);
    expect(g.missCount).toBe(2);
    expect(g.correctKeystrokes).toBe(3);
    // ミスのあとも、そのまま続けられる（待ち時間なし）
    expect(g.input('n')).toBe('correct');
  });
  it('終わったあとのキーでは数値が変わらない', () => {
    const { g } = playGuide(GAME_STORIES.short[0]!, 'hepburn');
    const snap = { c: g.correctKeystrokes, m: g.missCount, p: g.completedReadingCharacters };
    expect(g.input('a')).toBe('ignored');
    expect(g.input('q')).toBe('ignored');
    expect({ c: g.correctKeystrokes, m: g.missCount, p: g.completedReadingCharacters }).toEqual(snap);
  });
  it('文字ではないキー（名前つきのキー）は判定しない', () => {
    const g = new SakuradaGame(story, 'hepburn');
    expect(g.input('Shift')).toBe('ignored');
    expect(g.input('Enter')).toBe('ignored');
    expect(g.missCount).toBe(0);
  });
});

describe('工程と完成率', () => {
  it('0・5・20・40・70・100％で工程が切り替わる（整数で比較）', () => {
    expect(stageFor(0, 1000).name).toBe('準備');
    expect(stageFor(49, 1000).name).toBe('準備');
    expect(stageFor(50, 1000).name).toBe('基礎工事');
    expect(stageFor(199, 1000).name).toBe('基礎工事');
    expect(stageFor(200, 1000).name).toBe('壁の建築');
    expect(stageFor(400, 1000).name).toBe('本体の建築');
    expect(stageFor(700, 1000).name).toBe('塔の建築');
    expect(stageFor(999, 1000).name).toBe('塔の建築');
    expect(stageFor(1000, 1000).name).toBe('完成');
  });
  it('完成率は0〜100％に収め、全部入力するまで100％にしない', () => {
    expect(percentFor(-5, 100)).toBe(0);
    expect(percentFor(999, 1000)).toBe(99);
    expect(percentFor(1000, 1000)).toBe(100);
    expect(percentFor(2000, 1000)).toBe(100);
    expect(percentFor(650, 1000)).toBe(65);
  });
});

describe('時間と完成年', () => {
  it('ミス6回・入力3分 → 記録3分30秒', () => {
    const t = recordTimeMsFor(180_000, 6);
    expect(penaltyMsFor(6)).toBe(30_000);
    expect(t).toBe(210_000);
    expect(formatGameTime(t)).toBe('3分30秒');
  });
  it('3分46秒 → 1995年、4分56秒 → 2030年、8分 → 2122年', () => {
    expect(completionYearFor(226_000)).toBe(1995);
    expect(completionYearFor(296_000)).toBe(2030);
    expect(completionYearFor(480_000)).toBe(2122);
  });
  it('表示の丸めは計算を変えない（生のミリ秒で計算）', () => {
    expect(completionYearFor(225_999)).toBe(1994);
    expect(formatGameTime(225_999)).toBe('3分45秒');
    expect(completionYearFor(recordTimeMsFor(1999.6, 0))).toBe(1883); // 1999.6ms は 2000ms に四捨五入して保存
    expect(completionYearFor(0)).toBe(1882);
    // 遅くても上限で同じ年に丸めない
    expect(completionYearFor(3_600_000)).toBe(3682);
    expect(completionYearFor(3_602_000)).toBe(3683);
  });
  it('正確率', () => {
    expect(accuracyFor(95, 5)).toBe(95);
    expect(accuracyFor(0, 0)).toBeNull();
  });
});

describe('計時', () => {
  it('一時停止の間は進まず、回数を数える。止めたあとは増えない', () => {
    let t = 1000;
    const c = new GameClock(() => t);
    c.start();
    t += 5000;
    c.pause();
    t += 60_000;
    expect(c.elapsedMs()).toBe(5000);
    c.resume();
    t += 1000;
    expect(c.elapsedMs()).toBe(6000);
    expect(c.pauseCount).toBe(1);
    c.stop();
    t += 9999;
    expect(c.elapsedMs()).toBe(6000);
  });
});
