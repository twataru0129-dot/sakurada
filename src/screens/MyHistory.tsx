import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { mergeRecords, recordFromResult, type HistoryRecord } from '../core/history';
import { fetchExamResultsOf, fetchResultsOf } from '../data/cloud';
import { mergeExamRecords, type ExamRecord } from '../core/examResult';
import { clearGuestExamHistory, loadGuestExamHistory } from '../data/guestExamHistory';
import { ExamRecordTable } from '../ui/exam/ExamRecordTable';
import { CloudTableMissingError, fetchGameResultsOf } from '../data/cloud';
import { mergeGameResults, type GameResult } from '../core/game/result';
import { clearGuestGameHistory, loadGuestGameHistory } from '../data/guestGameHistory';
import { GameRecordTable } from '../ui/game/GameRecordTable';
import { clearGuestHistory, GUEST_HISTORY_NOTICE, loadGuestHistory } from '../data/guestHistory';
import { useApp } from '../state/AppContext';
import { BackLink } from '../ui/common';
import { HistoryPanel } from '../ui/HistoryPanel';

/**
 * 練習の記録。ゲストはこの端末に保存した記録、ログイン利用者はアカウント（クラウド）の記録を表示します。
 * ゲストとアカウントの記録は混ぜません。どちらも新しい順に 100 件までです。
 */
export function MyHistory() {
  const { account, sessionResults, saves, historyFocus } = useApp();
  const userId = account?.kind === 'user' ? account.profile.id : null;
  const [tab, setTab] = useState<'typing' | 'exam' | 'game'>(historyFocus === 'exam' ? 'exam' : historyFocus === 'game' ? 'game' : 'typing');
  // アカウントが変わったら、前の人の記録を残さないよう作り直します
  const tabs = (
    <nav className="tabs history-tabs" aria-label="記録の種類">
        <button type="button" className="btn btn-small" aria-current={tab === 'typing' ? 'page' : undefined} onClick={() => setTab('typing')} data-testid="tab-typing">
          タイピングの記録
        </button>
        <button type="button" className="btn btn-small" aria-current={tab === 'exam' ? 'page' : undefined} onClick={() => setTab('exam')} data-testid="tab-exam">
          検定モードの記録
        </button>
        <button type="button" className="btn btn-small" aria-current={tab === 'game' ? 'page' : undefined} onClick={() => setTab('game')} data-testid="tab-game">
          ゲームの記録
        </button>
      </nav>
  );
  if (tab === 'game') return <GameHistoryScreen key={userId ?? 'guest'} userId={userId} tabs={tabs} />;
  return tab === 'typing' ? (
    <HistoryScreen key={userId ?? 'guest'} userId={userId} sessionResults={sessionResults} saves={saves} focus={historyFocus === 'exam' || historyFocus === 'game' ? null : historyFocus} tabs={tabs} />
  ) : (
    <ExamHistoryScreen key={userId ?? 'guest'} userId={userId} tabs={tabs} />
  );
}

