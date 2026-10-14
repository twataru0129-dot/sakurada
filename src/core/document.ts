/**
 * 文書作成モード（v2.0.0）の中心の処理。画面から独立した純粋な関数だけです。
 *
 * ■ 見本と段落
 *   見本の文章は改行（\n）で段落に分けます。見本には空の行（何も書いていない行・空白だけの行）を入れません
 *   （先生の問題の登録で確かめます）。段落の数・文字数は、実際の見本の文章から求めます。
 *   文字数は「改行を除いた文字数」です（空白・句読点・記号は数えます）。NFC にそろえ、サロゲートペアも1文字です。
 *
 * ■ 本人の入力
 *   入力欄は見本の段落ごとに1つあり、それぞれ「本人が入力した本文（途中の改行・空白を含む）」と、
 *   「段落の終わりで Enter を押して記録した改行（endBreak）」を持ちます。
 *   完成した文書は、各欄の本文に、本人が記録した改行だけを足してつなげたものです（押していない改行は補いません）。
 *
 * ■ チェック（照合）
 *   段落ごとに、見本の段落（＋段落の終わりの改行）と本人の入力（＋記録した改行）を比べます。
 *   1. 文字：空白・改行を除いた文字の列を、検定モードと同じ対応付け（アラインメント）で比べ、
 *      違う文字（wrong）・余分な文字（extra）・抜けた文字（missing）を求めます。
 *      1文字の抜けがあっても、そのあとの文字は正しく対応します（後ろがすべて誤りになりません）。
 *   2. 空白・改行：対応した文字どうしの間（と段落の先頭・終わり）の空白・改行を比べ、
 *      空白の違い（space）・改行の抜け（missingBreak）・余分な改行（extraBreak）を求めます。
 *      画面の幅による自動の折り返しは本文に含まれないため、誤りになりません。
 *   まだ入力している途中の段落（partial）は、入力した部分だけを比べ、未入力の末尾を誤りにしません。
 *   本人が段落を終えた（Enter で改行した・あとの段落に入力した）段落と、完成のときは、段落の最後まで比べます（full）。
 */
import { alignExam } from './examScoring';

export const DOC_RULES_VERSION = 'doc-v1';
/** 見本・入力の上限（計算量の目安。照合は段落ごとに行います） */
export const MAX_SAMPLE_CHARS = 5000;
export const MAX_PARAGRAPH_INPUT_CHARS = 4000;

/** 空白（改行以外）：半角・全角スペース、タブ */
const SPACE = /[ 　\t]/u;
const isWs = (ch: string) => ch === '\n' || SPACE.test(ch);

/** 見本・入力の文字をそろえます（NFC・改行は \n に） */
export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/\r\n?/g, '\n');
}

/** 見本の段落（改行で分けたもの） */
export function sampleParagraphs(sample: string): string[] {
  return normalizeText(sample).split('\n');
}

/** 文字数（改行を除く。空白・記号は数えます） */
export function countDocChars(text: string): number {
  return Array.from(normalizeText(text).replace(/\n/g, '')).length;
}

/** 見本の文章の問題点（先生の登録・読み込みで使います）。空なら問題なし */
export function sampleProblems(sample: string): string[] {
  const t = normalizeText(sample);
  const out: string[] = [];
  if (!t.trim()) return ['見本の文章を入力してください'];
  const lines = t.split('\n');
  if (lines.some((l) => l.trim() === '')) out.push('空の行（何も書いていない行・空白だけの行）があります。段落の間に空の行は入れられません。「空の行を取り除く」で整えてから確認してください。');
  if (countDocChars(t) > MAX_SAMPLE_CHARS) out.push(`見本の文章は${MAX_SAMPLE_CHARS}文字までです`);
  return out;
}

/** 空の行（先頭・末尾・段落の間）だけを取り除きます。段落の中の改行・空白は変えません */
export function removeBlankLines(sample: string): string {
  return normalizeText(sample)
    .split('\n')
    .filter((l) => l.trim() !== '')
    .join('\n');
}

// ---------------------------------------------------------------------
// 本人の入力
// ---------------------------------------------------------------------

export interface ParagraphInput {
  /** 本人が入力した本文（変換中の文字は含めません） */
  text: string;
  /** 段落の終わりで Enter を押して記録した改行 */
  endBreak: boolean;
}

