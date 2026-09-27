-- 0008_drop_pro.sql
-- Remove the Pro entitlement. The app no longer has paid features, so nothing
-- sets or reads this flag. The two runtime Claude features stay gated by
-- sign-in and the per-user daily cap in ai_usage (0006).

alter table little_lexicon.profiles
  drop column if exists is_pro;
