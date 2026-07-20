-- 0007_streak_column.sql
-- Track the last day the daily goal was met, so streak reconciliation (done in
-- the app via applyGoalMet) is idempotent and does not double-count a day.

alter table little_lexicon.profiles
  add column if not exists last_goal_met_day date;
