-- =====================================================================
-- 桜打 — SAKURA TYPE v1.2.0  ゲームモードの記録
--
--  * ゲーム「サクラダファミリアを完成させよ」の記録を、タイピングの記録（practice_results）・
--    検定モードの記録（exam_results）とは別の表に保存します。ランク・成長グラフには使いません。
--  * 保存するのは集計した値だけです（入力した文章・打鍵の記録は保存しません）。
--  * ミス加算・記録タイム・完成年・正確率は、ルールの版（sakurada-rule-v1）に従ってデータベース側で計算し直します。
--  * 本人だけが追加・閲覧できます。先生は担当する生徒の記録だけを閲覧できます（practice_results と同じ規則：
--    private.is_active_user()・private.can_manage_student()。先生は二段階認証が必要）。変更・削除はできません。
-- =====================================================================

-- 物語ごとの読みの文字数（記録の completed / total の整合性を確かめるため）
create table private.game_stories (
  story_set_version text not null,
  story_id text not null,
  course_id text not null check (course_id in ('standard', 'short')),
  total_reading_characters integer not null check (total_reading_characters > 0),
  primary key (story_set_version, story_id)
);
insert into private.game_stories (story_set_version, story_id, course_id, total_reading_characters) values
  ('sakurada-stories-v1', 'inherited-dream', 'standard', 967),
  ('sakurada-stories-v1', 'gaudi-and-nature', 'standard', 978),
  ('sakurada-stories-v1', 'visit-barcelona', 'standard', 951),
  ('sakurada-stories-v1', 'inherited-dream-intro', 'short', 28),
  ('sakurada-stories-v1', 'gaudi-and-nature-intro', 'short', 28),
  ('sakurada-stories-v1', 'visit-barcelona-intro', 'short', 30);

create table public.game_results (
  -- プレイを始めるときに端末で1回だけ作る ID。再送しても同じ記録が二重に登録されません
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  game_id text not null check (game_id in ('sakurada-familia')),
  rule_version text not null check (rule_version in ('sakurada-rule-v1')),
  story_set_version text not null,
  story_id text not null,
  course_id text not null check (course_id in ('standard', 'short')),
  input_method text not null check (input_method in ('keyboard', 'touch')),
  romaji_style text not null check (romaji_style in ('hepburn', 'kunrei')),
  started_at timestamptz not null,
  finished_at timestamptz not null,
  saved_at timestamptz not null default now(),
  elapsed_ms integer not null check (elapsed_ms between 0 and 86400000),
  miss_count integer not null check (miss_count between 0 and 1000000),
  correct_keystrokes integer not null check (correct_keystrokes between 0 and 1000000),
  completed_reading_characters integer not null check (completed_reading_characters >= 0),
  total_reading_characters integer not null check (total_reading_characters > 0),
  pause_count integer not null default 0 check (pause_count between 0 and 10000),
  finished boolean not null,
  -- 以下はサーバー側（トリガー）で計算し直します
  penalty_ms bigint,
  record_time_ms bigint,
  completion_year integer,
  accuracy numeric(7, 4),
  constraint game_story_known foreign key (story_set_version, story_id) references private.game_stories (story_set_version, story_id),
  constraint finished_after_start check (finished_at >= started_at),
  constraint reading_within_total check (completed_reading_characters <= total_reading_characters),
  constraint finished_means_complete check (not finished or completed_reading_characters = total_reading_characters),
  -- ありえない速さの記録は受け付けません（1分あたり 1500 正解打鍵まで）
  constraint plausible_speed check (correct_keystrokes::bigint * 60000 <= 1500::bigint * greatest(elapsed_ms, 1))
);
create index game_results_user_idx on public.game_results (user_id, started_at desc);
create index game_results_best_idx on public.game_results (user_id, course_id, story_id, record_time_ms) where finished;

create or replace function private.game_results_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  st private.game_stories;
begin
  if new.started_at > now() + interval '5 minutes' or new.finished_at > now() + interval '5 minutes' then
    raise exception 'プレイの日時が正しくありません';
  end if;
  select * into st from private.game_stories g where g.story_set_version = new.story_set_version and g.story_id = new.story_id;
  if st.story_id is null or st.course_id <> new.course_id or st.total_reading_characters <> new.total_reading_characters then
    raise exception '物語・コース・読みの文字数が一致しません';
  end if;
  new.saved_at := now();
  -- ルール sakurada-rule-v1：ミス1回 5 秒、記録タイム＝入力時間＋ミス加算、完成年＝1882＋floor(記録タイム ÷ 2 秒)
  new.penalty_ms := new.miss_count::bigint * 5000;
  new.record_time_ms := new.elapsed_ms::bigint + new.penalty_ms;
  new.completion_year := 1882 + floor(new.record_time_ms / 2000.0)::integer;
  new.accuracy := case when new.correct_keystrokes + new.miss_count = 0 then null
                       else round(new.correct_keystrokes * 100.0 / (new.correct_keystrokes + new.miss_count), 4) end;
  return new;
end;
$$;

create trigger game_results_before_insert
  before insert on public.game_results
  for each row execute function private.game_results_before_insert();

revoke all on function private.game_results_before_insert() from public;
revoke all on private.game_stories from public;
grant select on private.game_stories to authenticated;

alter table public.game_results enable row level security;
revoke all on public.game_results from anon;
revoke all on public.game_results from authenticated;
grant select, insert on public.game_results to authenticated;

create policy game_results_insert_own on public.game_results for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy game_results_select_own on public.game_results for select to authenticated
  using (user_id = auth.uid());
create policy game_results_select_managed on public.game_results for select to authenticated
  using (private.can_manage_student(user_id));

-- 自己ベスト：条件（コース・物語・ルールの版・物語の版・入力のしかた・一時停止の有無）ごとに最も良い完成記録。
-- 古い記録も含めて求めます。security invoker のため、呼び出した人が見られる行（RLS）だけが対象です。
create or replace function public.game_bests(p_user uuid)
returns setof public.game_results
language sql
stable
security invoker
set search_path = ''
as $$
  select distinct on (r.game_id, r.rule_version, r.story_set_version, r.course_id, r.story_id, r.input_method, (r.pause_count > 0)) r.*
  from public.game_results r
  where r.user_id = p_user and r.finished
  order by r.game_id, r.rule_version, r.story_set_version, r.course_id, r.story_id, r.input_method, (r.pause_count > 0), r.record_time_ms, r.started_at
$$;
revoke all on function public.game_bests(uuid) from public, anon;
grant execute on function public.game_bests(uuid) to authenticated;
