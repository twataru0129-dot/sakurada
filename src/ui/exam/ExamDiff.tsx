import { Fragment, type ReactNode } from 'react';
import { examChars, paragraphEnds } from '../../core/exam';
import type { ExamScore } from '../../core/examScoring';

/** 違いの表示の説明（色だけに頼らず、記号と文字でも区別します） */
export function DiffLegend() {
  return (
    <dl className="diff-legend" data-testid="diff-legend">
      <div>
        <dt>
          <span className="d-sub">
            期<span className="d-ref">→機</span>
          </span>
        </dt>
        <dd>置換：入力した文字（左）と、正しい文字（→の右）</dd>
      </div>
      <div>
        <dt>
          <span className="d-ins">＋の</span>
        </dt>
        <dd>余分：お手本にない文字（＋と取り消し線）</dd>
      </div>
      <div>
        <dt>
          <span className="d-del">［抜:は］</span>
        </dt>
        <dd>抜け：入力されていない文字（［抜:］で囲んだ文字）</dd>
      </div>
      <div>
        <dt>
          <span className="d-rest">（未入力）</span>
        </dt>
        <dd>未入力：ここから先はまだ入力していない部分です。ミスには数えません</dd>
      </div>
    </dl>
  );
}

/** お手本と入力本文の違い（段落の区切りはお手本に合わせて表示します） */
export function ExamDiff({ score, answerText }: { score: ExamScore; answerText: string }) {
  const ends = paragraphEnds(answerText);
  const ref = examChars(answerText);
  const out: ReactNode[] = [];
  let n = 0;
  const brAfter = (refIndex: number) => {
    if (ends[refIndex]) out.push(<br key={`br${n++}`} />);
  };
  for (const o of score.ops) {
    const k = n++;
    if (o.op === 'match') {
      out.push(<Fragment key={k}>{o.input}</Fragment>);
      brAfter(o.refIndex);
    } else if (o.op === 'sub') {
      out.push(
        <span key={k} className="d-sub" title={`置換：「${o.input}」→ 正しくは「${o.ref}」`}>
          {o.input}
          <span className="d-ref">→{o.ref}</span>
          <span className="sr-only">（置換。正しくは「{o.ref}」）</span>
        </span>,
      );
      brAfter(o.refIndex);
    } else if (o.op === 'ins') {
      out.push(
        <span key={k} className="d-ins" title={`余分：「${o.input}」`}>
          ＋{o.input}
          <span className="sr-only">（余分な文字）</span>
        </span>,
      );
    } else {
      out.push(
        <span key={k} className="d-del" title={`抜け：「${o.ref}」`}>
          ［抜:{o.ref}］<span className="sr-only">（抜けた文字）</span>
        </span>,
      );
      brAfter(o.refIndex);
    }
  }
  const restCount = ref.length - score.comparedRefChars;
  return (
    <div className="exam-diff" data-testid="exam-diff" lang="ja">
      {out.length === 0 && <span className="hint">（入力した文字はありません）</span>}
      {out}
      {restCount > 0 && (
        <span className="d-rest" data-testid="diff-rest">
          （未入力：ここから先の{restCount}文字はミスに数えません）{ref.slice(score.comparedRefChars, score.comparedRefChars + 30).join('')}
          {restCount > 30 ? '…' : ''}
        </span>
      )}
    </div>
  );
}
