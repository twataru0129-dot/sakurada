-- =====================================================================
-- 桜打 — SAKURA TYPE v1.1.0  検定モードの記録
--
--  * 検定モードの成績を、タイピングの記録（practice_results）とは別の表に保存します。
--    タイピングのランクの計算には使いません。
--  * 保存するのは成績の数値と、問題の ID・名前・改訂番号だけです。
--    問題の本文・正解文・生徒が入力した文章は保存しません。
--  * 問題（先生の追加問題を含む）は端末内にあり、データベースは正解文を持たないため、
--    ミス数・一致した文字数はアプリが計算した値を受け取ります。データベース側では、
--    値の範囲・組み合わせの整合性を確かめ、得点文字数と目安達成を同じ規則で計算し直します。
--  * 本人だけが追加・閲覧できます。先生は担当する生徒の記録だけを閲覧できます（practice_results と同じ規則）。
--    変更・削除はできません。
-- =====================================================================

create table public.exam_results (
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  saved_at timestamptz not null default now(),
  problem_id text not null check (problem_id ~ '^[A-Za-z0-9_-]{1,80}$'),
  problem_title text not null
    check (char_length(problem_title) between 1 and 200 and problem_title !~ '[[:cntrl:]<>]'),
  problem_revision integer not null check (problem_revision between 1 and 1000000),
  problem_source text not null check (problem_source in ('builtin', 'teacher')),
  grade text not null check (grade in ('4', '3', 'pre2', '2', 'pre1', '1')),
  -- 選んだ制限時間（秒）。null は時間制限なし
  time_limit_seconds integer check (time_limit_seconds in (180, 300, 600)),
  elapsed_ms integer not null check (elapsed_ms between 0 and 86400000),
  end_reason text not null check (end_reason in ('time_up', 'user_end')),
  full_text_completed boolean not null default false,
  scoring_enabled boolean not null,
  input_chars integer not null check (input_chars between 0 and 20000),
  matched_chars integer check (matched_chars between 0 and 20000),
  miss_count integer check (miss_count between 0 and 40000),
  penalty_per_error smallint not null,
  target_characters integer not null,
  scoring_version text not null check (scoring_version in ('exam-v1')),
  -- 以下はサーバー側（トリガー）で計算し直します
  score_chars integer,
  achieved boolean,
  -- 段階ごとの減点・目安文字数（アプリの GRADES と同じ）
  constraint grade_settings check (
    (grade = '4' and penalty_per_error = 1 and target_characters = 200)
    or (grade = '3' and penalty_per_error = 1 and target_characters = 300)
    or (grade = 'pre2' and penalty_per_error = 3 and target_characters = 400)
    or (grade = '2' and penalty_per_error = 3 and target_characters = 500)
    or (grade = 'pre1' and penalty_per_error = 5 and target_characters = 600)
    or (grade = '1' and penalty_per_error = 5 and target_characters = 700)
  ),
  constraint elapsed_within_limit check (time_limit_seconds is null or elapsed_ms <= time_limit_seconds * 1000),
  -- 時間切れの終了は、制限時間ちょうどまで計測したもの
  constraint time_up_means_full_time check (
    end_reason <> 'time_up' or (time_limit_seconds is not null and elapsed_ms = time_limit_seconds * 1000)
  ),
  -- 採点ありのときだけ、一致数・ミス数を持つ
  constraint scoring_fields check (
    (scoring_enabled and matched_chars is not null and miss_count is not null and matched_chars <= input_chars)
    or (not scoring_enabled and matched_chars is null and miss_count is null and not full_text_completed)
  ),
  -- ありえない速さの記録は受け付けません（1分あたり 400 文字まで）
  constraint plausible_speed check (input_chars::bigint * 60000 <= 400::bigint * greatest(elapsed_ms, 1))
);
create index exam_results_user_idx on public.exam_results (user_id, started_at desc);

create or replace function private.exam_results_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '5 minutes' then
    raise exception '練習日時が正しくありません';
  end if;
  new.saved_at := now();
  if new.scoring_enabled then
    new.score_chars := greatest(0, new.input_chars - new.miss_count * new.penalty_per_error);
    -- 目安達成：標準10分を最後まで計測したときだけ判定します（短縮・時間制限なし・途中終了は null）
    new.achieved := case
      when new.time_limit_seconds = 600 and new.end_reason = 'time_up' then new.score_chars >= new.target_characters
      else null
    end;
  else
    new.score_chars := null;
    new.achieved := null;
  end if;
  return new;
end;
$$;

create trigger exam_results_before_insert
  before insert on public.exam_results
  for each row execute function private.exam_results_before_insert();

revoke all on function private.exam_results_before_insert() from public;

alter table public.exam_results enable row level security;
revoke all on public.exam_results from anon;
revoke all on public.exam_results from authenticated;
grant select, insert on public.exam_results to authenticated;

create policy exam_results_insert_own on public.exam_results for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy exam_results_select_own on public.exam_results for select to authenticated
  using (user_id = auth.uid());
create policy exam_results_select_managed on public.exam_results for select to authenticated
  using (private.can_manage_student(user_id));
