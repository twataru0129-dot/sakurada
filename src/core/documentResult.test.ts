import { describe, expect, it } from 'vitest';
import type { ExamProblem } from './exam';
import { docInfo, docSampleOf, docUnavailableReason, sortTeacherProblems } from './documentProblem';
import { buildDocOutcome, mergeDocRecords, parseDocRecord } from './documentResult';
import { clearGuestDocHistory, GUEST_DOC_HISTORY_KEY, loadGuestDocHistory, saveGuestDocRecord } from '../data/guestDocHistory';

function problem(extra: Partial<ExamProblem> = {}): ExamProblem {
  return {
    id: 'tp-1',
    revision: 2,
    title: '朝の準備',
    grade: '4',
    source: 'teacher',
    timeLimitSeconds: null,
    scoringEnabled: true,
    answerText: '朝の準備をします。\n学校へ行きます。',
    answerConfirmed: true,
    visible: true,
    material: { kind: 'text' },
    createdAt: '2026-10-14T00:00:00.000Z',
    updatedAt: '2026-10-14T00:00:00.000Z',
    ...extra,
  };
}

class MemStorage implements Storage {
  private m = new Map<string, string>();
  get length() {
    return this.m.size;
  }
  clear() {
    this.m.clear();
  }
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  key(i: number) {
    return [...this.m.keys()][i] ?? null;
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
  setItem(k: string, v: string) {
    this.m.set(k, v);
  }
}

const outcome = (id: string, inputs = [{ text: '朝の準備をしまず。', endBreak: true }, { text: '学校へ行きます。', endBreak: false }]) =>
  buildDocOutcome({ id, startedAt: new Date('2026-10-14T01:00:00Z'), finishedAt: new Date('2026-10-14T01:05:00Z'), problem: problem(), sample: problem().answerText!, inputs, elapsedMs: 300_400, status: 'completed' });

describe('文書作成モードの問題（使えるか）', () => {
  it('見本の文章が確認済みで空の行がなければ使える。文字数（改行を除く）・段落数', () => {
    expect(docSampleOf(problem())).toBe('朝の準備をします。\n学校へ行きます。');
    expect(docInfo(problem())).toMatchObject({ chars: 17, paragraphs: 2 });
    expect(docUnavailableReason(problem())).toBeNull();
  });
  it('旧検定の画像・PDF だけの問題（見本の文章なし・未確認）は使えない。案内を出す', () => {
    const legacy = problem({ answerText: null, answerConfirmed: false, scoringEnabled: false, material: { kind: 'image', pages: [{ fileId: 'f-1', rotation: 0 }] } });
    expect(docSampleOf(legacy)).toBeNull();
    expect(docUnavailableReason(legacy)).toBe('見本の文章を登録・確認すると使用できます');
    expect(docUnavailableReason(problem({ answerConfirmed: false }))).toContain('見本の文章を登録・確認すると使用できます');
    // 見本の文章を確認すれば、原本のファイルを残したまま使える
    expect(docSampleOf({ ...legacy, answerText: '一段落。', answerConfirmed: true })).toBe('一段落。');
  });
  it('空の行がある見本は使えない（勝手に消さない）', () => {
    expect(docSampleOf(problem({ answerText: 'あ\n\nい' }))).toBeNull();
    expect(docUnavailableReason(problem({ answerText: 'あ\n\nい' }))).toContain('空の行');
  });
  it('先生の問題の並び順：並び順 → 作成日時', () => {
    const list = sortTeacherProblems([
      problem({ id: 'c', sortOrder: undefined, createdAt: '2026-10-01T00:00:00Z' }),
      problem({ id: 'b', sortOrder: 2 }),
      problem({ id: 'a', sortOrder: 1 }),
    ]);
    expect(list.map((p) => p.id)).toEqual(['a', 'b', 'c']);
  });
});

describe('文書作成モードの記録', () => {
  it('記録は成績の数値と問題の ID・タイトル・改訂番号だけ（本文を含めない）', () => {
    const o = outcome('r1');
    expect(o.record).toMatchObject({ problemId: 'tp-1', problemTitle: '朝の準備', problemRevision: 2, status: 'completed', elapsedMs: 300_400, inputChars: 17, paragraphCount: 2, textErrors: 1, wrongChars: 1, spaceErrors: 0, breakErrors: 0, rulesVersion: 'doc-v1' });
    expect(JSON.stringify(o.record)).not.toContain('準備をしまず');
    // 誤字も本人の入力どおり（正しい字に置き換えない）
    expect(o.text).toBe('朝の準備をしまず。\n学校へ行きます。');
  });
  it('保存された値の検証：壊れた値は読み込まない', () => {
    const r = outcome('r1').record;
    expect(parseDocRecord(r)).toEqual(r);
    expect(parseDocRecord({ ...r, status: 'passed' })).toBeNull();
    expect(parseDocRecord({ ...r, textErrors: -1 })).toBeNull();
    expect(parseDocRecord({ ...r, problemId: '<x>' })).toBeNull();
    expect(mergeDocRecords([r], [r])).toHaveLength(1);
  });
  it('ゲストの記録：この端末に保存し、同じ記録は二重に保存しない。旧検定の記録とは別のキー', () => {
    const s = new MemStorage();
    const r = outcome('r1').record;
    expect(saveGuestDocRecord(r, s)).toBe('saved');
    expect(saveGuestDocRecord(r, s)).toBe('duplicate');
    expect(loadGuestDocHistory(s).records).toHaveLength(1);
    expect(GUEST_DOC_HISTORY_KEY).not.toBe('sakura-type:guest-exam-history');
    s.setItem('sakura-type:guest-exam-history', '{"version":1,"records":[]}');
    expect(clearGuestDocHistory(s)).toBe(true);
    expect(loadGuestDocHistory(s).records).toHaveLength(0);
    expect(s.getItem('sakura-type:guest-exam-history')).not.toBeNull();
  });
  it('保存できない端末では failed。新しい版の記録は上書きしない', () => {
    expect(saveGuestDocRecord(outcome('r1').record, null)).toBe('failed');
    const s = new MemStorage();
    s.setItem(GUEST_DOC_HISTORY_KEY, JSON.stringify({ version: 9, records: [] }));
    expect(saveGuestDocRecord(outcome('r1').record, s)).toBe('failed');
    expect(loadGuestDocHistory(s).incompatible).toBe(true);
  });
});
