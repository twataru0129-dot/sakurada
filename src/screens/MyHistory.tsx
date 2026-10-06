import { useCallback, useEffect, useState } from 'react';
import { mergeRecords, recordFromResult, type HistoryRecord } from '../core/history';
import { fetchResultsOf } from '../data/cloud';
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
  // アカウントが変わったら、前の人の記録を残さないよう作り直します
  return <HistoryScreen key={userId ?? 'guest'} userId={userId} sessionResults={sessionResults} saves={saves} focus={historyFocus} />;
}

function HistoryScreen({
  userId,
  sessionResults,
  saves,
  focus,
}: {
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