/** 完成した文書：各欄の本文と、本人が記録した改行だけをつなげます */
export function composeDocument(inputs: readonly ParagraphInput[]): string {
  return inputs.map((p) => p.text + (p.endBreak ? '\n' : '')).join('');
}

/** 空白・改行だけではない入力があるか */
export function hasContent(text: string): boolean {
  return Array.from(text).some((c) => !isWs(c));
}

/** 完成できるか：すべての段落に、空白・改行だけではない入力がある。だめなときは最初の空の段落の番号（0始まり） */
export function firstEmptyParagraph(inputs: readonly ParagraphInput[]): number | null {
  const i = inputs.findIndex((p) => !hasContent(p.text));
  return i < 0 ? null : i;
}

// ---------------------------------------------------------------------
// チェック
// ---------------------------------------------------------------------

export type MarkKind = 'wrong' | 'extra' | 'missing' | 'space' | 'missingBreak' | 'extraBreak';

/**
 * チェックの印。start / end は本人の入力の本文（ParagraphInput.text）の中の位置（UTF-16 の位置）です。
 * - wrong・extra・space（空白が余分・違う）：start〜end の文字に赤い波線
 * - missing・missingBreak・space（空白が足りない）：start（＝end）の位置に小さな印（本文には何も入れません）
 * - extraBreak：start〜end の改行の位置に印
 * end === text.length かつ kind === 'missingBreak' は、段落の終わりの改行が足りないことを表します
 */
export interface CheckMark {
  kind: MarkKind;
  start: number;
  end: number;
  /** 見本の文字（違う文字・抜けた文字・空白の違いのとき） */
  expected?: string;
  /** 説明（画面に出す短い文） */
  note: string;
}

export interface ParagraphCheck {
  marks: CheckMark[];
  /** 文字の誤り */
  wrong: number;
  extra: number;
  missing: number;
  /** 空白の違い・改行の違い */
  space: number;
  breaks: number;
  /** 段落の最後まで比べたか（false は入力した部分だけ） */
  full: boolean;
}

interface Unit {
  ch: string;
  /** 本人の入力（text + 改行）の中の位置 */
  pos: number;
}

function units(s: string): Unit[] {
  const out: Unit[] = [];
  let pos = 0;
  for (const ch of Array.from(s)) {
    if (!isWs(ch)) out.push({ ch, pos });
    pos += ch.length;
  }
  return out;
}

/** 対応付け：full のときは見本の最後まで（未入力の末尾も抜けにします） */
function align(ref: readonly string[], input: readonly string[], full: boolean) {
  return alignExam(ref, input, full).ops;
}

const wsLabel = (s: string) =>
  Array.from(s)
    .map((c) => (c === '\n' ? '改行' : c === '　' ? '全角の空白' : c === '\t' ? 'タブ' : '半角の空白'))
    .join('・');

/**
 * 1つの段落をチェックします。
 * @param expected 見本の段落（段落の終わりの改行を含む。最後の段落は改行なし）
 * @param input 本人の入力
 * @param full 段落の最後まで比べる（段落を終えた・完成のとき）
 */
