-- 0015_due_forecast_local_days.sql
-- Fixes the Progress screen's "Upcoming reviews" forecast. It disagreed with
-- the Due count above it in three ways:
--
-- 1. Words due before today were in no bar. Due counts every word with
--    due <= now, overdue words included, so today's bar could be lower than
--    Due. Overdue words now count in today's bar.
-- 2. Words marked known were counted. Due, the session's due queue and the
--    demo backend leave them out. The forecast now does too.
-- 3. Days were the database's days (UTC on Supabase). The rest of the app uses
--    the device's local days (src/lib/date.ts). due_forecast_local takes the
--    day boundaries from the device.
--
-- 0004 is applied, so this file replaces its function rather than editing it.

-- due_forecast_local: p_day_ends holds the local midnight that ends each day
-- of the forecast, today first, in ascending order (forecastWindow in
-- src/features/stats/forecast.ts). Returns one row per day, day_index 0 for
-- today, with count 0 for empty days. Words due after the last day are left
-- out.
create or replace function little_lexicon.due_forecast_local(p_day_ends timestamptz[])
returns table(day_index int, due_count bigint)
language sql
stable
security invoker
set search_path = ''
as $$
  select
    gs              as day_index,
    count(b.bucket) as due_count
  from generate_series(0, coalesce(cardinality(p_day_ends), 0) - 1) as gs
  left join (
    -- width_bucket returns 0 for a due date before p_day_ends[1], so overdue
    -- words count in today's row. It returns i for a due date at or after
    -- p_day_ends[i] and before p_day_ends[i + 1].
    select width_bucket(uws.due, p_day_ends) as bucket
    from little_lexicon.user_word_state uws
    where uws.user_id      = auth.uid()
      and uws.is_suspended = false
      and uws.is_known     = false
      and uws.due          < p_day_ends[cardinality(p_day_ends)]
  ) b on b.bucket = gs
  group by gs
  order by gs;
$$;

revoke all on function little_lexicon.due_forecast_local(timestamptz[]) from public;
grant execute on function little_lexicon.due_forecast_local(timestamptz[]) to authenticated;

-- due_forecast (0004) stays for app versions published before this
-- migration, which call it by name. It gets the overdue and known-word fixes
-- but still uses the database's days. Its grants from 0004 carry over. Drop it
-- once no installed app calls it.
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
    and uws.is_known     = false
    and greatest(uws.due::date, current_date) = (current_date + gs)
  group by gs
  order by gs;
$$;
