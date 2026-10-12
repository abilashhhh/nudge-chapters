-- Daily Rhythm: the time of day an activity is done ("HH:MM", local time). Optional; the checklist is ordered by it.
-- Applied to project mzmcvnqmdyvlzzppzfyo on 2026-10-12.
alter table public.habits add column if not exists time text check (time is null or time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
-- Activities that already had a reminder take that as their time.
update public.habits set time = reminder_time where time is null and reminder_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$';
