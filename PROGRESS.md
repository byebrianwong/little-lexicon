# PROGRESS

Running log of what each phase built, decisions made, and anything the next
phase needs to know. Append new notes; do not overwrite earlier ones.

## Backend SQL and Edge Functions (migrations 0002 to 0006, functions little-lexicon-*)

Covers the transactional review path, progress columns and achievements, stats
functions, the weekly leaderboard, the rate-limit ledger, and the three runtime
Edge Functions. Nothing under `src/` or `app/` was touched, and
`0001_init_little_lexicon_schema.sql` was left unchanged.

### Review commit is an RPC, not an Edge Function

`little_lexicon.submit_review(...)` (migration 0002) is a single plpgsql RPC. It does the
card upsert into `user_word_state`, the single `review_logs` insert, the
`daily_stats` upsert, and the `profiles.xp_total` bump in one implicit
transaction, so any failure rolls all four writes back together. That is the
Phase 2.3 "a failure rolls all three back" requirement, and a Postgres function
gives real transactional atomicity without a network round trip per statement.
An Edge Function would either need an explicit transaction over PostgREST (not
available) or multiple round trips that can partially fail. The function is
SECURITY INVOKER, so RLS applies and `auth.uid()` is the acting user; a caller
can only write its own rows.

The FSRS math stays in the app (ts-fsrs). The app computes the next card state
and passes the fields in; the RPC only persists them and returns aggregated
counters as JSON: `{ state, due, reps, lapses, goal_met, reviews_done,
new_learned, xp_today, xp_total }`. The RPC does NOT touch `streak_count`.
Streak reconciliation stays in the app (TS `applyGoalMet`) using the returned
`goal_met`, because it depends on yesterday's state and the freeze budget;
keeping it out of the RPC avoids double counting.

### Progress columns, achievements, stats (0003, 0004)

0003 adds `profiles.onboarded_at`, `profiles.reminder_hour` (0 to 23 check), and
`profiles.sound_enabled` (default true), plus the owner-only `achievements`
table (primary key user_id, code). 0004 adds two SECURITY INVOKER helpers:
`due_forecast(p_days)` returns one row per upcoming day with the count of
non-suspended cards due that day (zero-filled via generate_series), and
`retention_rate(p_since)` returns the fraction of reviews since a timestamp with
rating >= 3 (Good or Easy), returning 0 when there are no reviews.

### Weekly leaderboard: aggregation, segmentation, and the privacy tradeoff

`little_lexicon.weekly_leaderboard` (0005) is a VIEW (database.types declares it under
Views), columns `user_id, display_name, cohort, weekly_xp, rank_in_cohort`. It
sums `daily_stats.xp` for the current ISO week
(`day >= date_trunc('week', current_date)`) into one total per user.

Segmentation: users are grouped into fixed-size cohorts of 30, ordered by weekly
XP descending, so you are ranked against peers with similar weekly activity
rather than the whole population. This serves the SPEC section 8 goal of not
demoralizing lower-XP users. The task also allowed a stable user_id hash;
XP-adjacency was chosen because it directly matches that goal. The cohort
boundary is recomputed on read, so a user appears once they earn XP this week. A
production system would likely freeze weekly cohort membership via a scheduled
job (future work).

Privacy tradeoff: `daily_stats` and `profiles` are owner-only under RLS, so a
plain security-invoker view would only ever return the caller's own row. The
view is therefore defined `WITH (security_invoker = false)`, so it runs as the
view owner and bypasses RLS on the underlying tables (this is what Supabase's
linter flags as a "security definer view"). To keep that safe it exposes only
display_name, cohort, weekly_xp, and rank_in_cohort, and only for the caller's
own cohort (filtered by `auth.uid()`, which still resolves to the real caller
inside a definer view). No word-level data, no review history, and no other
cohort's rows are reachable through it.

### Runtime Claude features and RevenueCat: gating and rate limits

Three Edge Functions under `supabase/functions/`, all reading secrets from
`Deno.env` only (never returned to clients), supabase-js pinned at 2.45.4 via
esm.sh, Anthropic called by fetch with `claude-haiku-4-5` and the rubric cached
via `cache_control`.

- `little-lexicon-evaluate-sentence` (Phase 4.4): identifies the caller from the bearer
  JWT (anon client + Authorization header, `getUser()`), gates on
  `profiles.is_pro` read with a service-role client (403 if not Pro), rate-limits
  via `bump_ai_usage('evaluate')` (429 over the daily cap of 30), then evaluates
  with Haiku. Malformed model output degrades to
  `{ correct: null, feedback: "Saved.", logged: true }` instead of crashing.
