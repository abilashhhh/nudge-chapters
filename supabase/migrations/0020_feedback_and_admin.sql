-- Feature requests & feedback (Menu → Feedback) and the admin dashboard (/admin).
--
-- Everyone can send feedback and see their own, with the team's reply and status.
-- Admins (rows in public.admins, added by hand in SQL) can read every feedback item and reply, and can open the
-- admin dashboard. The dashboard reads other people's data only through the admin_* functions below, which check
-- is_admin() first; nothing else about RLS changes, so ordinary users still see only their own rows.

create table if not exists public.admins (
  user_id uuid primary key references auth.users (id) on delete cascade,
  created_at timestamptz not null default now()
);
alter table public.admins enable row level security;
-- You can see whether you yourself are an admin (the app uses it to show the Admin link). No insert/update/delete
-- policy: admins are added in SQL only.
create policy admins_select_own on public.admins for select to authenticated using ((select auth.uid()) = user_id);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public
as $$ select exists (select 1 from public.admins where user_id = auth.uid()) $$;
revoke all on function public.is_admin() from public;
grant execute on function public.is_admin() to authenticated;

create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null default 'feature' check (kind in ('feature', 'feedback', 'bug')),
  title text not null check (length(trim(title)) between 1 and 200),
  body text check (body is null or length(body) <= 4000),
  area text check (area is null or length(area) <= 60),
  rating smallint check (rating is null or rating between 1 and 5),
  status text not null default 'new' check (status in ('new', 'planned', 'in_progress', 'done', 'declined')),
  admin_reply text check (admin_reply is null or length(admin_reply) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists feedback_user_idx on public.feedback (user_id, created_at desc);
create index if not exists feedback_status_idx on public.feedback (status, created_at desc);
alter table public.feedback enable row level security;

create policy feedback_select on public.feedback for select to authenticated using ((select auth.uid()) = user_id or (select public.is_admin()));
create policy feedback_insert_own on public.feedback for insert to authenticated with check ((select auth.uid()) = user_id and status = 'new' and admin_reply is null);
create policy feedback_update on public.feedback for update to authenticated using ((select auth.uid()) = user_id or (select public.is_admin())) with check ((select auth.uid()) = user_id or (select public.is_admin()));
create policy feedback_delete_own on public.feedback for delete to authenticated using ((select auth.uid()) = user_id);
create trigger feedback_updated_at before update on public.feedback for each row execute function public.set_updated_at();

-- People may edit their own words but not the status or the team's reply.
create or replace function public.feedback_guard() returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if not public.is_admin() then
    new.status := old.status;
    new.admin_reply := old.admin_reply;
  end if;
  new.user_id := old.user_id;
  return new;
end $$;
create trigger feedback_guard before update on public.feedback for each row execute function public.feedback_guard();

-- What each person uses: how many rows they have in each part of the app.
create or replace function public.admin_usage(uid uuid) returns jsonb
language sql stable security definer set search_path = public
as $$
  select jsonb_build_object(
    'Bank accounts', (select count(*) from accounts where user_id = uid and not archived),
    'Credit cards', (select count(*) from credit_cards where user_id = uid and not archived),
    'Transactions', (select count(*) from transactions where user_id = uid),
    'Loans', (select count(*) from loans where user_id = uid),
    'Chits', (select count(*) from chits where user_id = uid),
    'Investments', (select count(*) from investments where user_id = uid and not archived),
    'Lent / borrowed', (select count(*) from lendings where user_id = uid),
    'Goals', (select count(*) from goals where user_id = uid),
    'Recurring items', (select count(*) from recurring_rules where user_id = uid),
    'Notes', (select count(*) from life_items where user_id = uid and kind = 'note'),
    'To-dos & checklists', (select count(*) from life_items where user_id = uid and kind in ('task', 'checklist')),
    'Reminders', (select count(*) from life_items where user_id = uid and kind = 'reminder'),
    'Wishlist', (select count(*) from life_items where user_id = uid and kind = 'wishlist'),
    'Daily Rhythm activities', (select count(*) from habits where user_id = uid),
    'Daily Rhythm check-ins', (select count(*) from habit_logs where user_id = uid),
    'Insurance policies', (select count(*) from insurance_policies where user_id = uid),
    'Contacts', (select count(*) from contacts where user_id = uid),
    'Trades', (select count(*) from trades where user_id = uid),
    'IPOs', (select count(*) from ipo_applications where user_id = uid),
    'Training sessions', (select count(*) from training_sessions where user_id = uid),
    'Bank SMS', (select count(*) from sms_inbox where user_id = uid),
    'Passwords saved', (select count(*) from vault_items where user_id = uid),
    'Feedback sent', (select count(*) from feedback where user_id = uid)
  )
$$;
revoke all on function public.admin_usage(uuid) from public, authenticated;

-- Every person, with their net worth (latest snapshot), activity and feature usage. Admins only.
create or replace function public.admin_users() returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return coalesce((
    select jsonb_agg(row order by (row->>'created_at') desc)
    from (
      select jsonb_build_object(
        'id', u.id,
        'email', u.email,
        'name', p.name,
        'country', p.country,
        'currency', p.currency,
        'created_at', u.created_at,
        'last_sign_in_at', u.last_sign_in_at,
        'is_admin', exists (select 1 from admins a where a.user_id = u.id),
        'onboarding_done', p.onboarding_done,
        'net_worth', s.net_worth,
        'cash', s.cash,
        'investments', s.investments,
        'liabilities', s.liabilities,
        'net_worth_date', s.date,
        'last_active', greatest(
          (select max(updated_at) from transactions where user_id = u.id),
          (select max(updated_at) from life_items where user_id = u.id),
          (select max(updated_at) from habit_logs where user_id = u.id),
          (select max(updated_at) from accounts where user_id = u.id),
          u.last_sign_in_at
        ),
        'usage', public.admin_usage(u.id),
        'feedback_open', (select count(*) from feedback f where f.user_id = u.id and f.status in ('new', 'planned', 'in_progress'))
      ) as row
      from auth.users u
      left join profiles p on p.id = u.id
      left join lateral (select * from net_worth_snapshots n where n.user_id = u.id order by n.date desc limit 1) s on true
    ) t
  ), '[]'::jsonb);
end $$;
revoke all on function public.admin_users() from public;
grant execute on function public.admin_users() to authenticated;

-- One person's net worth over time (monthly) and their feedback. Admins only.
create or replace function public.admin_user_detail(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public, auth
as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
    'history', coalesce((
      select jsonb_agg(jsonb_build_object('date', d.date, 'net_worth', d.net_worth, 'cash', d.cash, 'investments', d.investments, 'liabilities', d.liabilities) order by d.date)
      from (
        select distinct on (date_trunc('week', date)) date, net_worth, cash, investments, liabilities
        from net_worth_snapshots where user_id = uid order by date_trunc('week', date), date desc
      ) d
    ), '[]'::jsonb),
    'usage', public.admin_usage(uid),
    'by_month', coalesce((
      select jsonb_agg(jsonb_build_object('month', m, 'transactions', c) order by m)
      from (select to_char(date, 'YYYY-MM') m, count(*) c from transactions where user_id = uid group by 1) x
    ), '[]'::jsonb),
    'errors', (select count(*) from client_errors where user_id = uid and created_at > now() - interval '30 days')
  );
end $$;
revoke all on function public.admin_user_detail(uuid) from public;
grant execute on function public.admin_user_detail(uuid) to authenticated;

-- The app's owner is the first admin.
insert into public.admins (user_id)
select id from auth.users where email = 'abilashnarayanan2001@gmail.com'
on conflict do nothing;
