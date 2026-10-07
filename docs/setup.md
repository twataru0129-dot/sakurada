# 初回導入手順（ログインと記録の保存を使うとき）

ゲストでの練習だけなら、この手順は不要です（README の「2. まずゲストで動かしてみる」）。
ここでは、ID とパスワードでのログイン、記録のクラウド保存、先生用の画面を使えるようにします。

> Supabase の画面の名前や場所は、サービスの更新で変わることがあります。見つからないときは、Supabase の公式ドキュメントで同じ名前の設定を探してください。

## 全体の構成

| 役割 | 使うもの | 置き場所 |
|---|---|---|
| 画面（フロントエンド） | このアプリを `npm run build` した `dist` | 学校の Web サーバー、GitHub Pages など（HTTPS） |
| 認証（ID・パスワード・二段階認証） | Supabase Auth | Supabase |
| データベースと権限 | Supabase の PostgreSQL ＋ 行レベルセキュリティ（RLS） | Supabase（`supabase/migrations/`） |
| 管理処理（生徒の発行など。管理用の鍵が必要） | Supabase Edge Function `teacher-admin` | Supabase（`supabase/functions/`） |

管理用の鍵（service_role / secret キー）は Edge Function の実行環境と、管理者が教員を作るときのターミナルの中だけで使います。
**画面（dist）、GitHub、`.env.local` には入れません。**

---

## 手順1　Supabase のプロジェクトを作る

1. https://supabase.com でアカウントを作り、「New project」でプロジェクトを作ります。
   - 地域（Region）は日本に近い場所（Tokyo など）を選びます。
   - データベースのパスワードは、ほかで使っていない長いものにし、安全な場所に保管します。
2. 学校や自治体の規程（個人情報・外部サービスの利用）に沿って、利用してよいか事前に確認してください。

## 手順2　データベースの表と権限を入れる

いずれかの方法で `supabase/migrations/` の SQL を**ファイル名の順に**実行します。

1. `20261005000000_init.sql`（表・権限・関数）
2. `20261006000000_count_mode_and_romaji_style.sql`（v1.0.2：問題数で練習の記録、ローマ字のお手本の設定）
3. `20261007000000_history_romaji_style.sql`（v1.0.3：練習の記録にローマ字のお手本を残す）
4. `20261008000000_exam_results.sql`（v1.1.0：検定モードの記録の表 `exam_results` と権限）
5. `20261009000000_game_results.sql`（v1.2.0：ゲームモードの記録の表 `game_results`・物語の表・自己ベストの関数 `game_bests` と権限）
6. `20261010000000_game_short_stories_v2.sql`（v1.3.0：新しい短縮コースの物語を `private.game_stories` に追加。既存の行は変更しません）
7. `20261011000000_garden_events.sql`（v1.4.0：桜ガーデンの記録の表 `garden_events` と権限）

> **はじめて設定する場合**：1 → 2 → 3 → 4 → 5 → 6 → 7 の順にすべて実行します（Supabase CLI の `npx supabase db push` はファイル名の順に実行します）。
>
> **すでに一部を適用している場合**：まだ実行していない番号のファイルだけを、番号の順に追加で実行してください。
> 3 を実行する前でも記録の保存は動きます（アプリが romaji_style を外して保存し直します。お手本は残りません）。
> 7 を実行する前は、ログイン利用者は**桜ガーデン**を使えません（「アカウントの保存先が準備されていないため…」と表示されます。ゲストは使えます。ほかの記録には影響しません）。
> 6 を実行する前は、ログイン利用者の**新しい短縮コースのゲームの記録**だけが保存できません（標準コースは保存できます）。
> 5 を実行する前は、ログイン利用者の**ゲームの記録**だけが保存できません（「クラウドに保存できていません」と表示されます）。
> 4 を実行する前は、ログイン利用者の**検定モードの記録**だけが保存できません（「保存できませんでした」と表示されます。タイピングの記録には影響しません）。
>
> **v1.0.1 以前から使っている場合**：アプリを v1.0.2 以降に更新する前に、2 と 3 を追加で実行してください。
> これまでの記録はすべて「時間で練習」の記録として、そのまま使えます。
> 2 を実行する前でも、時間で練習した記録の保存・表示は動きますが、「問題数で練習」の記録と「ローマ字のお手本」の設定は保存できません（保存失敗と表示されます）。

