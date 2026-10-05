import { useEffect, useState } from 'react';
import { compareWithHistory, type Comparable, type Comparison } from '../core/compare';
import { DIFFICULTY_LABEL, themeLabel } from '../core/questions';
import { formatNumber1, nextRank, RANK_NONE } from '../core/rank';
import { speedUnit, type PracticeResult } from '../core/result';
import { fetchSameCondition } from '../data/cloud';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';

function toComparable(r: PracticeResult): Comparable {
  return { id: r.id, startedAt: r.startedAt, finished: r.finished, rank: r.rank, speed: r.speed, accuracy: r.accuracy, correct: r.correct, miss: r.miss };
}

export function setTypeLabel(r: Pick<PracticeResult, 'setType' | 'theme' | 'difficulty' | 'kind'>): string {
  switch (r.setType) {
    case 'standard':
      return '標準問題';
    case 'general':
      return `一般問題（${r.difficulty === 'mixed' ? 'いろいろ' : DIFFICULTY_LABEL[r.kind][r.difficulty]}）`;
    case 'sakura':
      return `🌸桜モード（${r.theme === 'all' ? 'すべてのテーマ' : themeLabel('sakura', r.theme)}・${r.difficulty === 'mixed' ? 'いろいろ' : DIFFICULTY_LABEL[r.kind][r.difficulty]}）`;
    default:
      return '先生の追加教材';
  }
}

