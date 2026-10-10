import { GUEST_HISTORY_NOTICE } from '../data/guestHistory';
import { endLabel } from '../core/result';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { logoSrcSet, logoUrl, Notice, Toggle } from '../ui/common';

export function Home() {
  const { account, settings, updateSettings, settingsSave, sessionResults, setHistoryFocus } = useApp();
  if (!account) return null;
  const isUser = account.kind === 'user';
  return (
    <main className="home-main">
      <Notice />
      <div className="home-hero">
        <img src={logoUrl} srcSet={logoSrcSet} sizes="(min-width: 761px) 180px, 96px" alt="桜打 SAKURA TYPE のロゴ" width={180} height={180} />
        <div>
          <h1 className="home-greeting">{isUser ? `${account.profile.displayName}さん、こんにちは` : 'ゲストで練習中'}</h1>
          <p className="home-hero-note">{isUser ? '記録と設定はアカウント（クラウド）に保存されます。' : GUEST_HISTORY_NOTICE}</p>
        </div>
      </div>

      <h2 className="home-section-title">モードをえらぶ</h2>
      <div className="home-modes">
        <button type="button" className="card-button home-mode" onClick={() => navigate('/typing')}>
          <span className="title">① タイピングモード</span>
          <span className="home-mode-desc">ローマ字入力と、漢字に変換する文章入力。3・5・10分、または25・50問で練習できます。</span>
          <span className="home-mode-foot">
            <span className="badge badge-ok">練習できます</span>
            <span className="home-mode-arrow" aria-hidden="true">→</span>
          </span>
        </button>
        <button type="button" className="card-button home-mode" onClick={() => navigate('/game')} data-testid="home-game">
          <span className="title">② ゲームモード</span>
          <span className="home-mode-desc">文章を打って建物を完成させたり、桜を育てて庭を作ったり、爆弾を解除したりできます。</span>
          <span className="home-mode-sub">
            <span>・サクラダファミリアを完成させよ</span>
            <span>・桜ガーデン</span>
            <span>・ボウイの爆弾遊戯</span>
          </span>
          <span className="home-mode-foot">
            <span className="badge badge-ok">遊べます</span>
            <span className="home-mode-arrow" aria-hidden="true">→</span>
          </span>
        </button>
        <button type="button" className="card-button home-mode" onClick={() => navigate('/exam')} data-testid="home-exam">
          <span className="title">③ 検定モード</span>
          <span className="home-mode-desc">お手本を見ながら、A4の用紙に日本語の文章を入力する練習です。4級相当〜1級相当。</span>
          <span className="home-mode-foot">
            <span className="badge badge-ok">練習できます</span>
            <span className="home-mode-arrow" aria-hidden="true">→</span>
          </span>
        </button>
      </div>

      <div className="home-panels">
        <section className="panel home-panel" aria-labelledby="settings-title">
          <h2 id="settings-title">設定</h2>
          <div className="home-settings">
            <Toggle label="ローマ字ガイド（文章入力では読み）" checked={settings.romajiGuide} onChange={(v) => updateSettings({ romajiGuide: v })} />
            <Toggle label="キーボードガイド" checked={settings.keyboardGuide} onChange={(v) => updateSettings({ keyboardGuide: v })} />
            <Toggle label="指のガイド" checked={settings.fingerGuide} onChange={(v) => updateSettings({ fingerGuide: v })} />
            <Toggle label="音" checked={settings.sound} onChange={(v) => updateSettings({ sound: v })} />
          </div>
          {isUser && (
            <p className="hint" role="status" style={{ marginTop: 8 }}>
              {settingsSave === 'saving' && '設定を保存しています…'}
              {settingsSave === 'saved' && '✓ 設定を保存しました'}
              {settingsSave === 'failed' && <span className="error-text">× 設定を保存できませんでした。通信を確認してください。</span>}
            </p>
          )}
        </section>
        <section className="panel home-panel" aria-labelledby="recent-title">
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
              className="btn btn-primary home-history-btn"
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
