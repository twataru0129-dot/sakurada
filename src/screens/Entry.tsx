import { isCloudConfigured } from '../config';
import { useApp } from '../state/AppContext';
import { navigate } from '../state/router';
import { logoUrl, Notice } from '../ui/common';

export function Entry() {
  const { startGuest } = useApp();
  return (
    <main>
      <Notice />
      <section className="entry">
        <img className="entry-logo" src={logoUrl} alt="桜打 SAKURA TYPE のロゴ" width={168} height={168} />
        <h1 className="entry-title">桜打 — SAKURA TYPE</h1>
        <p>日本語のタイピングを練習するアプリです。</p>
        <div className="entry-actions">
          <button type="button" className="btn btn-primary" onClick={startGuest}>
            ゲストで練習
          </button>
          <button type="button" className="btn" onClick={() => navigate('/login')} disabled={!isCloudConfigured} aria-describedby={!isCloudConfigured ? 'no-cloud' : undefined}>
            ログインして練習
          </button>
        </div>
        {!isCloudConfigured && (
          <div id="no-cloud" className="msg msg-warn notice">
            <b>ログイン機能はまだ設定されていません。</b>
            いまはゲストでの練習だけが使えます。
            <br />
            <span className="hint">先生・管理者の方へ：ログインと記録の保存を使うには、README の「クラウドの設定」の手順で Supabase を設定してください。</span>
          </div>
        )}
        <section className="panel notice" aria-labelledby="about-data">
          <h2 id="about-data">はじめに読んでください</h2>
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
        </section>
      </section>
    </main>
  );
}
