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

いずれかの方法で `supabase/migrations/20261005000000_init.sql` を実行します。

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