- `little-lexicon-generate-personalized` (Phase 6.4): same auth, Pro gate, and rate limit
  (kind `generate`). For `kind: 'mnemonic'` it inserts into `little_lexicon.mnemonics`
  with `user_id` set (owner-only via RLS); for `kind: 'sentence'` it returns the
  text and never writes to shared content.
- `little-lexicon-revenuecat-webhook` (Phase 7.2): verifies the `REVENUECAT_WEBHOOK_SECRET`
  shared secret in the Authorization header (401 on mismatch), maps
  `app_user_id` (must be the Supabase user UUID) to the profile, and sets
  `is_pro` true on INITIAL_PURCHASE / RENEWAL / UNCANCELLATION / PRODUCT_CHANGE
  and false on EXPIRATION / CANCELLATION. Non-UUID ids and unhandled events are
  acknowledged with 200 and no change. Entitlement is decided server-side, never
  from a client flag.

Rate limiting: the `little_lexicon.ai_usage` ledger (0006) is one row per (user, day,
kind) and is owner-read only. Increments go through the SECURITY DEFINER
`little_lexicon.bump_ai_usage(p_kind)`, which bumps the caller's counter atomically and
returns the new value. It increments before the paid call (fail-closed), so a
rejected call still consumes a slot and bursts are throttled. Because writes only
go through this function, a client cannot forge or reset its counters.

### Notes for the next phase

- `bump_ai_usage` is a new DB function not present in the current
  `database.types.ts` Functions block. The app does not call it (only the Edge
  Functions do, on an untyped client), so `src/` still typechecks. Regenerate
  types after applying these migrations and it will appear.
- Deploy the webhook with `--no-verify-jwt` (RevenueCat cannot send a Supabase
  JWT); the shared secret is the auth. The other two functions rely on the
  default JWT verification plus their own `getUser()` check.
- For the Edge Functions' `little_lexicon`-schema calls and the app's PostgREST access to
  work, `little_lexicon` must be in the project's exposed schemas. The existing app
  already depends on this, so it should already be configured.
- On RevenueCat CANCELLATION: it currently sets `is_pro = false` as the task
  specified, but CANCELLATION usually means auto-renew off with access until
  period end. If premature revocation is a problem, revoke only on EXPIRATION.
  Flagged in the webhook README.

## Phase 1: Content and Audio Pipeline (pipeline/)

Standalone Node/TypeScript pipeline under `pipeline/`. Own `package.json`
(type module, version-pinned deps), own git-ignored `.env`, no shared source
with the app. Writes the six `little_lexicon` content tables (words, senses,
example_sentences, word_relations, mnemonics, distractors) plus the
`little-lexicon-audio` Storage bucket. Nothing outside `pipeline/` was changed except
this note.

### Final approach

Four stages behind one orchestrator (`src/run.ts`) with `--only=<stage>`,
`--dry-run`, and `--limit=N`. A single `Store` interface has two
implementations: `SupabaseStore` (live, service role, bypasses RLS) and
`JsonFileStore` (dry-run, writes `out/dry-run.json`). Both back the same
idempotency reads, so behavior matches in either mode.

- 01 ingest: parse the bundled seed list, drop multi-word and proper-noun
  candidates, lowercase-normalize, dedupe, assign `difficulty_tier` 1..5.
  Live tiers come from Datamuse `md=f`; dry-run uses a length/syllable
  heuristic.
- 02 hydrate: definitions, part of speech, synonyms, antonyms, and real
  examples. Live path uses the Free Dictionary API (Wiktionary, CC BY-SA);
  Open English WordNet is the intended primary backbone and bundling its data
  export is the documented follow-up. Source is recorded on every relation and
  example row. Real examples are `is_generated=false`.
- 03 generate: Anthropic Batch API with `claude-haiku-4-5`, a prompt-cached
  shared instruction prefix, and escalation to `claude-sonnet-5` for items that
  fail validation twice. Per sense: a plain-language definition, 3 to 5 erudite
  cloze examples, 4 to 6 distractors, one global mnemonic per word. Output is
  JSON-only, code fences stripped, Zod-validated before any write; malformed
  items are rejected and retried, never inserted.
