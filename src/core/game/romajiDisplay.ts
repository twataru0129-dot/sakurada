/**
 * ゲーム画面の「読み」と「ローマ字」の表示用の分割（表示だけに使います）。
 *
 * - 判定は RomajiMatcher のまま変えません。ここでは、いまの状態を入力単位（「きょ」「っか」「ん」など）ごとに分け、
 *   読み（かな）とローマ字を同じ単位で並べます。単位の途中では折り返さないため、拗音などが分断されません。
 * - 「、」「。」の単位のあとで行を分けます（意味のまとまりでの改行）。読みとローマ字の改行位置は必ず対応します。
 *   改行は表示上だけで、Enter やスペースの入力は必要ありません。
 * - 入力済みの単位は、実際に打った文字（shi / si など）を表示します。これからの単位はお手本の打ち方を表示します。
 */
import { RomajiMatcher, type RomajiStyle } from '../romaji';

export interface DisplayUnit {
  index: number;
  kana: string;
  /** 'done'：入力済み、'current'：入力中、'rest'：これから */
  state: 'done' | 'current' | 'rest';
  /** この単位で入力済みのローマ字 */
  typed: string;
  /** 次に押すキー（入力中の単位だけ） */
  next: string;
  /** この単位の残りのローマ字（次に押すキーのあと） */
  rest: string;
  /** この単位のお手本の打ち方（行の幅を決めるのに使います。打ち方で幅が変わって改行が動かないように） */
  model: string;
}

/** 行（意味のまとまり）ごとの単位の並び */
export type DisplayLines = DisplayUnit[][];

/** 単位のあとで行を分けるか（「、」「。」で終わる単位） */
const breaksAfter = (kana: string) => /[、。！？]$/.test(kana);

/**
 * いまの入力の状態（打った文字列）から、表示用の行を作ります。
 * matcher と同じ読み・お手本で、打った文字を1文字ずつたどり直して、各文字がどの単位のものかを求めます。
 */
export function displayLines(reading: string, style: RomajiStyle, typed: string): DisplayLines {
  const m = new RomajiMatcher(reading, style);
  const typedOf: string[] = m.units.map(() => '');
  for (const ch of typed) {
    m.input(ch);
    const snap = m.snapshot();
    // 入力のあと、その単位がまだ途中なら今の単位、確定したならひとつ前の単位の文字です
    const owner = snap.buffer !== '' ? snap.index : snap.index - 1;
    if (owner >= 0 && owner < typedOf.length) typedOf[owner] += ch;
  }
  const snap = m.snapshot();
  // 入力中の単位の残り：全体の残りから、後ろの単位のお手本の分を除いたもの
  const later = m.units.slice(snap.index + 1).reduce((n, u) => n + u.cands[0]!.length, 0);
  const curRemaining = snap.done ? '' : snap.remaining.slice(0, snap.remaining.length - later);
  const lines: DisplayLines = [[]];
  m.units.forEach((u, i) => {
    const state: DisplayUnit['state'] = i < snap.index ? 'done' : i === snap.index ? 'current' : 'rest';
    const unit: DisplayUnit =
      state === 'done'
        ? { index: i, kana: u.kana, state, typed: typedOf[i]!, next: '', rest: '', model: u.cands[0]! }
        : state === 'current'
          ? { index: i, kana: u.kana, state, typed: typedOf[i]!, next: curRemaining.slice(0, 1), rest: curRemaining.slice(1), model: u.cands[0]! }
          : { index: i, kana: u.kana, state, typed: '', next: '', rest: u.cands[0]!, model: u.cands[0]! };
    lines[lines.length - 1]!.push(unit);
    if (breaksAfter(u.kana) && i < m.units.length - 1) lines.push([]);
  });
  return lines;
}

/** 区切りの位置がわからないとき（文と読みを対応づけられないとき）に、改行を優先する単位（助詞など） */
const GOOD_BREAK_AFTER = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'へ', 'や', 'て', 'ば']);

type CharKind = 'hira' | 'kata' | 'kanji' | 'other';
const kindOf = (c: string): CharKind =>
  /[\u3041-\u309f]/.test(c) ? 'hira' : /[\u30a1-\u30fa\u30fc]/.test(c) ? 'kata' : /[\u4e00-\u9fff\u3005]/.test(c) ? 'kanji' : 'other';
const toHira = (c: string) => (/[\u30a1-\u30f6]/.test(c) ? String.fromCharCode(c.charCodeAt(0) - 0x60) : c);

