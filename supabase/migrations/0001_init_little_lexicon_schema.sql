-- 0001_init_little_lexicon_schema.sql
-- Initial schema for the Little Lexicon app inside the shared "games-apps" Supabase project.
-- Isolation: everything lives in schema "little_lexicon". Never create these tables in "public".
-- RLS is enabled on all per-user tables; owners can read/write only their own rows.
-- Content tables are readable by any authenticated user and writable only by the service role (pipeline).

create schema if not exists little_lexicon;

-- Let API roles see the schema. Table-level RLS still governs row access.
grant usage on schema little_lexicon to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
do $$ begin
  create type little_lexicon.card_state as enum ('new', 'learning', 'review', 'relearning');
exception when duplicate_object then null; end $$;

do $$ begin
  create type little_lexicon.relation_type as enum ('synonym', 'antonym', 'hypernym', 'hyponym');
exception when duplicate_object then null; end $$;

do $$ begin
  create type little_lexicon.content_source as enum ('wordnet', 'wiktionary', 'free_dictionary', 'datamuse', 'claude', 'user', 'manual');
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------------------
-- Content tables (seeded by the Phase 1 pipeline; read-only to clients)
-- ---------------------------------------------------------------------------
create table if not exists little_lexicon.words (
  id                bigint generated always as identity primary key,
  headword          text not null unique,
  part_of_speech    text,
  ipa               text,
  syllables         int,
  frequency_rank    int,                 -- lower = more common; from Datamuse/ngrams
  difficulty_tier   int not null default 3 check (difficulty_tier between 1 and 5),
  etymology         text,
  audio_url         text,                -- headword pronunciation MP3 in Storage
  created_at        timestamptz not null default now()
);

create table if not exists little_lexicon.senses (
  id                          bigint generated always as identity primary key,
  word_id                     bigint not null references little_lexicon.words(id) on delete cascade,
  definition                  text not null,
  plain_language_definition   text,
  sense_order                 int not null default 1,
  register                    text,      -- e.g. formal, literary, archaic
  created_at                  timestamptz not null default now()
);
create index if not exists idx_senses_word on little_lexicon.senses(word_id);

create table if not exists little_lexicon.example_sentences (
  id            bigint generated always as identity primary key,
  sense_id      bigint not null references little_lexicon.senses(id) on delete cascade,
  text          text not null,
  audio_url     text,                     -- sentence audio MP3 in Storage
  cloze_target  text,                     -- the token/span to blank for cloze games
  source        little_lexicon.content_source not null default 'claude',
  is_generated  boolean not null default true,
  created_at    timestamptz not null default now()
);
create index if not exists idx_examples_sense on little_lexicon.example_sentences(sense_id);

create table if not exists little_lexicon.word_relations (
  id             bigint generated always as identity primary key,
  word_id        bigint not null references little_lexicon.words(id) on delete cascade,
  related_lemma  text not null,           -- store lemma text; may or may not be a headword in words
  relation_type  little_lexicon.relation_type not null,
  source         little_lexicon.content_source not null default 'wordnet',
  unique (word_id, related_lemma, relation_type)
);
create index if not exists idx_relations_word on little_lexicon.word_relations(word_id);

create table if not exists little_lexicon.mnemonics (
  id          bigint generated always as identity primary key,
  word_id     bigint not null references little_lexicon.words(id) on delete cascade,
  text        text not null,
  source      little_lexicon.content_source not null default 'claude',
  user_id     uuid references auth.users(id) on delete cascade,  -- null = global; set = personalized
  created_at  timestamptz not null default now()
);
create index if not exists idx_mnemonics_word on little_lexicon.mnemonics(word_id);

create table if not exists little_lexicon.distractors (
  id               bigint generated always as identity primary key,
  sense_id         bigint not null references little_lexicon.senses(id) on delete cascade,
  distractor_lemma text not null,
  kind             text not null default 'mc',   -- mc | cloze
  difficulty       int not null default 3 check (difficulty between 1 and 5),
  source           little_lexicon.content_source not null default 'claude'
);
create index if not exists idx_distractors_sense on little_lexicon.distractors(sense_id);

