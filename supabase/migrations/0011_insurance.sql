-- Insurance: every kind of policy (life, term, health, vehicle, home, travel, accident, critical illness, or your own).
-- The premium is a linked repeating bill (recurring_rules), so it shows in To Pay, the calendar and projections like
-- any other bill; a linked reminder (life_items, source 'insurance') rings on the premium date at the chosen time,
-- using the existing alarm + push. Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-12.

create table if not exists public.insurance_policies (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  type text not null default 'health',
  insurer text,
  policy_number text,
  insured text,
  nominee text,
  sum_assured numeric check (sum_assured is null or sum_assured >= 0),
  premium numeric not null default 0 check (premium >= 0),
  frequency text not null default 'yearly' check (frequency in ('monthly', 'quarterly', 'half_yearly', 'yearly', 'once')),
  -- The next premium date you entered; later ones follow from the frequency.
  premium_due_date date,
  start_date date,
  end_date date,
  account_id uuid references public.accounts (id) on delete set null,
  card_id uuid references public.credit_cards (id) on delete set null,
  notify boolean not null default true,
  notify_time text not null default '09:00' check (notify_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$'),
  notify_days_before integer not null default 0 check (notify_days_before between 0 and 60),
  rule_id uuid references public.recurring_rules (id) on delete set null,
  reminder_id uuid references public.life_items (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'lapsed', 'closed')),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists insurance_policies_user_idx on public.insurance_policies (user_id);

alter table public.insurance_policies enable row level security;
create policy insurance_select_own on public.insurance_policies for select to authenticated using ((select auth.uid()) = user_id);
create policy insurance_insert_own on public.insurance_policies for insert to authenticated with check ((select auth.uid()) = user_id);
create policy insurance_update_own on public.insurance_policies for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy insurance_delete_own on public.insurance_policies for delete to authenticated using ((select auth.uid()) = user_id);

create trigger insurance_policies_updated_at before update on public.insurance_policies
  for each row execute function public.set_updated_at();
