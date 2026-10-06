-- =====================================================================
-- 桜打 — SAKURA TYPE v1.0.3  練習の記録と成長グラフ
--
-- ログイン利用者の練習記録に「ローマ字のお手本」（ヘボン式・訓令式）を残します。
-- 判定や比較の条件は変わりません（記録として残すだけです）。
-- 古い記録は自動では削除しません。アプリの「練習の記録」は新しい順に 100 件を取得して表示します。
--
-- 実行順：
--   1. 20261005000000_init.sql
--   2. 20261006000000_count_mode_and_romaji_style.sql（v1.0.2）
--   3. この 20261007000000_history_romaji_style.sql（v1.0.3）
-- 3 を適用する前でも、アプリは romaji_style を外して保存し直すため、記録の保存は動きます（お手本は残りません）。
-- =====================================================================

alter table public.practice_results
  add column if not exists romaji_style text;

alter table public.practice_results
  drop constraint if exists practice_results_romaji_style_check;
alter table public.practice_results
  add constraint practice_results_romaji_style_check check (
    romaji_style is null or (kind = 'romaji' and romaji_style in ('hepburn', 'kunrei'))
  );

-- 「練習の記録」は本人の新しい記録から 100 件を読むため、既存の (user_id, started_at desc) の索引を使います（追加の索引は不要）
