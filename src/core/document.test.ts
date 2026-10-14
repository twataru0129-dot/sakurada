import { describe, expect, it } from 'vitest';
import raw from '../data/exam/exam_problems.json';
import order from '../data/exam/document_order.json';
import {
  checkDocument,
  checkParagraph,
  composeDocument,
  countDocChars,
  docxFileName,
  firstEmptyParagraph,
  formatElapsed,
  paragraphFinished,
  removeBlankLines,
  sampleParagraphs,
  sampleProblems,
  type ParagraphInput,
} from './document';

const P = (text: string, endBreak = false): ParagraphInput => ({ text, endBreak });

describe('収録問題とやさしい順', () => {
  it('30問の ID・タイトル・本文はそのまま。並び順は段階 4→3→準2→2→準1→1 で、30問をちょうど1回ずつ', () => {
    const ids = raw.problems.map((p) => p.id);
    expect(ids).toHaveLength(30);
    expect([...order.order].sort()).toEqual([...ids].sort());
    const gradeOf = new Map(raw.problems.map((p) => [p.id, p.grade]));
    const g = order.order.map((id) => gradeOf.get(id));
    const rank = ['4', '3', 'pre2', '2', 'pre1', '1'];
    for (let i = 1; i < g.length; i++) expect(rank.indexOf(g[i]!)).toBeGreaterThanOrEqual(rank.indexOf(g[i - 1]!));
    expect(order.order[0]).toBe('exam-original-4-04');
  });
  it('文字数は改行を除いた本文の文字数、段落数は本文から。見本に空の行はない', () => {
    for (const p of raw.problems) {
      expect(countDocChars(p.answerText)).toBe(p.characterCount);
      expect(sampleParagraphs(p.answerText).length).toBe(p.answerText.split('\n').length);
      expect(sampleProblems(p.answerText)).toEqual([]);
    }
  });
});

describe('見本の文章（先生の登録）', () => {
  it('空の行は知らせる。取り除くのは「空の行を取り除く」を押したときだけで、段落の中の改行・空白は変えない', () => {
    const t = '一つ目の段落。\n\n　二つ目の段落です。\n';
    expect(sampleProblems(t)[0]).toContain('空の行');
    expect(removeBlankLines(t)).toBe('一つ目の段落。\n　二つ目の段落です。');
    expect(sampleProblems('')[0]).toContain('入力');
    expect(sampleParagraphs('a\r\nb')).toEqual(['a', 'b']);
  });
});

describe('本人の入力と完成した文書', () => {
  it('完成した文書は、各欄の本文と本人が記録した改行だけをつなげる（押していない改行は補わない）', () => {
    expect(composeDocument([P('あいう', true), P('えお', false), P('か')])).toBe('あいう\nえおか');
    expect(composeDocument([P('あ\nい', true), P(' う', true), P('え', true)])).toBe('あ\nい\n う\nえ\n');
  });
  it('完成の条件：すべての段落に空白・改行だけではない入力がある（誤字があっても完成できる）', () => {
    expect(firstEmptyParagraph([P('あ'), P('　\n'), P('う')])).toBe(1);
    expect(firstEmptyParagraph([P('ちがう字'), P('x'), P('y')])).toBeNull();
  });
  it('段落を終えたか：段落の終わりで改行した、またはあとの段落に入力した', () => {
    const inputs = [P('あ'), P(''), P('う')];
    expect(paragraphFinished(inputs, 0)).toBe(true);
    expect(paragraphFinished(inputs, 2)).toBe(false);
    expect(paragraphFinished([P('あ', true), P('')], 0)).toBe(true);
  });
});

