-- Nudge Chapters — chit installments are auction-dependent.
-- Each chit keeps one record per installment (base amount, auction date, auction discount,
-- dividend, fees, confirmed payable, amount paid for installments from before tracking,
-- source / confirmation and a note). Cash payments remain chit_installment transactions.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09.

alter table public.chits
  add column if not exists installment_records jsonb not null default '[]'::jsonb;

alter table public.chits
  add constraint chits_installment_records_is_array check (jsonb_typeof(installment_records) = 'array');

comment on column public.chits.installment_records is
  'Per-installment records: [{no, due_date, base_amount, auction_date, auction_discount, dividend, fees, payable, paid_amount, paid_date, source, note}]. Cash payments themselves are chit_installment transactions.';
