-- Nudge Chapters — let each signed-in user remove only their own rows.
-- Without these policies a removal returns success but changes nothing.
-- Already part of 0001_init.sql for fresh projects; this is idempotent.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09.

do $$
declare
  t text;
  owned text[] := array[
    'accounts', 'categories', 'credit_cards', 'card_statements', 'loans', 'chits',
    'goals', 'investments', 'investment_valuations', 'lendings', 'reserves',
    'recurring_rules', 'event_overrides', 'transactions', 'net_worth_snapshots'];
begin
  foreach t in array owned loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = t and policyname = t || '_delete_own') then
      execute format(
        'create policy %I on public.%I for delete to authenticated using ((select auth.uid()) = user_id)',
        t || '_delete_own', t);
    end if;
  end loop;
end;
$$;
