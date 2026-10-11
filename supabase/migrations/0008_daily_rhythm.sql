-- Daily Rhythm: a habit / everyday-activity tracker inside the Daily section.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-11.
-- Activity definitions (habits) are kept apart from the per-day records (habit_logs), so a routine can change
-- over time without rewriting its history. Only explicit actions are stored: an activity that was scheduled on a
-- past day and has no record counts as missed; today's counts as pending; future days never count.
-- Analytics (rates, streaks, comparisons) are always computed from these rows, never stored.

create table if not exists public.habits (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  category text not null default 'General',
  icon text,
  color text,
  -- daily: every day · days: on the weekdays in `days` (0 = Sunday … 6 = Saturday) · interval: every `interval_days` days from start_date
  frequency text not null default 'daily' check (frequency in ('daily', 'days', 'interval')),
  days smallint[] not null default '{}',
  interval_days integer check (interval_days is null or interval_days between 1 and 365),
  -- Earlier schedules, so changing an activity's days doesn't rewrite its past:
  -- [{ "from"?: date, "until": date (exclusive), "frequency": "daily"|"days"|"interval"|"off", "days"?: [...], "interval_days"?: n, "anchor"?: date }]
  schedule_history jsonb not null default '[]'::jsonb,
  -- Optional measurable target for later (minutes, pages…); checking an activity off does not need it.
  target_value numeric,
  target_unit text,
  start_date date not null default current_date,
  end_date date,
  reminder_time text,
  sort_order integer not null default 0,
  -- Archived activities stop getting new days from archived_on; their history stays.
  archived boolean not null default false,
  archived_on date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.habit_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  habit_id uuid not null references public.habits (id) on delete cascade,
  date date not null,
  status text not null check (status in ('pending', 'completed', 'missed', 'skipped')),
  actual_value numeric,
  notes text,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (habit_id, date)
);

create index if not exists habits_user_idx on public.habits (user_id);
create index if not exists habit_logs_user_date_idx on public.habit_logs (user_id, date);

alter table public.habits enable row level security;
alter table public.habit_logs enable row level security;

create policy habits_select_own on public.habits for select to authenticated using ((select auth.uid()) = user_id);
create policy habits_insert_own on public.habits for insert to authenticated with check ((select auth.uid()) = user_id);
create policy habits_update_own on public.habits for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy habits_delete_own on public.habits for delete to authenticated using ((select auth.uid()) = user_id);

create policy habit_logs_select_own on public.habit_logs for select to authenticated using ((select auth.uid()) = user_id);
-- A record can only point at one of your own activities.
create policy habit_logs_insert_own on public.habit_logs for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())));
create policy habit_logs_update_own on public.habit_logs for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id and exists (select 1 from public.habits h where h.id = habit_id and h.user_id = (select auth.uid())));
create policy habit_logs_delete_own on public.habit_logs for delete to authenticated using ((select auth.uid()) = user_id);

create trigger habits_updated_at before update on public.habits
  for each row execute function public.set_updated_at();
create trigger habit_logs_updated_at before update on public.habit_logs
  for each row execute function public.set_updated_at();
