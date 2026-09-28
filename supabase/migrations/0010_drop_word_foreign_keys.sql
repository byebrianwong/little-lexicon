-- 0010_drop_word_foreign_keys.sql
-- Let per-user rows refer to words by their id in the app's words file.
--
-- Word content now ships inside the app as src/content/words.json, and the
-- pipeline no longer writes little_lexicon.words. The foreign keys below point
-- at that table, so they would reject every user row for a word from the file.
--
-- Four per-user tables had one, all on word_id:
--   user_word_state (0001), review_logs (0001), mnemonics (0001), word_list (0009).
-- mnemonics is included because personalized mnemonics are user rows.
--
-- Dropping them also removes their "on delete cascade". With it, emptying the
-- content tables would have deleted users' progress.
--
-- Nothing else changes. The content tables, their rows, and the foreign keys
-- between content tables (senses, word_relations) stay as they are.
--
-- The constraints were declared inline, so Postgres chose their names. This
-- finds them in the catalog instead of assuming the names. Running it again
-- finds nothing and does nothing.

do $$
declare
  fk record;
begin
  for fk in
    select c.conrelid::regclass as table_name, c.conname
    from pg_constraint c
    where c.contype = 'f'
      and c.confrelid = 'little_lexicon.words'::regclass
      and c.conrelid in (
        'little_lexicon.user_word_state'::regclass,
        'little_lexicon.review_logs'::regclass,
        'little_lexicon.mnemonics'::regclass,
        'little_lexicon.word_list'::regclass
      )
  loop
    execute format('alter table %s drop constraint %I', fk.table_name, fk.conname);
  end loop;
end $$;
