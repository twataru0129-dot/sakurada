/**
 * チェックの結果の表示（文書作成モード）。本人の入力の本文に、赤い波線と小さな印を付けて描きます。
 * 印は表示だけのもので、本人の本文には入れません（入力欄の本文とは別に描きます）。
 *
 * - mirror：入力欄（textarea）と同じ位置・同じ折り返しで重ねて描く写し。文字は透明にし、波線と印だけを見せます
 *   （入力欄そのものは変えないため、日本語入力・カーソル移動・範囲選択はブラウザのままです）
 * - visible：完成画面の「間違いの確認」で、文字も見せて描きます
 * 印は幅のない要素で描くため、文字の並び・折り返しは変わりません。
 */
import type { ReactNode } from 'react';
import type { CheckMark } from '../../core/document';

const SYMBOL: Record<CheckMark['kind'], string> = {
  wrong: '',
  extra: '',
  missing: '∧',
  space: '␣',
  missingBreak: '↵',
  extraBreak: '↵',
};

export function CheckedText({ text, marks, mode }: { text: string; marks: readonly CheckMark[]; mode: 'mirror' | 'visible' }) {
  const ranges = marks.filter((m) => m.end > m.start && m.kind !== 'extraBreak');
  const pins = marks.filter((m) => m.end === m.start || m.kind === 'extraBreak');
  const cuts = new Set<number>([0, text.length]);
  for (const m of ranges) {
    cuts.add(m.start);
    cuts.add(m.end);
  }
  for (const m of pins) cuts.add(m.start);
  const points = [...cuts].filter((n) => n >= 0 && n <= text.length).sort((a, b) => a - b);
  const out: ReactNode[] = [];
  const pin = (m: CheckMark, k: string) => (
    <span key={k} className={`doc-pin doc-mk-${m.kind}`} data-sym={SYMBOL[m.kind]} title={m.note} aria-label={m.note} role="img" data-testid="doc-pin" data-kind={m.kind} />
  );
  for (let i = 0; i < points.length; i++) {
    const at = points[i]!;
    pins.filter((m) => m.start === at).forEach((m, j) => out.push(pin(m, `p${at}-${j}`)));
    const next = points[i + 1];
    if (next === undefined || next <= at) continue;
    const seg = text.slice(at, next);
    const cover = ranges.filter((m) => m.start <= at && m.end >= next);
    if (cover.length === 0) out.push(seg);
    else
      out.push(
        <span key={`r${at}`} className={`doc-wavy ${cover.map((m) => `doc-mk-${m.kind}`).join(' ')}`} title={cover.map((m) => m.note).join('／')} data-testid="doc-wavy" data-kind={cover[0]!.kind}>
          {seg}
        </span>,
      );
  }
  // textarea は終わりの改行のあとにも1行ぶんの高さを取るため、写しにも幅のない文字を足して高さをそろえます
  if (mode === 'mirror') out.push('​');
  return <>{out}</>;
}
