import { describe, expect, it } from 'vitest';
import { countExamChars, examChars, GRADES, gradeInfo, paragraphEnds } from './exam';
import { alignExam, scoreExam } from './examScoring';
import { buildExamOutcome, examEndLabel, parseExamRecord } from './examResult';
import { BUILTIN_EXAM_PROBLEMS, BUILTIN_EXAM_SOURCE } from '../data/examBuiltin';
import type { ExamProblem } from './exam';

const REF = '朝、学校に着いたら、まず教室であいさつをします。';

describe('文字のそろえ方', () => {
  it('改行・半角/全角スペース・タブを除き、句読点・数字・記号は残す', () => {
    expect(examChars('あ い　う\tえ\n\r\nお。1,（）')).toEqual(['あ', 'い', 'う', 'え', 'お', '。', '1', ',', '（', '）']);
  });
  it('NFC にそろえる（濁点の結合文字）', () => {
    expect(examChars('が')).toEqual(['が']);
  });
  it('全角と半角は同じ文字として扱わない', () => {
    const s = scoreExam('１２３', '123', 1);
    expect(s.missCount).toBe(3);
  });
  it('段落の終わりを文字の位置で表す', () => {
    expect(paragraphEnds('あい\nう\n\nえ')).toEqual([false, true, true, false]);
  });
});

describe('採点（先頭固定のアラインメント）', () => {
  it('すべて正しく途中まで入力：未入力の末尾はミスにしない', () => {
    const s = scoreExam(REF, '朝、学校に着いたら', 1);
    expect(s).toMatchObject({ inputChars: 9, matchedChars: 9, missCount: 0, scoreChars: 9, reachedEnd: false });
  });
  it('空の入力は 0 文字・ミス 0', () => {
    const s = scoreExam(REF, '', 3);
    expect(s).toMatchObject({ inputChars: 0, matchedChars: 0, missCount: 0, scoreChars: 0 });
    expect(scoreExam(REF, ' \n　\t', 3).inputChars).toBe(0);
  });
  it('1文字の置換は1ミス（後続は正しく一致）', () => {
    const s = scoreExam(REF, '朝、学校に着いたら、まず教室でアいさつをします。', 1);
    expect(s).toMatchObject({ substitutions: 1, insertions: 0, deletions: 0, missCount: 1, matchedChars: 23 });
  });
  it('1文字の挿入は1ミス', () => {
    const s = scoreExam(REF, '朝、学校に着いたらら、まず教室であいさつをします。', 1);
    expect(s).toMatchObject({ insertions: 1, substitutions: 0, deletions: 0, missCount: 1, matchedChars: 24 });
  });
  it('途中の1文字の脱落は1ミス（後ろが全部ずれて誤りにならない）', () => {
    const s = scoreExam(REF, '朝、学校に着いたら、まず教室であいさをします。', 1);
    expect(s).toMatchObject({ deletions: 1, substitutions: 0, insertions: 0, missCount: 1, matchedChars: 23, reachedEnd: true });
  });
  it('先頭の1文字の脱落も途中の脱落として数える（入力を任意の位置へ当てはめない）', () => {
    const s = scoreExam(REF, '、学校に着いたら', 1);
    expect(s).toMatchObject({ deletions: 1, missCount: 1, matchedChars: 8 });
  });
  it('末尾の誤った入力を切り捨てない', () => {
    const s = scoreExam('あいうえお', 'あいうxyz', 1);
    expect(s.inputChars).toBe(6);
    expect(s.missCount).toBe(3);
    expect(s.matchedChars).toBe(3);
  });
  it('同じ費用の候補：入力の最後の誤字は「置換」とする（余分な文字＋未入力とはしない）', () => {
    const { ops } = alignExam([...'あいうえ'], [...'あいx']);
    expect(ops.map((o) => o.op)).toEqual(['match', 'match', 'sub']);
  });
  it('同じ費用の候補：抜けたあと正しく続けた場合は「脱落」とする', () => {
    const { ops } = alignExam([...'あいう'], [...'あう']);
    expect(ops.map((o) => o.op)).toEqual(['match', 'del', 'match']);
  });
  it('繰り返しのある文章でも破綻しない', () => {
    const ref = 'ははははは。ははは。';
    expect(scoreExam(ref, 'はははは。', 1).missCount).toBe(1);
    expect(scoreExam(ref, 'ははははは。ははは。', 1).missCount).toBe(0);
    expect(scoreExam(ref, 'ははははははは。', 1).missCount).toBe(2);
  });
  it('改行の位置が違っても、改行は比較しない', () => {
    const s = scoreExam('あいう\nえお', 'あ\nいうえ\n\nお', 1);
    expect(s.missCount).toBe(0);
    expect(s.inputChars).toBe(5);
  });
  it('句読点の誤り・抜けはミス', () => {
    expect(scoreExam('あ、い。', 'あ，い', 1)).toMatchObject({ substitutions: 1, missCount: 1 });
    expect(scoreExam('あ、い。う', 'あいう', 1)).toMatchObject({ deletions: 2, missCount: 2 });
  });
  it('得点文字数＝入力文字数−ミス数×減点（下限0）', () => {
    expect(scoreExam('あいうえおかきくけこ', 'あいxえおかきくけこ', 3).scoreChars).toBe(7);
    expect(scoreExam('あいう', 'xyz', 5).scoreChars).toBe(0);
  });
  it('全文入力で reachedEnd', () => {
    expect(scoreExam('あいう', 'あいう', 1).reachedEnd).toBe(true);
    expect(scoreExam('あいう', 'あい', 1).reachedEnd).toBe(false);
  });
  it('長い文章（1級相当の全文）でも採点できる', () => {
    const p = BUILTIN_EXAM_PROBLEMS.find((x) => x.grade === '1')!;
    const text = p.answerText!;
    const broken = text.slice(0, 100) + text.slice(101, 500) + 'x' + text.slice(500);
    const t0 = Date.now();
    const s = scoreExam(text, broken, 5);
    expect(Date.now() - t0).toBeLessThan(3000);
    expect(s.missCount).toBe(2);
    expect(s.reachedEnd).toBe(true);
  });
});