export function checkParagraph(expected: string, input: ParagraphInput, full: boolean): ParagraphCheck {
  const exp = normalizeText(expected);
  const text = input.text;
  const inp = text + (input.endBreak ? '\n' : '');
  const eu = units(exp);
  const iu = units(inp);
  const ops = align(
    eu.map((u) => u.ch),
    iu.map((u) => u.ch),
    full,
  );
  const marks: CheckMark[] = [];
  const res: ParagraphCheck = { marks, wrong: 0, extra: 0, missing: 0, space: 0, breaks: 0, full };
  /** 本文の範囲の中に収めます（記録した改行の位置は本文の終わり） */
  const clip = (n: number) => Math.min(n, text.length);

  // 対応の列：各要素は [見本の文字の番号 | null, 入力の文字の番号 | null]
  const pairs: Array<[number | null, number | null]> = [];
  let ii = 0;
  for (const o of ops) {
    if (o.op === 'match' || o.op === 'sub') {
      pairs.push([o.refIndex, ii]);
      if (o.op === 'sub') {
        const u = iu[ii]!;
        marks.push({ kind: 'wrong', start: u.pos, end: u.pos + u.ch.length, expected: o.ref, note: `「${o.ref}」と違う文字です` });
        res.wrong++;
      }
      ii++;
    } else if (o.op === 'ins') {
      const u = iu[ii]!;
      marks.push({ kind: 'extra', start: u.pos, end: u.pos + u.ch.length, note: '余分な文字です' });
      res.extra++;
      pairs.push([null, ii]);
      ii++;
    } else {
      // 抜け：次の入力の文字の直前（なければ本文の終わり）
      const at = ii < iu.length ? iu[ii]!.pos : text.length;
      const prev = marks.at(-1);
      // 続けて抜けた文字は1つの印にまとめます
      if (prev && prev.kind === 'missing' && prev.start === clip(at)) {
        prev.expected = (prev.expected ?? '') + o.ref;
        prev.note = `「${prev.expected}」が抜けています`;
      } else marks.push({ kind: 'missing', start: clip(at), end: clip(at), expected: o.ref, note: `「${o.ref}」が抜けています` });
      res.missing++;
      pairs.push([o.refIndex, null]);
    }
  }

  // 空白・改行：対応した文字（一致・違う文字）の間だけを比べます（抜け・余分の前後は文字の誤りとして示しています）
  const expRun = (from: number, to: number) => exp.slice(from, to);
  const cmpRun = (e: string, iStart: number, iEnd: number) => {
    const i = inp.slice(iStart, iEnd);
    if (e === i) return;
    const en = (e.match(/\n/g) ?? []).length;
    const inn = (i.match(/\n/g) ?? []).length;
    if (en > inn) {
      // 改行が足りない：入力の空白の後ろ（本文の終わりなら段落の終わり）に印
      const at = clip(iEnd);
      marks.push({ kind: 'missingBreak', start: at, end: at, note: at === text.length ? '段落の終わりの改行（Enter）が足りません' : '改行が足りません' });
      res.breaks += en - inn;
    } else if (inn > en) {
      // 余分な改行：入力の改行の位置
      let k = iStart;
      let n = inn - en;
      while (k < iEnd && n > 0) {
        if (inp[k] === '\n') {
          if (k < text.length) marks.push({ kind: 'extraBreak', start: k, end: k + 1, note: '余分な改行です' });
          else marks.push({ kind: 'extraBreak', start: text.length, end: text.length, note: '余分な改行です' });
          n--;
        }
        k++;
      }
      res.breaks += inn - en;
    }
    const es = e.replace(/\n/g, '');
    const is = i.replace(/\n/g, '');
    if (es !== is) {
      // 入力に空白があるときはその空白に波線、ないときは位置に印（本文には何も入れません）
      let a = iStart;
      while (a < iEnd && inp[a] === '\n') a++;
      let b = iEnd;
      while (b > a && inp[b - 1] === '\n') b--;
      const start = clip(is ? a : iStart);
      const end = is ? clip(b) : start;
      const note = !es ? `余分な空白です（${wsLabel(is)}）` : !is ? `空白が足りません（見本：${wsLabel(es)}）` : `空白が見本と違います（見本：${wsLabel(es)}）`;
      marks.push({ kind: 'space', start, end, expected: es, note });
      res.space++;
    }
  };

  // 先頭の空白
  if (pairs.length > 0 && pairs[0]![0] === 0 && pairs[0]![1] === 0) cmpRun(expRun(0, eu[0]!.pos), 0, iu[0]!.pos);
  else if (eu.length === 0 && iu.length === 0 && full) cmpRun(exp, 0, inp.length);
  for (let k = 0; k + 1 < pairs.length; k++) {
    const [ra, ia] = pairs[k]!;
    const [rb, ib] = pairs[k + 1]!;
    if (ra === null || ia === null || rb === null || ib === null) continue;
    if (rb !== ra + 1 || ib !== ia + 1) continue;
    const ea = eu[ra]!;
    const iaU = iu[ia]!;
    cmpRun(expRun(ea.pos + ea.ch.length, eu[rb]!.pos), iaU.pos + iaU.ch.length, iu[ib]!.pos);
  }
  // 段落の終わり（段落を終えたときだけ）：最後の文字のあとの空白・改行
  const last = pairs.at(-1);
  if (full && last && last[0] === eu.length - 1 && last[1] === iu.length - 1 && eu.length > 0 && iu.length > 0) {
    const ea = eu[last[0]]!;
    const iaU = iu[last[1]]!;
    const from = iaU.pos + iaU.ch.length;
    // 最後の段落の終わりの改行は必須でも誤りでもありません（見本の終わりに改行がないときは、入力の終わりの改行を比べません）
    let to = inp.length;
    if (!/\n$/.test(exp)) while (to > from && inp[to - 1] === '\n') to--;
    cmpRun(expRun(ea.pos + ea.ch.length, exp.length), from, to);
  } else if (full && /\n$/.test(exp) && !input.endBreak && !marks.some((m) => m.kind === 'missingBreak' && m.start === text.length)) {
    // 最後の文字の対応が崩れていても、段落の終わりの改行が足りないことは知らせます
    marks.push({ kind: 'missingBreak', start: text.length, end: text.length, note: '段落の終わりの改行（Enter）が足りません' });
    res.breaks++;
  }
  marks.sort((a, b) => a.start - b.start || a.end - b.end);
  return res;
}

