-- =====================================================================
-- 桜打 — SAKURA TYPE v1.4.0  ゲーム「桜ガーデン」の記録
--
--  * 桜ガーデンの記録は「出来事（イベント）」の一覧として保存します（問題の完成・水やり・交換・配置など）。
--    状態（水・花びら・桜・飾り・庭）はアプリが出来事をたどって計算します。
--  * 出来事には端末で作る ID があり、同じ ID は一度しか登録されません（主キー）。
--    再送・別の端末からの同期でも、ごほうびや苗・飾りが二重になりません。
--  * 本人だけが追加・閲覧できます。変更・削除はできません（先生・他の生徒からは見えません）。
--  * 入力した文章・打鍵の記録は保存しません。
-- =====================================================================

create table public.garden_events (
  user_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  event_id text not null check (char_length(event_id) between 1 and 120),
  event_type text not null check (event_type in (
    'session', 'solve', 'end', 'first', 'buy_tree', 'buy_deco', 'water',
    'plant', 'unplant', 'place', 'move', 'stow', 'rename', 'count', 'seen'
  )),
  -- 端末の時刻（ミリ秒）。出来事をたどる順番に使います
  event_at bigint not null check (event_at > 0),
  payload jsonb not null check (jsonb_typeof(payload) = 'object' and octet_length(payload::text) <= 4096),
  saved_at timestamptz not null default now(),
  primary key (user_id, event_id)
);
create index garden_events_user_idx on public.garden_events (user_id, event_at);

create or replace function private.garden_events_before_insert()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- 未来の時刻の出来事は受け付けません（端末の時計のずれは10分まで）
  if new.event_at > (extract(epoch from now()) * 1000)::bigint + 600000 then
    raise exception '出来事の日時が正しくありません';
  end if;
  new.saved_at := now();
  return new;
end;
$$;

create trigger garden_events_before_insert
  before insert on public.garden_events
  for each row execute function private.garden_events_before_insert();

revoke all on function private.garden_events_before_insert() from public;

alter table public.garden_events enable row level security;
revoke all on public.garden_events from anon;
revoke all on public.garden_events from authenticated;
grant select, insert on public.garden_events to authenticated;

create policy garden_events_insert_own on public.garden_events for insert to authenticated
  with check (user_id = auth.uid() and private.is_active_user());
create policy garden_events_select_own on public.garden_events for select to authenticated
  using (user_id = auth.uid());