describe('内蔵の30問', () => {
  it('各段階5問ずつ、合計30問', () => {
    expect(BUILTIN_EXAM_PROBLEMS).toHaveLength(30);
    for (const g of GRADES) expect(BUILTIN_EXAM_PROBLEMS.filter((p) => p.grade === g.grade)).toHaveLength(5);
  });
  it('JSON の本文と文字数情報が一致し、本文は目安文字数より長い', () => {
    for (const p of BUILTIN_EXAM_SOURCE.problems) {
      expect(countExamChars(p.answerText), p.id).toBe(p.characterCount);
      const g = gradeInfo(p.grade as never);
      expect(p.targetCharacters).toBe(g.targetCharacters);
      expect(p.penaltyPerError).toBe(g.penaltyPerError);
      expect(p.gradeLabel).toBe(g.label);
      expect(p.timeLimitSeconds).toBe(600);
      expect(p.characterCount).toBeGreaterThan(g.targetCharacters);
    }
  });
  it('本文はJSONから変更せずに使う', () => {
    BUILTIN_EXAM_SOURCE.problems.forEach((p, i) => {
      expect(BUILTIN_EXAM_PROBLEMS[i]!.answerText).toBe(p.answerText);
      expect(BUILTIN_EXAM_PROBLEMS[i]!.title).toBe(p.title);
    });
  });
  it('IDは重複しない', () => {
    expect(new Set(BUILTIN_EXAM_PROBLEMS.map((p) => p.id)).size).toBe(30);
  });
});

describe('結果と目安達成', () => {
  const p = BUILTIN_EXAM_PROBLEMS[0]!; // 4級相当：目安200文字・減点1
  const base = { id: 'r1', startedAt: new Date('2026-10-06T00:00:00Z'), problem: p, inputText: p.answerText!.slice(0, 250) };
  it('標準10分の計測を完了し、基準以上なら目安達成', () => {
    const o = buildExamOutcome({ ...base, timeLimitSeconds: 600, elapsedMs: 600000, endReason: 'time_up' });
    expect(o.record.scoreChars).toBeGreaterThanOrEqual(200);
    expect(o.record.achieved).toBe(true);
    expect(examEndLabel(o.record)).toBe('10分の計測を完了');
  });
  it('基準に届かなければ未達（false）', () => {
    const o = buildExamOutcome({ ...base, inputText: p.answerText!.slice(0, 120), timeLimitSeconds: 600, elapsedMs: 600000, endReason: 'time_up' });
    expect(o.record.achieved).toBe(false);
  });
  it('短縮練習・時間制限なし・途中終了では判定しない（null）', () => {
    for (const [t, e] of [[300, 'time_up'], [null, 'user_end'], [600, 'user_end'], [180, 'time_up']] as const) {
      expect(buildExamOutcome({ ...base, timeLimitSeconds: t, elapsedMs: 1000, endReason: e }).record.achieved).toBeNull();
    }
  });
  it('全文入力して早く終えたときは「全文入力完了」（10分の計測とは区別）', () => {
    const o = buildExamOutcome({ ...base, inputText: p.answerText!, timeLimitSeconds: 600, elapsedMs: 300000, endReason: 'user_end' });
    expect(o.record.fullTextCompleted).toBe(true);
    expect(o.record.achieved).toBeNull();
    expect(examEndLabel(o.record)).toBe('全文入力完了');
  });
  it('採点なしの問題はミス数・得点・目安達成を出さない', () => {
    const q: ExamProblem = { ...p, id: 't1', source: 'teacher', scoringEnabled: false, answerText: null, answerConfirmed: false };
    const o = buildExamOutcome({ ...base, problem: q, timeLimitSeconds: 600, elapsedMs: 600000, endReason: 'time_up' });
    expect(o.score).toBeNull();
    expect(o.record).toMatchObject({ scoringEnabled: false, missCount: null, scoreChars: null, matchedChars: null, achieved: null, inputChars: countExamChars(p.answerText!.slice(0, 250)) });
  });
  it('正解文が未確認なら採点しない', () => {
    const q: ExamProblem = { ...p, id: 't2', source: 'teacher', answerConfirmed: false };
    expect(buildExamOutcome({ ...base, problem: q, timeLimitSeconds: 600, elapsedMs: 600000, endReason: 'time_up' }).score).toBeNull();
  });
  it('記録は検証して読み込める（壊れた値は読まない）', () => {
    const o = buildExamOutcome({ ...base, timeLimitSeconds: 600, elapsedMs: 600000, endReason: 'time_up' });
    expect(parseExamRecord(JSON.parse(JSON.stringify(o.record)))).toEqual(o.record);
    expect(parseExamRecord({ ...o.record, grade: '5' })).toBeNull();
    expect(parseExamRecord({ ...o.record, timeLimitSeconds: 1234 })).toBeNull();
    expect(parseExamRecord({ ...o.record, inputChars: -1 })).toBeNull();
    expect(parseExamRecord('x')).toBeNull();
    // 入力本文は記録に含めない
    expect(JSON.stringify(o.record)).not.toContain(p.answerText!.slice(0, 30));
  });
});
