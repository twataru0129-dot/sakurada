-- =====================================================================
-- 桜打 — SAKURA TYPE v2.0.0  文書作成モードの記録
--
--  * 文書作成モード（旧検定モードを変更したもの）の記録を、新しい表 document_results に保存します。
--    旧検定モードの記録（exam_results）は変更・削除せず、そのまま残します（読み替え・再計算もしません）。
--  * タイピング・ゲームの記録とは別の表で、ランクの計算には使いません。
--  * 保存するのは成績の数値と、問題の ID・タイトル・改訂番号だけです。
--    見本の文章・生徒が入力した本文は保存しません（本文はアプリの画面の中だけで扱います）。
--  * 本人だけが追加・閲覧できます。先生は担当する生徒の記録だけを閲覧できます（exam_results と同じ規則）。
--    変更・削除はできません。
--  * 既存のマイグレーションは変更しません（この表を追加するだけです）。
-- =====================================================================

create table public.document_results (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  finished_at timestamptz not null,
  saved_at timestamptz not null default now(),
  problem_id text not null check (problem_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  problem_title text not null
    check (char_length(problem_title) between 1 and 200 and problem_title !~ '[[:cntrl:]<>]'),
  problem_revision integer not null check (problem_revision between 1 and 1000000),
  problem_source text not null check (problem_source in ('builtin', 'teacher')),
  -- completed：完成、quit：途中で終了
  status text not null check (status in ('completed', 'quit')),
  -- 開始から完成（終了）までの時間。制限時間はありません（7日まで）
  elapsed_ms bigint not null check (elapsed_ms between 0 and 604800000),
  input_chars integer not null check (input_chars between 0 and 100000),
  paragraph_count integer not null check (paragraph_count between 1 and 10000),
  -- 最終確認での文章の誤り（合計と内訳）と、空白・改行の誤り
  text_errors integer not null check (text_errors between 0 and 200000),
  wrong_chars integer not null check (wrong_chars between 0 and 100000),
  extra_chars integer not null check (extra_chars between 0 and 100000),
  missing_chars integer not null check (missing_chars between 0 and 100000),
  space_errors integer not null check (space_errors between 0 and 100000),
  break_errors integer not null check (break_errors between 0 and 100000),
  rules_version text not null check (rules_version in ('doc-v1')),
  constraint text_errors_sum check (text_errors = wrong_chars + extra_chars + missing_chars),
  constraint finished_after_started check (finished_at >= started_at)
);
create index document_results_user_idx on public.document_results (user_id, started_at desc);

create or replace function private.document_results_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '5 minutes' or new.finished_at > now() + interval '5 minutes' then
    raise exception '実施日時が正しくありません';
  end if;
  new.saved_at := now();
  return new;
end;
$$;

create trigger document_results_before_insert
  before insert on public.document_results
  for each row execute function private.document_results_before_insert();

revoke all on function private.document_results_before_insert() from public;

alter table public.document_results enable row level security;
revoke all on public.document_results from anon;
revoke all on public.document_results from authenticated;
grant select, insert on public.document_results to authenticated;

create policy document_results_insert_own on public.document_results for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy document_results_select_own on public.document_results for select to authenticated
  using (user_id = auth.uid());
create policy document_results_select_managed on public.document_results for select to authenticated
  using (private.can_manage_student(user_id));
