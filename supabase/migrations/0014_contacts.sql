-- Contacts: your address book, imported from a .vcf file (iPhone / Google Contacts export) and shown in Menu → Contacts.
-- Photos aren't kept (they'd make every load heavy); names, numbers, emails, company, birthday, address and notes are.
-- Applied 2026-10-17.
create table if not exists public.contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  phones jsonb not null default '[]'::jsonb,
  emails jsonb not null default '[]'::jsonb,
  org text check (org is null or length(org) <= 200),
  title text check (title is null or length(title) <= 200),
  birthday date,
  address text check (address is null or length(address) <= 1000),
  notes text check (notes is null or length(notes) <= 4000),
  favorite boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists contacts_user_idx on public.contacts (user_id, name);
alter table public.contacts enable row level security;
create policy contacts_select_own on public.contacts for select to authenticated using ((select auth.uid()) = user_id);
create policy contacts_insert_own on public.contacts for insert to authenticated with check ((select auth.uid()) = user_id);
create policy contacts_update_own on public.contacts for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy contacts_delete_own on public.contacts for delete to authenticated using ((select auth.uid()) = user_id);
create trigger contacts_updated_at before update on public.contacts for each row execute function public.set_updated_at();
