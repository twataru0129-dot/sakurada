import { useEffect, useState } from 'react';
import { fetchResultsOf, type HistoryRow } from '../data/cloud';
import { useApp } from '../state/AppContext';
import { BackLink } from '../ui/common';
import { HistoryView } from '../ui/HistoryView';

export function MyHistory() {
  const { account } = useApp();
  const [rows, setRows] = useState<HistoryRow[] | null>(null);
  const [error, setError] = useState(false);
  const userId = account?.kind === 'user' ? account.profile.id : null;
  useEffect(() => {
    if (!userId) return;
    fetchResultsOf(userId).then(setRows).catch(() => setError(true));
  }, [userId]);
  if (!userId) return null;
  return (
    <main>
      <BackLink to="/home">ホームにもどる</BackLink>
      <h1 style={{ marginTop: 12 }}>これまでの記録</h1>
      <section className="panel">
        {error && <p className="msg msg-ng">記録を読み込めませんでした。</p>}
        {!rows && !error && <p>読み込んでいます…</p>}
        {rows && <HistoryView rows={rows} />}
      </section>
    </main>
  );
}
