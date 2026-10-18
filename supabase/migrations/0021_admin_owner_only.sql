-- Admin is for the app's owner only (Abilash: abilashnarayanan2001@gmail.com).
-- 1. The admins table can hold only the owner's account, so nobody else can ever be made an admin by a row.
-- 2. is_admin() is true only for the owner's account (fixed id, confirmed email) that is also in admins.
-- 3. No signed-out (anon) access to any admin function; admin_usage() checks is_admin() itself too.

alter table public.admins drop constraint if exists admins_owner_only;
alter table public.admins add constraint admins_owner_only check (user_id = 'c488420a-5541-4858-aeb4-9ae7d1432ff5'::uuid);

create or replace function public.is_admin() returns boolean
language sql stable security definer set search_path = public, auth
as $$
  select auth.uid() = 'c488420a-5541-4858-aeb4-9ae7d1432ff5'::uuid
    and exists (select 1 from public.admins a where a.user_id = auth.uid())
    and exists (
      select 1 from auth.users u
      where u.id = auth.uid() and lower(u.email) = 'abilashnarayanan2001@gmail.com' and u.email_confirmed_at is not null
    )
$$;

create or replace function public.admin_usage(uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public
as $$
begin
  if not public.is_admin() then raise exception 'Admins only' using errcode = '42501'; end if;
  return jsonb_build_object(
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
  );
end $$;

revoke all on function public.is_admin() from public, anon;
revoke all on function public.admin_usage(uuid) from public, anon, authenticated;
revoke all on function public.admin_users() from public, anon;
revoke all on function public.admin_user_detail(uuid) from public, anon;
revoke all on function public.feedback_guard() from public, anon, authenticated;
grant execute on function public.is_admin() to authenticated;
grant execute on function public.admin_users() to authenticated;
grant execute on function public.admin_user_detail(uuid) to authenticated;
