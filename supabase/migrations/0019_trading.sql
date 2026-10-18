-- Trading: your trade journal (intraday, swing, delivery, F&O) and IPO applications (Trading section).
-- A trade is one round trip: bought and sold (or sold short and bought back). Open trades have no exit yet.
-- Profit, win rate and listing gains are always worked out from these rows, never stored.
-- These are a journal: they don't move money in your bank accounts (record the broker transfers there as usual).
create table if not exists public.trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (length(trim(symbol)) > 0 and length(symbol) <= 40),
  name text check (name is null or length(name) <= 200),
  exchange text check (exchange is null or length(exchange) <= 20),
  segment text not null default 'intraday' check (segment in ('intraday', 'swing', 'delivery', 'fno', 'other')),
  side text not null default 'long' check (side in ('long', 'short')),
  quantity numeric not null check (quantity > 0),
  entry_date date not null,
  entry_price numeric not null check (entry_price >= 0),
  exit_date date,
  exit_price numeric check (exit_price is null or exit_price >= 0),
  charges numeric not null default 0 check (charges >= 0),
  broker text check (broker is null or length(broker) <= 60),
  strategy text check (strategy is null or length(strategy) <= 120),
  notes text check (notes is null or length(notes) <= 4000),
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.ipo_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0 and length(name) <= 200),
  symbol text check (symbol is null or length(symbol) <= 40),
  category text not null default 'retail' check (category in ('retail', 'shni', 'bhni', 'employee', 'shareholder', 'other')),
  apply_date date not null,
  price numeric not null check (price >= 0),
  lot_size integer not null check (lot_size > 0),
  lots integer not null default 1 check (lots > 0),
  status text not null default 'applied' check (status in ('applied', 'allotted', 'not_allotted', 'listed', 'sold', 'withdrawn')),
  allotted_shares integer not null default 0 check (allotted_shares >= 0),
  listing_date date,
  listing_price numeric check (listing_price is null or listing_price >= 0),
  sold_date date,
  sold_price numeric check (sold_price is null or sold_price >= 0),
  account_id uuid references public.accounts (id) on delete set null,
  broker text check (broker is null or length(broker) <= 60),
  notes text check (notes is null or length(notes) <= 4000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists trades_user_date_idx on public.trades (user_id, entry_date);
create index if not exists ipo_applications_user_date_idx on public.ipo_applications (user_id, apply_date);
create index if not exists ipo_applications_account_idx on public.ipo_applications (account_id);

alter table public.trades enable row level security;
alter table public.ipo_applications enable row level security;

create policy trades_select_own on public.trades for select to authenticated using ((select auth.uid()) = user_id);
create policy trades_insert_own on public.trades for insert to authenticated with check ((select auth.uid()) = user_id);
create policy trades_update_own on public.trades for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy trades_delete_own on public.trades for delete to authenticated using ((select auth.uid()) = user_id);

create policy ipo_applications_select_own on public.ipo_applications for select to authenticated using ((select auth.uid()) = user_id);
create policy ipo_applications_insert_own on public.ipo_applications for insert to authenticated with check ((select auth.uid()) = user_id);
create policy ipo_applications_update_own on public.ipo_applications for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy ipo_applications_delete_own on public.ipo_applications for delete to authenticated using ((select auth.uid()) = user_id);

create trigger trades_updated_at before update on public.trades for each row execute function public.set_updated_at();
create trigger ipo_applications_updated_at before update on public.ipo_applications for each row execute function public.set_updated_at();
