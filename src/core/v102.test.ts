import { describe, expect, it } from 'vitest';
import { RomajiMatcher } from './romaji';
import { buildResult, conditionKey, endLabel, withEndMode, type PracticeConfig, type QuestionAttempt } from './result';
import { summarizeAttempt } from './missDetail';
import { sanitizeSettings, APP_DEFAULT_SETTINGS } from './settings';

describe('ローマ字のお手本（ヘボン式・訓令式）', () => {
  it('既定はヘボン式', () => {
    expect(APP_DEFAULT_SETTINGS.romajiStyle).toBe('hepburn');
    expect(new RomajiMatcher('しちつふじ').remaining()).toBe('shichitsufuji');
    expect(new RomajiMatcher('しゃしゅしょちゃちゅちょ').remaining()).toBe('shashushochachucho');
  });
  it('訓令式ではガイドが訓令式になる', () => {
    expect(new RomajiMatcher('しちつふじ', 'kunrei').remaining()).toBe('sitituhuzi');
    expect(new RomajiMatcher('しゃしゅしょちゃちゅちょじゃ', 'kunrei').remaining()).toBe('syasyusyotyatyutyozya');
    // 促音も訓令式の子音を重ねる
    expect(new RomajiMatcher('ざっし', 'kunrei').remaining()).toBe('zassi');
  });
  it('ぢ・づ・を・長音は、どちらの方式でも入力どおりの表記', () => {
    for (const style of ['hepburn', 'kunrei'] as const) {
      expect(new RomajiMatcher('ぢづをらーめん', style).remaining()).toBe('diduwora-menn');
    }
  });
  it('選択していない方式の正しい表記も正解', () => {
    const h = new RomajiMatcher('し');
    expect(h.input('s')).toBe('correct');
    expect(h.input('i')).toBe('correct'); // ヘボン式でも si は正解
    expect(h.done).toBe(true);
    const k = new RomajiMatcher('ち', 'kunrei');
    for (const c of 'chi') expect(k.input(c)).toBe('correct'); // 訓令式でも chi は正解
    expect(k.done).toBe(true);
  });
  it('入力途中で別の表記を使うと、残りのガイドが入力に合わせて変わる', () => {
    const k = new RomajiMatcher('しか', 'kunrei');
    expect(k.remaining()).toBe('sika');
    k.input('s');
    k.input('h');
    expect(k.remaining()).toBe('ika');
  });
  it('正しいキーの一覧は、ガイドの文字以外の正しい打ち方も含む', () => {
    const m = new RomajiMatcher('し');
    m.input('s');
    expect(m.acceptableKeys().sort()).toEqual(['h', 'i']);
  });
  it('設定の読み込み', () => {
    expect(sanitizeSettings({ romajiStyle: 'kunrei' })).toEqual({ romajiStyle: 'kunrei' });
    expect(sanitizeSettings({ romajiStyle: 'x' })).toEqual({});
  });
});

const base: PracticeConfig = { kind: 'romaji', endMode: 'time', minutes: 3, targetCount: null, inputMethod: 'keyboard', setType: 'standard', theme: 'all', difficulty: 'mixed', questionSetVersion: 'v' };

describe('問題数で練習', () => {
  it('時間制・25問・50問は別の条件', () => {
    const keys = new Set([
      conditionKey(base),
      conditionKey({ ...base, endMode: 'count', minutes: null, targetCount: 25 }),
      conditionKey({ ...base, endMode: 'count', minutes: null, targetCount: 50 }),
    ]);
    expect(keys.size).toBe(3);
  });
  it('時間制の条件キーはこれまでと同じ形（過去の記録との比較を保つ）', () => {
    expect(conditionKey(base)).toBe('romaji|3|keyboard|standard|all|mixed|v');
  });
  it('問題数制の完了は正式ランクにならない（参考ランク）。時間制の完走は正式ランク', () => {
    const totals = { correct: 300, miss: 5, completedQuestions: 25, elapsedMs: 200_000, finished: true };
    expect(buildResult('1', new Date(), { ...base, endMode: 'count', minutes: null, targetCount: 25 }, totals).official).toBe(false);
    expect(buildResult('1', new Date(), base, { ...totals, elapsedMs: 180_000 }).official).toBe(true);
  });
  it('終了条件を持たない古い記録は時間制として読み込む', () => {
    expect(withEndMode({ minutes: 5 } as Partial<PracticeConfig>).endMode).toBe('time');
    expect(endLabel({ endMode: 'time', minutes: 5, targetCount: null })).toBe('5分');
    expect(endLabel({ endMode: 'count', minutes: null, targetCount: 50 })).toBe('50問');
  });
});

function attempt(extra: Partial<QuestionAttempt>): QuestionAttempt {
  return { seq: 1, questionId: 'q', text: '囲碁', reading: 'いご', units: ['い', 'ご'], startMs: 1000, endMs: 4000, completed: true, correct: 3, miss: 0, typed: 'igo', remainingGuide: '', misses: [], ...extra };
}

describe('ミス詳細', () => {
  it('ミスした位置と押したキー・回数をまとめる', () => {
    const a = attempt({
      miss: 2,
      misses: [
        { position: 1, unitIndex: 1, kana: 'ご', typedBefore: 'i', guideChar: 'g', acceptable: ['g'], pressed: 'u' },
        { position: 1, unitIndex: 1, kana: 'ご', typedBefore: 'i', guideChar: 'g', acceptable: ['g'], pressed: 'u' },
      ],
    });
    const s = summarizeAttempt(a);
    expect(s.path.map((p) => p.missCount)).toEqual([0, 2, 0]);
    expect(s.explanations).toEqual([{ position: 1, kana: 'ご', guideChar: 'g', acceptable: ['g'], pressed: 'u', count: 2 }]);
    expect(s.pressedKeys).toEqual(['u']);
  });
  it('入力途中の問題は残りのガイドもつなげて表示する', () => {
    const a = attempt({ completed: false, typed: 'i', remainingGuide: 'go', miss: 1, misses: [{ position: 1, unitIndex: 1, kana: 'ご', typedBefore: 'i', guideChar: 'g', acceptable: ['g'], pressed: 'k' }] });
    const s = summarizeAttempt(a);
    expect(s.path.map((p) => p.ch).join('')).toBe('igo');
    expect(s.path.map((p) => p.part)).toEqual(['typed', 'rest', 'rest']);
    expect(s.path[1]!.missCount).toBe(1);
  });
  it('ミスがない出題回は結果の詳細に含めない', () => {
    const r = buildResult('1', new Date(), base, { correct: 6, miss: 1, completedQuestions: 2, elapsedMs: 180_000, finished: true }, [
      attempt({}),
      attempt({ seq: 2, miss: 1 }),
    ]);
    expect(r.missDetails?.map((a) => a.seq)).toEqual([2]);
    const none = buildResult('2', new Date(), base, { correct: 3, miss: 0, completedQuestions: 1, elapsedMs: 180_000, finished: true }, [attempt({})]);
    expect(none.missDetails).toBeUndefined();
  });
});
