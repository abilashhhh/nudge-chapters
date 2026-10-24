-- Cards paid in full at the end of each month: everything spent up to the month's last day is due that day.
alter table public.credit_cards add column if not exists pay_by_month_end boolean not null default false;
