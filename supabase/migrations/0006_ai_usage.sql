-- 0006_ai_usage.sql
-- Per-user daily rate-limit ledger for the gated runtime Claude features
-- (little-lexicon-evaluate-sentence Phase 4.4, little-lexicon-generate-personalized Phase 6.4).
-- One row per (user, day, kind); kind distinguishes 'evaluate' vs 'generate'.

create table if not exists little_lexicon.ai_usage (
  user_id uuid  not null references auth.users(id) on delete cascade,
  day     date  not null default current_date,
  kind    text  not null,
  count   int   not null default 0,
  primary key (user_id, day, kind)
);

alter table little_lexicon.ai_usage enable row level security;

-- Owner-read only. Writes are performed by the bump_ai_usage function below
-- (SECURITY DEFINER) invoked from the Edge Functions, so there is deliberately
-- no client insert/update/delete policy: a user cannot forge or reset counters.
do $$ begin
  create policy "own ai usage read" on little_lexicon.ai_usage
    for select to authenticated
    using (user_id = auth.uid());
exception when duplicate_object then null; end $$;

-- Atomic "reserve one" counter. Increments the caller's counter for today and
-- returns the NEW value in a single statement. Edge Functions call this before
-- doing the paid work and reject when the returned value exceeds the daily cap
-- (increment-first / fail-closed: even a rejected call consumes a slot, which
-- naturally throttles bursts). SECURITY DEFINER so it can write ai_usage despite
-- the read-only RLS policy; it still keys everything off auth.uid(), so a caller
-- can only ever bump its own row.
create or replace function little_lexicon.bump_ai_usage(p_kind text)
returns int
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := auth.uid();
  v_count int;
begin
  if v_uid is null then
    raise exception 'bump_ai_usage: not authenticated (auth.uid() is null)'
      using errcode = '28000';
  end if;

  insert into little_lexicon.ai_usage (user_id, day, kind, count)
  values (v_uid, current_date, p_kind, 1)
  on conflict (user_id, day, kind) do update
    set count = little_lexicon.ai_usage.count + 1
  returning count into v_count;

  return v_count;
end;
$$;

revoke all on function little_lexicon.bump_ai_usage(text) from public;
grant execute on function little_lexicon.bump_ai_usage(text) to authenticated;
