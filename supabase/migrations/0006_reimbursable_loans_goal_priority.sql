-- Reimbursable card EMIs / loans and four goal priority levels.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-09.

-- A loan or card EMI bought for someone who repays you: excluded from personal spending and EMI totals,
-- still part of the card bill you pay.
alter table public.loans add column if not exists reimbursable_person text
  check (reimbursable_person is null or length(reimbursable_person) <= 120);

-- Goal priorities: 1 Critical, 2 High, 3 Medium, 4 Low.
alter table public.goals drop constraint if exists goals_priority_check;
alter table public.goals add constraint goals_priority_check check (priority >= 1 and priority <= 4);
