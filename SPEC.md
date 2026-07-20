# SPEC.md

Architecture and product specification. This is the reference; task files implement pieces of it.

## 1. Product loop

The app has one core loop, run as a daily session.

1. A session mixes new words with reviews that FSRS says are due.
2. Each word encounter is a game task. The task type escalates with the word's maturity:
   - New / early: recognition (multiple choice, definition to word).
   - Learning: cloze (fill the blank in an example sentence).
   - Maturing: production (type the word from its definition or a synonym).
   - Mature: use it (write a sentence; optional Claude evaluation).
3. Every encounter is multimodal: the user sees the word, reads it in a sentence, and can hear it.
4. The game outcome (correct/incorrect, speed, hint used) maps to an FSRS rating (Again, Hard, Good, Easy). FSRS updates the card and schedules the next review.
5. Session ends at the daily goal or when the due queue plus the new-word allotment is exhausted. XP, streak, and stats update.

Design target from the learning research: words need roughly 8 to 14 spaced, varied, multimodal encounters to stick. The loop exists to deliver those encounters efficiently, not to maximize taps.

## 2. Architecture

```
Expo universal app (iOS / Android / web, one TS codebase)
        │  @supabase/supabase-js (via TanStack Query)
        ▼
Supabase project "games-apps"
  ├── Postgres  (schema: little_lexicon)            content + per-user SRS state + logs
  ├── Auth                                 email + OAuth
  ├── Storage   (bucket: little-lexicon-audio)      pre-generated MP3s (words + sentences)
  └── Edge Functions (little-lexicon-*)             optional runtime Claude calls, RevenueCat webhook

Offline build-time pipeline (Node, not shipped in the app)
  ├── ingest word lists
  ├── hydrate from WordNet / Wiktionary / Free Dictionary API
  ├── Claude API (batch) -> sentences, distractors, mnemonics, plain definitions
  ├── TTS (batch) -> MP3s
  └── seed Postgres + upload audio to Storage
```

The pipeline runs on the developer machine or CI, writes to Supabase once, and is not part of the runtime. Per-user runtime cost for paid APIs is therefore near zero.

### Universal-app choice

One Expo app with Expo Router web output covers native and web from a single codebase. This fits "native first, web companion." A separate small marketing site can be added later if SEO matters; do not restructure the app for that. Ref: https://docs.expo.dev/router/reference/web/

## 3. Spaced-repetition engine (FSRS)

Use `ts-fsrs`. FSRS is the modern scheduler used in Anki; it models Difficulty, Stability, and Retrievability per card and takes a "desired retention" target rather than manual ease factors. Refs: https://github.com/open-spaced-repetition/ts-fsrs and the algorithm wiki https://github.com/open-spaced-repetition/fsrs4anki/wiki/ABC-of-FSRS

Rules:

- Default desired retention 0.90. User-adjustable 0.80 to 0.95 in settings (Phase 5+).
- Persist the full FSRS card state per user-word in `little_lexicon.user_word_state` (see schema).
- Log every review to `little_lexicon.review_logs`. This is required both for analytics and for later per-user parameter optimization.
- Map game outcome to rating:
  - Incorrect answer: `Again` (1).
  - Correct but a hint was used, or response time over a slow threshold: `Hard` (2).
  - Correct: `Good` (3).
  - Correct, fast, first attempt: `Easy` (4).
- Start with FSRS default weights. Do not build per-user weight optimization until a user has accumulated enough reviews (order of hundreds to a thousand). That is a later enhancement, not launch scope.

The wrapper and mapping are implemented in `src/srs/srs.ts` (starting artifact provided).

## 4. Data model

Full DDL is in `supabase/migrations/0001_init_little_lexicon_schema.sql`. Summary of tables in schema `little_lexicon`:

Content (seeded by Phase 1, read-only to clients):

- `words` (headword, part_of_speech, ipa, syllables, frequency_rank, difficulty_tier, etymology, audio_url).
- `senses` (word_id, definition, plain_language_definition, sense_order, register).
- `example_sentences` (sense_id, text, audio_url, cloze_target, source, is_generated).
- `word_relations` (word_id, related_lemma, relation_type in synonym/antonym/hypernym).
- `mnemonics` (word_id, text, source, user_id nullable for personalized).
- `distractors` (sense_id, distractor_lemma, kind, difficulty).

Per-user (RLS: owner only):

- `profiles` (extends auth.users: level_estimate, daily_goal, desired_retention, interests, streak_count, streak_freeze_count, xp_total, fsrs_weights jsonb).
- `user_word_state` (the SRS table: due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps, first_seen_at, is_known, is_suspended). Unique on (user_id, word_id).
- `review_logs` (user_id, word_id, rating, state_before, game_mode, response_ms, scheduled_days, retrievability, reviewed_at).
- `game_sessions` (user_id, started_at, ended_at, words_reviewed, new_words, xp_earned, accuracy).
- `daily_stats` (user_id, day, reviews_done, new_learned, xp, goal_met). Drives streak and heatmap.

