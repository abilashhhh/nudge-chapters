-- Nudge Chapters — finish Supabase setup
--
-- Run this once in Supabase → SQL Editor for the Nudge Chapters project (ref mzmcvnqmdyvlzzppzfyo).
-- Optional. It adds two things that need your confirmation to apply:
--   2. the audit-log trigger (Settings → Activity shows every change, including removals)
--   3. delete_my_account() for the "Delete my account" button in Settings
-- (Step 1, the "delete own rows" policies, is already applied — see migrations/0003.)
-- Safe to run more than once.
--
-- (Fresh projects can instead run migrations/0001_init.sql, which contains everything.)

-- 2. Audit trail for every financial table
create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid;
  v_id uuid;
begin
  if tg_op = 'DELETE' then
    v_user := old.user_id;
    v_id := old.id;
  else
    v_user := new.user_id;
    v_id := new.id;
  end if;

  -- Skip when the owning user is being deleted (cascade) — nothing left to audit.
  if not exists (select 1 from auth.users u where u.id = v_user) then
    return null;
  end if;

  insert into public.audit_events (user_id, table_name, record_id, action, old_data, new_data)
  values (
    v_user,
    tg_table_name,
    v_id,
    lower(tg_op),
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end
  );
  return null;
end;
$$;

revoke all on function public.audit_row() from public, anon, authenticated;

do $$
declare
  t text;
  audited text[] := array[
    'accounts', 'categories', 'credit_cards', 'card_statements', 'loans', 'chits',
    'goals', 'investments', 'investment_valuations', 'lendings', 'reserves',
    'recurring_rules', 'event_overrides', 'transactions'];
begin
  foreach t in array audited loop
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit', t);
  end loop;
end;
$$;

-- 3. "Delete my account": removes the signed-in user; all their data cascades.
create or replace function public.delete_my_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Not signed in';
  end if;
  delete from auth.users where id = v_user;
end;
$$;

revoke all on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
