-- Daily Rhythm: an optional end time, so an activity can be a slot (gym 10:00–11:00). Applied 2026-10-12.
alter table public.habits add column if not exists end_time text check (end_time is null or end_time ~ '^([01][0-9]|2[0-3]):[0-5][0-9]$');
