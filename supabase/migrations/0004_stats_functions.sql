-- 0004_stats_functions.sql
-- Progress / stats helpers for the stats screen (Phase 5.4).
-- Both run SECURITY INVOKER so RLS scopes them to the calling user via auth.uid().

-- due_forecast: for each of the next p_days days starting today, the number of
-- non-suspended cards whose due date falls on that day. Returns one row per day
-- (count 0 for empty days), so the client can render a continuous forecast.
create or replace function little_lexicon.due_forecast(p_days int)
returns table(day date, due_count bigint)
language sql
security invoker
set search_path = ''
as $$
  select
    (current_date + gs)::date as day,
    count(uws.id)             as due_count
  from generate_series(0, coalesce(p_days, 0) - 1) as gs
  left join little_lexicon.user_word_state uws
    on  uws.user_id      = auth.uid()
    and uws.is_suspended = false
    and uws.due::date    = (current_date + gs)
  group by gs
  order by gs;
$$;

revoke all on function little_lexicon.due_forecast(int) from public;
grant execute on function little_lexicon.due_forecast(int) to authenticated;

-- retention_rate: over the caller's review_logs since p_since, the fraction of
-- reviews that were successful recall (rating >= 3, i.e. Good or Easy). Returns
-- 0 when there are no reviews in the window (avoids divide-by-zero).
create or replace function little_lexicon.retention_rate(p_since timestamptz)
returns real
language sql
security invoker
set search_path = ''
as $$
  select coalesce(
    (count(*) filter (where rating >= 3))::real / nullif(count(*), 0)::real,
    0
  )::real
  from little_lexicon.review_logs
  where user_id     = auth.uid()
    and reviewed_at >= p_since;
$$;

revoke all on function little_lexicon.retention_rate(timestamptz) from public;
grant execute on function little_lexicon.retention_rate(timestamptz) to authenticated;
