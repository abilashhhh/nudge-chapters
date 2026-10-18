-- Admin moves to its own account and its own page (/admin, username "admin").
-- The account admin@nudgechapters.in was created separately (its password is not kept in the repo); it is the only
-- admin. Your personal account is no longer an admin, so the dashboard can't be opened from the app itself.
-- (The personal account's old row in admins grants nothing: is_admin() checks the exact admin account. The check
-- constraint is NOT VALID so that old row doesn't block it; no new row can be added for anyone else.)

alter table public.admins drop constraint if exists admins_owner_only;
insert into public.admins (user_id) values ('fe26d352-ef7f-49d7-83f9-b0364ba3db3f'::uuid) on conflict do nothing;
alter table public.admins add constraint admins_owner_only check (user_id = 'fe26d352-ef7f-49d7-83f9-b0364ba3db3f'::uuid) not valid;

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select auth.uid() = 'fe26d352-ef7f-49d7-83f9-b0364ba3db3f'::uuid
    and exists (select 1 from public.admins a where a.user_id = auth.uid())
    and exists (select 1 from auth.users u where u.id = auth.uid() and lower(u.email) = 'admin@nudgechapters.in')
$$;
revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

-- The users list marks only the admin account as admin.
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
        'is_admin', u.id = 'fe26d352-ef7f-49d7-83f9-b0364ba3db3f'::uuid,
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
revoke all on function public.admin_users() from public, anon;
grant execute on function public.admin_users() to authenticated;