- 04 audio: MP3 per headword and per example sentence, uploaded to
  `little-lexicon-audio` at deterministic paths (`words/<id>.mp3`,
  `sentences/<id>.mp3`), public URLs written back. Live mode reuses free human
  headword audio from the Free Dictionary API when present as MP3.

### TTS provider chosen

Google Cloud Text-to-Speech (Neural2). Reasons: generous monthly free tier
(about 1M Neural2 characters/month, which can cover the one-time corpus across
billing months), direct MP3 output, and simple API-key auth on the REST
`text:synthesize` endpoint with no service-account JSON. List price past the
free tier is about $16 per 1M characters. Env key `GOOGLE_TTS_API_KEY`, with
optional `GOOGLE_TTS_VOICE` and `GOOGLE_TTS_LANGUAGE` overrides.

### Sample word count

`data/seed-words.sample.txt` holds about 320 curated GRE headwords (plus a small
messy section that stage 01 normalizes: case variants deduped, 2 multi-word and
3 proper-noun entries dropped). It is bundled so a dry-run runs with no network.
The target production corpus is 3,000 to 8,000 words from larger seed lists.

### Idempotency approach

Every stage checks for existing rows and only fills gaps: existing headword
skipped; word with senses skipped; sense with a plain definition, 3 or more
generated examples, and 4 or more distractors skipped; word with a global
mnemonic gets none added; word or sentence with an `audio_url` is not
re-synthesized. Verified: two dry-runs at `--limit=20` produce identical row
counts (words 20, senses 20, examples 100, relations 60, mnemonics 20,
distractors 100, audio objects 120) with no duplicates, and the second run does
zero generation and zero synthesis.

### How dry-run works

If `--dry-run` is passed, or if the Supabase service credentials are absent, the
whole run goes offline: bundled seed list, deterministic stub generators (every
stub string labeled `(dry-run stub)`), and writes to `out/dry-run.json` instead
of Supabase. No API keys, no network, no spend. This is the `npm test` path
(`tsx src/run.ts --dry-run --limit=20`) and how the "runs end to end on a sample
input" acceptance criterion is met.

### Per-stage spend (dry-run estimate, limit 20)

These are the pipeline's own estimates from the offline stub run, not real API
charges (dry-run makes no calls):

- Generate: about 6,105 input and 4,155 output tokens, estimated $0.011 with
  Haiku plus the 50% batch discount and prefix caching.
- Audio: 6,774 characters synthesized, estimated $0.108 at the Neural2 rate
  (before the free tier and before human-audio reuse).
- Bucket size: about 0.79 MB for 120 clips at this limit. The pipeline tracks
  bucket bytes and flags at 0.9 GB, before the shared ~1 GB Supabase free-tier
  limit, recommending a dedicated bucket or external store at that point.

### Notes for the next phase

- The pipeline is the only writer of content tables. The app reads them via the
  content-read RLS policies in `0001_init_little_lexicon_schema.sql`.
- `words.part_of_speech` carries the primary POS; `senses` has no source column,
  so sense provenance is not stored per row (relations and examples do record
  `source`). This matches the existing schema; no migration was added.
- Live hydration currently uses the Free Dictionary API. Wiring Open English
  WordNet as the primary backbone (bundled data export, API as fallback) is the
  main follow-up for cleaner licensing.
- Verified: `npm install` and `tsc --noEmit` pass with 0 errors on Node 25;
  `npm test` runs end to end and is idempotent across repeated runs.

## App (Phases 0, 2, 3, 4, 5, 6, 7)

The Expo universal app (iOS / Android / web from one codebase) under `app/` and
`src/`. Built with Expo Router, TanStack Query for server state, Zustand for
client state, NativeWind for styling, and `ts-fsrs` for scheduling. Pinned every
dependency. `tsc --noEmit`, ESLint (flat config), 64 Jest unit tests, and a web
bundle (`expo export --platform web`) all pass.

### Data-access architecture: one backend interface, two implementations

The most consequential app-side decision. Every screen and hook talks to a
single `Backend` interface (`src/lib/backend/types.ts`), never to supabase-js
directly (CLAUDE.md rule). Two implementations satisfy it:

- `SupabaseBackend` (production): real supabase-js queries, the `submit_review`
  RPC, the stats functions, the leaderboard view, and Edge Function invocations.
- `DemoBackend` (`EXPO_PUBLIC_DEMO_MODE`, or whenever Supabase is not
  configured): a fully playable in-memory backend seeded from a bundled 12-word
  erudite corpus, persisted to AsyncStorage.

