-- Nudge Chapters — personal system: tasks, checklists, notes, reminders and wishlist items.
-- One table with a `kind`; kind-specific fields (checklist entries, wishlist prices, URLs) live in `data`.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09.

create table if not exists public.life_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  kind text not null check (kind in ('task', 'checklist', 'note', 'reminder', 'wishlist')),
  title text not null,
  body text,
  status text not null default 'open' check (status in ('open', 'done', 'archived')),
  due_date date,
  due_time text,
  repeat text not null default 'none' check (repeat in ('none', 'daily', 'weekly', 'monthly', 'yearly')),
  priority smallint not null default 2 check (priority between 1 and 3),
  tags text[] not null default '{}',
  pinned boolean not null default false,
  goal_id uuid references public.goals (id) on delete set null,
  data jsonb not null default '{}'::jsonb,
  source text not null default 'user',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists life_items_user_kind_idx on public.life_items (user_id, kind);
create index if not exists life_items_goal_idx on public.life_items (goal_id);

alter table public.life_items enable row level security;

create policy life_items_select_own on public.life_items for select to authenticated using ((select auth.uid()) = user_id);
create policy life_items_insert_own on public.life_items for insert to authenticated with check ((select auth.uid()) = user_id);
create policy life_items_update_own on public.life_items for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy life_items_delete_own on public.life_items for delete to authenticated using ((select auth.uid()) = user_id);

create trigger life_items_updated_at before update on public.life_items
  for each row execute function public.set_updated_at();
