-- Cards and lendings kept track of but not counted in totals (e.g. a card EMI someone else repays).
alter table public.credit_cards add column if not exists track_separately boolean not null default false;
alter table public.lendings add column if not exists track_separately boolean not null default false;
