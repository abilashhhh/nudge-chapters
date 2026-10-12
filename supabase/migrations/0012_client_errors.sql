-- Crash reports from the app (message, stack, screen, build), so a screen that fails on a phone can be looked
-- into. Only your own rows are visible to you; no financial data is stored here. Applied 2026-10-12.
create table if not exists public.client_errors (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  message text not null check (length(message) <= 1000),
  stack text check (stack is null or length(stack) <= 4000),
  url text check (url is null or length(url) <= 500),
  build text,
  "where" text,
  user_agent text check (user_agent is null or length(user_agent) <= 300),
  created_at timestamptz not null default now()
);
create index if not exists client_errors_user_idx on public.client_errors (user_id, created_at desc);
alter table public.client_errors enable row level security;
create policy client_errors_insert_own on public.client_errors for insert to authenticated with check ((select auth.uid()) = user_id);
create policy client_errors_select_own on public.client_errors for select to authenticated using ((select auth.uid()) = user_id);
create policy client_errors_delete_own on public.client_errors for delete to authenticated using ((select auth.uid()) = user_id);