describe('チェック（段落）', () => {
  it('見本と同じなら誤りなし（段落の終わりの改行も記録している）', () => {
    const c = checkParagraph('朝、学校に着いた。\n', P('朝、学校に着いた。', true), true);
    expect(c.marks).toEqual([]);
  });
  it('1文字の抜けは1つの印だけ。そのあとの文字は正しく対応する（後ろがすべて誤りにならない）', () => {
    const c = checkParagraph('かばんを決められた場所に置きます。\n', P('かばんを決められた場所に置ます。', true), true);
    expect(c).toMatchObject({ wrong: 0, extra: 0, missing: 1, space: 0, breaks: 0 });
    const m = c.marks[0]!;
    expect(m).toMatchObject({ kind: 'missing', expected: 'き' });
    // 印の位置は「置」と「ま」の間。本文には何も入れない
    expect('かばんを決められた場所に置ます。'.slice(0, m.start)).toBe('かばんを決められた場所に置');
  });
  it('違う文字・余分な文字には波線の範囲、続けて抜けた文字は1つの印にまとめる', () => {
    const c = checkParagraph('今日は晴れです。', P('今日は暗れでしす。'), true);
    expect(c.wrong).toBe(1);
    expect(c.extra).toBe(1);
    const w = c.marks.find((m) => m.kind === 'wrong')!;
    expect('今日は暗れでしす。'.slice(w.start, w.end)).toBe('暗');
    const d = checkParagraph('あいうえお', P('あお'), true);
    expect(d.missing).toBe(3);
    expect(d.marks.filter((m) => m.kind === 'missing')).toHaveLength(1);
    expect(d.marks[0]!.expected).toBe('いうえ');
  });
  it('入力の途中（partial）は未入力の末尾を誤りにしない。段落を終えたら（full）末尾の抜けも示す', () => {
    const exp = '本を選ぶときは、題名だけでなく中も見ます。\n';
    const part = checkParagraph(exp, P('本を選ぶときは、'), false);
    expect(part.marks).toEqual([]);
    const full = checkParagraph(exp, P('本を選ぶときは、', true), true);
    expect(full.missing).toBeGreaterThan(0);
    expect(full.breaks).toBe(0);
  });
  it('段落の終わりの改行が足りない（Enter を押さずに次へ移った）・途中の余分な改行', () => {
    const a = checkParagraph('あいう。\n', P('あいう。'), true);
    expect(a).toMatchObject({ breaks: 1, wrong: 0, missing: 0 });
    expect(a.marks[0]).toMatchObject({ kind: 'missingBreak', start: 4, end: 4 });
    const b = checkParagraph('あいうえお。\n', P('あい\nうえお。', true), true);
    expect(b).toMatchObject({ breaks: 1, wrong: 0 });
    expect(b.marks[0]).toMatchObject({ kind: 'extraBreak', start: 2, end: 3 });
  });
  it('空白の違い（余分・足りない・全角と半角）を文字の誤りとは別に数える', () => {
    expect(checkParagraph('A B', P('AB'), true)).toMatchObject({ space: 1, wrong: 0 });
    expect(checkParagraph('AB', P('A B'), true)).toMatchObject({ space: 1, wrong: 0 });
    const c = checkParagraph('　はじめに。', P(' はじめに。'), true);
    expect(c).toMatchObject({ space: 1, wrong: 0 });
    expect(c.marks[0]!.note).toContain('全角の空白');
  });
  it('最後の段落の終わりの改行は必須ではなく、あっても誤りにしない', () => {
    expect(checkParagraph('おわり。', P('おわり。', true), true).marks).toEqual([]);
    expect(checkParagraph('おわり。', P('おわり。'), true).marks).toEqual([]);
  });
});

describe('チェック（文書）', () => {
  const sample = 'あいう。\nかきく。\nさしす。';
  it('まだ入力していない段落はチェックしない。入力中の段落の未入力の末尾は誤りにしない', () => {
    const c = checkDocument(sample, [P('あいう。', true), P('かき'), P('')], false);
    expect(c.paragraphs[2]).toBeNull();
    expect(c.paragraphs[1]!.marks).toEqual([]);
    expect(c.textErrors).toBe(0);
  });
  it('完成のときはすべての段落を最後まで比べ、文字の誤りと空白・改行の誤りを分けて数える', () => {
    const c = checkDocument(sample, [P('あいう。'), P('かきく', true), P('さしす。')], true);
    expect(c.missing).toBe(1);
    expect(c.textErrors).toBe(1);
    expect(c.breakErrors).toBe(1);
    expect(c.spaceErrors).toBe(0);
  });
});

describe('表示の補助', () => {
  it('経過時間と Word のファイル名（使えない文字を置き換える）', () => {
    expect(formatElapsed(754_000)).toBe('12分34秒');
    expect(formatElapsed(3_723_000)).toBe('1時間2分3秒');
    expect(docxFileName('朝の準備')).toBe('朝の準備.docx');
    expect(docxFileName('a/b:c*?"<>|')).toBe('a_b_c______.docx');
    expect(docxFileName('  ')).toBe('文書.docx');
    expect(docxFileName('CON')).toBe('_CON.docx');
  });
});
