import { DOCS_BASE, isCloudConfigured } from '../config';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { logoUrl, Notice } from '../ui/common';

export function Entry() {
  const { startGuest } = useApp();
  return (
    <main className="entry-main">
      <Notice />
      <section className="entry-hero">
        <img className="entry-logo" src={logoUrl} alt="桜打 SAKURA TYPE のロゴ" width={240} height={240} />
        <div className="entry-heading">
          <h1 className="entry-title">桜打 — SAKURA TYPE</h1>
          <p className="entry-tagline">自分のペースで、タイピングを練習しよう</p>
        </div>
      </section>

      <section className="entry-choices" aria-label="はじめかたをえらぶ">
        <div className="entry-choice-wrap">
          <button type="button" className="choice-card choice-card-primary" onClick={startGuest}>
            <span className="choice-card-title">ゲストで練習</span>
            <span className="choice-card-desc">登録なしですぐ練習</span>
          </button>
          <p className="choice-note">ゲストの記録は保存されません。</p>
        </div>
        <div className="entry-choice-wrap">
          <button
            type="button"
            className="choice-card"
            onClick={() => navigate('/login')}
            disabled={!isCloudConfigured}
            aria-describedby={!isCloudConfigured ? 'no-cloud' : undefined}
          >
            <span className="choice-card-title">ログインして練習</span>
            <span className="choice-card-desc">記録を保存して成長を確認</span>
          </button>
          {isCloudConfigured ? (
            <p className="choice-note">先生からもらった ID とパスワードを使います。</p>
          ) : (
            <p id="no-cloud" className="choice-note choice-note-warn">
              ログイン機能は準備中です。ゲストで練習できます。
            </p>
          )}
        </div>
      </section>

      <section className="entry-cautions" aria-labelledby="caution-title">
        <h2 id="caution-title" className="sr-only">大切な注意</h2>
        <ul>
          <li>
            <b>本名・住所・電話番号などは入力しないでください。</b>
          </li>
          <li>
            みんなで使うパソコンでは、終わったら<b>「終了してログアウト」</b>を押してください。
          </li>
        </ul>
      </section>

      <details className="entry-details">
        <summary>使い方・記録と個人情報について</summary>
        <div className="entry-details-body">
          <h3>ゲストで練習</h3>
          <ul>
            <li>IDやパスワードは使いません。</li>
            <li>結果はその場で見られますが、保存されません。終了すると消えます。</li>
          </ul>
          <h3>ログインして練習</h3>
          <ul>
            <li>先生からもらった ID とパスワードを使います。</li>
            <li>練習の記録と設定は、インターネット上の保存場所（クラウド）に保存されます。学校のどのパソコンや、ほかの端末からでも続きができます。</li>
            <li>
              保存するもの：ID、表示名（ハンドルネーム）、クラス、練習の設定、練習した日時・種類・時間・入力のしかた、正しく打てた数、ミスの数、正確率、速さ、ランク。
            </li>
            <li>保存しないもの：打った文章そのもの、1つ1つのキー操作。</li>
            <li>保存する目的：自分の成長を確かめるため、先生が授業で練習の様子を知るためです。記録を見られるのは、あなたと担当の先生です。</li>
          </ul>
          <h3>気をつけること</h3>
          <ul>
            <li>
              <b>本名・住所・電話番号などは入力しないでください。</b>表示名にはハンドルネームを使います。
            </li>
            <li>
              みんなで使うパソコンでは、終わったら必ず<b>「終了してログアウト」</b>を押してください。
            </li>
            <li>15分間操作がないと、自動でログアウトします。画面を再読み込みしたり閉じたりしても、ログアウトします。</li>
            <li>ブラウザに「パスワードを保存しますか」と出たら、「保存しない」を選んでください。</li>
          </ul>
        </div>
      </details>

      <details className="entry-details">
        <summary>先生・管理者向けの設定案内</summary>
        <div className="entry-details-body">
          {!isCloudConfigured && (
            <p>
              ログインと記録の保存を使うには、Supabase（認証とデータベースのサービス）の設定が必要です。設定するまでは、ゲストでの練習だけが使えます。
            </p>
          )}
          <ul>
            <li>
              <a href={`${DOCS_BASE}README.md`} target="_blank" rel="noopener noreferrer">
                README（全体の説明・最初の教員アカウント・生徒の発行）
              </a>
            </li>
            <li>
              <a href={`${DOCS_BASE}docs/setup.md`} target="_blank" rel="noopener noreferrer">
                初回導入手順（Supabase の設定）
              </a>
            </li>
            <li>
              <a href={`${DOCS_BASE}docs/teacher-guide.md`} target="_blank" rel="noopener noreferrer">
                先生向けの使い方
              </a>
            </li>
            <li>
              <a href={`${DOCS_BASE}docs/security.md`} target="_blank" rel="noopener noreferrer">
                安全のための設計と設定
              </a>
            </li>
          </ul>
        </div>
      </details>
    </main>
  );
}