## 5. Content pipeline (Phase 1)

Sourcing plan, cheapest viable first:

- **Word lists:** seed from public GRE/erudite lists (for example the aggregations under https://github.com/Xatta-Trone/gre-words-collection). Curate a master list of roughly 3,000 to 8,000 words. Treat aggregated lists as seeds, not authoritative content.
- **Definitions, synonyms, antonyms, examples:** Open English WordNet (open license, structured) as the backbone. Refs: https://github.com/globalwordnet/english-wordnet and https://en-word.net/
- **Etymology, IPA, extra examples, some audio:** Wiktionary via the Free Dictionary API for prototyping. Ref: https://dictionaryapi.dev/ (sources Wiktionary, CC BY-SA; unofficial rate limits, so batch politely and cache).
- **Related words / distractor candidates / frequency:** Datamuse. Ref: https://www.datamuse.com/api/ (free; note an API key becomes required Jan 1, 2027, at 100k requests/day; this is a build-time dependency, not runtime).
- **Fresh example sentences, distractors, mnemonics, plain-language definitions:** Claude API in batch mode (see cost model). Store all generated content in Postgres so runtime never calls Claude for it.

Respect licensing: WordNet needs attribution; Wiktionary-derived verbatim text is CC BY-SA (share-alike). Owning Claude-generated derived content avoids runtime dependence on share-alike text. Merriam-Webster and Oxford are higher quality but carry commercial-licensing friction; do not wire them in unless a later decision calls for it.

## 6. Audio

- Pre-generate all audio once and cache MP3s in Storage (`little-lexicon-audio`). Do not generate audio at runtime.
- Prefer human pronunciations for headwords where freely available (Wiktionary/Commons audio surfaced by the Free Dictionary API). Fall back to TTS for coverage and for all sentence audio.
- TTS provider is a Phase 1 decision. Reasonable options by cost per 1M characters (verify before spending): Google Neural2 and Amazon Polly Neural in the mid range, OpenAI `gpt-4o-mini-tts` and `tts-1` for naturalness, ElevenLabs for the most natural output at higher cost. Google, Polly, and Azure have free monthly tiers that may cover the whole corpus.
- Corpus size is small and finite. Roughly 8,000 words plus 3 to 5 sentences each is on the order of a few million characters, a one-time cost in the tens of dollars or free within a provider's monthly free tier.

## 7. Claude API usage and cost model

Current lineup and pricing (verify at https://docs.claude.com/en/docs/about-claude/pricing before spending):

- Bulk generation: **Claude Haiku 4.5** (`claude-haiku-4-5`), $1 input / $5 output per million tokens.
- Quality tier for example sentences where Haiku output is weak: **Claude Sonnet 5** (`claude-sonnet-5`), introductory $2 / $10 per million tokens through Aug 31, 2026, then $3 / $15.
- Cost levers: Batch API is 50% off; prompt caching cuts cached input up to 90%; stacked, up to about 95%. Use the Batch API for all Phase 1 generation and cache the shared instruction prefix. Refs: https://docs.claude.com/en/docs/build-with-claude/batch-processing and https://docs.claude.com/en/docs/build-with-claude/prompt-caching

Pre-generating for roughly 8,000 words (a few example sentences, a handful of distractors, one mnemonic, and a plain-language definition each) is a few million output tokens, a one-time cost on the order of tens of dollars with Haiku plus batch. Runtime Claude use is optional and limited to gated features (for example evaluating a user's own sentence), routed through a `little-lexicon-*` Edge Function, never from the client.

Structured output: prompt the model to return JSON only, parse defensively, strip any code fences, and validate with Zod before writing to Postgres. Reject and retry malformed rows rather than inserting them.

## 8. Gamification (Phase 5)

- Engagement layer: streaks with a limited streak-freeze, XP and levels, an adjustable daily goal, a weekly segmented leaderboard, achievements, immediate positive feedback on correct answers.
- Anti-gaming rules baked in from the start: XP scales with retrieval difficulty (production and cloze award more than multiple choice), and streak credit requires genuine review completion, not trivial taps. This keeps engagement aligned with learning rather than decoupled from it.
- Progress views: words known/learning/due, retention percentage, streak, XP and level, a calendar heatmap, and a forecast of upcoming reviews.

## 9. Monetization (Phase 7, high level)

Freemium. Free tier: a capped number of new words per day and the core game modes. Pro (target around $5 to $8 per month or roughly $40 per year): unlimited new words, all game modes, advanced stats, offline audio, and the Claude-powered features. Use RevenueCat for cross-platform purchases and entitlement checks. Do not put purchase logic or entitlement decisions on the client alone; verify entitlements server-side via the RevenueCat webhook and a `profiles` entitlement flag.

## 10. Out of scope for v1

Social features beyond the leaderboard, user-authored decks, multi-language, and per-user FSRS weight optimization. Note them in `PROGRESS.md` as future work; do not build them in the initial phases.
