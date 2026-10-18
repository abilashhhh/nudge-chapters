-- Some banks give several cards one shared credit limit (e.g. three Axis cards sharing ₹1,00,000).
-- Cards with the same group name share their limit: the app adds up what all of them owe against it.
alter table public.credit_cards add column if not exists shared_limit_group text
  check (shared_limit_group is null or length(shared_limit_group) <= 60);
