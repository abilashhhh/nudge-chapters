-- Bank SMS import (iPhone Shortcuts → this database → the app). Applied 2026-10-17.
--
-- iOS doesn't let web apps read SMS. Instead, a Shortcuts automation on the phone runs when a bank SMS arrives and
-- posts just that message to `ingest_sms` with a personal key. Messages that aren't about money (OTPs, chats) are
-- dropped before anything is stored. The app reads the inbox, turns each message into a transaction and marks it.

-- Last digits of a bank account, to match "A/c XX1234" in a message to the right account.
alter table public.accounts add column if not exists last4 text;
alter table public.accounts drop constraint if exists accounts_last4_check;
alter table public.accounts add constraint accounts_last4_check check (last4 is null or last4 = '' or last4 ~ '^[0-9]{3,6}$');

-- One import key per person. Only its SHA-256 is stored; the key itself is shown once, when it's made.
create table if not exists public.sms_keys (
  user_id uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  key_hash text not null unique,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);
alter table public.sms_keys enable row level security;
create policy sms_keys_select_own on public.sms_keys for select to authenticated using ((select auth.uid()) = user_id);
create policy sms_keys_delete_own on public.sms_keys for delete to authenticated using ((select auth.uid()) = user_id);

create table if not exists public.sms_inbox (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  sender text check (sender is null or length(sender) <= 60),
  body text not null check (length(body) <= 1000),
  received_at timestamptz not null default now(),
  body_hash text not null,
  status text not null default 'new' check (status in ('new', 'added', 'ignored')),
  transaction_id uuid references public.transactions (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, body_hash)
);
create index if not exists sms_inbox_user_idx on public.sms_inbox (user_id, status, received_at desc);
alter table public.sms_inbox enable row level security;
create policy sms_inbox_select_own on public.sms_inbox for select to authenticated using ((select auth.uid()) = user_id);
create policy sms_inbox_update_own on public.sms_inbox for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sms_inbox_delete_own on public.sms_inbox for delete to authenticated using ((select auth.uid()) = user_id);

-- Make (or replace) your import key. Returns the key once; only its hash is kept.
create or replace function public.create_sms_key() returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  k text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if auth.uid() is null then raise exception 'Sign in first'; end if;
  insert into public.sms_keys (user_id, key_hash) values (auth.uid(), encode(extensions.digest(k, 'sha256'), 'hex'))
  on conflict (user_id) do update set key_hash = excluded.key_hash, created_at = now(), last_used_at = null;
  return k;
end;
$$;
revoke all on function public.create_sms_key() from public, anon;
grant execute on function public.create_sms_key() to authenticated;

-- Called by the phone. Keeps only messages about money, at most 300 a day, and never the same message twice.
create or replace function public.ingest_sms(key text, body text, sender text default null, received_at timestamptz default null) returns text
language plpgsql security definer set search_path = public, extensions
as $$
declare
  uid uuid;
  b text := left(trim(coalesce(body, '')), 1000);
begin
  select k.user_id into uid from public.sms_keys k where k.key_hash = encode(extensions.digest(coalesce(key, ''), 'sha256'), 'hex');
  if uid is null then return 'unknown key'; end if;
  if b ~* '(\motp\M|one[ -]time password|verification code|\mpin\M is)' then return 'skipped'; end if;
  if b !~* '((rs\.?|inr|₹)\s*[0-9])|((debited|credited|spent|sent|received|paid|withdrawn|deposited)[^0-9]{0,40}[0-9])' then return 'skipped'; end if;
  if (select count(*) from public.sms_inbox i where i.user_id = uid and i.created_at > now() - interval '1 day') >= 300 then return 'limit'; end if;
  insert into public.sms_inbox (user_id, sender, body, received_at, body_hash)
  values (uid, left(sender, 60), b, coalesce(received_at, now()), encode(extensions.digest(b, 'sha256'), 'hex'))
  on conflict (user_id, body_hash) do nothing;
  update public.sms_keys set last_used_at = now() where user_id = uid;
  return 'ok';
end;
$$;
revoke all on function public.ingest_sms(text, text, text, timestamptz) from public;
grant execute on function public.ingest_sms(text, text, text, timestamptz) to anon, authenticated;

create trigger sms_inbox_updated_at before update on public.sms_inbox for each row execute function public.set_updated_at();
