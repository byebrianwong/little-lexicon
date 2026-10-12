-- 0011_grant_api_access.sql
-- Let signed-in users reach their own rows through the Data API.
--
-- Supabase grants table access to the API roles only in the public schema.
-- In any other schema, a table is unreachable until it is granted, whatever
-- its RLS policies say. Before this migration only word_list (0009) and the
-- weekly_leaderboard view (0005) were granted, so every other read and write
-- from the app would fail with "permission denied".
--
-- Grants say which tables a role may touch at all. RLS still decides which
-- rows: every table here has owner-only policies (0001, 0003, 0006).
--
-- Choices:
-- - Only `authenticated` is granted. The app never reads tables signed out,
--   and the Edge Functions act as the calling user.
-- - No DELETE anywhere. User data is never hard-deleted by the app. Account
--   deletion removes the auth user, and the foreign keys to auth.users cascade.
-- - The content tables (words, senses, example_sentences, word_relations,
--   distractors) get nothing. The app reads words from its bundled file.
-- - No default privileges for future tables. Each new table's migration grants
--   what it needs, next to the RLS that protects it, as 0009 did.

grant select, insert, update on little_lexicon.profiles        to authenticated;
grant select, insert, update on little_lexicon.user_word_state to authenticated;
grant select, insert         on little_lexicon.review_logs     to authenticated;
grant select, insert, update on little_lexicon.game_sessions   to authenticated;
grant select, insert, update on little_lexicon.daily_stats     to authenticated;
grant select, insert, update on little_lexicon.achievements    to authenticated;
-- Personalized mnemonics are saved by the Edge Function as the caller.
grant select, insert         on little_lexicon.mnemonics       to authenticated;
-- Read only. bump_ai_usage (0006, security definer) does the writes.
grant select                 on little_lexicon.ai_usage        to authenticated;
