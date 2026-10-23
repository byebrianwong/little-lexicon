-- 0014_saved_words_tracker.sql
-- Saved words that stay saved, a tracker on each word, and a setting for how
-- often practice shows words the learner knows.
--
-- 1. practice_logs: one row per answer in endless practice. Practice never
--    writes review_logs or reschedules a card (that would wreck FSRS
--    intervals), so until now its answers were not kept anywhere. The app
--    reads these rows with review_logs to build the tracker on each word: how
--    often it came up lately, how many recent answers were right, and whether
--    it is known (right on 5 separate days with no mistake since).
--
-- 2. profiles.known_word_frequency: how often practice shows a known word.
--    'rarely' (the default), 'sometimes' or 'often'.
--
-- 3. delete_my_data (0013) also removes practice_logs.
--
-- word_list (0009) is unchanged. Its rows already stayed after a session
-- introduced the word; the app used to hide them, and now shows them.
--
-- word_id is the word's id in the app's words file, with no foreign key, as
-- for the other per-user tables since 0010.

create table if not exists little_lexicon.practice_logs (
  id          bigint      generated always as identity primary key,
  user_id     uuid        not null references auth.users(id) on delete cascade,
  word_id     bigint      not null,
  correct     boolean     not null,
  game_mode   text        not null,
  answered_at timestamptz not null default now()
);

create index if not exists practice_logs_user_time_idx
  on little_lexicon.practice_logs (user_id, answered_at);

alter table little_lexicon.practice_logs enable row level security;

-- Owners read and add their own rows. Logs are never changed or deleted by
-- the app.
do $$ begin
  create policy "own practice logs read" on little_lexicon.practice_logs
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

do $$ begin
  create policy "own practice logs insert" on little_lexicon.practice_logs
    for insert to authenticated
    with check (user_id = auth.uid());
exception when duplicate_object then null; end $$;

grant select, insert on little_lexicon.practice_logs to authenticated;

alter table little_lexicon.profiles
  add column if not exists known_word_frequency text not null default 'rarely';

do $$ begin
  alter table little_lexicon.profiles
    add constraint profiles_known_word_frequency_check
    check (known_word_frequency in ('rarely', 'sometimes', 'often'));
exception when duplicate_object then null; end $$;

-- As 0013, plus practice_logs. These are all eleven per-user tables as of
-- 0014. A migration that adds a per-user table must add it here too.
create or replace function little_lexicon.delete_my_data()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
begin
  if v_uid is null then
    raise exception 'delete_my_data: not authenticated (auth.uid() is null)'
      using errcode = '28000';
  end if;

  delete from little_lexicon.review_logs     where user_id = v_uid;
  delete from little_lexicon.practice_logs   where user_id = v_uid;
  delete from little_lexicon.user_word_state where user_id = v_uid;
  delete from little_lexicon.word_list       where user_id = v_uid;
  delete from little_lexicon.game_sessions   where user_id = v_uid;
  delete from little_lexicon.daily_stats     where user_id = v_uid;
  delete from little_lexicon.achievements    where user_id = v_uid;
  delete from little_lexicon.mnemonics       where user_id = v_uid;
  delete from little_lexicon.ai_usage        where user_id = v_uid;
  delete from little_lexicon.word_reports    where user_id = v_uid;
  delete from little_lexicon.profiles        where user_id = v_uid;
end;
$$;

revoke all on function little_lexicon.delete_my_data() from public;
grant execute on function little_lexicon.delete_my_data() to authenticated;
