-- Nudge Chapters — push alarms that reach the phone even when the app is closed / screen locked.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09. Secrets are NOT in this file:
-- insert vapid_public, vapid_private, vapid_subject and cron_secret into public.app_secrets yourself
-- (generate VAPID keys with `npx web-push generate-vapid-keys`).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy push_subs_select_own on public.push_subscriptions for select to authenticated using ((select auth.uid()) = user_id);
create policy push_subs_insert_own on public.push_subscriptions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy push_subs_update_own on public.push_subscriptions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy push_subs_delete_own on public.push_subscriptions for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.alarm_pushes (
  item_id uuid not null references public.life_items (id) on delete cascade,
  alarm_key text not null,
  sent_at timestamptz not null default now(),
  primary key (item_id, alarm_key)
);
alter table public.alarm_pushes enable row level security;

-- Server-only settings: RLS on with no policies, so the app can never read them.
create table if not exists public.app_secrets (name text primary key, value text not null);
alter table public.app_secrets enable row level security;

create or replace function public.due_alarm_pushes()
returns table (item_id uuid, user_id uuid, title text, kind text, alarm_key text)
language sql security definer set search_path = '' as $$
  select i.id, i.user_id, i.title, i.kind, i.due_date::text || ' ' || i.due_time
  from public.life_items i
  join public.profiles p on p.id = i.user_id
  where i.status = 'open'
    and i.kind in ('task', 'checklist', 'reminder')
    and i.due_date is not null and i.due_time ~ '^\d{2}:\d{2}$'
    and (i.due_date + i.due_time::time) at time zone coalesce(p.timezone, 'Asia/Kolkata') <= now()
    and (i.due_date + i.due_time::time) at time zone coalesce(p.timezone, 'Asia/Kolkata') > now() - interval '10 minutes'
    and coalesce(i.data->>'alarm_ack', '') <> i.due_date::text || ' ' || i.due_time
    and not exists (select 1 from public.alarm_pushes a where a.item_id = i.id and a.alarm_key = i.due_date::text || ' ' || i.due_time);
$$;
revoke all on function public.due_alarm_pushes() from public, anon, authenticated;

select cron.schedule('send-alarms', '* * * * *', $cron$
  select net.http_post(
    url := 'https://mzmcvnqmdyvlzzppzfyo.supabase.co/functions/v1/send-alarms',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', (select value from public.app_secrets where name = 'cron_secret')),
    body := '{}'::jsonb
  );
$cron$);
