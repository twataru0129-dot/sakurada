import { describe, expect, it } from 'vitest';
import { buildGameResult } from '../../core/game/result';
import { cleanNickname, memorialContent, memorialFileName } from './memorial';

const r = buildGameResult({
  id: '00000000-0000-4000-8000-000000000001',
  storySetVersion: 'sakurada-stories-v2',
  storyId: 'inherited-dream-short',
  courseId: 'short',
  inputMethod: 'keyboard',
  romajiStyle: 'hepburn',
  startedAt: new Date('2026-10-06T05:00:00Z'),
  finishedAt: new Date('2026-10-06T05:03:46Z'),
  elapsedMs: 180_000,
  missCount: 6,
  correctKeystrokes: 937,
  completedReadingCharacters: 503,
  totalReadingCharacters: 503,
  pauseCount: 0,
  finished: true,
});

describe('完成記念画像の内容', () => {
  it('結果と同じ値（ミス加算後の記録タイム・ゲーム内の完成年・正確率）', () => {
    const c = memorialContent(r, '夢をつないだ建築物（短縮版）', '短縮コース', null);
    expect(c).toEqual({
      title: 'サクラダファミリアを完成させよ',
      yearLabel: 'ゲーム内の完成年',
      year: '西暦1987年',
      time: '3分30秒',
      accuracy: '99.3％',
      course: '短縮コース',
      story: '夢をつないだ建築物（短縮版）',
      nickname: null,
    });
  });
  it('ニックネームは任意。空・空白だけなら載せない。改行・制御文字を除き20文字まで', () => {
    expect(memorialContent(r, 's', 'c', '   ').nickname).toBeNull();
    expect(memorialContent(r, 's', 'c', ' さくら\n ').nickname).toBe('さくら');
    expect(cleanNickname('あ'.repeat(30))).toHaveLength(20);
  });
  it('ファイル名は日本語・名前を含まない', () => {
    expect(memorialFileName(r.finishedAt)).toMatch(/^sakurada-memorial-\d{8}-\d{6}\.png$/);
  });
});
