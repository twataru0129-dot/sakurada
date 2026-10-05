-- =====================================================================
-- 桜打 — SAKURA TYPE v1.0.0  初期スキーマ
--
-- 方針
--  * すべての表で行レベルセキュリティ（RLS）を有効にし、
--    「本人の記録だけ」「教員は担当クラスの生徒だけ」をデータベース側で検証します。
--  * 教員のデータ参照・管理には二段階認証済み（JWT の aal = aal2）を必須にします。
--  * 生徒のアカウント作成・停止・削除・パスワード再設定は、Edge Function（teacher-admin）
--    だけがサービスロールで行います。フロントエンドからは profiles を直接書き換えられません。
--  * 生徒が入力した文章全文やキー操作の履歴は保存しません（集計結果だけ）。
-- =====================================================================

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 利用者（アカウント）
-- ---------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  -- ログインID（英小文字と数字。最初は英字）。メールアドレスは使いません
  login_id text not null unique
    check (login_id ~ '^[a-z][a-z0-9]{3,19}$'),
  -- 表示名（ハンドルネーム）。本名は入力しないよう画面で案内します
  display_name text not null
    check (char_length(display_name) between 1 and 20
           and display_name = btrim(display_name)
           and display_name !~ '[[:cntrl:]<>]'),
  role text not null check (role in ('student', 'teacher')),
  status text not null default 'active' check (status in ('active', 'suspended')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- クラスと担当（複数の教員が同じクラスを担当できます）
-- ---------------------------------------------------------------------
create table public.classes (
  id uuid primary key default gen_random_uuid(),
  name text not null
    check (char_length(name) between 1 and 40 and name = btrim(name) and name !~ '[[:cntrl:]<>]'),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.class_teachers (
  class_id uuid not null references public.classes (id) on delete cascade,
  teacher_id uuid not null references public.profiles (id) on delete cascade,
  added_by uuid references public.profiles (id) on delete set null,
  added_at timestamptz not null default now(),
  primary key (class_id, teacher_id)
);
create index class_teachers_teacher_idx on public.class_teachers (teacher_id);

create table public.class_students (
  class_id uuid not null references public.classes (id) on delete cascade,
  student_id uuid not null references public.profiles (id) on delete cascade,
  added_at timestamptz not null default now(),
  primary key (class_id, student_id)
);
create index class_students_student_idx on public.class_students (student_id);

-- ---------------------------------------------------------------------
-- 学習設定
-- ---------------------------------------------------------------------
create or replace function private.valid_settings(s jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select jsonb_typeof(s) = 'object'
    and not exists (
      select 1 from jsonb_object_keys(s) k
      where k not in ('romajiGuide', 'keyboardGuide', 'fingerGuide', 'sound', 'minutes', 'difficulty')
    )
    and (not s ? 'romajiGuide' or jsonb_typeof(s -> 'romajiGuide') = 'boolean')
    and (not s ? 'keyboardGuide' or jsonb_typeof(s -> 'keyboardGuide') = 'boolean')
    and (not s ? 'fingerGuide' or jsonb_typeof(s -> 'fingerGuide') = 'boolean')
    and (not s ? 'sound' or jsonb_typeof(s -> 'sound') = 'boolean')
    and (not s ? 'minutes' or (s ->> 'minutes') in ('3', '5', '10'))
    and (not s ? 'difficulty' or (s ->> 'difficulty') in ('mixed', '1', '2', '3'))
$$;

-- 本人が変更した設定（端末をまたいで引き継ぎます）
create table public.user_settings (
  user_id uuid primary key references public.profiles (id) on delete cascade default auth.uid(),
  settings jsonb not null check (private.valid_settings(settings)),
  updated_at timestamptz not null default now()
);

-- 教員が指定する生徒ごとの初期設定
create table public.student_defaults (
  student_id uuid primary key references public.profiles (id) on delete cascade,
  settings jsonb not null check (private.valid_settings(settings)),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------
-- 練習結果（集計値のみ）
-- ---------------------------------------------------------------------
create table public.practice_results (
  -- 端末で作った ID。再送しても同じ結果が二重に登録されません
  id uuid primary key,
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  started_at timestamptz not null,
  saved_at timestamptz not null default now(),
  kind text not null check (kind in ('romaji', 'sentence')),
  set_type text not null check (set_type in ('standard', 'general', 'sakura', 'teacher')),
  theme text not null check (theme ~ '^[a-z0-9_-]{1,64}$'),
  difficulty text not null check (difficulty in ('mixed', '1', '2', '3')),
  question_set_version text not null check (question_set_version ~ '^[a-z0-9._-]{1,32}$'),
  rank_version text not null check (rank_version in ('rank-v1')),
  minutes smallint not null check (minutes in (3, 5, 10)),
  elapsed_ms integer not null check (elapsed_ms >= 0),
  finished boolean not null,
  input_method text not null check (input_method in ('keyboard', 'touch')),
  correct_count integer not null check (correct_count between 0 and 100000),
  miss_count integer not null check (miss_count between 0 and 100000),
  completed_questions integer not null check (completed_questions between 0 and 10000),
  -- 以下はサーバー側（トリガー）で計算し直します
  accuracy numeric(7, 4),
  speed numeric(9, 3) not null default 0,
  rank text not null default '未判定',
  official boolean not null default false,
  constraint elapsed_within_minutes check (elapsed_ms <= minutes * 60000),
  constraint finished_means_full_time check (not finished or elapsed_ms = minutes * 60000),
  constraint plausible_speed check (
    (kind = 'romaji' and correct_count::bigint * 60000 <= 1500::bigint * greatest(elapsed_ms, 1))
    or (kind = 'sentence' and correct_count::bigint * 60000 <= 400::bigint * greatest(elapsed_ms, 1))
  )
);
create index practice_results_user_idx on public.practice_results (user_id, started_at desc);

-- ランク判定（アプリと同じ基準 rank-v1。丸める前の値＝整数の掛け算で判定）
create table private.rank_table (
  version text not null,
  ord smallint not null,
  name text not null,
  romaji integer not null,
  sentence integer not null,
  accuracy_x10 integer not null,
  primary key (version, ord)
);
insert into private.rank_table (version, ord, name, romaji, sentence, accuracy_x10) values
  ('rank-v1', 1, 'S＋', 900, 200, 990), ('rank-v1', 2, 'S', 800, 180, 985), ('rank-v1', 3, 'S−', 700, 160, 980),
  ('rank-v1', 4, 'A＋', 600, 140, 975), ('rank-v1', 5, 'A', 550, 120, 970), ('rank-v1', 6, 'A−', 500, 100, 965),
  ('rank-v1', 7, 'B＋', 450, 90, 960), ('rank-v1', 8, 'B', 400, 80, 955), ('rank-v1', 9, 'B−', 350, 70, 950),
  ('rank-v1', 10, 'C＋', 300, 60, 940), ('rank-v1', 11, 'C', 260, 50, 930), ('rank-v1', 12, 'C−', 220, 45, 920),
  ('rank-v1', 13, 'D＋', 180, 40, 910), ('rank-v1', 14, 'D', 150, 35, 900), ('rank-v1', 15, 'D−', 120, 30, 890),
  ('rank-v1', 16, 'E＋', 100, 25, 880), ('rank-v1', 17, 'E', 80, 20, 870), ('rank-v1', 18, 'E−', 60, 15, 850),
  ('rank-v1', 19, 'F＋', 45, 10, 830), ('rank-v1', 20, 'F', 30, 8, 800), ('rank-v1', 21, 'F−', 20, 6, 750),
  ('rank-v1', 22, 'G＋', 10, 4, 700), ('rank-v1', 23, 'G', 5, 2, 600);

create or replace function private.judge_rank(p_version text, p_kind text, p_correct integer, p_miss integer, p_elapsed_ms integer)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when p_correct + p_miss = 0 or p_elapsed_ms <= 0 then '未判定'
    else coalesce((
      select r.name from private.rank_table r
      where r.version = p_version
        and p_correct::bigint * 60000 >= (case when p_kind = 'romaji' then r.romaji else r.sentence end)::bigint * p_elapsed_ms
        and p_correct::bigint * 1000 >= r.accuracy_x10::bigint * (p_correct + p_miss)
      order by r.ord
      limit 1
    ), 'G−')
  end
$$;

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
  new.official := new.set_type = 'standard' and new.finished;
  return new;
end;
$$;

create trigger practice_results_before_insert
  before insert on public.practice_results
  for each row execute function private.practice_results_before_insert();

-- ---------------------------------------------------------------------
-- 先生の追加教材
-- ---------------------------------------------------------------------
create table public.materials (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  kind text not null check (kind in ('romaji', 'sentence')),
  text text not null,
  reading text not null default '',
  theme text not null check (char_length(theme) between 1 and 30 and theme !~ '[[:cntrl:]<>]'),
  difficulty smallint not null check (difficulty between 1 and 3),
  is_published boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint material_text_length check (char_length(text) between 1 and 300 and text = btrim(text)),
  -- 改行以外の制御文字と < > は使えません
  constraint material_text_chars check (text !~ '[\x01-\x09\x0b-\x1f\x7f<>]'),
  -- ローマ字の教材は読み（ひらがな）が必須。ローマ字で入力できる文字だけ
  constraint material_romaji check (
    kind <> 'romaji' or (
      reading ~ '^[ぁ-ゖー、。！？「」・〜0-9]+$'
      and char_length(reading) <= 40
      and char_length(text) <= 60
      and position(E'\n' in text) = 0
    )
  ),
  constraint material_sentence_reading check (
    kind <> 'sentence' or reading ~ '^[ぁ-ゖァ-ヺー0-9０-９、。！？「」『』（）・〜：　 \n]*$'
  )
);
create index materials_owner_idx on public.materials (owner_id);

create table public.material_classes (
  material_id uuid not null references public.materials (id) on delete cascade,
  class_id uuid not null references public.classes (id) on delete cascade,
  primary key (material_id, class_id)
);
create index material_classes_class_idx on public.material_classes (class_id);

-- ---------------------------------------------------------------------
-- 権限の判定（SECURITY DEFINER：RLS の連鎖を避け、判定を1か所にまとめます）
-- ---------------------------------------------------------------------
create or replace function private.is_active_user()
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles p where p.id = auth.uid() and p.status = 'active')
$$;

create or replace function private.has_aal2()
returns boolean language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() ->> 'aal', '') = 'aal2'
$$;

-- 有効な教員で、二段階認証を済ませているか
create or replace function private.teacher_ok()
returns boolean language sql stable security definer set search_path = '' as $$
  select private.has_aal2() and exists (
    select 1 from public.profiles p where p.id = auth.uid() and p.role = 'teacher' and p.status = 'active'
  )
$$;

create or replace function private.teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.teacher_ok() and exists (
    select 1 from public.class_teachers ct where ct.class_id = p_class and ct.teacher_id = auth.uid()
  )
$$;

-- 生徒を管理できるか：担当クラスに所属している生徒、または自分が発行してまだクラスに入っていない生徒
create or replace function private.can_manage_student(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.teacher_ok() and exists (
    select 1 from public.profiles s
    where s.id = p_student and s.role = 'student'
      and (
        exists (
          select 1 from public.class_students cs
          join public.class_teachers ct on ct.class_id = cs.class_id
          where cs.student_id = s.id and ct.teacher_id = auth.uid()
        )
        or (
          s.created_by = auth.uid()
          and not exists (select 1 from public.class_students cs2 where cs2.student_id = s.id)
        )
      )
  )
$$;

create or replace function private.is_member_of_class(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.is_active_user() and exists (
    select 1 from public.class_students cs where cs.class_id = p_class and cs.student_id = auth.uid()
  )
$$;

-- 同じクラスを担当している教員どうしか（共同担当者の表示名を見るため）
create or replace function private.shares_class_with(p_teacher uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.teacher_ok() and exists (
    select 1 from public.class_teachers a
    join public.class_teachers b on a.class_id = b.class_id
    where a.teacher_id = auth.uid() and b.teacher_id = p_teacher
  )
$$;

create or replace function private.can_see_material(p_material uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.materials m
    where m.id = p_material and (
      (private.teacher_ok() and (
        m.owner_id = auth.uid()
        or exists (
          select 1 from public.material_classes mc
          join public.class_teachers ct on ct.class_id = mc.class_id
          where mc.material_id = m.id and ct.teacher_id = auth.uid()
        )
      ))
      or (
        m.is_published and private.is_active_user() and exists (
          select 1 from public.material_classes mc
          join public.class_students cs on cs.class_id = mc.class_id
          where mc.material_id = m.id and cs.student_id = auth.uid()
        )
      )
    )
  )
$$;

create or replace function private.owns_material(p_material uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.teacher_ok() and exists (
    select 1 from public.materials m where m.id = p_material and m.owner_id = auth.uid()
  )
$$;

revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated, service_role;

-- ---------------------------------------------------------------------
-- 行レベルセキュリティ
-- ---------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.classes enable row level security;
alter table public.class_teachers enable row level security;
alter table public.class_students enable row level security;
alter table public.user_settings enable row level security;
alter table public.student_defaults enable row level security;
alter table public.practice_results enable row level security;
alter table public.materials enable row level security;
alter table public.material_classes enable row level security;

-- 未ログイン（anon）には何も見せません
revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

-- profiles：閲覧のみ（作成・変更は Edge Function か下の関数で）
grant select on public.profiles to authenticated;
create policy profiles_select_self on public.profiles for select to authenticated
  using (id = auth.uid());
create policy profiles_select_managed on public.profiles for select to authenticated
  using (private.can_manage_student(id));
create policy profiles_select_coteacher on public.profiles for select to authenticated
  using (role = 'teacher' and private.shares_class_with(id));

-- classes
grant select, delete on public.classes to authenticated;
grant update (name) on public.classes to authenticated;
create policy classes_select on public.classes for select to authenticated
  using (private.teaches_class(id) or private.is_member_of_class(id));
create policy classes_update on public.classes for update to authenticated
  using (private.teaches_class(id)) with check (private.teaches_class(id));
create policy classes_delete on public.classes for delete to authenticated
  using (private.teaches_class(id));

-- class_teachers / class_students：閲覧のみ（変更は下の関数で）
grant select on public.class_teachers to authenticated;
create policy class_teachers_select on public.class_teachers for select to authenticated
  using (private.teaches_class(class_id));

grant select on public.class_students to authenticated;
create policy class_students_select on public.class_students for select to authenticated
  using (private.teaches_class(class_id) or (student_id = auth.uid() and private.is_active_user()));

-- user_settings：本人だけが読み書き。教員は担当生徒の設定を閲覧・初期化（削除）できる
grant select, insert, delete on public.user_settings to authenticated;
grant update (settings, updated_at) on public.user_settings to authenticated;
create policy user_settings_select on public.user_settings for select to authenticated
  using (user_id = auth.uid() or private.can_manage_student(user_id));
create policy user_settings_insert on public.user_settings for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy user_settings_update on public.user_settings for update to authenticated
  using (user_id = auth.uid() and private.is_active_user())
  with check (user_id = auth.uid());
create policy user_settings_delete on public.user_settings for delete to authenticated
  using (private.can_manage_student(user_id));

-- student_defaults：担当の教員が設定、生徒本人は閲覧
grant select, insert, delete on public.student_defaults to authenticated;
grant update (settings, updated_by, updated_at) on public.student_defaults to authenticated;
create policy student_defaults_select on public.student_defaults for select to authenticated
  using (student_id = auth.uid() or private.can_manage_student(student_id));
create policy student_defaults_insert on public.student_defaults for insert to authenticated
  with check (private.can_manage_student(student_id) and updated_by = auth.uid());
create policy student_defaults_update on public.student_defaults for update to authenticated
  using (private.can_manage_student(student_id))
  with check (private.can_manage_student(student_id) and updated_by = auth.uid());
create policy student_defaults_delete on public.student_defaults for delete to authenticated
  using (private.can_manage_student(student_id));

-- practice_results：本人が追加・閲覧。教員は担当生徒の記録を閲覧。変更・削除はできない
grant select, insert on public.practice_results to authenticated;
create policy results_insert_own on public.practice_results for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy results_select_own on public.practice_results for select to authenticated
  using (user_id = auth.uid());
create policy results_select_managed on public.practice_results for select to authenticated
  using (private.can_manage_student(user_id));

-- materials
grant select, insert, delete on public.materials to authenticated;
grant update (kind, text, reading, theme, difficulty, is_published, updated_at) on public.materials to authenticated;
create policy materials_select on public.materials for select to authenticated
  using ((owner_id = auth.uid() and private.teacher_ok()) or private.can_see_material(id));
create policy materials_insert on public.materials for insert to authenticated
  with check (private.teacher_ok() and owner_id = auth.uid());
create policy materials_update on public.materials for update to authenticated
  using (private.teacher_ok() and owner_id = auth.uid())
  with check (private.teacher_ok() and owner_id = auth.uid());
create policy materials_delete on public.materials for delete to authenticated
  using (private.teacher_ok() and owner_id = auth.uid());

grant select, insert, delete on public.material_classes to authenticated;
create policy material_classes_select on public.material_classes for select to authenticated
  using (private.owns_material(material_id) or private.teaches_class(class_id));
create policy material_classes_insert on public.material_classes for insert to authenticated
  with check (private.owns_material(material_id) and private.teaches_class(class_id));
create policy material_classes_delete on public.material_classes for delete to authenticated
  using (private.owns_material(material_id));

-- ---------------------------------------------------------------------
-- 教員用の操作（SECURITY DEFINER。中で必ず権限を確かめます）
-- ---------------------------------------------------------------------
create or replace function public.create_class(p_name text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  if not private.teacher_ok() then raise exception '権限がありません' using errcode = '42501'; end if;
  insert into public.classes (name, created_by) values (btrim(p_name), auth.uid()) returning id into v_id;
  insert into public.class_teachers (class_id, teacher_id, added_by) values (v_id, auth.uid(), auth.uid());
  return v_id;
end $$;

-- 共同担当の教員を、ログインIDを指定して明示的に追加します
create or replace function public.add_class_teacher(p_class uuid, p_login_id text)
returns void language plpgsql security definer set search_path = '' as $$
declare v_teacher uuid;
begin
  if not private.teaches_class(p_class) then raise exception '権限がありません' using errcode = '42501'; end if;
  select id into v_teacher from public.profiles
    where login_id = lower(btrim(p_login_id)) and role = 'teacher' and status = 'active';
  if v_teacher is null then raise exception 'その教員のIDは見つかりません'; end if;
  insert into public.class_teachers (class_id, teacher_id, added_by) values (p_class, v_teacher, auth.uid())
    on conflict do nothing;
end $$;

create or replace function public.remove_class_teacher(p_class uuid, p_teacher uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.teaches_class(p_class) then raise exception '権限がありません' using errcode = '42501'; end if;
  if (select count(*) from public.class_teachers where class_id = p_class) <= 1 then
    raise exception '担当の教員が1人のクラスからは外れられません';
  end if;
  delete from public.class_teachers where class_id = p_class and teacher_id = p_teacher;
end $$;

-- 生徒のクラス所属を設定します（担当しているクラスと、管理できる生徒の組み合わせだけ）
create or replace function public.set_student_class(p_student uuid, p_class uuid, p_member boolean)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not (private.teaches_class(p_class) and private.can_manage_student(p_student)) then
    raise exception '権限がありません' using errcode = '42501';
  end if;
  if p_member then
    insert into public.class_students (class_id, student_id) values (p_class, p_student) on conflict do nothing;
  else
    delete from public.class_students where class_id = p_class and student_id = p_student;
  end if;
end $$;

create or replace function public.update_student_display_name(p_student uuid, p_name text)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not private.can_manage_student(p_student) then raise exception '権限がありません' using errcode = '42501'; end if;
  update public.profiles set display_name = btrim(p_name), updated_at = now() where id = p_student;
end $$;

-- Edge Function が呼び出し元の権限を確かめるための関数（結果は真偽のみ）
create or replace function public.teacher_can_manage_student(p_student uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.can_manage_student(p_student)
$$;

create or replace function public.teacher_teaches_class(p_class uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select private.teaches_class(p_class)
$$;

-- 生徒一覧の集計（SECURITY INVOKER：RLS により担当の生徒だけが対象になります）
create or replace function public.teacher_student_summaries(p_class uuid default null)
returns table (
  student_id uuid,
  login_id text,
  display_name text,
  status text,
  practice_count bigint,
  last_practiced_at timestamptz,
  romaji_best_speed numeric,
  romaji_last_accuracy numeric,
  sentence_best_speed numeric,
  sentence_last_accuracy numeric
)
language sql stable security invoker set search_path = '' as $$
  select p.id, p.login_id, p.display_name, p.status,
    count(r.id),
    max(r.started_at),
    max(r.speed) filter (where r.kind = 'romaji' and r.official),
    (array_agg(r.accuracy order by r.started_at desc) filter (where r.kind = 'romaji' and r.accuracy is not null))[1],
    max(r.speed) filter (where r.kind = 'sentence' and r.official),
    (array_agg(r.accuracy order by r.started_at desc) filter (where r.kind = 'sentence' and r.accuracy is not null))[1]
  from public.profiles p
  left join public.practice_results r on r.user_id = p.id
  where p.role = 'student'
    and p.id <> auth.uid()
    and (p_class is null or exists (
      select 1 from public.class_students cs where cs.student_id = p.id and cs.class_id = p_class
    ))
  group by p.id
  order by p.login_id
$$;

revoke all on function public.create_class(text) from public, anon;
revoke all on function public.add_class_teacher(uuid, text) from public, anon;
revoke all on function public.remove_class_teacher(uuid, uuid) from public, anon;
revoke all on function public.set_student_class(uuid, uuid, boolean) from public, anon;
revoke all on function public.update_student_display_name(uuid, text) from public, anon;
revoke all on function public.teacher_can_manage_student(uuid) from public, anon;
revoke all on function public.teacher_teaches_class(uuid) from public, anon;
revoke all on function public.teacher_student_summaries(uuid) from public, anon;
grant execute on function public.create_class(text) to authenticated;
grant execute on function public.add_class_teacher(uuid, text) to authenticated;
grant execute on function public.remove_class_teacher(uuid, uuid) to authenticated;
grant execute on function public.set_student_class(uuid, uuid, boolean) to authenticated;
grant execute on function public.update_student_display_name(uuid, text) to authenticated;
grant execute on function public.teacher_can_manage_student(uuid) to authenticated;
grant execute on function public.teacher_teaches_class(uuid) to authenticated;
grant execute on function public.teacher_student_summaries(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- サービスロール（Edge Function）専用
-- ---------------------------------------------------------------------
create table private.login_failures (
  user_id uuid primary key,
  failed_count integer not null default 0,
  last_failed_at timestamptz not null default now()
);

-- 生徒のログイン中のセッションを終了させます（パスワード再設定・停止のとき）
create or replace function public.admin_revoke_sessions(p_user uuid)
returns void language plpgsql security definer set search_path = '' as $$
begin
  delete from auth.sessions where user_id = p_user;
  delete from private.login_failures where user_id = p_user;
end $$;
revoke all on function public.admin_revoke_sessions(uuid) from public, anon, authenticated;
grant execute on function public.admin_revoke_sessions(uuid) to service_role;

-- ---------------------------------------------------------------------
-- ログイン失敗の連続試行の制限（Supabase Auth の Password Verification Attempt フック）
-- 同じアカウントで15分以内に5回失敗すると、15分間ログインできなくなります。
-- 有効にするには、ダッシュボードの Authentication → Hooks でこの関数を指定します。
-- ---------------------------------------------------------------------
create or replace function public.hook_password_verification_attempt(event jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (event ->> 'user_id')::uuid;
  v_valid boolean := coalesce((event ->> 'valid')::boolean, false);
  v_count integer;
  v_last timestamptz;
begin
  select failed_count, last_failed_at into v_count, v_last from private.login_failures where user_id = v_user;
  if found and v_count >= 5 and v_last > now() - interval '15 minutes' then
    return jsonb_build_object(
      'decision', 'reject',
      'message', 'ログインの失敗が続いたため、しばらくログインできません。15分ほど待つか、先生に相談してください。',
      'should_logout_user', false
    );
  end if;
  if v_valid then
    delete from private.login_failures where user_id = v_user;
  else
    insert into private.login_failures (user_id, failed_count, last_failed_at) values (v_user, 1, now())
    on conflict (user_id) do update set
      failed_count = case when private.login_failures.last_failed_at < now() - interval '15 minutes' then 1
                          else private.login_failures.failed_count + 1 end,
      last_failed_at = now();
  end if;
  return jsonb_build_object('decision', 'continue');
end $$;
revoke all on function public.hook_password_verification_attempt(jsonb) from public, anon, authenticated;
do $$ begin
  if exists (select 1 from pg_roles where rolname = 'supabase_auth_admin') then
    grant execute on function public.hook_password_verification_attempt(jsonb) to supabase_auth_admin;
  end if;
end $$;
