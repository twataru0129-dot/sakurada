import { GUEST_HISTORY_NOTICE } from '../data/guestHistory';
import { endLabel } from '../core/result';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { logoUrl, Notice, Toggle } from '../ui/common';

export function Home() {
  const { account, settings, updateSettings, settingsSave, sessionResults, setHistoryFocus } = useApp();
  if (!account) return null;
  const isUser = account.kind === 'user';
  return (
    <main>
      <Notice />
      <div className="home-hero">
        <img src={logoUrl} alt="桜打 SAKURA TYPE のロゴ" width={88} height={88} />
        <div>
          <h1 style={{ marginBottom: 4 }}>{isUser ? `${account.profile.displayName}さん、こんにちは` : 'ゲストで練習中'}</h1>
          <p className="hint" style={{ margin: 0 }}>
            {isUser ? '記録と設定はアカウント（クラウド）に保存されます。' : GUEST_HISTORY_NOTICE}
          </p>
        </div>
      </div>

      <h2>モードをえらぶ</h2>
      <div className="grid grid-3" style={{ marginBottom: 24 }}>
        <button type="button" className="card-button" onClick={() => navigate('/typing')}>
          <span className="title">① タイピングモード</span>
          <span>ローマ字入力と、漢字に変換する文章入力を練習します。3分・5分・10分。</span>
          <span className="badge badge-ok">練習できます</span>
        </button>
        <button type="button" className="card-button" disabled aria-describedby="quest-soon">
          <span className="title">② 桜打クエスト</span>
          <span>（準備中です）</span>
          <span id="quest-soon" className="badge badge-soon">準備中</span>
        </button>
        <button type="button" className="card-button" disabled aria-describedby="exam-soon">
          <span className="title">③ 検定モード</span>
          <span>見本を見ながら、白紙のA4文書に文章を作る練習を予定しています。（準備中です）</span>
          <span id="exam-soon" className="badge badge-soon">準備中</span>
        </button>
      </div>

      <div className="grid grid-2">
        <section className="panel" aria-labelledby="settings-title">
          <h2 id="settings-title">設定</h2>
          <Toggle label="ローマ字ガイド（文章入力では読み）" checked={settings.romajiGuide} onChange={(v) => updateSettings({ romajiGuide: v })} />
          <br />
          <Toggle label="キーボードガイド" checked={settings.keyboardGuide} onChange={(v) => updateSettings({ keyboardGuide: v })} />
          <br />
          <Toggle label="指のガイド" checked={settings.fingerGuide} onChange={(v) => updateSettings({ fingerGuide: v })} />
          <br />
          <Toggle label="音" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          {isUser && (
            <p className="hint" role="status" style={{ marginTop: 8 }}>
              {settingsSave === 'saving' && '設定を保存しています…'}
              {settingsSave === 'saved' && '✓ 設定を保存しました'}
              {settingsSave === 'failed' && <span className="error-text">× 設定を保存できませんでした。通信を確認してください。</span>}
            </p>
          )}
        </section>
        <section className="panel" aria-labelledby="recent-title">
          <h2 id="recent-title">今回の練習</h2>
          {sessionResults.length === 0 ? (
            <p className="hint">まだ練習していません。</p>
          ) : (
            <ul>
              {sessionResults.slice(0, 5).map((r) => (
                <li key={r.id}>
                  {r.kind === 'romaji' ? 'ローマ字' : '文章'} {endLabel(r)}：{r.rank}（{r.official ? '正式' : '参考'}）
                </li>
              ))}
            </ul>
          )}
          <div className="btn-row">
            <button
              type="button"
              className="btn"
              onClick={() => {
                setHistoryFocus(null);
                navigate('/history');
              }}
            >
              練習の記録
            </button>
            {isUser && account.profile.role === 'teacher' && (
              <button type="button" className="btn" onClick={() => navigate('/teacher')}>
                先生用の画面へ
              </button>
            )}
          </div>
        </section>
      </div>
    </main>
  );
}
