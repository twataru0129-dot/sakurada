import { useEffect, useState } from 'react';
import { compareGame, type GameComparison, type GameResult } from '../../core/game/result';
import { completionYearFor, formatGameTime } from '../../core/game/sakurada';
import { formatNumber1 } from '../../core/rank';
import { fetchGameBests, fetchGameResultsOf } from '../../data/cloud';
import { COURSE_LABEL, courseLabelOf, findStory, pickStory } from '../../data/gameStories';
import { loadGuestGameBests, loadGuestGameHistory } from '../../data/guestGameHistory';
import { GUEST_HISTORY_NOTICE } from '../../data/guestHistory';
import { useApp } from '../../state/AppContext';
import { navigate } from '../../state/router';
import { BuildingView } from '../../ui/game/BuildingView';
import { IMAGE_NOTE, usePreloadStages } from '../../ui/game/stageImages';
import { MemorialPanel } from '../../ui/game/MemorialPanel';

function diffText(ms: number): string {
  const s = Math.abs(ms) / 1000;
  return s >= 60 ? formatGameTime(Math.abs(ms)) : `${formatNumber1(s)}秒`;
}

export function SakuradaResult() {
  const { currentGame: r, account, saves, saveFailures, retryGameSave, gameResults, gameSession, setGameSession, setHistoryFocus } = useApp();
  const loadState = usePreloadStages();
  const [cmp, setCmp] = useState<GameComparison | null>(null);
  const [cmpError, setCmpError] = useState(false);
  const userId = account?.kind === 'user' ? account.profile.id : null;

  // 比較は、保存先（ゲストはこの端末、ログイン利用者はアカウント）の記録と、今回のログイン中の記録で行います
  useEffect(() => {
    if (!r) return;
    let cancelled = false;
    void (async () => {
      try {
        let history: GameResult[];
        let bests: GameResult[];
        if (userId) {
          [history, bests] = await Promise.all([fetchGameResultsOf(userId), fetchGameBests(userId)]);
        } else {
          history = loadGuestGameHistory().records;
          bests = loadGuestGameBests().records;
        }
        const local = gameResults.filter((x) => x.id !== r.id);
        if (!cancelled) setCmp(compareGame(r, [...history, ...local], bests));
      } catch {
        if (!cancelled) {
          setCmpError(true);
          setCmp(compareGame(r, gameResults.filter((x) => x.id !== r.id), []));
        }
      }
    })();
    return () => {
      cancelled = true;
    };
    // 保存の状態が変わったら（保存後に）比べ直します
  }, [r, userId, gameResults, saves[r?.id ?? '']]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!r) {
    return (
      <main>
        <p>結果がありません。</p>
        <button type="button" className="btn" onClick={() => navigate('/game')}>
          ゲームの選択へ
        </button>
      </main>
    );
  }
  const story = findStory(r.storyId);
  const save = saves[r.id];
  const failure = saveFailures[r.id];
  const prev = cmp?.previous ?? null;
  const best = cmp?.bestBefore ?? null;

  return (
    <main className="game-result">
      <div className="petals" aria-hidden="true">
        {Array.from({ length: 12 }, (_, i) => (
          <span key={i} className="petal" style={{ left: `${(i * 8.3 + 3) % 100}%`, animationDelay: `${(i % 6) * 0.7}s` }} />
        ))}
      </div>
      <BuildingView stage={5} loadState={loadState} large />
      <p className="hint game-image-note">{IMAGE_NOTE}</p>
      <h1 className="game-complete-title" data-testid="game-complete-title">
        西暦{r.completionYear}年、あなたのサクラダファミリアが完成！
      </h1>
      <p className="hint" style={{ textAlign: 'center' }}>
        ※ ゲーム内の完成年です（1882年 ＋ 記録タイム2秒ごとに1年）。実際のサグラダ・ファミリアの完成予定年とは関係ありません。
      </p>

      <section className="panel" aria-labelledby="gr-title">
        <h2 id="gr-title" className="sr-only">
          記録
        </h2>
        <div className="game-record-main">
          <span className="k">記録タイム</span>
          <span className="v" data-testid="record-time">
            {formatGameTime(r.recordTimeMs)}
          </span>
        </div>
        <div className="kv">
          <div>
            <div className="k">入力時間</div>
            <div className="v" data-testid="elapsed-time">
              {formatGameTime(r.elapsedMs)}
            </div>
          </div>
          <div>
            <div className="k">ミス回数</div>
            <div className="v" data-testid="miss-count">
              {r.missCount}
              <span className="u"> 回</span>
            </div>
          </div>
          <div>
            <div className="k">ミス加算時間</div>
            <div className="v" data-testid="penalty-time">
              ＋{r.penaltyMs / 1000}
              <span className="u"> 秒</span>
            </div>
          </div>
          <div>
            <div className="k">正確率</div>
            <div className="v" data-testid="accuracy">
              {r.accuracy === null ? '—' : `${formatNumber1(r.accuracy)}％`}
            </div>
          </div>
          <div>
            <div className="k">正しく打ったキー</div>
            <div className="v">
              {r.correctKeystrokes}
              <span className="u"> 回</span>
            </div>
          </div>
        </div>
        <p className="hint">
          物語：「{story?.title ?? r.storyId}」・{courseLabelOf(r)}・{r.inputMethod === 'keyboard' ? '実物のキーボード' : '画面のキー'}
          {r.pauseCount > 0 && `・一時停止 ${r.pauseCount}回`}
          。記録タイム ＝ 入力時間 ＋ ミス回数 × 5秒。
        </p>
      </section>

      <section className="panel" aria-labelledby="gcmp-title" data-testid="game-compare">
        <h2 id="gcmp-title">前回・自己ベストとくらべて</h2>
        {!cmp && <p>記録を読み込んでいます…</p>}
        {cmp?.firstTime && <p className="game-first">初めての完成！ おめでとうございます。</p>}
        {cmp && prev && (
          <p data-testid="cmp-prev">
            {prev.recordTimeMs > r.recordTimeMs
              ? `前回より${diffText(prev.recordTimeMs - r.recordTimeMs)}早く完成しました。`
              : prev.recordTimeMs < r.recordTimeMs
                ? `前回の記録は${formatGameTime(prev.recordTimeMs)}でした。`
                : '前回と同じ記録タイムでした。'}
            {prev.completionYear > r.completionYear && ` 完成年は前回より${prev.completionYear - r.completionYear}年早くなりました。`}
          </p>
        )}
        {cmp && !cmp.firstTime && cmp.isNewBest && <p className="game-best" data-testid="cmp-best">自己ベストを更新しました！（この物語・コース）</p>}
        {cmp && best && !cmp.isNewBest && (
          <p className="hint" data-testid="cmp-best-before">
            この物語の自己ベスト：{formatGameTime(best.recordTimeMs)}（西暦{completionYearFor(best.recordTimeMs)}年）
          </p>
        )}
        {cmp?.courseBestBefore && (
          <p className="hint">
            {COURSE_LABEL[r.courseId]}の3つの物語全体での自己ベスト（参考）：{formatGameTime(cmp.courseBestBefore.recordTimeMs)}。物語ごとに入力する量が少し違うため、物語ごとの記録を主に比べています。
          </p>
        )}
        <p className="hint">比べるのは、同じゲーム・ルール・コース・物語・入力のしかたで、一時停止の有無も同じ記録です。</p>
        {cmpError && <p className="hint">アカウントの記録を読み込めなかったため、このログイン中の記録だけで比べています。</p>}
      </section>

      <div className="memorial-row">
        <MemorialPanel
          result={r}
          storyTitle={story?.title ?? r.storyId}
          courseLabel={courseLabelOf(r)}
          displayName={account?.kind === 'user' ? account.profile.displayName : null}
        />
      </div>

      <section className="panel" aria-live="polite">
        <p className="save-state" data-testid="game-save-state">
          {account?.kind === 'user' ? (
            <>
              {save === 'saving' && '記録をアカウントに保存しています…'}
              {save === 'saved' && <span className="ok-text">✓ 記録をアカウントに保存しました</span>}
              {save === 'failed' && (
                <span className="error-text">
                  × クラウドに保存できていません。
                  {failure === 'missing_table'
                    ? 'データベースにゲームの記録の表がまだありません（管理者にマイグレーションの適用を依頼してください）。'
                    : '通信を確認して、もう一度保存してください。'}
                  この画面を閉じるまで、記録は消えません。{' '}
                  <button type="button" className="btn btn-small" onClick={() => retryGameSave(r.id)} data-testid="game-retry">
                    もう一度保存する
                  </button>
                </span>
              )}
            </>
          ) : (
            <>
              {save === 'saved' && <span className="ok-text">✓ この端末・ブラウザに記録しました（ゲスト）</span>}
              {save === 'failed' && (
                <span className="error-text">
                  × この端末に記録できませんでした（ブラウザの設定や空き容量を確認してください）。{' '}
                  <button type="button" className="btn btn-small" onClick={() => retryGameSave(r.id)} data-testid="game-retry">
                    もう一度記録する
                  </button>
                </span>
              )}
              <br />
              <span className="hint">{GUEST_HISTORY_NOTICE}</span>
            </>
          )}
        </p>
      </section>

      <div className="btn-row result-actions">
        <button
          type="button"
          className="btn btn-primary"
          autoFocus
          onClick={() => {
            // もう一度：同じコースの3本から、あらためてランダムに1本を選びます
            const s = pickStory(r.courseId);
            setGameSession({ courseId: r.courseId, storyId: s.id, inputMethod: gameSession?.inputMethod ?? r.inputMethod });
            navigate('/game/sakurada/play');
          }}
          data-testid="game-again"
        >
          もう一度
        </button>
        <button type="button" className="btn" onClick={() => navigate('/game')}>
          ゲーム選択へ
        </button>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setHistoryFocus('game');
            navigate('/history');
          }}
        >
          ゲームの記録
        </button>
      </div>
    </main>
  );
}