-- ---------------------------------------------------------------------------
-- Per-user tables (RLS: owner only)
-- ---------------------------------------------------------------------------
create table if not exists little_lexicon.profiles (
  user_id             uuid primary key references auth.users(id) on delete cascade,
  display_name        text,
  level_estimate      int,                          -- from onboarding placement
  daily_goal          int not null default 15,      -- target reviews/new per day
  desired_retention   real not null default 0.90 check (desired_retention between 0.80 and 0.95),
  interests           text[] not null default '{}', -- for personalized mnemonics/sentences
  streak_count        int not null default 0,
  streak_freeze_count int not null default 0,
  xp_total            bigint not null default 0,
  fsrs_weights        jsonb,                         -- null = use library defaults
  is_pro              boolean not null default false, -- entitlement, set via RevenueCat webhook
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- The SRS table. One row per (user, word). Holds the full ts-fsrs card state.
create table if not exists little_lexicon.user_word_state (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  word_id         bigint not null references little_lexicon.words(id) on delete cascade,
  -- ts-fsrs Card fields:
  due             timestamptz not null default now(),
  stability       real not null default 0,
  difficulty      real not null default 0,
  elapsed_days    int not null default 0,
  scheduled_days  int not null default 0,
  reps            int not null default 0,
  lapses          int not null default 0,
  state           little_lexicon.card_state not null default 'new',
  last_review     timestamptz,
  learning_steps  int not null default 0,
  -- app fields:
  first_seen_at   timestamptz not null default now(),
  is_known        boolean not null default false,  -- skipped as already known in onboarding
  is_suspended    boolean not null default false,
  updated_at      timestamptz not null default now(),
  unique (user_id, word_id)
);
-- Primary hot path: "what is due for me now", ordered by due date.
create index if not exists idx_uws_due on little_lexicon.user_word_state(user_id, due)
  where is_suspended = false;

create table if not exists little_lexicon.review_logs (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  word_id         bigint not null references little_lexicon.words(id) on delete cascade,
  rating          smallint not null check (rating between 1 and 4), -- Again/Hard/Good/Easy
  state_before    little_lexicon.card_state,
  game_mode       text,
  response_ms     int,
  scheduled_days  int,
  retrievability  real,                    -- predicted recall at review time
  reviewed_at     timestamptz not null default now()
);
create index if not exists idx_logs_user_time on little_lexicon.review_logs(user_id, reviewed_at);

create table if not exists little_lexicon.game_sessions (
  id              bigint generated always as identity primary key,
  user_id         uuid not null references auth.users(id) on delete cascade,
  started_at      timestamptz not null default now(),
  ended_at        timestamptz,
  words_reviewed  int not null default 0,
  new_words       int not null default 0,
  xp_earned       int not null default 0,
  accuracy        real
);
create index if not exists idx_sessions_user on little_lexicon.game_sessions(user_id, started_at);

create table if not exists little_lexicon.daily_stats (
  user_id       uuid not null references auth.users(id) on delete cascade,
  day           date not null,
  reviews_done  int not null default 0,
  new_learned   int not null default 0,
  xp            int not null default 0,
  goal_met      boolean not null default false,
  primary key (user_id, day)
);

-- ---------------------------------------------------------------------------
-- Auto-create a profile row when a new auth user signs up
-- ---------------------------------------------------------------------------
create or replace function little_lexicon.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = ''
as $$
begin
  insert into little_lexicon.profiles (user_id, display_name)
  values (new.id, coalesce(new.raw_user_meta_data->>'display_name', null))
  on conflict (user_id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function little_lexicon.handle_new_user();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
-- Content tables: readable by any authenticated user, no client writes.
alter table little_lexicon.words             enable row level security;
alter table little_lexicon.senses            enable row level security;
alter table little_lexicon.example_sentences enable row level security;
alter table little_lexicon.word_relations    enable row level security;
alter table little_lexicon.distractors       enable row level security;

create policy "content read words"      on little_lexicon.words             for select to authenticated using (true);
create policy "content read senses"     on little_lexicon.senses            for select to authenticated using (true);
create policy "content read examples"   on little_lexicon.example_sentences for select to authenticated using (true);
create policy "content read relations"  on little_lexicon.word_relations    for select to authenticated using (true);
create policy "content read distractors" on little_lexicon.distractors      for select to authenticated using (true);

-- Mnemonics: global rows (user_id is null) readable by all; personalized rows owner-only.
alter table little_lexicon.mnemonics enable row level security;
create policy "read global or own mnemonics" on little_lexicon.mnemonics
  for select to authenticated using (user_id is null or user_id = auth.uid());
create policy "insert own mnemonics" on little_lexicon.mnemonics
  for insert to authenticated with check (user_id = auth.uid());
create policy "update own mnemonics" on little_lexicon.mnemonics
  for update to authenticated using (user_id = auth.uid());
create policy "delete own mnemonics" on little_lexicon.mnemonics
  for delete to authenticated using (user_id = auth.uid());

-- Per-user tables: full owner-only CRUD.
alter table little_lexicon.profiles         enable row level security;
alter table little_lexicon.user_word_state  enable row level security;
alter table little_lexicon.review_logs      enable row level security;
alter table little_lexicon.game_sessions    enable row level security;
alter table little_lexicon.daily_stats      enable row level security;

create policy "own profile"    on little_lexicon.profiles        for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own word state" on little_lexicon.user_word_state for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own logs"       on little_lexicon.review_logs     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own sessions"   on little_lexicon.game_sessions   for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
create policy "own daily"      on little_lexicon.daily_stats     for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Note: the pipeline writes content tables using the service role key, which bypasses RLS.
