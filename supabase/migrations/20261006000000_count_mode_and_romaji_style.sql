-- =====================================================================
-- 桜打 — SAKURA TYPE v1.0.2
--  1. 問題数で練習（25問・50問）の記録を保存できるようにします
--  2. 学習設定に「ローマ字のお手本」（romajiStyle：hepburn / kunrei）を追加します
--
-- これまでの記録はすべて「時間制」（end_mode = 'time'）として読み込まれ、内容は変わりません。
-- アプリ v1.0.2 を公開する前に、このマイグレーションを適用してください（docs/setup.md）。
-- 適用前でも、時間制の記録の保存・表示は従来どおり動きます。
-- =====================================================================

-- 終了条件：time（時間で練習）／ count（問題数で練習）
alter table public.practice_results
  add column if not exists end_mode text not null default 'time',
  add column if not exists target_count smallint;

alter table public.practice_results
  add constraint practice_results_end_mode_check check (end_mode in ('time', 'count'));

-- minutes は時間制のときだけ使います（問題数制では空）。問題数制を minutes = 3 などで代用しません
alter table public.practice_results alter column minutes drop not null;
alter table public.practice_results drop constraint if exists practice_results_minutes_check;
alter table public.practice_results drop constraint if exists elapsed_within_minutes;
alter table public.practice_results drop constraint if exists finished_means_full_time;

alter table public.practice_results
  add constraint end_condition_valid check (
    -- CHECK は NULL を合格として扱うため、空でないことも明示します
    (end_mode = 'time' and minutes is not null and minutes in (3, 5, 10) and target_count is null)
    or (end_mode = 'count' and minutes is null and target_count is not null and target_count in (25, 50))
  ),
  -- 時間制：練習時間を超えない／問題数制：4時間まで（それ以上は通常ありえない値として拒否）
  add constraint elapsed_within_limit check (
    (end_mode = 'time' and elapsed_ms <= minutes * 60000)
    or (end_mode = 'count' and elapsed_ms <= 4 * 60 * 60000)
  ),
  -- 完走：時間制は時間いっぱい、問題数制は目標の問題数をちょうど完成
  add constraint finished_means_goal check (
    not finished
    or (end_mode = 'time' and elapsed_ms = minutes * 60000)
    or (end_mode = 'count' and completed_questions = target_count)
  );

-- 正式ランクは、時間制の標準問題を時間いっぱいまで練習した記録だけ（問題数制は参考ランク）
create or replace function private.practice_results_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.started_at > now() + interval '5 minutes' then
    raise exception '練習日時が正しくありません';
  end if;
  new.saved_at := now();
  new.accuracy := case when new.correct_count + new.miss_count = 0 then null
                       else round(new.correct_count * 100.0 / (new.correct_count + new.miss_count), 4) end;
  new.speed := case when new.elapsed_ms = 0 then 0 else round(new.correct_count * 60000.0 / new.elapsed_ms, 3) end;
  new.rank := private.judge_rank(new.rank_version, new.kind, new.correct_count, new.miss_count, new.elapsed_ms);
  new.official := new.end_mode = 'time' and new.set_type = 'standard' and new.finished;
  return new;
end;
$$;

-- 学習設定に romajiStyle（ローマ字のお手本）を追加
create or replace function private.valid_settings(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(s) k
      where k not in ('romajiGuide', 'keyboardGuide', 'fingerGuide', 'sound', 'minutes', 'difficulty', 'romajiStyle')
    )
    and (not s ? 'romajiGuide' or jsonb_typeof(s -> 'romajiGuide') = 'boolean')
    and (not s ? 'keyboardGuide' or jsonb_typeof(s -> 'keyboardGuide') = 'boolean')
    and (not s ? 'fingerGuide' or jsonb_typeof(s -> 'fingerGuide') = 'boolean')
    and (not s ? 'sound' or jsonb_typeof(s -> 'sound') = 'boolean')
    and (not s ? 'minutes' or (s ->> 'minutes') in ('3', '5', '10'))
    and (not s ? 'difficulty' or (s ->> 'difficulty') in ('mixed', '1', '2', '3'))
    and (not s ? 'romajiStyle' or (s ->> 'romajiStyle') in ('hepburn', 'kunrei'))
$$;