export function Result() {
  const { currentResult: r, account, saves, retrySave, sessionResults, setLastConfig } = useApp();
  const [cmp, setCmp] = useState<Comparison | null>(null);
  const [cmpError, setCmpError] = useState(false);
  const unitShort = r?.kind === 'romaji' ? '打／分' : '字／分';

  useEffect(() => {
    if (!r) return;
    let cancelled = false;
    if (account?.kind === 'user') {
      fetchSameCondition(r, r.id)
        .then((rows) => {
          if (cancelled) return;
          const hist: Comparable[] = rows.map((h) => ({ ...h }));
          setCmp(compareWithHistory(toComparable(r), hist, unitShort));
        })
        .catch(() => !cancelled && setCmpError(true));
    } else {
      const hist = sessionResults.filter((x) => x.conditionKey === r.conditionKey && x.id !== r.id).map(toComparable);
      setCmp(compareWithHistory(toComparable(r), hist, unitShort));
    }
    return () => {
      cancelled = true;
    };
    // 結果が変わったときだけ比べ直します
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [r?.id]);

  if (!r) {
    return (
      <main>
        <p>表示する結果がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/home')}>
          ホームへ
        </button>
      </main>
    );
  }

  const save = saves[r.id];
  const nr = nextRank(r.kind, r.rank);
  const unit = speedUnit(r.kind);
  const countLabel = r.kind === 'romaji' ? '正しく打った数（打鍵）' : '正しく入力した文字数';
  const missLabel = r.kind === 'romaji' ? 'ミス（打鍵）' : 'ミス（誤って確定した文字数）';

  return (
    <main>
      <h1>練習の結果</h1>
      <section className="panel">
        <p>
          {r.kind === 'romaji' ? 'ローマ字入力' : '文章入力〈変換あり〉'}・{setTypeLabel(r)}・{r.minutes}分・
          {r.inputMethod === 'keyboard' ? '実物のキーボード' : r.kind === 'romaji' ? '画面のキーをタップ' : '画面のキーボード'}
        </p>
        {!r.finished && (
          <p className="msg msg-warn">途中で終わったため、完走の記録・正式ランクには使いません（練習した時間：{Math.floor(r.elapsedMs / 1000)}秒）。</p>
        )}
        <div className="result-rank">
          <div className="rank-big" aria-label={`ランク ${r.rank}`}>
            {r.rank}
          </div>
          <div>
            {r.rank === RANK_NONE ? (
              <span className="badge badge-soon">入力がなかったため未判定</span>
            ) : r.official ? (
              <span className="badge badge-official">正式ランク</span>
            ) : (
              <span className="badge badge-ref">参考ランク</span>
            )}
            {cmp?.isNewBest && (
              <p className="ok-text" style={{ marginTop: 8 }}>
                ★ {cmp.isFirst ? 'この条件の初めての記録です！' : '自己ベスト更新！'}
              </p>
            )}
            <p className="hint" style={{ marginTop: 6 }}>ランクはこのアプリ独自の目安です。</p>
          </div>
        </div>

        <div className="kv">
          <div>
            <div className="k">{countLabel}</div>
            <div className="v">{r.correct}</div>
          </div>
          <div>
            <div className="k">完成した問題</div>
            <div className="v">
              {r.completedQuestions}
              <span className="u"> 問</span>
            </div>
          </div>
          <div>
            <div className="k">{missLabel}</div>
            <div className="v">{r.miss}</div>
          </div>
          <div>
            <div className="k">正確率</div>
            <div className="v">
              {r.accuracy === null ? '—' : formatNumber1(r.accuracy)}
              {r.accuracy !== null && <span className="u"> ％</span>}
            </div>
          </div>
          <div>
            <div className="k">1分あたりの速さ</div>
            <div className="v">
              {formatNumber1(r.speed)}
              <span className="u"> {unit}</span>
            </div>
          </div>
        </div>

        {nr && (
          <p>
            次のランク「<b>{nr.name}</b>」まで：速さ <b>{nr.speed}</b> {r.kind === 'romaji' ? '打／分' : '字／分'}以上
            {r.speed < nr.speed && `（あと ${formatNumber1(nr.speed - r.speed)}）`}、正確率 <b>{nr.accuracy}％</b>以上
            {r.accuracy !== null && r.accuracy < nr.accuracy && `（あと ${formatNumber1(nr.accuracy - r.accuracy)} ポイント）`}
          </p>
        )}
        {!nr && r.rank !== RANK_NONE && <p>最高のランクです。</p>}
      </section>

      <section className="panel" aria-labelledby="cmp-title">
        <h2 id="cmp-title">同じ条件の前回と比べて</h2>
        {cmpError && <p className="msg msg-warn">前回の記録を読み込めませんでした。</p>}
        {!cmp && !cmpError && <p className="hint">読み込んでいます…</p>}
        {cmp && !cmp.previous && <p>同じ条件の前回の記録はありません。この記録が次の目標になります。</p>}
        {cmp?.previous && (
          <>
            <p>
              前回：ランク {cmp.previous.rank}・速さ {formatNumber1(cmp.previous.speed)} {unitShort}・正確率{' '}
              {cmp.previous.accuracy === null ? '—' : `${formatNumber1(cmp.previous.accuracy)}％`}
            </p>
            {cmp.growth.length > 0 ? (
              <ul>
                {cmp.growth.map((g) => (
                  <li key={g} className="ok-text">
                    ↑ {g}
                  </li>
                ))}
              </ul>
            ) : (
              <p>今回は前回と同じくらいでした。あわてずに、正確さを大切に続けましょう。</p>
            )}
          </>
        )}
        {cmp?.bestBefore && !cmp.isNewBest && (
          <p className="hint">
            自己ベスト：ランク {cmp.bestBefore.rank}・速さ {formatNumber1(cmp.bestBefore.speed)} {unitShort}
          </p>
        )}
      </section>

      <section className="panel" aria-live="polite">
        {account?.kind === 'user' ? (
          <p className="save-state">
            {save === 'saving' && '記録を保存しています…'}
            {save === 'saved' && <span className="ok-text">✓ 記録を保存しました</span>}
            {save === 'failed' && (
              <span className="error-text">
                × 記録を保存できませんでした。通信を確認して、もう一度保存してください。{' '}
                <button type="button" className="btn btn-small" onClick={() => retrySave(r.id)}>
                  もう一度保存する
                </button>
              </span>
            )}
          </p>
        ) : (
          <p>ゲストのため、この記録は保存されません。終了すると消えます。</p>
        )}
      </section>

      <div className="btn-row">
        <button
          type="button"
          className="btn btn-primary"
          autoFocus
          onClick={() => {
            setLastConfig({ kind: r.kind, minutes: r.minutes, inputMethod: r.inputMethod, setType: r.setType, theme: r.theme, difficulty: r.difficulty, questionSetVersion: r.questionSetVersion });
            navigate('/practice');
          }}
        >
          同じ条件でもう一度
        </button>
        <button type="button" className="btn" onClick={() => navigate('/typing')}>
          条件を変えて練習
        </button>
        <button type="button" className="btn btn-quiet" onClick={() => navigate('/home')}>
          ホームへ
        </button>
      </div>
    </main>
  );
}