/** 見本の段落 i の「期待する文字列」（最後の段落以外は終わりに改行） */
export function expectedParagraph(paragraphs: readonly string[], i: number): string {
  return paragraphs[i]! + (i < paragraphs.length - 1 ? '\n' : '');
}

/**
 * 段落を終えたか（チェックで段落の最後まで比べるか）：段落の終わりで改行した、またはあとの段落に入力がある
 */
export function paragraphFinished(inputs: readonly ParagraphInput[], i: number): boolean {
  if (inputs[i]?.endBreak) return true;
  return inputs.slice(i + 1).some((p) => hasContent(p.text));
}

export interface DocumentCheck {
  paragraphs: Array<ParagraphCheck | null>;
  textErrors: number;
  wrong: number;
  extra: number;
  missing: number;
  spaceErrors: number;
  breakErrors: number;
}

/**
 * 文書全体をチェックします。final（完成のとき）はすべての段落を最後まで比べます。
 * そうでないときは、まだ何も入力していない段落はチェックしません（null）。
 */
export function checkDocument(sample: string, inputs: readonly ParagraphInput[], final: boolean): DocumentCheck {
  const paras = sampleParagraphs(sample);
  const out: DocumentCheck = { paragraphs: [], textErrors: 0, wrong: 0, extra: 0, missing: 0, spaceErrors: 0, breakErrors: 0 };
  paras.forEach((_, i) => {
    const input = inputs[i] ?? { text: '', endBreak: false };
    if (!final && !hasContent(input.text) && !input.endBreak) {
      out.paragraphs.push(null);
      return;
    }
    const c = checkParagraph(expectedParagraph(paras, i), input, final || paragraphFinished(inputs, i));
    out.paragraphs.push(c);
    out.wrong += c.wrong;
    out.extra += c.extra;
    out.missing += c.missing;
    out.spaceErrors += c.space;
    out.breakErrors += c.breaks;
  });
  out.textErrors = out.wrong + out.extra + out.missing;
  // 見本より多い入力欄はありません（入力欄は見本の段落と同じ数です）
  return out;
}

// ---------------------------------------------------------------------
// 表示用：文字数・ファイル名
// ---------------------------------------------------------------------

/** 経過時間の表示（例：12分34秒、1時間2分3秒） */
export function formatElapsed(ms: number): string {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  if (h > 0) return `${h}時間${m}分${sec}秒`;
  return `${m}分${sec}秒`;
}

/** Word で保存するときのファイル名（使えない文字を置き換えます） */
export function docxFileName(title: string): string {
  // eslint-disable-next-line no-control-regex
  let base = normalizeText(title).replace(/[\\/:*?"<>|\u0000-\u001f\u007f]/g, '_').replace(/\s+/g, ' ').trim();
  base = base.replace(/^[.\s]+|[.\s]+$/g, '');
  if (/^(con|prn|aux|nul|com\d|lpt\d)$/i.test(base)) base = `_${base}`;
  if (!base) base = '文書';
  base = Array.from(base).slice(0, 80).join('');
  return `${base}.docx`;
}
