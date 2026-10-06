import { attemptAccuracy, type QuestionAttempt } from '../core/result';
import { keyName, summarizeAttempt } from '../core/missDetail';
import { formatNumber1 } from '../core/rank';

/**
 * ミスした問題の詳細（ローマ字入力）。ミスがあった出題回だけを表示します。
 * ミスがなければ、このセクションは何も表示しません。
 */
export function MissDetails({ attempts }: { attempts: QuestionAttempt[] | undefined }) {
  const list = (attempts ?? []).filter((a) => a.miss > 0);
  if (list.length === 0) return null;
  return (
    <section className="panel miss-details" aria-labelledby="miss-title">
      <h2 id="miss-title">ミスした問題の詳細</h2>
      <p className="hint">赤い文字（下線と ×）が、ミスしたところです。</p>
      <ol className="miss-list">
        {list.map((a) => {
          const { path, explanations, pressedKeys } = summarizeAttempt(a);
          const acc = attemptAccuracy(a);
          return (
            <li key={a.seq} className="miss-item" data-testid="miss-item">
              <div className="miss-head">
                <span className="miss-seq">{a.seq}問目</span>
                <span className="miss-text" lang="ja">
                  {a.text}
                </span>
                <span className="miss-reading">（{a.reading}）</span>
                {!a.completed && <span className="badge badge-ref">入力途中</span>}
              </div>
              <div className="miss-path" aria-label={`入力：${path.map((p) => p.ch).join('')}`} data-testid="miss-path">
                {path.map((p, i) => (
                  <span key={i} className={`${p.part === 'rest' ? 'path-rest' : ''} ${p.missCount > 0 ? 'path-miss' : ''}`}>
                    {p.ch}
                    {p.missCount > 0 && <span className="path-mark">×{p.missCount > 1 ? p.missCount : ''}</span>}
                  </span>
                ))}
              </div>
              <ul className="miss-explain">
                {explanations.map((e) => (
                  <li key={`${e.position}-${e.pressed}`} data-testid="miss-explain">
                    「{e.kana}」の <b>{e.guideChar}</b> の位置で <b className="error-text">{keyName(e.pressed)}</b> を押した
                    {e.count > 1 && `（${e.count}回）`}
                    {e.acceptable.length > 1 && (
                      <span className="hint">（正しいキー：{e.acceptable.join(' または ')}）</span>
                    )}
                  </li>
                ))}
              </ul>
              <dl className="miss-stats">
                <div>
                  <dt>ミス</dt>
                  <dd data-testid="miss-count">{a.miss}回</dd>
                </div>
                <div>
                  <dt>かかった時間</dt>
                  <dd>{formatNumber1((a.endMs - a.startMs) / 1000)}秒</dd>
                </div>
                <div>
                  <dt>正確率</dt>
                  <dd>{acc === null ? '—' : `${formatNumber1(acc)}％`}</dd>
                </div>
                <div>
                  <dt>誤って押したキー</dt>
                  <dd data-testid="miss-keys">{pressedKeys.map(keyName).join('、')}</dd>
                </div>
              </dl>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