- **ダッシュボードで**：左の「SQL Editor」→ 新しいクエリにファイルの中身をすべて貼り付けて「Run」。
- **Supabase CLI で**：`npx supabase login` → `npx supabase link --project-ref （プロジェクトの ID）` → `npx supabase db push`

実行後、「Table Editor」に `profiles` `classes` `practice_results` などの表ができ、すべての表で RLS が有効（Enabled）になっていることを確かめます。

## 手順3　認証の安全設定

「Authentication」の設定で、次のようにします（`supabase/config.toml` にも同じ内容を書いてあります）。

| 設定 | 値 | 理由 |
|---|---|---|
| 新規登録（Allow new users to sign up） | **オフ** | 生徒が自由に登録できないように。教員が発行します |
| Email の確認（Confirm email） | オフでよい | 生徒は実在のメールアドレスを使いません（管理処理が確認済みとして作成します） |
| 匿名ログイン（Anonymous sign-ins） | **オフ** | ゲストはログインなしで動くため不要 |
| パスワードの最小文字数 | 8 以上（推奨 10） | |
| パスワードの条件 | 英字と数字を含む | |
| 多要素認証（MFA）の TOTP | **有効** | 先生の二段階認証に使います（先生用の画面と管理処理は、二段階認証を済ませないと使えません） |
| アクセストークンの有効期間（JWT expiry） | 900 秒（15分）程度 | ログアウト後に古いトークンが使える時間を短くするため |
| Refresh token rotation | 有効 | |
| ログインの試行回数の上限（Rate limits → Sign-ins） | クラスの人数に合わせて増やす（例：5分で200） | 学校では教室の全員が同じ IP アドレスになることが多いため |
| URL Configuration の Site URL | アプリを公開する URL | |

### ログイン失敗の連続試行の制限（アカウント単位）

`public.hook_password_verification_attempt` という関数を用意しています（同じアカウントで15分以内に5回失敗すると、15分間ログインできなくなります）。

- 「Authentication」→「Hooks」→「Password Verification Attempt」で、Postgres 関数 `public.hook_password_verification_attempt` を選んで有効にします。
- **このフックは、Supabase のプランによっては使えない場合があります。** 使えないときは、IP アドレス単位の試行制限（上の Rate limits）だけが働きます。その場合は、生徒のパスワードを推測されにくいもの（「自動で作る」）にしてください。

### 自動ログアウト

- アプリは、15分間操作がないと自動でログアウトし、使用中のセッションを終了します（ブラウザでの処理）。
- ログイン状態はブラウザ（localStorage など）に保存しません。再読み込みやタブを閉じるとログアウトします。
- Supabase の有料プランには、サーバー側でセッションの最大時間・無操作時間を決める設定（Sessions → Time-box / Inactivity timeout）があります。使える場合は、無操作 15 分などに設定すると、より確実です。

## 手順4　管理用の Edge Function を登録する

Supabase CLI を使います（Node.js が入っていれば `npx supabase` で使えます）。

```
npx supabase login
npx supabase link --project-ref （プロジェクトの ID）
npx supabase secrets set ALLOWED_ORIGINS=https://（アプリを公開するオリジン） LOGIN_EMAIL_DOMAIN=
npx supabase functions deploy teacher-admin
```

- `ALLOWED_ORIGINS` は、アプリの画面を置く場所のオリジン（`https://example.ed.jp` のように、パスを含まない部分）です。複数あるときはカンマで区切ります。
- `SUPABASE_URL`・`SUPABASE_ANON_KEY`・`SUPABASE_SERVICE_ROLE_KEY` は Supabase が自動で用意するため、登録は不要です。
  （新しい形式の鍵だけのプロジェクトで `SUPABASE_SERVICE_ROLE_KEY` が無い場合は、secret キーを `SAKURA_SERVICE_ROLE_KEY` という名前で `secrets set` してください）
- JWT の検証（verify_jwt）は有効のままにします。

## 手順5　画面（フロントエンド）に接続先を設定する

1. `.env.example` をコピーして `.env.local` を作り、次の2つを書きます（Project Settings → API）。
   - `VITE_SUPABASE_URL`：プロジェクトの URL（`https://` で始まる）
   - `VITE_SUPABASE_ANON_KEY`：公開用の anon（publishable）キー
   - **service_role / secret キーは書かないでください。**
2. `npm run build` でビルドし、`dist` の中身を Web サーバーに置きます（HTTPS）。
3. 入口の「ログインして練習」が押せるようになれば接続されています。