Why: no live Supabase project was provisioned during this build, and the app had
to be runnable and reviewable end to end anyway. Demo mode makes the whole loop
work with no network. The Supabase path is written against the migrations and
Edge Functions and typechecks, but was not exercised against a live database
here. To go live: set the two `EXPO_PUBLIC_SUPABASE_*` vars, apply migrations
0001-0007, deploy the functions, run the Phase 1 pipeline, and regenerate
`database.types.ts` with `npm run gen:types`.

### Phase 0 (foundations)

Expo SDK 54 / React Native 0.81 / React 19 scaffold with Expo Router typed
routes, NativeWind v4 (dark-first palette in `tailwind.config.js`), Zustand,
TanStack Query. Auth is email + Google OAuth through the backend interface;
`src/features/auth`. Route guards: `app/index.tsx` redirects by session and
onboarding state; the `(auth)`, `onboarding`, and `(app)` group layouts guard
their own access. CI (`.github/workflows/ci.yml`) runs typecheck, lint, tests
for the app and a typecheck + dry-run for the pipeline. RevenueCat is behind an
off-by-default flag and lazy-imported so no purchase UI appears unless enabled
(`src/lib/purchases.ts`). `.env.example` lists only `EXPO_PUBLIC_*`.

Deviation: `database.types.ts` is committed as a faithful hand-authored copy of
the schema so the app typechecks before a live DB exists. It carries a header
saying to regenerate it with `npm run gen:types` once the schema is applied.

### Phase 2 (SRS core)

`ts-fsrs` pinned at 4.7.1. The provided `src/srs/srs.ts` needed two small fixes
for that version: `outcomeToRating` and `review` now use the `Grade` type
(Rating minus Manual) so `scheduler.next` typechecks; 4.7.1's `Card` has no
`learning_steps` field, so that column round-trips as 0 (harmless, forward
compatible). Rating thresholds are the file's defaults: slow over 8000 ms
downgrades to Hard, fast under 3000 ms with a clean first attempt earns Easy.
Scheduling queries live in `src/features/review/queries.ts`; the review commit
path is `src/features/review/submitReview.ts`, which computes the FSRS update and
XP in TS and hands one atomic write to the backend (the `submit_review` RPC in
production). Unit tests cover `outcomeToRating`, an increasing due date after a
Good review, ordered `previewIntervals`, and a lossless card row round trip.

### Phase 3 (learning loop and first games)

`app/session.tsx` is the session runner. It builds a plan (`sessionPlan.ts`:
due reviews first up to the goal, new words fill remaining slots up to the
new-word allowance, interleaved), picks a mode per item from the escalation
ladder (`ladder.ts`), shows a one-time `WordIntro` for new words, commits every
answer, and ends with a summary. Audio is `src/lib/audio.ts`: it plays
pre-generated MP3s via `expo-audio` and falls back to on-device speech synthesis
(`expo-speech`) when a clip is missing, which is what makes audio and listening
mode work in demo mode. Typo tolerance for cloze/production is edit-distance
scaled by word length (`src/lib/text.ts`, tested). Mode selection rule per card
state: new -> multiple choice; learning -> cloze; young review -> production or
relation match; mature review -> use-it; relearning -> cloze/MC; each gated by
whether the word actually has that content.

### Phase 4 (game modes)

Shared contract: every mode is a component `({ item, mode, onOutcome,
soundEnabled }) => ...` that calls `onOutcome(GameOutcome)` once. `GameHost`
selects the mode and substitutes a free-tier fallback when a mode is Pro-gated.
Modes shipped: multiple choice (definition-to-word and word-to-definition),
cloze, production, synonym/antonym match, listening (audio-first), use-it
(writes a sentence, Pro-gated, evaluated by the `little-lexicon-evaluate-sentence` Edge
Function with a graceful degrade), and a timed speed round (`app/speed.tsx`).
Distractor selection is pure and unit tested (`optionPool.ts`) with a seeded PRNG
so option order is deterministic. Single scored attempt per encounter (one FSRS
rating per review); a hint is the main downgrade signal.

### Phase 5 (gamification)

