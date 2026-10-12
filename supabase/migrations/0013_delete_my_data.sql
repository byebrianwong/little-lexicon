-- 0013_delete_my_data.sql
-- "Delete account" in Settings: remove every Little Lexicon row for the caller.
--
-- The sign-in (auth.users) is shared by every app in the games-apps project.
-- Deleting it would also delete or orphan the person's data in those apps
-- (rotation, baby_bean and storage_tracker reference auth.users), and would
-- sign them out of all of them. So this deletes only Little Lexicon's data and
-- leaves the sign-in alone. If the person opens Little Lexicon again, the app
-- creates a fresh, empty profile.
--
-- This is the one place user rows are hard-deleted, because the person asked
-- for it. The grants (0011, 0012) give no DELETE, so the function runs as its
-- owner (security definer). It deletes only rows whose user_id is the caller,
-- taken from the request's JWT, never from an argument.
--
-- Global mnemonics (user_id is null) are content and stay.
--
-- These are all ten per-user tables as of 0013. A migration that adds a
-- per-user table must add it here too.

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
