-- Goal dependencies and pausing. Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09.
-- A goal with depends_on gets no money until that goal reaches min_before_start (or its full target when 0).
alter table public.goals add column if not exists depends_on uuid references public.goals(id) on delete set null;
alter table public.goals add column if not exists min_before_start numeric not null default 0 check (min_before_start >= 0);
alter table public.goals add column if not exists paused boolean not null default false;
