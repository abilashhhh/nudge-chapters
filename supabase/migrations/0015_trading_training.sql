-- Trading Training: lessons, quizzes, chart exercises and the daily scoreboard (Menu → Trading Training).
-- Only what you did is stored here. The lessons, questions and chart scenarios ship with the app (src/lib/training),
-- so seed content never mixes with your own records and a content update never rewrites your history.
-- Scores, accuracy, streaks, mastery, achievements and analytics are always worked out from these rows, never stored.

-- One sitting: a quiz, a practice round, a lesson's knowledge check or the daily challenge.
-- The id is made on the device before saving, so a retried save can't create a second sitting.
create table if not exists public.training_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  mode text not null check (mode in ('learn', 'quiz', 'pattern', 'predict', 'analysis', 'revision', 'challenge', 'daily')),
  lesson_id text check (lesson_id is null or length(lesson_id) <= 100),
  -- The user's own date (their time zone), so "today" means the same thing everywhere.
  day date not null,
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  bonus_xp integer not null default 0 check (bonus_xp between 0 and 100),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- One answer. Unique per sitting and question: a double tap or a network retry can't award XP twice.
create table if not exists public.training_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  session_id uuid not null references public.training_sessions (id) on delete cascade,
  question_id text not null check (length(question_id) between 1 and 120),
  mode text not null check (mode in ('learn', 'quiz', 'pattern', 'predict', 'analysis', 'revision', 'challenge', 'daily')),
  topic text not null check (length(topic) between 1 and 60),
  difficulty smallint not null check (difficulty between 1 and 3),
  answer jsonb,
  correct boolean not null,
  score numeric not null check (score >= 0 and score <= 1),
  reasoning_score numeric check (reasoning_score is null or (reasoning_score >= 0 and reasoning_score <= 1)),
  attempt_no integer not null check (attempt_no >= 1),
  time_ms integer not null default 0 check (time_ms >= 0 and time_ms <= 86400000),
  xp integer not null default 0 check (xp between 0 and 100),
  day date not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (session_id, question_id)
);

-- A lesson you opened or finished: one row per lesson, so finishing it twice can't count twice.
create table if not exists public.training_lessons (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null default auth.uid() references auth.users (id) on delete cascade,
  lesson_id text not null check (length(lesson_id) between 1 and 100),
  status text not null default 'started' check (status in ('started', 'completed')),
  completed_on date,
  last_opened_at timestamptz not null default now(),
  time_spent_s integer not null default 0 check (time_spent_s >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, lesson_id)
);

create index if not exists training_sessions_user_day_idx on public.training_sessions (user_id, day);
-- One daily challenge per day.
create unique index if not exists training_sessions_daily_once on public.training_sessions (user_id, day) where mode = 'daily';
create index if not exists training_attempts_user_day_idx on public.training_attempts (user_id, day);
create index if not exists training_attempts_user_question_idx on public.training_attempts (user_id, question_id);
create index if not exists training_attempts_session_idx on public.training_attempts (session_id);

alter table public.training_sessions enable row level security;
alter table public.training_attempts enable row level security;
alter table public.training_lessons enable row level security;

create policy training_sessions_select_own on public.training_sessions for select to authenticated using ((select auth.uid()) = user_id);
create policy training_sessions_insert_own on public.training_sessions for insert to authenticated with check ((select auth.uid()) = user_id);
create policy training_sessions_update_own on public.training_sessions for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy training_sessions_delete_own on public.training_sessions for delete to authenticated using ((select auth.uid()) = user_id);

create policy training_attempts_select_own on public.training_attempts for select to authenticated using ((select auth.uid()) = user_id);
-- An answer can only belong to one of your own sittings.
create policy training_attempts_insert_own on public.training_attempts for insert to authenticated
  with check ((select auth.uid()) = user_id and exists (select 1 from public.training_sessions s where s.id = session_id and s.user_id = (select auth.uid())));
-- Answers are final once given: no update policy.
create policy training_attempts_delete_own on public.training_attempts for delete to authenticated using ((select auth.uid()) = user_id);

create policy training_lessons_select_own on public.training_lessons for select to authenticated using ((select auth.uid()) = user_id);
create policy training_lessons_insert_own on public.training_lessons for insert to authenticated with check ((select auth.uid()) = user_id);
create policy training_lessons_update_own on public.training_lessons for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy training_lessons_delete_own on public.training_lessons for delete to authenticated using ((select auth.uid()) = user_id);

create trigger training_sessions_updated_at before update on public.training_sessions
  for each row execute function public.set_updated_at();
create trigger training_attempts_updated_at before update on public.training_attempts
  for each row execute function public.set_updated_at();
create trigger training_lessons_updated_at before update on public.training_lessons
  for each row execute function public.set_updated_at();
