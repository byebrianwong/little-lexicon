-- 0002_review_rpc.sql
-- Transactional review-commit path for the SRS loop (Phase 2.3).
--
-- submit_review is a single Postgres RPC, not an Edge Function, so the card
-- upsert, the review-log insert, the daily_stats upsert, and the profile XP
-- update all happen inside one implicit transaction. A function that raises at
-- any point rolls back all four writes, which is exactly the "a failure rolls
-- all three back" acceptance criterion. The app builds the new FSRS card state
-- client-side with ts-fsrs and passes the resulting fields in; this function
-- only persists them and returns the aggregated day/profile counters.
--
-- SECURITY INVOKER: the function runs as the calling user, so RLS on every
-- table applies and auth.uid() is the acting user. The caller can therefore
-- only ever write its own rows.
--
-- NOTE ON STREAKS: this function does NOT touch profiles.streak_count. Streak
-- reconciliation (advance / reset / spend-freeze) is done by the app in TS
-- (applyGoalMet) using the goal_met value returned here, because it depends on
-- yesterday's state and the freeze budget. Keeping it out of this function
-- avoids double-counting when the app also runs that logic.

create or replace function little_lexicon.submit_review(
  p_word_id        bigint,
  p_due            timestamptz,
  p_stability      real,
  p_difficulty     real,
  p_elapsed_days   int,
  p_scheduled_days int,
  p_reps           int,
  p_lapses         int,
  p_state          little_lexicon.card_state,
  p_last_review    timestamptz,
  p_learning_steps int,
  p_rating         smallint,
  p_state_before   little_lexicon.card_state,
  p_game_mode      text,
  p_response_ms    int,
  p_retrievability real,
  p_xp             int,
  p_is_new         boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid          uuid := auth.uid();
  v_daily_goal   int;
  v_reviews_done int;
  v_new_learned  int;
  v_xp_today     int;
  v_goal_met     boolean;
  v_xp_total     bigint;
begin
  if v_uid is null then
    raise exception 'submit_review: not authenticated (auth.uid() is null)'
      using errcode = '28000';
  end if;

  -- 1. Upsert the FSRS card state for (user, word).
  insert into little_lexicon.user_word_state (
    user_id, word_id, due, stability, difficulty, elapsed_days,
    scheduled_days, reps, lapses, state, last_review, learning_steps,
    first_seen_at, updated_at
  ) values (
    v_uid, p_word_id, p_due, p_stability, p_difficulty, p_elapsed_days,
    p_scheduled_days, p_reps, p_lapses, p_state, p_last_review, p_learning_steps,
    now(), now()
  )
  on conflict (user_id, word_id) do update set
    due            = excluded.due,
    stability      = excluded.stability,
    difficulty     = excluded.difficulty,
    elapsed_days   = excluded.elapsed_days,
    scheduled_days = excluded.scheduled_days,
    reps           = excluded.reps,
    lapses         = excluded.lapses,
    state          = excluded.state,
    last_review    = excluded.last_review,
    learning_steps = excluded.learning_steps,
    updated_at     = now();
    -- first_seen_at is intentionally left untouched on conflict.

  -- 2. Insert exactly one review log row.
  insert into little_lexicon.review_logs (
    user_id, word_id, rating, state_before, game_mode,
    response_ms, scheduled_days, retrievability, reviewed_at
  ) values (
    v_uid, p_word_id, p_rating, p_state_before, p_game_mode,
    p_response_ms, p_scheduled_days, p_retrievability, now()
  );

  -- 3. Resolve the user's daily goal for the goal_met computation.
  select daily_goal into v_daily_goal
  from little_lexicon.profiles
  where user_id = v_uid;
  v_daily_goal := coalesce(v_daily_goal, 15);

  -- 4. Upsert today's daily_stats. reviews_done += 1, new_learned += (is_new?1:0),
  --    xp += p_xp, and goal_met is recomputed from the post-increment reviews_done.
  --    The target is aliased "ds" so the DO UPDATE self-references are unambiguous.
  insert into little_lexicon.daily_stats as ds (user_id, day, reviews_done, new_learned, xp, goal_met)
  values (
    v_uid,
    current_date,
    1,
    case when p_is_new then 1 else 0 end,
    coalesce(p_xp, 0),
    (1 >= v_daily_goal)
  )
  on conflict (user_id, day) do update set
    reviews_done = ds.reviews_done + 1,
    new_learned  = ds.new_learned + case when p_is_new then 1 else 0 end,
    xp           = ds.xp + coalesce(p_xp, 0),
    goal_met     = (ds.reviews_done + 1) >= v_daily_goal
  returning ds.reviews_done, ds.new_learned, ds.xp, ds.goal_met
    into v_reviews_done, v_new_learned, v_xp_today, v_goal_met;

  -- 5. Bump the lifetime XP total on the profile.
  update little_lexicon.profiles
  set xp_total   = xp_total + coalesce(p_xp, 0),
      updated_at = now()
  where user_id = v_uid
  returning xp_total into v_xp_total;

  return jsonb_build_object(
    'state',        p_state,
    'due',          p_due,
    'reps',         p_reps,
    'lapses',       p_lapses,
    'goal_met',     v_goal_met,
    'reviews_done', v_reviews_done,
    'new_learned',  v_new_learned,
    'xp_today',     v_xp_today,
    'xp_total',     v_xp_total
  );
end;
$$;

-- Only authenticated end users may commit reviews. Revoke the default PUBLIC
-- execute grant first so anon cannot reach it (it would raise anyway).
revoke all on function little_lexicon.submit_review(
  bigint, timestamptz, real, real, int, int, int, int,
  little_lexicon.card_state, timestamptz, int, smallint, little_lexicon.card_state,
  text, int, real, int, boolean
) from public;

grant execute on function little_lexicon.submit_review(
  bigint, timestamptz, real, real, int, int, int, int,
  little_lexicon.card_state, timestamptz, int, smallint, little_lexicon.card_state,
  text, int, real, int, boolean
) to authenticated;