XP is weighted by retrieval difficulty (`xp.ts`, tested): production and use-it
pay most, recognition least, wrong answers pay nothing, with first-attempt and
speed bonuses and a Hard discount. Levels are a gentle sqrt curve. Streaks
(`streak.ts`, tested) advance once per goal-met day with a limited freeze that
covers exactly one missed day; reconciliation is idempotent via
`profiles.last_goal_met_day` (migration 0007) and only ever runs off a real
goal-met day. The stats screen shows known/learning/due counts, retention from
logs, a 12-week activity heatmap, and a 14-day review forecast. The leaderboard
shows the user's weekly cohort. Achievements (`achievements.ts`, tested) unlock
on real conditions after a session. Desired retention and daily goal are
adjustable in settings; sound/haptic feedback is a persisted local setting.

### Phase 6 (onboarding and personalization)

Adaptive placement (`placement.ts`, tested): starts at tier 3, goes harder after
"know" and easier after "don't know", sets a level estimate, and marks clearly
known words with `is_known=true` so they skip the new-word queue. The tier window
for new words is centered on the estimate. Goals and interests persist to the
profile. Daily reminders are opt-in local notifications (`src/lib/notifications.ts`,
web is a no-op). Personalized memory hooks are a Pro, rate-limited Edge Function
call surfaced in the word intro.

### Phase 7 (monetization, polish, ship)

Free vs Pro limits are one source of truth (`limits.ts`): a free daily new-word
cap and core modes; Pro unlocks unlimited new words, all modes, AI features. The
paywall reads offerings from RevenueCat when enabled and offers a clearly labeled
demo unlock otherwise. Server-side entitlement is `profiles.is_pro`, set only by
the `little-lexicon-revenuecat-webhook`; the client never decides entitlement. Offline
review commits are queued to AsyncStorage and flushed once on reconnect without
duplicates (`reviewQueue.ts`); a review is committed at most once from a device.
Account management: data export (JSON) and account deletion via the
`little-lexicon-delete-account` Edge Function (cascades all per-user rows, leaves content
intact). Store-readiness docs are under `docs/` (privacy policy, data-safety
disclosure, store listing) and `eas.json` defines dev/preview/production build
and submit profiles with EAS Update channels.

### RevenueCat webhook adjustment

Changed from the initial spec: the webhook now revokes Pro only on `EXPIRATION`,
not on `CANCELLATION`. In RevenueCat, `CANCELLATION` means auto-renew was turned
off while access continues to the end of the paid period, so revoking then would
cut a paying user off early. `CANCELLATION` is acknowledged without changing
entitlement; `EXPIRATION` fires at period end and revokes.

### Verification run in this build

- `npx jest`: 9 suites, 64 tests, all pass.
- `npx tsc --noEmit`: 0 errors across app, features, and the Supabase backend.
- `npx eslint .`: 0 errors, 0 warnings.
- `npx expo export --platform web`: bundles successfully.
- Not run here (needs infra not available in this environment): iOS simulator,
  Android emulator, a live Supabase database, real EAS builds, and any paid API
  call. These are the remaining "runs on a device / against live infra" parts of
  the definition of done.

## Dependency cleanup: removed `zeego`

`zeego` (pinned at 3.0.5) was removed from `package.json` dependencies. A
repo-wide search (excluding `node_modules`) found no reference to it anywhere in
`app/`, `src/`, `pipeline/`, `supabase/`, or any config file (babel, metro,
jest, eslint, tailwind, app.json). Its only appearances were the `package.json`
entry itself and the resulting `package-lock.json` subtree. It was never wired
up, so nothing in the app used its menu primitives. Dropping it removed 848
lines from the lockfile, mostly a private nested copy of several `@radix-ui`
menu packages that only `zeego` depended on.

`react-native-purchases` looks similarly unreferenced by a plain import search
but was deliberately kept. `src/lib/purchases.ts` loads it through a dynamic
`await import('react-native-purchases')` gated on
`EXPO_PUBLIC_REVENUECAT_ENABLED`, so the native module is never initialized
unless the flag is on. Static import searches do not catch that pattern. Check
for dynamic imports before pruning any dependency that appears unused.

### Verification after the removal

- `npx tsc --noEmit`: passes, 0 errors.
- `npx eslint .`: passes, 0 errors, 0 warnings.
- `npx jest`: 9 suites, 64 tests, all pass.
- `npx expo export --platform web`: bundles successfully (1584 modules).

### Noted, not changed

`package.json` lists `react-native-css-interop` twice in `dependencies`, once as
`^0.1.22` and once as `0.1.22`. Duplicate JSON keys resolve last-wins, so the
pinned `0.1.22` is what installs and the floating entry is dead text. It is
outside the scope of this change and was left alone, but the floating `^` entry
should be deleted since this repo pins every version.