/** ゲームの記録（タイピング・検定の記録とは別に表示します） */
function GameHistoryScreen({ userId, tabs }: { userId: string | null; tabs: ReactNode }) {
  const { gameResults, saves } = useApp();
  const [records, setRecords] = useState<GameResult[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const unsaved = gameResults.filter((r) => saves[r.id] !== 'saved');
  const unsavedIds = new Set(unsaved.map((r) => r.id));

  const load = useCallback(async () => {
    setError(null);
    if (userId) {
      try {
        setRecords(await fetchGameResultsOf(userId));
      } catch (e) {
        setRecords([]);
        setError(
          e instanceof CloudTableMissingError
            ? 'ゲームの記録を保存する表が、まだデータベースにありません（管理者が v1.2.0 のマイグレーションを適用すると使えます）。'
            : 'ゲームの記録を読み込めませんでした。通信を確認してください。',
        );
      }
    } else {
      const r = loadGuestGameHistory();
      setRecords(r.records);
      if (r.unavailable) setError('このブラウザでは記録を保存・読み込みできません（プライベートモードやブラウザの設定を確認してください）。');
      else if (r.incompatible) setError('新しい版のアプリで保存された記録のため、この版では表示できません。');
      else if (r.dropped > 0) setNotice(`読み込めなかった記録が${r.dropped}件ありました（データが壊れていた可能性があります）。`);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = records ? mergeGameResults(records, unsaved) : null;
  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>練習の記録</h1>
      {tabs}
      <p className="history-source" data-testid="game-history-source">
        {userId ? (
          <span className="badge badge-official">アカウントに保存した記録</span>
        ) : (
          <span className="badge badge-ref">ゲスト：この端末・ブラウザに保存した記録</span>
        )}
        <span className="hint">　新しい順に最新100回分を表示します。タイピングのランク・検定モードとは別の記録です。</span>
      </p>
      <p className="hint">完成年はゲーム内の換算です（1882年 ＋ 記録タイム2秒ごとに1年）。入力した文章や打鍵の記録は保存しません。</p>
      {!userId && (
        <div className="msg msg-info">
          {GUEST_HISTORY_NOTICE}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={() => {
                if (!window.confirm('この端末に保存したゲストのゲームの記録と、ゲームの自己ベストをすべて削除します。元に戻せません。削除しますか？')) return;
                if (clearGuestGameHistory()) {
                  setNotice('ゲストのゲームの記録と自己ベストを削除しました。');
                  void load();
                } else setError('記録を削除できませんでした。');
              }}
              data-testid="game-history-clear"
            >
              ゲストのゲームの記録と自己ベストをすべて削除
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="msg msg-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="msg msg-ng" role="alert">
          {error}
        </p>
      )}
      {!shown ? <p>読み込んでいます…</p> : <GameRecordTable records={shown} unsaved={unsavedIds} />}
    </main>
  );
}

/** 検定モードの記録（タイピングの記録・ランクとは別に表示します） */
function ExamHistoryScreen({ userId, tabs }: { userId: string | null; tabs: ReactNode }) {
  const { examOutcomes, saves } = useApp();
  const [records, setRecords] = useState<ExamRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const unsaved = examOutcomes.filter((o) => !o.preview && saves[o.record.id] !== 'saved');
  const unsavedIds = new Set(unsaved.map((o) => o.record.id));

  const load = useCallback(async () => {
    setError(null);
    if (userId) {
      try {
        setRecords(await fetchExamResultsOf(userId));
      } catch (e) {
        setRecords([]);
        setError(
          (e as Error)?.message === 'exam_results_missing'
            ? '検定モードの記録を保存する表が、まだデータベースにありません（管理者が v1.1.0 のマイグレーションを適用すると使えます）。'
            : '検定モードの記録を読み込めませんでした。通信を確認してください。',
        );
      }
    } else {
      const r = loadGuestExamHistory();
      setRecords(r.records);
      if (r.unavailable) setError('このブラウザでは記録を保存・読み込みできません（プライベートモードやブラウザの設定を確認してください）。');
      else if (r.incompatible) setError('新しい版のアプリで保存された記録のため、この版では表示できません。');
      else if (r.dropped > 0) setNotice(`読み込めなかった記録が${r.dropped}件ありました（データが壊れていた可能性があります）。`);
    }
  }, [userId]);
  useEffect(() => {
    void load();
  }, [load]);

  const shown = records ? mergeExamRecords(records, unsaved.map((o) => o.record)) : null;
  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>練習の記録</h1>
      {tabs}
      <p className="history-source" data-testid="exam-history-source">
        {userId ? (
          <span className="badge badge-official">アカウントに保存した記録</span>
        ) : (
          <span className="badge badge-ref">ゲスト：この端末・ブラウザに保存した記録</span>
        )}
        <span className="hint">　新しい順に最新100回分を表示します。タイピングのランクとは別の記録です。</span>
      </p>
      <p className="hint">記録には、そのとき使った問題の改訂番号と成績をそのまま残します。あとで問題が直されても、過去の成績は採点し直しません。入力した文章は保存しません。</p>
      {!userId && (
        <div className="msg msg-info">
          {GUEST_HISTORY_NOTICE}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={() => {
                if (!window.confirm('この端末に保存したゲストの検定モードの記録をすべて削除します。元に戻せません。削除しますか？')) return;
                if (clearGuestExamHistory()) {
                  setNotice('ゲストの検定モードの記録を削除しました。');
                  void load();
                } else setError('記録を削除できませんでした。');
              }}
            >
              ゲストの検定モードの記録をすべて削除
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="msg msg-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="msg msg-ng" role="alert">
          {error}
        </p>
      )}
      {!shown ? <p>読み込んでいます…</p> : <ExamRecordTable records={shown} unsaved={unsavedIds} />}
    </main>
  );
}

function HistoryScreen({
  userId,
  sessionResults,
  saves,
  focus,
  tabs,
}: {
  tabs: ReactNode;
  userId: string | null;
  sessionResults: ReturnType<typeof useApp>['sessionResults'];
  saves: ReturnType<typeof useApp>['saves'];
  focus: string | null;
}) {
  const [records, setRecords] = useState<HistoryRecord[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // まだ保存できていない今回の結果（保存失敗・保存中）も、記録 ID で重複を除いて表示します
  const unsavedIds = new Set(sessionResults.filter((r) => saves[r.id] !== 'saved').map((r) => r.id));
  const unsavedRecords = sessionResults.filter((r) => unsavedIds.has(r.id)).map(recordFromResult);

  const load = useCallback(async () => {
    setError(null);
    if (userId) {
      try {
        const cloud = await fetchResultsOf(userId);
        setRecords(cloud);
      } catch {
        setRecords([]);
        setError('アカウントの記録を読み込めませんでした。通信を確認してください。');
      }
    } else {
      const r = loadGuestHistory();
      setRecords(r.records);
      if (r.unavailable) setError('このブラウザでは記録を保存・読み込みできません（プライベートモードやブラウザの設定を確認してください）。');
      else if (r.incompatible) setError('新しい版のアプリで保存された記録のため、この版では表示できません。');
      else if (r.dropped > 0) setNotice(`読み込めなかった記録が${r.dropped}件ありました（データが壊れていた可能性があります）。`);
    }
  }, [userId]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = records ? mergeRecords(records, unsavedRecords) : null;

  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>練習の記録</h1>
      {tabs}
      <p className="history-source" data-testid="history-source">
        {userId ? (
          <span className="badge badge-official">アカウントに保存した記録</span>
        ) : (
          <span className="badge badge-ref">ゲスト：この端末・ブラウザに保存した記録</span>
        )}
        <span className="hint">　新しい順に最新100回分を表示します。</span>
      </p>
      {userId ? (
        <p className="hint">ログインしている間の記録です。同じアカウントなら、ほかの端末からでも見られます。ゲストの記録は含みません。</p>
      ) : (
        <div className="msg msg-info">
          {GUEST_HISTORY_NOTICE}
          <div style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn btn-danger btn-small"
              onClick={() => {
                if (!window.confirm('この端末に保存したゲストの記録をすべて削除します。元に戻せません。削除しますか？')) return;
                if (clearGuestHistory()) {
                  setNotice('ゲストの記録を削除しました。');
                  void load();
                } else {
                  setError('記録を削除できませんでした。');
                }
              }}
            >
              ゲストの記録をすべて削除
            </button>
          </div>
        </div>
      )}
      {notice && (
        <p className="msg msg-ok" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="msg msg-ng" role="alert">
          {error}
        </p>
      )}
      {!shown ? <p>読み込んでいます…</p> : <HistoryPanel records={shown} initialKey={focus} unsaved={unsavedIds} />}
    </main>
  );
}
