-- 0003_progress_columns.sql
-- Onboarding / notification / sound preferences on the profile, plus the
-- achievements table (Phase 5.5, Phase 6.2/6.3). Matches database.types.ts
-- profiles Row additions and the achievements Row.

-- New profile columns. The check on reminder_hour is created inline with the
-- column, so `add column if not exists` keeps the whole statement idempotent:
-- on a re-run the column already exists and the clause is skipped as a unit.
alter table little_lexicon.profiles
  add column if not exists onboarded_at timestamptz;

alter table little_lexicon.profiles
  add column if not exists reminder_hour int check (reminder_hour between 0 and 23);

alter table little_lexicon.profiles
  add column if not exists sound_enabled boolean not null default true;

-- Unlocked achievements, one row per (user, code). Owner-only.
create table if not exists little_lexicon.achievements (
  user_id     uuid not null references auth.users(id) on delete cascade,
  code        text not null,
  unlocked_at timestamptz not null default now(),
  primary key (user_id, code)
);

alter table little_lexicon.achievements enable row level security;

-- A single FOR ALL policy covers select / insert / update / delete for the owner.
do $$ begin
  create policy "own achievements" on little_lexicon.achievements
    for all to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;
