-- 0005_leaderboard.sql
-- Weekly segmented leaderboard (Phase 5.3).
--
-- Shape: a VIEW named little_lexicon.weekly_leaderboard with columns
--   (user_id uuid, display_name text, cohort int, weekly_xp bigint, rank_in_cohort int)
-- exactly as declared in database.types.ts (Views.weekly_leaderboard).
--
-- Aggregation: sum(daily_stats.xp) for the current ISO week
-- (day >= date_trunc('week', current_date)), one total per user.
--
-- Segmentation: users are grouped into fixed-size cohorts of COHORT_SIZE (30)
-- users, ordered by weekly XP descending, so you are ranked against peers with
-- similar weekly activity rather than against the whole population. This is the
-- "avoid demoralizing low-XP users" goal from SPEC section 8. The boundary is
-- recomputed on every read; a user appears once they have earned XP this week.
-- (The task also allowed a stable user_id hash; XP-adjacency was chosen because
-- it directly serves the anti-demoralizing intent. A production system would
-- likely freeze cohort membership per week via a scheduled job; noted as future
-- work in PROGRESS.md.)
--
-- SECURITY / PRIVACY TRADEOFF:
-- daily_stats and profiles are owner-only under RLS, so a plain security-invoker
-- view would only ever return the caller's own row and could not show a cohort.
-- This view is therefore defined WITH (security_invoker = false): it executes as
-- the view owner and bypasses RLS on the underlying tables, which is what lets it
-- read other users' aggregates. To keep that safe, the view exposes ONLY
-- display_name, cohort, weekly_xp, and rank_in_cohort, and only for the members
-- of the caller's own cohort. No word-level data, no review history, and no rows
-- from other cohorts are ever reachable through it. auth.uid() still resolves to
-- the real caller inside a definer view (it reads the request JWT claim), so the
-- cohort filter below is per-caller.

create or replace view little_lexicon.weekly_leaderboard
with (security_invoker = false) as
with weekly as (
  select
    ds.user_id,
    sum(ds.xp)::bigint as weekly_xp
  from little_lexicon.daily_stats ds
  where ds.day >= date_trunc('week', current_date::timestamp)::date
  group by ds.user_id
),
scored as (
  select
    w.user_id,
    p.display_name,
    w.weekly_xp,
    -- fixed-size cohorts of 30, ordered by weekly XP desc (user_id breaks ties)
    ((row_number() over (order by w.weekly_xp desc, w.user_id) - 1) / 30)::int as cohort
  from weekly w
  join little_lexicon.profiles p on p.user_id = w.user_id
),
ranked as (
  select
    s.user_id,
    s.display_name,
    s.cohort,
    s.weekly_xp,
    rank() over (partition by s.cohort order by s.weekly_xp desc)::int as rank_in_cohort
  from scored s
)
select
  user_id,
  display_name,
  cohort,
  weekly_xp,
  rank_in_cohort
from ranked
where cohort = (select cohort from scored where user_id = auth.uid());

grant select on little_lexicon.weekly_leaderboard to authenticated;
