-- Market Simulator: paper trading against real market prices. No real money, no real orders.
--
-- You can READ your own rows. Only the `market-sim` Edge Function (service role) can change balances,
-- orders, fills and positions — it fetches the market price itself and calls sim_fill(), which does
-- every fill inside one transaction with the account row locked. The watchlist is yours to edit.

create table if not exists public.sim_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'archived')),
  initial_capital numeric not null check (initial_capital >= 1000 and initial_capital <= 1e10),
  cash numeric not null check (cash >= 0),
  realized_pnl numeric not null default 0,
  charges_paid numeric not null default 0 check (charges_paid >= 0),
  settings jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  archived_at timestamptz
);
-- One active simulation per person; archived ones are kept for history.
create unique index if not exists sim_accounts_one_active on public.sim_accounts (user_id) where status = 'active';

create table if not exists public.sim_watchlist (
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  symbol text not null check (symbol ~ '^[A-Z0-9&.^-]{1,25}$'),
  exchange text not null default 'NSE' check (exchange in ('NSE', 'BSE')),
  name text check (name is null or length(name) <= 200),
  position integer not null default 0,
  created_at timestamptz not null default now(),
  primary key (user_id, symbol)
);

create table if not exists public.sim_orders (
  id uuid primary key default gen_random_uuid(),
  account_id uuid not null references public.sim_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Sent by the app with each order so a retry can never place it twice.
  client_id text not null check (length(client_id) between 8 and 64),
  symbol text not null,
  exchange text not null default 'NSE',
  name text,
  side text not null check (side in ('buy', 'sell')),
  product text not null check (product in ('delivery', 'intraday')),
  order_type text not null check (order_type in ('market', 'limit')),
  qty integer not null check (qty > 0),
  limit_price numeric check (limit_price is null or limit_price > 0),
  -- The market price when the order was placed (what the preview showed).
  ref_price numeric,
  status text not null default 'open' check (status in ('open', 'filled', 'rejected', 'cancelled', 'expired')),
  reason text,
  filled_qty integer not null default 0,
  avg_fill_price numeric,
  -- 'auto' = placed by the simulator (intraday square-off).
  source text not null default 'user' check (source in ('user', 'auto')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (account_id, client_id)
);
create index if not exists sim_orders_account_idx on public.sim_orders (account_id, created_at desc);
create index if not exists sim_orders_open_idx on public.sim_orders (account_id) where status = 'open';

-- One row per simulated execution. No partial fills in this model, so one fill per order (enforced).
create table if not exists public.sim_fills (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.sim_orders (id) on delete cascade,
  account_id uuid not null references public.sim_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  name text,
  side text not null,
  product text not null,
  qty integer not null,
  ref_price numeric not null,
  price numeric not null,
  value numeric not null,
  charges numeric not null default 0,
  charges_detail jsonb not null default '{}'::jsonb,
  realized_pnl numeric,
  -- When the market price used was quoted (market data time) vs when the simulator filled it.
  quote_time timestamptz,
  executed_at timestamptz not null default now()
);
create index if not exists sim_fills_account_idx on public.sim_fills (account_id, executed_at desc);

create table if not exists public.sim_positions (
  account_id uuid not null references public.sim_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  symbol text not null,
  product text not null check (product in ('delivery', 'intraday')),
  name text,
  exchange text not null default 'NSE',
  qty integer not null default 0 check (qty >= 0),
  avg_price numeric not null default 0,
  buy_charges numeric not null default 0,
  realized_pnl numeric not null default 0,
  charges numeric not null default 0,
  opened_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (account_id, symbol, product)
);

create table if not exists public.sim_snapshots (
  account_id uuid not null references public.sim_accounts (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  date date not null,
  cash numeric not null,
  holdings_value numeric not null,
  equity numeric not null,
  realized_pnl numeric not null,
  primary key (account_id, date)
);

-- Shared cache of market data so many screens don't each ask the provider (filled by the Edge Function).
create table if not exists public.sim_quote_cache (
  key text primary key,
  data jsonb not null,
  fetched_at timestamptz not null default now()
);

alter table public.sim_accounts enable row level security;
alter table public.sim_watchlist enable row level security;
alter table public.sim_orders enable row level security;
alter table public.sim_fills enable row level security;
alter table public.sim_positions enable row level security;
alter table public.sim_snapshots enable row level security;
alter table public.sim_quote_cache enable row level security;

create policy sim_accounts_select_own on public.sim_accounts for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_orders_select_own on public.sim_orders for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_fills_select_own on public.sim_fills for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_positions_select_own on public.sim_positions for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_snapshots_select_own on public.sim_snapshots for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_watchlist_select_own on public.sim_watchlist for select to authenticated using ((select auth.uid()) = user_id);
create policy sim_watchlist_insert_own on public.sim_watchlist for insert to authenticated with check ((select auth.uid()) = user_id);
create policy sim_watchlist_update_own on public.sim_watchlist for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy sim_watchlist_delete_own on public.sim_watchlist for delete to authenticated using ((select auth.uid()) = user_id);
-- sim_quote_cache: no policies — service role only.

/*
  Execute one open order at `p_price` (the simulated fill price the Edge Function worked out from a fresh
  quote). Everything happens under row locks in one transaction:
    · the order must still be open (so a retry or a second request can never fill it twice);
    · buys need enough cash for value + charges; sells need enough shares in that product;
    · cash, the position (average cost, buy charges kept for later sales), realized P&L and the fill row
      all change together, or not at all (a rejected order changes nothing but its own status).
  Realized P&L of a sale = (price − average cost) × qty − sell charges − the share of buy charges.
*/
create or replace function public.sim_fill(
  p_order_id uuid,
  p_price numeric,
  p_ref_price numeric,
  p_charges numeric,
  p_detail jsonb,
  p_quote_time timestamptz
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  o public.sim_orders;
  a public.sim_accounts;
  p public.sim_positions;
  v_value numeric;
  v_alloc numeric := 0;
  v_realized numeric := null;
  v_fill uuid;
begin
  select * into o from public.sim_orders where id = p_order_id for update;
  if not found or o.status <> 'open' then
    return jsonb_build_object('ok', false, 'reason', 'not_open');
  end if;
  select * into a from public.sim_accounts where id = o.account_id for update;
  if a.status <> 'active' then
    update public.sim_orders set status = 'cancelled', reason = 'Simulation was reset', updated_at = now() where id = o.id;
    return jsonb_build_object('ok', false, 'reason', 'Simulation was reset');
  end if;
  if p_price is null or p_price <= 0 or p_charges < 0 then
    raise exception 'bad fill price';
  end if;
  v_value := round(p_price * o.qty, 2);

  select * into p from public.sim_positions where account_id = o.account_id and symbol = o.symbol and product = o.product for update;

  if o.side = 'buy' then
    if a.cash < v_value + p_charges then
      update public.sim_orders set status = 'rejected', reason = 'Not enough virtual cash', updated_at = now() where id = o.id;
      return jsonb_build_object('ok', false, 'reason', 'Not enough virtual cash');
    end if;
    update public.sim_accounts set cash = cash - v_value - p_charges, charges_paid = charges_paid + p_charges where id = a.id;
    if p.symbol is null or p.qty = 0 then
      insert into public.sim_positions as sp (account_id, user_id, symbol, product, name, exchange, qty, avg_price, buy_charges, realized_pnl, charges, opened_at, updated_at)
      values (o.account_id, o.user_id, o.symbol, o.product, o.name, o.exchange, o.qty, p_price, p_charges, 0, p_charges, now(), now())
      on conflict (account_id, symbol, product) do update
        set qty = excluded.qty, avg_price = excluded.avg_price, buy_charges = excluded.buy_charges,
            charges = sp.charges + excluded.charges, name = coalesce(excluded.name, sp.name), opened_at = now(), updated_at = now();
    else
      update public.sim_positions
        set avg_price = (avg_price * qty + p_price * o.qty) / (qty + o.qty),
            qty = qty + o.qty,
            buy_charges = buy_charges + p_charges,
            charges = charges + p_charges,
            updated_at = now()
        where account_id = o.account_id and symbol = o.symbol and product = o.product;
    end if;
  else
    if p.symbol is null or p.qty < o.qty then
      update public.sim_orders set status = 'rejected', reason = 'Not enough shares to sell', updated_at = now() where id = o.id;
      return jsonb_build_object('ok', false, 'reason', 'Not enough shares to sell');
    end if;
    v_alloc := round(p.buy_charges * o.qty / p.qty, 2);
    v_realized := round((p_price - p.avg_price) * o.qty - p_charges - v_alloc, 2);
    update public.sim_accounts
      set cash = cash + v_value - p_charges, charges_paid = charges_paid + p_charges, realized_pnl = realized_pnl + v_realized
      where id = a.id;
    update public.sim_positions
      set qty = qty - o.qty,
          avg_price = case when qty - o.qty = 0 then 0 else avg_price end,
          buy_charges = buy_charges - v_alloc,
          realized_pnl = realized_pnl + v_realized,
          charges = charges + p_charges,
          updated_at = now()
      where account_id = o.account_id and symbol = o.symbol and product = o.product;
  end if;

  insert into public.sim_fills (order_id, account_id, user_id, symbol, name, side, product, qty, ref_price, price, value, charges, charges_detail, realized_pnl, quote_time)
  values (o.id, o.account_id, o.user_id, o.symbol, o.name, o.side, o.product, o.qty, p_ref_price, p_price, v_value, p_charges, coalesce(p_detail, '{}'::jsonb), v_realized, p_quote_time)
  returning id into v_fill;

  update public.sim_orders set status = 'filled', filled_qty = o.qty, avg_fill_price = p_price, updated_at = now() where id = o.id;

  return jsonb_build_object('ok', true, 'fill_id', v_fill, 'price', p_price, 'value', v_value, 'charges', p_charges, 'realized', v_realized);
end;
$$;

-- Start again: the active simulation is archived (kept for history) and a fresh one opened. Touches
-- nothing outside the sim_* tables.
create or replace function public.sim_reset(p_user uuid, p_capital numeric, p_settings jsonb) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old uuid;
  v_new uuid;
begin
  if p_capital < 1000 or p_capital > 1e10 then raise exception 'capital out of range'; end if;
  select id into v_old from public.sim_accounts where user_id = p_user and status = 'active' for update;
  if v_old is not null then
    update public.sim_orders set status = 'cancelled', reason = 'Simulation was reset', updated_at = now() where account_id = v_old and status = 'open';
    update public.sim_accounts set status = 'archived', archived_at = now() where id = v_old;
  end if;
  insert into public.sim_accounts (user_id, initial_capital, cash, settings) values (p_user, p_capital, p_capital, coalesce(p_settings, '{}'::jsonb)) returning id into v_new;
  return v_new;
end;
$$;

revoke all on function public.sim_fill(uuid, numeric, numeric, numeric, jsonb, timestamptz) from public, anon, authenticated;
revoke all on function public.sim_reset(uuid, numeric, jsonb) from public, anon, authenticated;
grant execute on function public.sim_fill(uuid, numeric, numeric, numeric, jsonb, timestamptz) to service_role;
grant execute on function public.sim_reset(uuid, numeric, jsonb) to service_role;
