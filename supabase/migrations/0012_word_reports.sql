-- 0012_word_reports.sql
-- Problems learners report with a word's content: a wrong definition, a bad
-- example, a wrong pronunciation, and so on.
--
-- Numbered 0012 because 0011 (grants for the API roles) is on the
-- claude/supabase-go-live branch. This file grants its own access, so it does
-- not depend on 0011.
--
-- word_id is the word's id in the app's words file. There is no foreign key,
-- as with the other per-user tables since 0010.
--
-- Learners add reports and read their own. They cannot change or delete them.
-- The curation process in pipeline/ reads open reports and sets resolved_at
-- once the word is fixed, using the service role, which bypasses RLS. The
-- learner is not told. Reports are kept after they are resolved (no hard
-- deletes of user data); deleting the account removes them through the
-- cascade on user_id.

create table if not exists little_lexicon.word_reports (
  id              bigint generated always as identity primary key,
  user_id         uuid        not null references auth.users(id) on delete cascade,
  word_id         bigint      not null,
  reason          text        not null
    check (reason in ('definition', 'example', 'pronunciation', 'answers', 'hook', 'other')),
  note            text        check (char_length(note) <= 500),
  screen          text        not null check (screen in ('intro', 'reveal', 'browse')),
  created_at      timestamptz not null default now(),
  resolved_at     timestamptz,
  resolution_note text
);

-- The curation process asks for open reports, oldest first.
create index if not exists word_reports_open_idx
  on little_lexicon.word_reports (created_at)
  where resolved_at is null;

alter table little_lexicon.word_reports enable row level security;

do $$ begin
  create policy "own word reports read" on little_lexicon.word_reports
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- A learner can only file a report as themselves, and only an open one.
do $$ begin
  create policy "own word reports insert" on little_lexicon.word_reports
    for insert to authenticated
    with check (user_id = auth.uid() and resolved_at is null and resolution_note is null);
exception when duplicate_object then null; end $$;

grant select, insert on little_lexicon.word_reports to authenticated;
grant select, update on little_lexicon.word_reports to service_role;
