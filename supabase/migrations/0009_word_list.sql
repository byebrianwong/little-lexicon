-- 0009_word_list.sql
-- The words a user chose to learn from the Discover feed.
--
-- A word is "new" to a user while it has no user_word_state row, so there was
-- nowhere to record "chosen, not started yet". This table is that record.
-- Sessions introduce listed words before the automatic picks. Once a session
-- has shown a word it has a user_word_state row and the list entry has done
-- its job; the entry stays for history.
--
-- Removing a word sets removed_at instead of deleting the row (no hard deletes
-- of user data). Adding it again clears removed_at and resets added_at.

create table if not exists little_lexicon.word_list (
  user_id    uuid        not null references auth.users(id) on delete cascade,
  word_id    bigint      not null references little_lexicon.words(id) on delete cascade,
  added_at   timestamptz not null default now(),
  removed_at timestamptz,
  primary key (user_id, word_id)
);

create index if not exists word_list_active_idx
  on little_lexicon.word_list (user_id, added_at)
  where removed_at is null;

alter table little_lexicon.word_list enable row level security;

-- Owners read, add and update their own rows. There is no delete policy.
do $$ begin
  create policy "own word list read" on little_lexicon.word_list
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own word list insert" on little_lexicon.word_list
    for insert to authenticated
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own word list update" on little_lexicon.word_list
    for update to authenticated
    using (user_id = auth.uid())
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select, insert, update on little_lexicon.word_list to authenticated;