GitHub Actions などで自動ビルドするときは、上の2つをリポジトリの「Secrets and variables」に登録し、ビルドのときだけ環境変数として渡します。

## 手順6　最初の教員アカウントを作る

README の「4. 最初の教員アカウントを作る」の手順で、`npm run create-teacher` を実行します。

## 手順7　動作確認

1. 先生の ID でログイン → 二段階認証を登録 → 先生用の画面が開く。
2. クラスを作り、テスト用の生徒アカウントを発行する。
3. 別のブラウザ（またはシークレットウィンドウ）で生徒としてログインし、3分の標準問題を練習 → 結果画面で「✓ 記録を保存しました」と出る。
4. 先生の画面で、その生徒の記録と成長グラフが見える。
5. [manual-checks.md](manual-checks.md) の「本物の Supabase での権限の確認」を行う。

## 運用上の注意

- 年度の終わりには、使わなくなったアカウントを削除するか停止してください（削除すると練習の記録も消えます）。
- Supabase のダッシュボードにログインできる人（管理者）は、すべてのデータを見られます。管理者のアカウントにも二段階認証を設定してください。
- バックアップや保存期間は、学校の規程に合わせて Supabase の設定で決めてください。

## 練習の記録（v1.0.3）について

- ゲストの記録は、使っている端末・ブラウザの localStorage（キー `sakura-type:guest-history`）に最新100回分を保存します。Supabase の設定は不要で、クラウドには送りません。
- ログイン利用者の記録は、これまでどおり `practice_results` に保存します。「練習の記録」画面は新しい順に100件を取得して表示します。**クラウドの古い記録は自動では削除しません**（先生の画面の記録や学習データを守るため）。
- 問題ごとのミス詳細は保存しません（結果画面でその場だけ表示します）。

## 検定モード（v1.1.0）について

- ログイン利用者の検定モードの記録は `exam_results` に保存します（手順2の 4 を適用してください）。タイピングの記録（`practice_results`）とは別の表で、ランクには使いません。入力した文章・正解文は保存しません。
- 先生が追加した検定問題（画像・PDF・正解文）は、各端末のブラウザ（IndexedDB）に保存します。**Supabase には保存しません**（Storage のバケットなどの設定も不要です）。ほかの端末へは教材パックのファイルで配布します。
- Supabase を設定すると、先生の追加問題の管理画面は先生のアカウントでログインしたときだけ表示されます（画面の表示の制御です。くわしくは [exam.md](exam.md)）。
- PDF の表示に使うファイル（`dist/pdfjs/` の CMap・フォント・wasm）は、アプリと同じ場所に置かれます。Web サーバーで `.mjs` を JavaScript、`.wasm` を `application/wasm` として配信してください（GitHub Pages はそのまま対応しています）。

## ゲームモード（v1.2.0）について

- ログイン利用者のゲームの記録は `game_results` に保存します（手順2の 5 を適用してください）。タイピング・検定モードの記録とは別の表で、ランクには使いません。入力した文章・打鍵の記録は保存しません。
- 適用後の確認：Table Editor に `game_results` があり RLS が有効（Enabled）になっていること、Database → Functions に `game_bests` があること。
- ゲストのゲームの記録は、各端末のブラウザ（localStorage）にだけ保存します。Supabase の設定は不要です。
- 物語を増やす・読みの文字数が変わる場合は、新しい物語の版（storySetVersion）として `private.game_stories` に行を追加する新しいマイグレーションを作ってください（既存の行・マイグレーションは書き換えません）。

## 桜ガーデン（v1.4.0）について

- ログイン利用者の桜ガーデンの記録は `garden_events` に保存します（手順2の 7 を適用してください）。本人だけが追加・閲覧でき、変更・削除はできません（先生からも見えません）。入力した文章・打鍵の記録は保存しません。
- 適用後の確認：Table Editor に `garden_events` があり RLS が有効（Enabled）になっていること。
- ゲストの庭は、各端末のブラウザ（localStorage）にだけ保存します。Supabase の設定は不要です。
- 記録は出来事ごとの ID で保存するため、通信の再送や別の端末からの保存でも二重になりません。送れなかった変更は画面に「アカウントに保存できていない変更があります。」と表示し、「もう一度保存する」で送り直せます（ログイン状態と同じく、端末には残しません）。