/**
 * 文（漢字かな交じり）と読みを対応づけて、読みの中の「言葉の切れ目」の位置を返します。
 * ひらがな（送りがな・助詞）のあとに漢字・カタカナの言葉が始まるところを切れ目とします（例：教会の｜工事が｜始まった）。
 * かなは読みとそのまま対応させ、漢字の並びの読みの長さは「漢字1文字におよそ2文字」からのずれが全体で最も小さくなるように決めます。
 * 対応づけられないときは null です。
 */
export function wordBreaks(text: string, reading: string): Set<number> | null {
  const chars = [...text];
  const kinds = chars.map(kindOf);
  type R = { cost: number; at: number[] } | null;
  const memo = new Map<number, R>();
  const go = (ti: number, ri: number): R => {
    if (ti === chars.length) return ri === reading.length ? { cost: 0, at: [] } : null;
    const key = ti * 10000 + ri;
    if (memo.has(key)) return memo.get(key)!;
    let res: R = null;
    const here = ti > 0 && kinds[ti - 1] === 'hira' && (kinds[ti] === 'kanji' || kinds[ti] === 'kata') ? [ri] : [];
    if (kinds[ti] === 'kanji') {
      let tj = ti;
      while (tj < chars.length && kinds[tj] === 'kanji') tj++;
      const expect = 2 * (tj - ti);
      for (let rj = ri + 1; rj <= reading.length; rj++) {
        const rest = go(tj, rj);
        if (!rest) continue;
        const cost = rest.cost + Math.abs(rj - ri - expect);
        if (!res || cost < res.cost) res = { cost, at: [...here, ...rest.at] };
      }
    } else if (reading[ri] === toHira(chars[ti]!)) {
      const rest = go(ti + 1, ri + 1);
      if (rest) res = { cost: rest.cost, at: [...here, ...rest.at] };
    }
    memo.set(key, res);
    return res;
  };
  const r = go(0, 0);
  return r ? new Set(r.at.filter((x) => x > 0)) : null;
}

/**
 * 枠の幅に収まらない長い行を、単位の切れ目で分けます（読みとローマ字を同じ位置で分けるため）。
 * - 幅はお手本の打ち方で測るため、入力の途中（shi と si など）で改行の位置は変わりません。
 * - 分けるときは、行の4割以上の位置にある言葉の切れ目（good：読みの何文字目のあとか）を優先し、
 *   なければ収まる限りのところで分けます。good がないときは助詞などのあとを優先します。
 * kanaWidth・romajiWidth は文字列の表示幅、max は1行の最大の幅です（同じ単位）。
 */
export function wrapLines(
  lines: DisplayLines,
  kanaWidth: (s: string) => number,
  romajiWidth: (s: string) => number,
  max: number,
  good: Set<number> | null = null,
): DisplayLines {
  if (!(max > 0)) return lines;
  // 各単位の終わりが、読みの何文字目か
  const endAt = new Map<number, number>();
  let pos = 0;
  for (const u of lines.flat()) {
    pos += u.kana.length;
    endAt.set(u.index, pos);
  }
  const isGood = (u: DisplayUnit) => (good ? good.has(endAt.get(u.index)!) : GOOD_BREAK_AFTER.has(u.kana));
  const out: DisplayLines = [];
  for (const line of lines) {
    let cur: DisplayUnit[] = [];
    let wk = 0;
    let wr = 0;
    const widths = (u: DisplayUnit) => [kanaWidth(u.kana), romajiWidth(u.model)] as const;
    const measure = (us: DisplayUnit[]) => us.reduce((a, u) => { const [k, r] = widths(u); return [a[0]! + k, a[1]! + r]; }, [0, 0]);
    for (const u of line) {
      const [k, r] = widths(u);
      if (cur.length && (wk + k > max || wr + r > max)) {
        // 区切りのよい位置を後ろから探します（いまの単位の前で切れるなら、それがいちばん後ろの候補です）
        let cut = cur.length;
        for (let j = cur.length; j > 0; j--) {
          if (!isGood(cur[j - 1]!)) continue;
          const [a, b] = measure(cur.slice(0, j));
          if (Math.max(a!, b!) >= max * 0.4) cut = j;
          break;
        }
        out.push(cur.slice(0, cut));
        cur = cur.slice(cut);
        [wk, wr] = measure(cur) as [number, number];
      }
      cur.push(u);
      wk += k;
      wr += r;
    }
    out.push(cur);
  }
  return out;
}
