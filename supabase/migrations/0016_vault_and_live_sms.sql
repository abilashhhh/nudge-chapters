-- 1. Password vault (Menu → Passwords). Encrypted on the device before saving (AES-256-GCM with a random data key,
--    itself sealed with a key derived from the master password by PBKDF2-SHA256). These tables only ever hold
--    salt, IVs and ciphertext: the server can't read a single title, username or password, and the master
--    password is never sent or stored. Not audited, not included in backups or exports.
-- 2. Bank SMS: the app subscribes to new inbox rows (Supabase Realtime), so a payment shows up within seconds of
--    the phone sending it, instead of on the next once-a-minute check.

create table if not exists public.vault_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  salt text not null check (length(salt) between 16 and 64),
  iterations integer not null check (iterations >= 100000),
  -- The wrapped data key (AES-GCM IV + ciphertext).
  check_iv text not null check (length(check_iv) between 12 and 32),
  check_ct text not null check (length(check_ct) between 16 and 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  iv text not null check (length(iv) between 12 and 32),
  ct text not null check (length(ct) between 16 and 40000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists vault_items_user_idx on public.vault_items (user_id, created_at);

alter table public.vault_keys enable row level security;
alter table public.vault_items enable row level security;

create policy vault_keys_select_own on public.vault_keys for select to authenticated using ((select auth.uid()) = user_id);
create policy vault_keys_insert_own on public.vault_keys for insert to authenticated with check ((select auth.uid()) = user_id);
create policy vault_keys_update_own on public.vault_keys for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy vault_keys_delete_own on public.vault_keys for delete to authenticated using ((select auth.uid()) = user_id);

create policy vault_items_select_own on public.vault_items for select to authenticated using ((select auth.uid()) = user_id);
create policy vault_items_insert_own on public.vault_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy vault_items_update_own on public.vault_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy vault_items_delete_own on public.vault_items for delete to authenticated using ((select auth.uid()) = user_id);

-- No anonymous access at all.
revoke all on public.vault_keys from anon;
revoke all on public.vault_items from anon;

create trigger vault_keys_updated_at before update on public.vault_keys for each row execute function public.set_updated_at();
create trigger vault_items_updated_at before update on public.vault_items for each row execute function public.set_updated_at();

-- Live bank SMS (row-level security still applies: each person only hears about their own messages).
do $$
begin
  if not exists (select 1 from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'sms_inbox') then
    alter publication supabase_realtime add table public.sms_inbox;
  end if;
end $$;
