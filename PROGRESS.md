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

### Deduplicated `react-native-css-interop`

`package.json` listed `react-native-css-interop` twice in `dependencies`, once
as `^0.1.22` and once as `0.1.22`. Duplicate JSON keys resolve last-wins, so the
pinned `0.1.22` was already the version installing and the floating `^` entry
was dead text. The floating entry violated the repo rule that every version is
pinned, and the duplicate was a hazard: reordering or reformatting the
dependency block could silently swap which value wins and allow a minor-version
float.

One entry remains, `"react-native-css-interop": "0.1.22"`, in the alphabetically
correct slot (the surviving duplicate had been sitting out of order between
`react-native-reanimated` and `react-native-safe-area-context`). This is a no-op
for what actually installs, confirmed two ways: `npm install` produced no
change to `package-lock.json`, and the web export emitted byte-identical bundle
hashes to the run before it.

## Playthrough pass: three defects found and fixed

First run of the app as a user rather than as a test suite. Played the whole
loop in demo mode on web (placement, goals, home, a six-item session covering
word intro, both multiple-choice directions, cloze and production, summary,
back to home) and checked every tab. The loop works: adaptive placement moved
tiers correctly and estimated level 4, FSRS scheduled and persisted across a
reload, XP and levels tracked, two achievements unlocked on real conditions,
stats and forecast and leaderboard and settings and paywall all render, and
there were no console or server errors. Three defects surfaced anyway.

### The "Known" tile on Home double-counted (both backends)

Home computed its Known tile as `reviewCount + known`, but `markKnown` writes
`is_known = true` and `state = 'review'` on the same row, so every word marked
known during placement was counted twice. With six known words Home showed 12
while the Progress screen showed "Known 6" and "In review 6" from the same
query. At one point Home claimed 12 known out of 7 words that had any state row
at all, which is how the double count was spotted.

The two sets genuinely overlap, so the sum can never be right. `ProgressCounts`
now carries `knownTotal`, a real union (`is_known OR state = 'review'`) computed
in both backends: a counter in the demo backend, and a `.or(...)` count in the
Supabase backend so it stays one query. Home reads `knownTotal`. The Progress
screen was already correct and is unchanged, since it reports the two figures
separately on purpose. Verified against the same saved state that previously
displayed 12: Home now shows 6.

### Unguarded router.push stacked duplicate screens on a double tap

`router.push` appends a screen on every call, and all five push call sites were
unguarded. Two ordinary taps on "Start session" opened two stacked sessions,
both at item 1, each needing its own dismissal. This is easy to hit on a device
because the button stays live while the session screen is still bundling.

`src/lib/navigation.ts` adds `pushOnce`, which ignores a repeat push of the same
route inside a 700 ms window, and all five call sites now use it ("Start
session", "Speed round", and the three "See Pro" / "Upgrade to Pro" buttons).
The pure guard and the href keying are unit tested (8 new tests). The href type
is derived from `Parameters<typeof router.push>[0]` because expo-router does not
re-export `Href` from its entry point, which avoids a cast. Verified: three
rapid taps now open exactly one session, a deliberate re-entry after closing
still works, and the paywall opens once from a double tap.

### package.json had a duplicate dependency key

`react-native-css-interop` appeared twice, as `^0.1.22` and `0.1.22`. Later keys
win in JSON parsing so the installed version was already pinned, but the caret
violated the repo rule against floating ranges and a duplicate key hides which
line is authoritative. Fixed here and, independently, by the separate cleanup
recorded under "Deduplicated `react-native-css-interop`" above; the two changes
were identical, so merging them was a no-op. There are now no duplicate keys and
no floating ranges in either dependency block.

### Verification after the fixes

- `npx tsc --noEmit`: 0 errors.
- `npx eslint .`: 0 errors, 0 warnings.
- `npx jest`: 10 suites, 72 tests, all pass (was 9 and 64).
- Re-played the loop on web with no console or server errors.

## First native run: the iOS bundle was broken

Installed the iOS 26.5 simulator runtime and ran the app on an iPhone 17 Pro
simulator through Expo Go. No dev build and no CocoaPods were needed: this is a
managed project, and the only native modules the app imports (expo-audio,
expo-speech, expo-notifications, react-native-gesture-handler) all ship inside
Expo Go. `zeego` and `react-native-purchases` are never imported, so Expo Go
does not need them either.

The first native bundle failed outright, so the app had never been able to start
on a device:

```
The package at "node_modules/ws/lib/stream.js" attempted to import the Node
standard library module "stream".
```

The chain is `app/onboarding/goals.tsx` to `@/lib/backend` to
`supabaseBackend.ts` to `@supabase/supabase-js` to `@supabase/realtime-js` to
`ws` to Node's `stream`, which React Native does not have. Demo mode does not
avoid this: `src/lib/backend/index.ts` imports `SupabaseBackend` statically, so
the bundler pulls Supabase in whichever backend is selected at runtime.

Cause: SDK 54 sets `unstable_enablePackageExports: true`, so a package's
`exports` map takes precedence over its `browser` and `main` fields, but Expo
ships `unstable_conditionNames` empty. The `ws` exports map lists `browser`,
`import`, then `require`, and with no conditions requested the resolver fell
through to `require`, which is the Node build. Web was fine because it resolves
the `browser` condition, which is why only native broke and why every earlier
check passed.

Fix in `metro.config.js`: `config.resolver.unstable_conditionNames =
['react-native', 'browser', 'require']`. That gives `ws` its browser stub and
leaves realtime on the global WebSocket that React Native provides, which is
what the ESM build of realtime-js already expects. The app does not use realtime
channels, so nothing depends on the Node path. Considered and rejected: adding
`module` to `resolverMainFields` (changes resolution for every package), and
pointing at `dist/module/index.js` directly (hardcodes a Supabase internal
path).

After the fix the iOS bundle builds (1842 modules) and the app runs. Verified on
the simulator: the placement screen renders with correct safe-area insets around
the Dynamic Island, and tapping "I know it" advanced from "ephemeral" to the
harder "quixotic" with the progress bar moving, so the adaptive ladder works
against real touch input. Web export, typecheck, lint and all 72 tests still
pass with the new resolver config.

### Notes for the next phase

- Native is now verified on iOS only, and through Expo Go rather than a dev
  build. Android emulator is still unverified. A dev build (which needs
  CocoaPods) is still required to exercise RevenueCat and full notification
  behaviour, neither of which Expo Go supports.
- Expo Go prints two warnings that are Expo Go limitations rather than app bugs:
  `expo-notifications` is not fully supported there since SDK 53, and a
  deprecated `SafeAreaView` import warning comes from a dependency.
- Worth considering: split the backend selection so demo mode does not pull
  supabase-js into the bundle at all. A dynamic import in
  `src/lib/backend/index.ts` would cut a large dependency out of the demo path
  and would have prevented this class of failure.

## OTA updates were never actually wired up

Phase 7.5 recorded that `eas.json` "defines dev/preview/production build and
submit profiles with EAS Update channels". The channels are there, but nothing
else was: `expo-updates` was not a dependency, and `app.json` had no
`runtimeVersion`, no `updates.url`, and no `extra.eas.projectId`. Channels alone
do nothing without the update client, so an installed build would have run
correctly and then never updated.

Wired up here:

- `expo-updates` 29.0.19, pinned exactly. `npx expo install` wrote `~29.0.19`;
  changed to an exact pin to match the repo rule against floating ranges.
- `app.json` gains `runtimeVersion: { policy: "fingerprint" }`. Fingerprint
  hashes the native project, so adding a native module moves the runtime version
  and older installs stop matching updates that need native code they lack. The
  `appVersion` policy would have shipped them anyway. The `ws`/`stream` failure
  above is exactly that class of mismatch, which is why fingerprint was chosen.
- `src/lib/updates.ts` applies a published update on startup instead of on the
  next launch, which is the stock behaviour. `shouldCheckForUpdate` is split out
  as pure logic and unit tested (4 tests); the I/O wrapper never throws, so a
  failed check or an offline device cannot stop the app starting. Called from
  `app/_layout.tsx`.

Not done here, because both create or consume resources in the Expo account:
`eas init` (registers the project and writes `extra.eas.projectId`) and
`eas update:configure` (writes `updates.url`, which needs that project id), plus
the first `eas build`. Those are the remaining steps before a phone build can
receive updates.

Verified: typecheck, lint, 76 tests across 11 suites, web export, and the iOS
bundle (1852 modules) all pass with expo-updates added, and the app still runs
in Expo Go, where `Updates.isEnabled` is false so the startup check no-ops.

### The app was asking for the microphone

Running `eas init` and the first Android build surfaced this. The generated
`android.permissions` in `app.json` listed `RECORD_AUDIO` (twice, alongside
`MODIFY_AUDIO_SETTINGS` twice). The cause is `expo-audio`'s config plugin, which
adds `RECORD_AUDIO` unless it is passed `microphonePermission: false`.

The app never records. It calls only `createAudioPlayer` and
`setAudioModeAsync`, and there is no `useAudioRecorder` or any other recording
API anywhere in `src/` or `app/`. `docs/DATA_SAFETY.md` does not mention a
microphone either, so the shipped manifest and the store disclosure would have
contradicted each other, which is the kind of mismatch Play review rejects. A
vocabulary app requesting microphone access is also a poor listing.

Fixed by configuring the plugin as `["expo-audio", { "microphonePermission":
false }]` and reducing `android.permissions` to just
`["android.permission.MODIFY_AUDIO_SETTINGS"]`. Verified against the resolved
native config (`expo config --type prebuild`), not just the source file:
Android permissions are now `MODIFY_AUDIO_SETTINGS` alone, and
`NSMicrophoneUsageDescription` is undefined, so iOS will not prompt either.

Consequence worth remembering: this edit changes the fingerprint runtimeVersion,
so the Android build that was in flight when it landed can never receive updates
published afterwards. It was cancelled and rebuilt. Any future change to
`app.json` or to a config plugin has the same effect and needs a fresh build.

### An unused dependency broke the Android build

The rebuild failed in Gradle. The EAS error was only
`EAS_BUILD_UNKNOWN_GRADLE_ERROR`; the real cause was in the build log, which is
Brotli-encoded rather than gzip, so it needs
`zlib.brotliDecompressSync` to read:

```
e: .../@react-native-menu/menu/android/src/main/java/com/reactnativemenu/MenuView.kt:50:3
   'setHitSlopRect' overrides nothing.
Execution failed for task ':react-native-menu_menu:compileReleaseKotlin'.
```

`@react-native-menu/menu@1.2.2` calls `setHitSlopRect`, which no longer exists
in React Native 0.81's Kotlin API. That package was in the tree only as a peer
of `zeego@3.0.5`, and `zeego` is imported nowhere in `src/` or `app/`.

This is the same `zeego` removed by the cleanup recorded under "Dependency
cleanup: removed `zeego`" above, which landed separately on `main`. That note
treats it as dead weight worth pruning. It was more than that: it was the sole
reason the Android build could not complete. Removing it drops 37 packages and
takes `@react-native-menu/menu` out of the tree entirely. Typecheck, lint, 76
tests and the web export all still pass.

Lesson for this repo: an unused dependency is not inert once it carries native
code. Anything with an Android or iOS component gets compiled during a build
regardless of whether the JS side references it.

### Known, deliberately not fixed

`expo doctor` fails two checks on every build. Neither blocked this build (Gradle
ran 155 tasks and only the react-native-menu one failed), so both are recorded
rather than fixed:

- Duplicate native module `expo-constants`, at 18.0.9 at the root and 18.0.13
  nested under `expo/expo-asset`. Expo warns duplicates can cause unexpected
  build errors, though this build tolerated it.
- 14 packages behind their SDK 54 expected versions, including a major-looking
  mismatch on `babel-preset-expo` (14.0.4 against `~54.0.10`, which is a
  versioning-scheme change rather than 40 major versions of drift).

Both trace to the same root cause and would be resolved together by
`npx expo install --check`. That touches 14 packages at once and needs its own
verification pass, so it is left as a separate task.
- Open, not fixed: the speed round dead-ends with "Nothing to race yet" once a
  user has a state row for every word. Its pool is due cards plus brand-new
  words only (`app/speed.tsx`), so the 12-word demo corpus is exhausted after
  one session. Harmless with a production corpus of thousands, but the Home
  button gives no reason for the empty state, and it makes the speed round hard
  to exercise in demo mode. Consider falling back to already-learned words.
- `expo doctor` reports about 15 packages behind their SDK 54 expected versions
  (for example `expo@54.0.12` against `~54.0.36`). Left alone deliberately: the
  repo pins deliberately, and bumping them is its own task with its own retest.
- The interest and pace chips in onboarding render as plain views rather than
  buttons, so they expose no button role to assistive technology. Not fixed
  here; worth folding into an accessibility pass.

## Removing the artificial limits

The app shipped with a free/Pro split that rationed the experience: a 10 new
words per day cap, `use_it` locked behind Pro, and a session hard-capped at the
daily goal. None of that is wanted. Every gate is gone, and two things were
added so "no limits" is true in practice rather than only on paper.

### What was removed

- `FREE_DAILY_NEW_CAP` / `PRO_DAILY_NEW_CAP` and `hitNewWordCap`. `limits.ts`
  now exports only two fetch bounds (`NEW_WORD_FETCH_LIMIT`, `DUE_FETCH_LIMIT`).
  Those are query bounds so a large collection does not load in full, not caps
  on what a user may learn.
- `PRO_ONLY_MODES` and `isModeAllowed`. `GameHost` no longer substitutes a
  fallback mode, and `UseIt` no longer renders a paywall. Every mode is playable
  by everyone.
- The daily-goal cap in `buildSessionPlan`. The goal is now a target for streaks
  and the progress ring only; a session offers every due review and every new
  word available. Its tests were rewritten to assert the new semantics.
- The "Daily new-word limit reached" card on Home.

`profiles.is_pro` still exists and is still set server-side by the RevenueCat
webhook. Nothing in the client reads it for gating any more.

### The tier window was a hidden limiter

Removing the caps was not enough. A session still came back with 6 of the 12
demo words, because `tierWindowForLevel` fenced new words to the placement
estimate plus or minus one tier. That is a reasonable ordering heuristic and a
bad wall: a level-2 estimate made tier-4 words permanently unreachable.

The window is now a preference, not a fence. `useSessionPlan` fetches
in-window words first, then appends everything outside the window, deduplicated.
Easier words still come first; nothing is excluded. A session went from 6 items
to all 12 after this change.

### Endless practice (`app/practice.tsx`)

The scheduled session is bounded by what FSRS says is due, which is correct for
retention but means it ends. Practice is the complement: shuffled rounds over
every word in the collection, extended a round at a time, so it never runs out.

Practice deliberately writes nothing. No review log, no card reschedule, no XP.
Grading a word repeatedly in one sitting would wreck its FSRS interval and
inflate retention, so practice keeps an in-run score instead and leaves the
schedule alone. Verified by playing 39 answers over the 12-word corpus (three
full passes, still running) and confirming the store held 0 review logs and 0
state rows afterwards.

The queue and mode-selection logic live in `src/features/games/practice.ts` as
pure functions with 13 unit tests. `practiceMode` never returns a mode the word
lacks content for, and rounds are deterministic per seed.

XP is the open question here. Practice awards none, to keep levels, retention
and the leaderboard meaningful. If practice should count toward XP, that is a
one-line change plus a decision about what it does to the leaderboard.

### Browse (`app/(app)/browse.tsx`)

A new Words tab listing the whole collection, scrollable, searchable by headword
and by meaning, with tier badges. Tapping a row expands the example sentence,
the memory hook, and audio for both the word and the sentence. Backed by a new
`getAllWords()` on the `Backend` interface, implemented in both backends;
the speed round now falls back to it so it no longer dead-ends when nothing is
due (the open item recorded above).

### A bug this introduced, and the check that caught it

The first version of the browse row wrapped the whole card in a `Pressable`
with the audio buttons inside it. React Native Web renders every `Pressable` as
a `<button>`, so that produced nested buttons: invalid HTML and a React
hydration error. Typecheck, lint and all 90 tests passed anyway. Only reading
the browser console surfaced it. The toggle and the audio controls are now
siblings, verified in a clean tab with zero console errors and zero nested
buttons.

### Verification

- `npx tsc --noEmit`: 0 errors.
- `npx eslint .`: 0 errors, 0 warnings.
- `npx jest`: 12 suites, 90 tests (was 11 and 76).
- `npx expo export --platform web`: bundles.
- Played in the browser: a session now offers all 12 words instead of 6,
  practice ran 39 answers without ending, browse lists and searches all 12, and
  the console is clean.

### Note for the next phase

The 12-word demo corpus is now the binding constraint. With the gates gone,
nothing stops a user exhausting the entire collection in one sitting. Practice
papers over it by cycling, but the real fix is content: provision Supabase and
run the Phase 1 pipeline, which is still the largest untested area in the repo.

## Storybook and Chromatic

Added a Storybook build so the UI components can be reviewed in isolation, and
wired it to Chromatic for visual regression testing.

### What was built

- `.storybook/main.ts` and `.storybook/preview.tsx`, using the
  `@storybook/react-native-web-vite` framework. The components run in a browser
  through `react-native-web`, bundled by Vite.
- Stories for the design system and two feature components: `UI/Button`,
  `UI/Primitives`, `Games/OptionButton`, `Stats/Heatmap`. 22 stories total.
- `npm run storybook`, `npm run build-storybook`, and `npm run chromatic`.
- `.github/workflows/chromatic.yml`, plus a `build-storybook` step added to the
  existing CI job.

### Decisions

**Two bundlers, on purpose.** The app still builds with Metro. Storybook uses
Vite, because that is what the Storybook React Native framework supports and
what Chromatic expects. Nothing in the Metro pipeline changed.

**PostCSS is configured inline in `main.ts`, not in a root
`postcss.config.js`.** Expo's Metro web build reads a root PostCSS config, so a
file there would run Tailwind twice: once through NativeWind's Metro
transformer and once through PostCSS. Keeping the config inside the Storybook
config leaves the app build untouched.

**NativeWind needs `jsxImportSource: 'nativewind'`.** Without it the JSX
transform drops every `className`, and the stories render unstyled. This was
verified visually, not just by the build passing.

**Safe-area insets are pinned in the preview decorator.** On web,
`react-native-safe-area-context` reports no insets, and on a device it reports
real ones. Chromatic compares images, so a story whose size depends on the
environment would report a diff on every run. The decorator supplies a fixed
390x844 frame with zero insets.

**Heatmap story data is fixed, not generated.** It starts from a hardcoded date
(5 January 2026) and cycles a fixed array of review counts. Deriving the dates
from `new Date()` would make the snapshot change daily.

**The Chromatic workflow is gated on a repository variable.** It runs only when
`CHROMATIC_ENABLED` is `"true"`, so the file could be merged before the project
token exists without turning CI red. It also skips pull requests from forks,
which cannot read repository secrets.

### Stories cover only presentational components

`ui.tsx`, `OptionButton` and `Heatmap` import nothing but `react-native` and
types. The game components one level up (`Reveal`, `WordIntro`, `GameHost`)
pull in `@/lib/audio` and `@/lib/backend`, so they need mocks before they can be
storied. That is deliberate scope, not an oversight.

### Verification

- `npx tsc --noEmit`: 0 errors.
- `npx eslint .`: 0 errors, 0 warnings.
- `npx jest`: 12 suites, 90 tests, all passing. Jest does not pick up
  `.stories.tsx`.
- `npm run build-storybook`: succeeds, all 4 story files compiled.
- Served the static build and checked three stories in a browser. NativeWind
  styling renders correctly: the palette from `tailwind.config.js`, card
  borders, pill tones, and heatmap shades all match the app.

### The Chromatic project is connected

Project `little-lexicon`, id `Project:6ab197588c58110371860309`, in the
`byebrianwong` Chromatic account and linked to the GitHub repository, so
Chromatic reports results on pull requests. Build 1 published 22 snapshots and
was auto-accepted, which makes it the baseline. The id is committed in
`chromatic.config.json`; the project token is not in the repository, it is the
`CHROMATIC_PROJECT_TOKEN` GitHub secret. The `CHROMATIC_ENABLED` repository
variable is set to `true`, so the workflow is live.

Baseline build 1 was recorded on the branch this work was done on rather than
on `main`. Chromatic follows git ancestry, so the first build on `main` finds
it.

### One thing to watch

ESLint had to be told to ignore `storybook-static/`. It is git-ignored, but
ESLint does not read `.gitignore`, so running `npm run lint` after
`npm run build-storybook` reported about 16,000 problems in the generated
bundle. CI never hit this because lint runs before the build, but anyone
building locally would have. The ignore is in `eslint.config.js`.

### A merge gate this broke, and the fix

Renaming the CI job to `App (typecheck, lint, test, storybook)` silently broke
the merge gate on `main`. The branch is protected by a repository **ruleset**
(not classic branch protection, which is why a `branches/main/protection` check
returns 404 and looks unprotected), and that ruleset requires a status check
named `App (typecheck, lint, test)`. A renamed job never reports under the old
name, so the pull request sat at `mergeStateStatus: BLOCKED` with every visible
check green and nothing explaining why.

The job name is back to the original. The Storybook build still runs as a step
inside it. If the name is ever worth changing, the ruleset's required check has
to change in the same breath.

## Accessibility testing turned on

Storybook now runs axe against every story, and Chromatic reports the results.

### What it took

Three things, all required, and the missing one is silent:

1. `@storybook/addon-a11y` in `package.json` and listed in `.storybook/main.ts`.
2. `parameters.a11y` in `.storybook/preview.tsx`.
3. **Accessibility tests enabled on the project's Manage page in the Chromatic
   web app.** This one is not readable or settable through the API, and without
   it a build returns no accessibility comparisons at all. That reads as a clean
   result and is not one.

Verified the hard way: a build with the addon installed and the parameter set,
but the project switch off, returned zero accessibility comparisons on all 22
tests while correctly detecting 8 visual changes in the same build.

### Two consequences worth expecting

**The first build reports nothing.** Chromatic's accessibility model is a diff,
so the first build after switching it on has no accessibility baseline: every
comparison comes back `ADDED` with a null diff and no rule data anywhere. Rule
data appears on the second build. The build published from this branch is that
first one.

**Every story reads as changed, once.** Enabling accessibility raises the
capture count from 22 to 66, three per story instead of one. Against a baseline
taken with one capture per story, all 22 stories report a visual change. They
are not visual regressions.

### The violations it finds are real

A build with a baseline in place reported 13 standing violations across 6
stories. Three were confirmed by computing the contrast ratios directly:
white text on the primary button is 3.07:1, on danger 2.78:1, and on success
1.90:1, against the 4.5:1 that WCAG AA asks for normal text. The colours are in
`tailwind.config.js`, so this affects the app, not only the stories. The
`Loading` state also has no accessible name, because the spinner replaces the
label with nothing a screen reader can read.

None of that is fixed here. This change makes the problems visible; fixing them
is a separate piece of work and a real design decision, since the button colours
are the app's palette.

### Something to check

Every visual change on the build from this branch was marked `ACCEPTED`
immediately, with nobody accepting it. No auto-accept setting is exposed on the
Chromatic API, so the cause could not be determined from here. Worth looking at
in the project's settings: if changes accept themselves, no human ever reviews
a diff, which defeats the point of having the checks.

## The heatmap accessibility bug, and what auto-accept actually means

### One line, 171 violations

The heatmap's day cells carried `accessibilityLabel` on a bare `View`. React
Native Web renders a `View` as a `<div>` and turns `accessibilityLabel` into
`aria-label`, which ARIA prohibits on an element with no role. So axe reported
`aria-prohibited-attr` once per cell: 84 on Twelve Weeks, 31 on Partial Week,
28 each on Four Weeks and No Activity. 171 of the project's 186 reported
violations came from that single line.

The cells now declare `accessibilityRole="image"`, which is what a cell is: one
day's activity, conveyed visually. After the fix, `aria-prohibited-attr` is
zero across the whole build, and the four heatmap stories report 171 resolved
violations with no pixel change.

This is a web-surface bug only. On native, `accessibilityLabel` on a `View` is
correct.

### Auto-accept was not a broken review gate

Earlier builds showed every visual change marked `ACCEPTED` within seconds with
nobody accepting, which looked like the review gate was switched off. It was
not. A deliberate test build with two new stories and one changed story
returned all three as `PENDING`, correctly awaiting a person.

There are three ways a test reads `ACCEPTED` without a human:

- **The capture set changed.** Enabling accessibility takes a story from one
  capture to three, so every story differs from a baseline taken at one
  capture, and all of them auto-accept. That is what happened when
  accessibility was turned on.
- **A violation was resolved.** A test whose pixels are `EQUAL` but whose
  accessibility comparison reports removed violations auto-accepts. An
  improvement does not need approval to become the baseline. That is what the
  four heatmap stories do in this change.
- **A real visual change**, which does not auto-accept.

Read `status` and `result` together. `ACCEPTED` beside `EQUAL` is routine.
`ACCEPTED` beside `CHANGED`, on a build whose capture set did not move, is the
one worth investigating.

### Also here

Two stories for states nothing covered: the `Screen` chrome, and an option
label long enough to wrap. The `Progress` story now shows each bar's percentage
beside it, which is a real visual change to an existing snapshot and is the
change that proved the review gate still works.

## Branch protection on `main`

A repository ruleset named `main` now guards the default branch. It blocks
deletions and force pushes, requires a pull request (zero approvals, so you can
merge your own), and requires three status checks:

- `App (typecheck, lint, test)`
- `Content pipeline (typecheck, dry-run)`
- `Visual tests`

Repository admins can bypass the ruleset. That is per-ruleset, not per-rule, so
the force-push and deletion guards bind tokens, Actions and collaborators, but
not the owner. Splitting those two rules into a second ruleset with no bypass
actors would make them bind everyone.

GitHub turned on `require_extra_approval_for_unattributed_changes` by default
when the ruleset was created. It was set back to false. On a single-owner repo
it can demand one approval on any pull request holding commits not attributed to
the author, which the `Co-Authored-By` trailers here would trigger, and you
cannot approve your own pull request.

### Visual diffs now block

`exitZeroOnChanges` in `.github/workflows/chromatic.yml` went from true to
false, so an unreviewed visual change fails the `Visual tests` job, and the
required check holds the merge until someone accepts or denies the diff.

Two things about this are unverified:

**Fork pull requests.** The `chromatic` job is skipped on pull requests from
forks, because a fork cannot read `CHROMATIC_PROJECT_TOKEN`. A skipped Actions
job posts a check run with conclusion `skipped`, which GitHub is expected to
count as passing for a required check, but that has not been tested here with a
real fork pull request. If it does not, fork pull requests will stall at
"Expected, waiting for status". The Chromatic app's own `UI Tests` commit status
is deliberately not required for the same reason: on a fork it is never posted
at all, so it would stall for certain.

**Whether a real diff reaches the job.** The auto-accept worry recorded earlier
turned out to be unfounded, and the section above explains why: a capture-set
change and a resolved violation both auto-accept, while a genuine visual change
stays `PENDING`. The `Progress` story proved it. What is still untested is the
step after that, whether a `PENDING` test actually fails this job now that
`exitZeroOnChanges` is false. The next pull request that changes a story's
pixels will answer it.

## Sessions that do not end

The caps were removed earlier (see "Limit removal, browse and endless
practice"), but the app still felt like a once-a-day thing. The reason was the
shape of a session, not a limit: the queue was built once, and answering the
last item ended the session and pushed the user to the summary. Carrying on
meant backing out and starting again. Some screens still said so in as many
words.

### What changed

**The queue refills while you play.** `src/features/review/continuation.ts` is
the new pure module. `shouldRefill` decides when the play head is close enough
to the end to fetch more (five items). `buildRefill` merges the fetched page
onto the running queue, dropping anything already there and interleaving new
words among the due cards the way the opening plan does. The session screen
calls the backend; the module does the deciding and is unit tested (13 tests in
`continuation.test.ts`).

**Refills only serve schedulable material.** This is the constraint that shapes
the design. A session writes FSRS reviews, so it may only serve cards that are
due and words never seen. Replaying a word answered minutes earlier would wreck
its interval and inflate retention, which is why practice never writes to the
schedule. `buildRefill` therefore matches against the *whole* queue including
answered items, not just the unanswered tail, so a word cannot be graded twice
in one session.

**Running dry offers practice instead of stopping.** When a refill returns
nothing the screen shows a panel with "Keep going in practice" and "Finish and
see summary". The forced jump to the summary is gone.

**Closing the session now finishes it.** Because the queue no longer runs out,
the close button is the normal way to end a session, so it runs the wrap-up the
old end-of-queue path did: the session row, streak reconciliation and
achievements. Leaving without answering anything still just goes home. Before
this change, closing a session skipped the streak and achievements entirely.

**The progress bar shows the daily goal.** A bar filling toward the end of the
queue is meaningless when the queue grows, and it would appear to slide
backwards on every refill. The header now shows the daily goal, which is a real
target the session is free to run past, plus an "N done" count.

**Copy.** The session empty state said "today's new words are done. Come back
later or raise your daily goal in settings", which described a cap that no
longer exists. The summary said "Come back to hit your goal" and "Another
session". Both now say the session can continue.

**Page sizes.** `src/features/monetization/limits.ts` is gone, and with it the
last file from the free/Pro system. It is replaced by
`src/features/review/pageSizes.ts`, whose two constants are opening page sizes,
not caps: refills continue past them, so one sitting can reach the whole
collection.

### The paywall was advertising limits that no longer exist

`app/paywall.tsx` still listed "Unlimited new words every day" and "Every game
mode" as things Pro unlocks. Both have been free for everyone since the limits
were removed, so a free user reading it would reasonably conclude they were
capped. The benefit list now names only what Pro actually gates, and the screen
opens by saying that playing is free and unlimited.

What Pro still gates is real and deliberate: the two Edge Functions that call
Claude at runtime (`little-lexicon-evaluate-sentence` and
`little-lexicon-generate-personalized`) check `profiles.is_pro` with a
service-role client and return 403 otherwise. They cost money per call, and
CLAUDE.md requires runtime paid calls be gated. That gate was left alone. The
write-your-own game mode is playable without Pro; only the AI feedback degrades,
with "Evaluation is unavailable right now".

**Open question for Brian:** with play fully unlimited, Pro now rests on two AI
features. Whether that is enough to sell, and whether the "Free" label in
settings still makes sense, is a product call that was not made here.

### Verified

Run in demo mode on web (`npx expo start --web`, no `.env`, so the bundled
12-word corpus). Onboarding with a 10/day goal, then:

- A session ran to 13 answers in one sitting, straight past the goal of 10. The
  goal bar filled at 10 and the session carried on without interrupting.
- At the end of the material the run-dry panel appeared instead of the summary,
  and "Keep going in practice" started practice immediately.
- Closing a session after one answer produced the summary with the streak set to
  1 day and two achievements unlocked, confirming the wrap-up now runs on close.
- The refill was confirmed by temporarily setting the opening pages and the
  refill page to 3. With three due cards fetched and no unseen words left, the
  session continued to a fourth and fifth item, which can only come from a
  refill. The real values were restored afterwards.

`tsc --noEmit`, `eslint .` and `jest` all pass (103 tests, 13 suites). The one
console error seen while testing is a pre-existing NativeWind dark-mode warning,
not from this work.

Note: `node_modules` was incomplete at the start of this task (`expo-updates` and
`@storybook/react-native-web-vite` were missing, which broke the typecheck and
one test suite). A plain `npm install` fixed it; no dependency was added or
changed.

### Not done

`REFILL_PAGE` is 40 and `REFILL_LOOKAHEAD` is 5. Those were not tuned against a
real Supabase collection, only against the 12-word demo corpus. On a slow
connection a refill could in principle arrive after the user reaches the end of
the queue, in which case they would see the run-dry panel for a moment. Raising
the lookahead is the fix if that shows up.

## Story coverage for every screen

Storybook went from 24 stories of design-system pieces to 138. The 114 new ones
cover every screen a user can reach and every game mode, in the states people
actually see: loading, empty, populated, answered right, answered wrong, free
and Pro.

### The shape of the change

Each screen was split in two.

- A **view** under `src/features/<area>/<Name>View.tsx` holds the layout. It
  takes data as props and fetches nothing.
- The **screen** under `app/` keeps the hooks, mutations, navigation and
  dialogs, and passes data down.

The JSX moved unchanged, so the app looks the same. This was the only way to
get real state coverage: a screen that calls `useQuery` inside itself can only
be storied by mocking TanStack Query, the backend and expo-router, and the
result would still be one snapshot of whatever the mocks returned. A view with
props can be rendered in six states with six lines each.

Views created: `HomeView`, `BrowseView`, `StatsView`, `LeaderboardView`,
`SettingsView`, `SessionView` (runner, loading, caught-up), `PracticeView`,
`SpeedView`, `SummaryView`, `PaywallView`, `AuthFormView`, `GoalsView`,
`PlacementView`.

Views own transient UI state, such as the browse search text, the settings name
box, and chip selections. That state belongs to the screen, not the server, and
keeping it in the view makes the stories interactive.

### What the stories cover

- **Screens (78 stories, 13 screens).** Home, Browse, Stats, Leaderboard,
  Settings, Session, Practice, Speed round, Summary, Paywall, Auth (sign-in and
  sign-up), and both onboarding steps.
- **Game components (36 stories).** All six modes plus the word introduction
  and the shared reveal panel, each in its unanswered, correct and incorrect
  states, with hints where a mode has one.

Answered states are reached with Storybook `play` functions that click and type
the way a user would, so they double as interaction tests. Chromatic runs them
before it snapshots, so a broken interaction fails the build rather than
quietly snapshotting the unanswered state.

Fixture data lives in `src/stories/fixtures.ts`. Word content comes from the
bundled demo corpus rather than a second set of invented words, and every date
is a constant. Nothing reads the clock or a random seed, so a story only
changes when the code changes.

### Two Storybook stubs

`.storybook/mocks/` stands in for the two device-effect modules:

- `@/lib/audio` reaches for `expo-audio`, which needs `expo-asset`. That
  package is not installed, and Vite cannot resolve it. The stub also keeps the
  speech synthesizer quiet, which matters because the reveal panel speaks the
  word on mount and Chromatic would otherwise start a synthesizer per snapshot.
- `expo-haptics` resolves to `expo-modules-core`, which ships TypeScript source
  that re-exports types as values. Vite cannot transform that. Nothing is lost:
  `feedback.ts` already returns early on web.

Neither module has any UI, so neither is worth snapshotting.

### Three bugs the stories found

**Relation-match options had no role.** The synonym and antonym rows were
plain `Pressable`s with no `accessibilityRole`, so a screen reader read five
words with no hint that they could be tapped or that any were selected. They
now carry `accessibilityRole="button"` and `accessibilityState.selected`. The
settings and onboarding chips had the same gap and got the same fix.

**The sound switch had no name.** axe reported it as a critical violation: an
`<input role="switch">` with nothing to announce. The heading beside it is not
attached to the control. It now has an `accessibilityLabel`.

**The settings name box stayed empty.** `useState(p?.displayName ?? '')` ran
before the profile query resolved, and never re-ran, so the field was blank
even after the name loaded. The container now renders a loading state until the
profile exists, and the view mounts with the name already in hand.

### Accessibility findings left alone

These are real, they predate this change, and fixing them is a design decision
rather than a bug fix:

- **Button contrast**, already recorded above: white text on the primary,
  danger and success colours is between 1.90:1 and 3.07:1, under the 4.5:1 WCAG
  AA asks for. The new stories report it on every screen with a button, because
  it is a palette problem, not a screen problem. Fixing it is the same design
  decision it was then.
- **Locked achievement cards.** The card is dimmed to 60% opacity, which takes
  the muted description text under the contrast threshold.
- **`scrollable-region-focusable` on the tall screens.** React Native Web
  renders `ScrollView` as a scrollable div with no `tabindex`, so a keyboard
  user cannot scroll it. It affects Stats and Leaderboard. Web is the companion
  surface here, so this is worth fixing but is not urgent.

### Not covered

- `app/(app)/_layout.tsx`, the tab bar. It is an expo-router `Tabs` component,
  and rendering it in Storybook needs a router mock.
- `app/index.tsx`, which is a spinner plus a redirect.
- Session logic: which mode the ladder picks, what gets committed, how the
  queue advances. That is in `app/session.tsx` and is covered by unit tests,
  not stories.

### Verified

`tsc --noEmit`, lint and the 90 unit tests pass. Storybook builds, and all 138
stories were loaded in both the dev server and the built output with no render
errors. The app itself was run on web (full export, served, clicked through
onboarding, home, practice, browse, stats, leaderboard and settings) and on the
iOS simulator through Expo Go (placement, goals, home, practice). No Android
SDK is installed on this machine, so the Android emulator was not run.

## Answer-loop polish

Five small changes to the part of the app a user spends nearly all their time
in: answering a question and reading the reveal. None of them touch the SRS
math or what gets committed.

### What changed

- **The reveal scrolls into view.** After an answer, the reveal panel and its
  Continue button mount below the question. With four definition-length
  options they landed under the fold, so every answer cost a scroll before the
  user could move on. The session and practice runners now hand their
  ScrollView to a small context (`src/features/games/RevealScroll.tsx`), and
  the panel asks for a scroll to the end once it has laid out. The runners
  also jump back to the top when a new question arrives, so the next question
  never starts half-scrolled. Without a provider (the panel on its own, as in
  Storybook) the scroll call is a no-op.
- **The reveal says when a typo was accepted.** Cloze and production accept a
  spelling within the typo tolerance, but the panel used to say "Correct" and
  the user never learned they had misspelled the word. `gradeAnswer` in
  `src/lib/text.ts` now returns `exact`, `near` or `wrong` (unit tested), and
  the typed modes pass what was typed to the panel. A near miss reads "Close
  enough" with "You typed …" above the right spelling. A wrong typed answer
  also shows the attempt, so the user can compare it with the word that was
  wanted. Tap-to-choose modes pass nothing and look the same as before.
- **The cloze hint is visible.** It used to go in the box's placeholder, which
  disappears as soon as the user types. It now sits under the box, as the
  production hint already did, and includes the letter count.
- **The answer box has focus on arrival.** Cloze, production and the sentence
  box in "use it" set `autoFocus`, which saves a tap on every typed question
  and brings the keyboard up on native.
- **One label for giving up.** Cloze said "Reveal answer" and production said
  "Give up" for the same action. Both now say "Show answer".

### Verified

`tsc --noEmit`, lint and the 107 unit tests pass. On web (Expo dev server,
phone-sized viewport) a session was played through multiple choice, listening
and cloze: the reveal scrolled to its end with Continue on screen, the next
question started at the top, the cloze box had focus on arrival, the hint line
stayed visible with text in the box, and "sycophantz" for "sycophant" showed
"Close enough" with the attempt. The Cloze, Production and Reveal stories,
including the new near-miss, incorrect-with-attempt and gave-up stories, were
loaded in Storybook and reached their asserted end states. Not run on the iOS
simulator or Android in this pass; nothing here is platform-specific, but the
`autoFocus` keyboard behaviour on native is the one thing worth a glance.

### Known, left alone

- Button text contrast (white on the primary, success and danger colours) is
  still under WCAG AA, as recorded in earlier notes. Dark text (`#0B1020`) on
  those same colours would pass at 6:1 or better, but it changes every button
  in the app, so it stays a design call.
- `nextDueLabel` on the reveal panel is still never passed by any mode.

## Response time stops at the answer, and the reveal says when the word is back

### The bug

Every mode built its outcome inside the Continue handler, so `responseMs` ran
from the question appearing to the Continue tap. That included however long
the user spent reading the reveal, listening to the word, or reading the
example. The rating thresholds are 3 s for Easy and 8 s for Hard, so a correct
answer with a careful read of the reveal was routinely committed as Hard,
which shortens the FSRS interval, and the fast-answer Easy grade and its XP
bonus were close to unreachable.

Every mode now builds the outcome the moment the answer is given: on the tap
in multiple choice and listening, on Check or Show answer in cloze and
production, on Check in relation match, and when the sentence is handed in
for "use it" (not when the evaluation comes back). Continue only commits it.
The speed round already measured its own time correctly and is unchanged.

### The reveal's "Next review" line

`Reveal` has accepted `nextDueLabel` since Phase 3 and nothing ever passed it.
It is now filled in for scheduled sessions: "Next review in 10 minutes",
"tomorrow", "in 3 days", "in 2 months".

The date has to match what the commit schedules a moment later. FSRS fuzzes
intervals with a seed that includes the review timestamp, so a preview and a
commit made at different instants would land on different days. `GameOutcome`
therefore carries `answeredAt`, and both the preview
(`src/features/review/nextDue.ts`) and `submitReview` date the review from
it. The unit test checks the preview equals a commit at the same instant to
the millisecond, fuzz included. The offline queue path uses the same instant.

The session passes `previewNextDue` through `GameContext`; modes read it with
`useNextDueLabel`. Practice does not pass it, because practice never
reschedules, so its reveal shows no line. Storybook's game decorator does not
pass it either, so no existing story changed.

### Verified

`tsc --noEmit`, lint and the 120 unit tests pass (new: `makeOutcome`,
`formatNextDue`, `previewNextDue`). Played a session on web and saw the
"Next review" line on the reveal.

## Paper and Ink redesign

The whole app moved from the dark navy-and-indigo look to a light design
called Paper and Ink. It was chosen from six directions mocked up on
2026-09-24. Every screen changed; the logic did not.

### The design in brief

- **One typeface, Newsreader**, a serif made for reading on screens. Five
  faces are loaded (regular, italic, medium, medium italic, semibold).
- **Warm paper background and near-black ink.** Structure comes from hairline
  rules and type size. There are no cards, shadows or emoji.
- **One accent, a deep red, used like a teacher's pen.** It marks answers
  (a tick on the right one, a cross and a strike-through on a wrong pick), the
  active tab, the speed round's clock and destructive actions. The marks differ
  in shape as well as colour, so they read in greyscale.
- **One centred column, at most 640 px wide.** The same screens work on a
  phone and in a desktop browser. In a browser at 768 px or wider the tab bar
  becomes a masthead across the top. Native apps keep the tabs at the bottom
  at every size.
- New app icon, splash and favicon: "Ll" in Newsreader over a short red rule.

### Where things live

- `tailwind.config.js` holds the colours and the `font-serif-*` classes.
  `src/theme/colors.ts` repeats the colours as strings for props that need
  one (spinners, placeholders, the heatmap). `colors.test.ts` fails if the two
  drift apart.
- `src/theme/fonts.ts` lists the faces. `app/_layout.tsx` loads them and holds
  the splash screen until they are ready. If loading fails it logs a warning
  and carries on in the fallback serif.
- `src/components/ui.tsx` has the primitives. New ones: `Section` (replaces
  `Card`), `Label` (small capitals, replaces `Pill`), `Headword`, `Note`,
  `Stat`, `ListRow`, `Choice`, `TextField`, `TextButton`, `IconButton`,
  `RunnerHeader`, `EmptyState`, `CenterScreen`, `FullScreen`, `Spinner`.
  `Button` lost its `success` variant and gained `trailingIcon`.
- `src/components/Icon.tsx` draws the line icons with react-native-svg.
- `src/components/TabBar.tsx` is the text tab bar and the web masthead.
- `src/components/tw.ts` merges a component's classes with a caller's so the
  caller's win. Two Tailwind classes that set the same property are resolved
  by stylesheet order, not by the order written, so without this
  `Body className="text-[20px]"` kept the base size on some screens.

### Rules for new screens

- Pick weight with a family class (`font-serif-medium`), never `font-bold` or
  `fontWeight`. Android ignores weight on a custom font.
- `Animated.View` is not wrapped by NativeWind, so it drops `className`. Put
  spacing on a plain `View` inside it. The reveal panel's top margin never
  applied for this reason, before and during this change.
- Anything shown as a full-screen modal uses `FullScreen` (or
  `Screen insets="window"`), not the native `SafeAreaView`. The native view
  measures itself while the modal is still sliding up, sees no overlap with
  the status bar, and never measures again, so on iOS the header sat under the
  Dynamic Island. Tabs and the paywall's page sheet keep the native view,
  which handles a sheet that never reaches the top.

### Behaviour changes that came with it

- The reveal no longer springs in. On iOS the native-driven spring could stop
  at 98% scale and leave the panel inset from the question above it.
- Multiple-choice options are lettered a to d.
- Locked achievements say "Locked" in words instead of being dimmed to 60%
  opacity, which fixes the contrast finding recorded in the story-coverage
  entry.
- Buttons use their title as their accessible name, so a button showing a
  spinner still has one. Spinners are named "Loading".

### Accessibility

Before: white text on the old primary, danger and success colours failed
contrast on every screen with a button. After: axe reports no contrast
failures in any of the 145 stories. The only remaining finding is
`scrollable-region-focusable` on Stats and Leaderboard, the React Native Web
ScrollView issue already recorded above.

### Storybook and Chromatic

`.storybook/paper.css` declares the Newsreader faces from the same font
files, because Storybook never runs the app's root layout. Every snapshot
will change on the first Chromatic build after this lands. That is expected;
the baselines need accepting once.

### Verified

`tsc --noEmit`, lint and 128 unit tests pass (new: the palette check and the
class merge). `expo export --platform web` succeeds. All 145 stories render,
every play function passes, and axe shows only the known scroll-region
finding. Clicked through onboarding, home, a session's empty state, practice
(synonym match, listening, multiple choice, typed answers), Words, Progress,
Ranks and Settings on web at phone width and at 1280 px. Ran home and
practice on the iOS simulator in Expo Go. No Android SDK is installed on this
machine, so the Android emulator was not run.

## The web app is hosted on Vercel

The web build now runs at https://little-lexicon.vercel.app. Before this, the
only hosted view of the app was the Storybook on Chromatic, which shows
screens one at a time and cannot be clicked through.

### What was added

- `vercel.json`. Vercel runs `npm ci`, then `npm run build:web`, and serves
  the `dist` folder.
- `npm run build:web`, which is `expo export --platform web`.
- `.vercel/` in `.gitignore`, for anyone who links the project with the
  Vercel CLI.
- A Vercel project named `little-lexicon` in the `byebrianwongs-projects`
  team, linked to the GitHub repository. A push to `main` updates production.
  A push to any other branch builds a preview with its own URL.

### Decisions

**Every path is rewritten to `index.html`.** `app.json` sets web output to
`single`, so the export is one HTML page and the router picks the screen in
the browser. Without the rewrite, reloading `/session` or opening a shared
link to any screen other than `/` returns a 404. Vercel checks for a real
file before applying a rewrite, so the JavaScript, CSS, fonts and images are
still served as files.

**The hosted build is always in demo mode.** The build command sets
`EXPO_PUBLIC_DEMO_MODE=true`. The site runs on the bundled words, saves
progress in the browser's local storage (the demo backend's AsyncStorage),
and never contacts Supabase. Each browser keeps its own progress. This stays
true if Supabase keys are later added to the Vercel project. Pointing the
site at the real backend needs a deliberate change to `vercel.json`.

**Hashed bundles are cached for a year.** Everything under `/_expo/static/`
has a content hash in its file name, so a new build produces new names and a
long cache cannot serve stale code. `index.html` keeps Vercel's default,
which revalidates on every load.

**Build settings live in `vercel.json`, not only in the dashboard.** The
project was created with the same values, but `vercel.json` overrides them,
so the repository is the place to change them.

**The first deploy went to production from this branch.** Vercel sent the
new project's first Git deploy to production even though it came from this
branch, so `little-lexicon.vercel.app` first served this branch. Its content
was `main` plus `vercel.json`, so nothing wrong was published.

### Verified

- `npm run build:web` succeeds locally, and the same command succeeds on
  Vercel (Node 24, about 80 seconds including `npm ci`).
- Without a Vercel login, `/`, `/session`, `/practice`, `/onboarding` and an
  unknown path all return the app's HTML with status 200. The unknown path
  shows Expo Router's default "Unmatched Route" page, because the app has no
  `+not-found` route of its own.
- The entry bundle is served with `cache-control: public, max-age=31536000,
  immutable`.
- The fonts are served even though their paths contain `node_modules`.
  Vercel serves the built output as-is.
- In a browser: the app opens on placement, answering a question moves to
  question 2, and reloading `/onboarding/placement` loads the app again. The
  Newsreader faces load. The console is empty, and the only host contacted is
  `little-lexicon.vercel.app`.

### For later

- Preview deployments sit behind Vercel's login (the team default).
  Production is public.
- Vercel's newer npm skips install scripts that are not allow-listed, and
  says so in the build log (`esbuild`, `unrs-resolver`). The web export does
  not use them. If a future build step does, allow them in `package.json`.

## Full-window activities on desktop web

On a desktop browser, the session, practice, speed round and summary screens
opened as a small dialog with its own scrollbar. Expo Router draws every
modal on web wider than 768 px as a centred box, at most 586 px tall (its
iOS 26 default). A question plus its answer panel needs about 810 px, so the
question scrolled out of view as soon as the answer appeared.

### What changed

- On web these four screens now use `presentation: 'card'`, so they open as
  ordinary full-window pages (`app/_layout.tsx`). Native is unchanged and
  still uses `fullScreenModal`. This also fixes a bug: clicking outside the
  old dialog closed a session without running its wrap-up (session row,
  streak, achievements) and without showing the summary. A page has no
  outside to click.
- The session and practice runners now put their 24 px side padding inside
  the 640 px column, as every other screen does. Before, the padding sat
  outside, so on a wide window the question ran 640 px wide while the header
  above it was inset, and the close button and status did not line up with
  the text. Phones look the same, because there the column is narrower than
  640 px either way. On a tablet or a wide window the question is now 592 px
  wide, like the other screens.

### What the next change needs to know

A full question with its answer fits without scrolling when the window is at
least about 810 px tall (measured at 1280 x 800 and 1280 x 960). In a
shorter window, "What does this word mean?" questions in a session still
scroll by a few pixels after answering, because they add a "Next review"
line. Tightening the answer panel (for example putting "Hear it" on the
headword line) would fix that, but it changes the phone layout too, so it
was left alone.

### Verified

`tsc --noEmit`, lint and 128 unit tests pass. On web at 1280 x 800 and
1280 x 960, played a full session, practice across every mode, a speed
round and the summary, and measured the scroll area after each answer. At
375 x 812 the session opens as a page and scrolls to the answer as before.
Storybook renders these screens at phone width, so Chromatic should show no
changes. Not run on the iOS simulator or Android emulator; the only native
change is where the side padding sits, which gives the same layout at phone
width.

## The placement test can be skipped

A new user can now skip the intro (the placement test, then the goals
screen) and go straight to home. Home then offers the test until it is taken.

### What was added

- A "Skip for now" link at the top right of the placement screen. The
  question count moved to just under the progress bar to make room.
- A "Placement test" row at the end of the home menu, shown only while the
  test has not been taken. It opens the same intro: the test, then goals.
- `needsPlacement(profile)` in `src/features/onboarding/placement.ts`, with
  unit tests.
- A `PlacementNotTaken` story for home. The `NewAccount` home story and every
  placement story change in Chromatic, because both screens changed.

### Decisions

**No new column.** Skipping sets `onboarded_at`, so the app opens on home
from then on. It leaves `level_estimate` empty. Finishing the test always
saves a level estimate (`estimateLevel` never returns null), so an empty
estimate means the test was skipped. That is what `needsPlacement` checks.

**Leaving the intro uses `router.dismissTo('/(app)')`.** On first run there
is no home screen behind the intro, so this replaces the intro with home.
When the intro was opened from home, it pops back to that same home screen.
The old `router.replace` would have put a second copy of home on the stack.

**Retaking the intro keeps what is already saved.** The goals screen starts
from the saved daily goal and interests when the user has been through the
intro before, so a goal set in Settings is not reset to 15. The first
`onboarded_at` date is kept.

**A failed save on skip still lets the user in.** It is logged with
`console.warn`. The app opens on the test again next launch, where they can
skip again.

### Verified

- Web at phone width and 1280 px: first visit opens on the test; skip goes
  home and a reload stays on home; the home row opens the test; finishing it
  saves the level and known words, keeps the goal set in Settings, keeps the
  first `onboarded_at`, and removes the row. Skipping a retaken test leaves
  the profile unchanged. Browser back after finishing does not reopen the
  test.
- iOS simulator in Expo Go: the same skip, retake and finish flow. Finishing
  slides back to the existing home screen.
- No Android emulator on this machine, so Android was not run.

### For later

- Someone who finished the test cannot retake it. A "Retake placement test"
  entry in Settings would cover that.

## Words come from a bundled file, not Postgres

The app now teaches 317 words from `src/content/words.json`, a data file that
ships inside the app. Before this, demo mode had 12 hand-written words, and the
pipeline had only ever run as a dry run.

### What was built

- The pipeline writes its record to `pipeline/data/content-db.json` and exports
  the app's words file from it. Both are committed. The Supabase writer and the
  pipeline's `@supabase/supabase-js` dependency are gone.
- Stage 02 reads Open English WordNet 2025 instead of the Free Dictionary API.
  The release is a pinned download with a SHA-256 check.
- A new stage 05 exports the words file. It stops without writing if any word's
  id would change compared with the file already in the app.
- Stage 01 re-tiers the whole list by frequency into five equal groups.
- Stage 03's prompt asks for distractors as wrong definitions.
- A live run skips a paid stage when its key is missing. Stub text can no
  longer reach the committed files.
- `src/lib/content` loads the words file once, through a dynamic import. The
  demo backend reads it.
- Demo progress saved under the old 12-word numbering is moved to the new ids
  by headword on first load (`src/lib/backend/demo/legacyWordIds.ts`). Rows it
  cannot map are kept under `retired` in storage, never deleted.
- The 12 hand-written words moved to `src/stories/` and are still the story
  fixtures, so Chromatic snapshots do not follow the words file.
- Settings shows the WordNet credit line, which its license (CC BY 4.0)
  requires.
- `insidious` was added to the seed list so all 12 old demo words exist in the
  file.
- Pipeline unit tests run on Node's built-in test runner
  (`npm run test:unit`, and `npm test` runs them before the dry run).

### Decisions

**Word content is a file in the app.** It is read-only and the same for every
user. As a file it works offline and needs no request before a definition
shows. 317 words with dictionary content are 439 KB as written and 41 KB
compressed. On web, Metro puts the file in its own 249 KB script
(`words-*.js`), separate from the 2.8 MB entry bundle. Supabase is still the
plan for per-user data, when accounts, sync or the leaderboard are needed.

**WordNet instead of the Free Dictionary API.** SPEC.md already named Open
English WordNet as the backbone. The Free Dictionary API returned Cloudflare
522 (origin timeout) on every request on 2026-09-27. WordNet is a local
download, so runs do not depend on a volunteer service, and its license is CC
BY 4.0 rather than share-alike.

**One part of speech per word.** WordNet lists parts of speech alphabetically.
Datamuse returns them most common first, from the same request stage 01 makes
for frequency, and only that part of speech's senses are kept. The part of
speech label then matches every definition shown.

**Only dictionary examples that use the headword.** WordNet examples belong to
a synonym group, so "a passing fancy" is listed under ephemeral. Examples are
kept only when they contain the headword or a simple inflection of it, and the
cloze target is the word as written ("abated").

**Tiers are relative to the list.** With the fixed frequency cut-offs, tier 1
was empty and 274 of 316 words were in tiers 4 and 5. The new-word window is
the user's level plus or minus one, so at the default level of 2 it would have
had 42 words. Five equal groups give 63 or 64 words per tier. A tier can shift
when words are added; saved progress is unaffected because it refers to ids.

**Vulgar synonyms are dropped.** WordNet lists "ass-kisser" for sycophant and
"retarded" as the antonym of precocious. Related words are answer options, so
a short whole-word blocklist in `pipeline/src/lib/wordnet.ts` removes them.

**A distractor is a wrong definition.** The app shows distractors next to the
real definition (task 3.3), but stage 03 asked Claude for single wrong words.
One definition among three single words gives the answer away. No real content
had been generated, so nothing needed fixing in the data.

**Audio stays on the device for now.** At full size the audio is hundreds of
MB, too large to bundle. Stage 04 now writes clips to `pipeline/out/audio` and
sets no URL until a host is chosen.

**The demo backend loads once.** Screens fire several queries at once, and
each used to read storage on its own. With the id conversion that is unsafe: a
second pass does not recognize the new ids and would move all progress to
`retired`. `ensureLoaded` now shares one load promise. The test in
`demoBackend.test.ts` fails without this.

**Personalized memory hooks get the headword from the caller.** The demo
backend looked the word up by id. Story fixtures number their 12 sample words
1 to 12, so the WordIntro "Personalized" story named "aberrant" (id 2 in the
words file) on the quixotic card; Chromatic caught it on PR #17. The app was
not affected, but `generatePersonalized` now takes `headword`, like
`evaluateSentence`, so no backend has to resolve a word by id to name it.

**Jest loads the words file with require.** Jest cannot run `import()` without
Metro. `src/lib/content/importWordsFile.ts` is the one place the import
happens, and `jest.setup.ts` swaps it for a `require`. The rest of the loader
runs unchanged in tests.

**The fetch cache no longer stores server errors.** It cached every response,
so a 5xx would have repeated on every later run. It now caches 2xx and 404
only.

### Verified

- Pipeline: `tsc` passes and 16 unit tests pass. Two dry runs in a row add
  nothing the second time. A live run hydrated all 316 seed words, then 317
  with `insidious`. Rebuilding the record from scratch gave every word the same
  id, and the export check passed against the existing file.
- App: `tsc --noEmit` passes (2.4 s, so the JSON import does not slow it),
  lint is clean, and 145 unit tests pass (new: the loader, checks on the
  committed file, the id conversion, and the demo backend loading once under
  concurrent calls).
- Web, production export served locally: the words file loads as its own
  request. Placement ran 12 questions across tiers and set level 5. A session
  showed new-word cards and multiple choice. Words lists 317 entries. Settings
  shows the credit. Writing old-format progress (ids 1, 11 and 40) and
  reloading moved it to ids 99 (ephemeral) and 317 (insidious), and kept 40
  under `retired`. The only console error was a 404 from opening `/browse`
  directly, which `expo serve` does not rewrite and Vercel does.
- iOS simulator in Expo Go: the words file loads as its own module. The
  simulator had demo progress from the old numbering, and it converted (12
  known). Words lists 317 entries, and a session ran a new-word card and
  word-to-definition multiple choice. No Metro errors.
- Not run: the Android emulator (no Android SDK on this machine).

### Not done

- **Stage 03 has not run.** There is no `ANTHROPIC_API_KEY` on this machine.
  Words have dictionary content only: no plain-language definitions, no
  mnemonics, no written distractors (multiple choice uses other words'
  definitions), and 194 of 317 words have an example for the cloze game. Add
  the key to `pipeline/.env` and run `npm start` in `pipeline/`. The dry-run
  estimate scales to about $0.37 for the 557 senses.
- **Stage 04 has not run** (no TTS key), and no audio host is chosen.
- **WordNet's first sense is not always the one the GRE tests.** "derivative"
  came through as the calculus noun, and aesthetic's first sense is circular.
  Fixes: let Claude choose the sense, or edit the record by hand and re-export.
- **Supabase mode is out of date for content.** `SupabaseBackend` still reads
  the Postgres content tables, which the pipeline no longer fills;
  `user_word_state` and `review_logs` have foreign keys to `words`; and the
  `little-lexicon-generate-personalized` Edge Function reads `words` and
  `senses`. All three need to move to the words file before Supabase mode is
  turned on.
- **No snapshot shows the WordNet credit line.** Story screens sit in a fixed
  390 by 844 frame and Settings scrolls, so the line is below the frame. It
  was checked in the browser instead.

## No paid features

Monetization is gone. As of 2026-09-27 the goal is the best app possible, not
revenue, so there is no paywall, no subscription and no Pro flag.

### What was removed

- `app/paywall.tsx`, `src/features/monetization/` (the paywall view and its
  stories) and `src/lib/purchases.ts`.
- The `react-native-purchases` package, the `EXPO_PUBLIC_REVENUECAT_*`
  variables in `src/lib/env.ts` and `.env.example`, and `revenueCatEnabled` in
  `app.json`.
- The `little-lexicon-revenuecat-webhook` Edge Function.
- `Profile.isPro`, and the Membership row and "Upgrade to Pro" button in
  Settings.
- `profiles.is_pro`, dropped by migration `0008_drop_pro.sql`.

### What changed because of it

- **"Make it personal" shows for anyone who picked interests.** It used to
  need Pro as well.
- **The two AI Edge Functions no longer check Pro.** CLAUDE.md still requires
  runtime paid calls to be gated. They stay gated by sign-in and by the
  per-user daily cap of 30 calls in `ai_usage` (migration 0006), which was
  already there as a second check. Dropping the Pro check also removed their
  only use of the service-role key, so neither function needs it now.
- SPEC.md section 9, CLAUDE.md (the Payments line), README, the store listing,
  the privacy policy and the data safety form now say there are no paid
  features. `tasks/phase-7-monetization-polish.md` has a note that 7.1 and 7.2
  no longer apply.

## Discover: a feed for picking new words

The Words tab has three views now: **Discover**, **Your list** and **All
words** (the old browse list). Discover shows unseen words one per screen,
like the feed in the Vocabulary app by Monkey Taps. Each word has two
buttons: **Learn this** adds it to your list, and **I know it** marks it
known. Scrolling past a word records nothing.

Your list is the words you picked that no session has shown yet. Sessions
take new words from the list first, oldest pick first, then fall back to the
automatic order (easiest tier, most frequent). The list decides which new
words come next. It does not limit how many, because nothing does.

### Where things live

- `src/features/feed/wordOrder.ts`: pure ordering, shared by both backends.
  `orderFeed` orders the feed. `pickNewWordIds` picks a session's new words
  with the list first. `tierWindowForLevel` moved here from
  `features/review/queries.ts`.
- `src/features/feed/feedState.ts`: pure. Decides what each button press does
  and returns the writes to make.
- `src/features/feed/useFeedWords.ts`: loads the feed a page (20 words) at a
  time.
- `src/features/feed/queries.ts`: TanStack Query hooks for the list, with
  optimistic add and remove.
- `src/features/feed/FeedView.tsx` and `WordListView.tsx`: the two new views.
  `src/features/browse/WordsLayout.tsx`: the title and view switch.
- `app/(app)/browse.tsx`: the Words screen. Owns the feed state and runs
  every write.
- Backend: `getFeedWords`, `getWordList`, `addToWordList` and
  `removeFromWordList`, in both the demo and Supabase backends.
- Migration `0009_word_list.sql`: `little_lexicon.word_list (user_id, word_id,
  added_at, removed_at)` with owner-only RLS and no delete policy.

### Decisions

**A word is "new" while it has no `user_word_state` row, so the list needed
its own table.** There was nowhere to record "chosen, not started".
Removing a word sets `removed_at`; adding it again brings the same row back.
Nothing is hard-deleted.

**"I know it" is saved when the card leaves the screen, not on the tap.**
Marking a word known writes a `user_word_state` row, and undoing that would
mean deleting the row. So the tap is held as pending while the word is on
screen, and Undo just forgets it. The write happens when the user scrolls to
another word, switches view, leaves the tab, or the app goes to the
background. After that the card says "Marked as known" with no Undo. "Learn
this" is saved at once, because its undo is a soft remove.

**Only the buttons act on a word.** In the Vocabulary app a stray tap moves
on and the word is lost. Here tapping the page does nothing, and scrolling
back always shows the same word, because loaded words never change order.

**The feed's words live in screen state, not the query cache.** Home, Stats
and Ranks call `invalidateQueries()` with no filter when they come into
focus, and the Words tab stays mounted. A cached feed would refetch then,
and words just added (which the backend now excludes) would disappear from
under the user. This is the same reason the session keeps its own queue.

**The feed order is shuffled with a seed, and paging cannot move words.**
Words inside the user's tier window come first, then one tier outside it,
and so on. Each group is shuffled before anything is excluded, so asking
for page two (by excluding page one) never moves a word the user has not
reached. The seed is picked once per app start, so skipped words come back
in a different place next time.

**The Supabase backend orders words in the client.** It fetches every
word's id, tier and frequency once per app run (paged, since PostgREST
returns at most 1,000 rows per request) and uses the same functions as demo
mode. This replaced `getNewWords`' `not in (every seen id)` URL filter,
which grew with the user's history. The seen-id and list reads are paged the
same way.

**The list only returns words no session has shown.** Otherwise it would
grow for good and every read would load hundreds of words' content. The
feed remembers what was added during the current visit, so a card still
says "On your list" after a session has started that word.

**One list, no named collections.** SPEC.md keeps user-authored decks out of
v1. A single list of the app's own words is not a deck. Named collections
would come close to one.

### Two layout traps found on the way

- React Native Web only watches an element's size if the element has
  `onLayout` when it mounts. The feed first rendered a loading view and then
  swapped in a view with `onLayout` at the same position, so React reused
  the element and the size was never reported. The measuring view is now
  rendered from the first frame, with the loading state inside it.
- An error line above the list made the list shorter than the page height
  it had measured, which would misalign every page. The line is now laid
  over the top of the page.

### Verified

- `tsc --noEmit` and lint pass. 28 new unit tests, in `wordOrder.test.ts`
  and `feedState.test.ts`.
- In the browser at phone size and at 1280 px, in demo mode: the feed pages
  one word per screen; Learn this, its Undo, I know it and its Undo all
  behave as described; a pending "I know it" is stored on scrolling away and
  not before; the list shows picks in order and Remove soft-deletes; a
  session introduces listed words first and in list order; after a session
  the list drops the word it started; the end page shows when every word has
  been seen.
- On the iOS simulator (iPhone 17, Expo Go): the feed renders with the
  "Swipe up" hint, Learn this switches the card to "On your list" and the
  count appears on the switch, and a swipe settles on exactly the next word.
- `expo export --platform web` succeeds.
- After merging the 317-word file (#17): the feed loaded its second page on
  the way down (40 words loaded by word 24), each scroll still landed on one
  word, and a word added from the feed was the first new word in the next
  session. 177 unit tests pass.
- Storybook: 17 stories under Screens/Words (10 new for Discover, 4 for Your
  list, 3 existing for All words, retitled). All render, no play function
  fails, and axe finds no violations in any of them.

### Not done

- The Supabase path typechecks but has not run against a live database, like
  the rest of it. Migrations 0008 and 0009 are unapplied. Its word order reads
  ids, tiers and frequencies from the Postgres `words` table, and
  `word_list.word_id` has a foreign key to `words`. Both join the list in "Words
  come from a bundled file, not Postgres" of things to move to the words file
  before Supabase mode is turned on.
- Merged after the words file landed (#17), so demo mode's feed now draws
  on 317 words. The demo backend reads its catalog from `loadContent()`.
- Not run on an Android emulator. No Android SDK is installed on this machine.
- All words has no "Learn this" button. Adding one would let someone who
  searched for a word put it on their list.

## A bypassed Chromatic build no longer passes Visual tests

`Visual tests` could pass while visual changes were still unreviewed. On
PR #16, build 38 had 29 changes waiting for review and failed the check. The
next commit only touched a Supabase function, so TurboSnap bypassed its
build (build 39, `SKIPPED`), the Chromatic step exited 0, and every required
check was green.

### Why it happened

This is how Chromatic works, not a mistake in our config. A build is bypassed
when no story's files changed and the ancestor build passed, or is on the
same branch. The CLI then prints "The pending status will be carried over
from the most recent ancestor build that has unreviewed changes", and the
`UI Tests` commit status on that commit does read pending. But the CLI
(18.9.4) skips the step that turns a pending build into exit code 1, so
`exitZeroOnChanges: false` does nothing for a bypassed build.

It also happens while the earlier build is still running. On PR #17, commit
3e25b63 was bypassed while build 42 was running. `Visual tests` passed at
22:19:14, and build 42 finished at 22:19:47.

### What changed

A new last step in the `Visual tests` job,
`.github/scripts/check-ui-tests-status.sh`, reads the `UI Tests` status
Chromatic posted on the pull request's head commit. It passes only when that
status is success. While it is pending, it checks every 10 seconds for up to
5 minutes. It fails straight away when the status says changes "must be
accepted", and it fails if Chromatic posts no status at all. The job now asks
for `statuses: read`.

The fix for a failure is the same as before: accept or deny the changes in
Chromatic, then re-run the job. On the re-run, the step sees the status
Chromatic updated after the accept.

### Options not taken

- **Require `UI Tests` in the ruleset.** It would also catch this, and it
  turns green on accept without a re-run. It stays unrequired for the reason
  given under "Visual diffs now block": Chromatic never posts it on a fork
  pull request, so those would wait forever. The new step runs inside a job
  that forks already skip.
- **Turn off `onlyChanged`.** Every commit would capture every story (the
  bypassed build 39 skipped 427 snapshots), which the free plan cannot
  sustain.
- **Ask the Chromatic API about the branch from CI.** This is possible with a
  machine-to-machine OAuth client (the API is in private beta). It would need
  two more secrets and a hand-written query that finds the latest real build
  on the branch and handles running and superseded builds. The `UI Tests`
  status already carries that answer, worked out by Chromatic.

### For later

- If a later CLI version makes a bypassed build exit non-zero when the
  carried-over status is pending, this step becomes redundant and can go.
- The step depends on Chromatic's GitHub integration. If the project is ever
  unlinked from the repository, the step fails after 5 minutes with "posted
  no UI Tests status".

## Supabase mode reads words from the words file

Supabase mode now gets word content from `src/content/words.json`, as demo
mode does. Supabase holds only per-user data. This clears the item "Supabase
mode is out of date for content" under "Words come from a bundled file, not
Postgres", and the matching item under Discover.

### What changed

- `SupabaseBackend` reads content with `loadContent()` in `getWordContent`,
  `getAllWords`, `getPlacementWords`, `getDueQueue`, `getNewWords`,
  `getFeedWords` and `getWordList`. The last two came with Discover (#16) and
  also read the `words` table. Per-user reads (`user_word_state`, `word_list`)
  are unchanged. `mapContent.ts` is deleted; nothing else used it.
- `getNewWords` and `getFeedWords` pass the words file's words to the shared
  ordering in `features/feed/wordOrder`, so the per-run catalog fetch from
  Postgres is gone. A `WordContent` has an id, tier and frequency, so it works
  as a catalog entry as it is.
- Migration `0010_drop_word_foreign_keys.sql` drops the foreign keys to
  `little_lexicon.words` on `user_word_state`, `review_logs`, `mnemonics` and
  `word_list`. `word_list` got the same key in 0009, so it is included.
  `submit_review` (0002), `due_forecast` and `retention_rate` (0004) and the
  leaderboard view (0005) do not join content tables, so no function changed.
- `little-lexicon-generate-personalized` no longer reads `words` or `senses`.
  It takes `headword` and `definition` from the request body, and the new
  `request.ts` checks the body before the rate limit. Auth, the daily cap of 30
  and the saved mnemonic are unchanged.
- `Backend.generatePersonalized` takes `definition`. `WordIntro` sends the
  definition it shows.
- CLAUDE.md's "Word content" line and the README's go-live steps describe the
  new setup.

### Decisions

**The client sends the definition, and the function checks its shape.** The
function cannot look the word up anymore, so the prompt text comes from the
caller. A headword must be letters, spaces, hyphens or apostrophes, at most 40
characters. A definition must fit on one line (line breaks become spaces), at
most 400 characters, with no control characters. The longest in the file now
are 13 and 144. A test runs every word in the file through the check. This
does not stop a caller from sending a made-up word. It keeps the call to a
short memory aid for something shaped like a word. The daily cap and the
200-token output limit still bound the cost.

**The check runs before the rate limit.** As before for `wordId` and `kind`, a
malformed request gets a 400 without using one of the caller's 30 daily calls.
`wordId` must now be a positive integer. Before, any number passed, and a
fraction would have failed later, at the insert.

**The due queue reads past words that left the file.** The pipeline can stop
exporting a word and keep its id retired (stage 05 lists these). A user's row
for such a word can never be reviewed, so its due date never moves and it
stays at the front of the due order. With a single query of `limit` rows,
enough of these rows would empty the queue for good. `getDueQueue` now reads
more pages until it has `limit` words that are in the file. Before, the
foreign keys prevented such rows by deleting them along with the word.

**Placement gets every word.** The old Supabase query took the 30 easiest
words, and with the file's tiers those are all tier 1. Placement groups words
by tier and moves between tiers, so it needs all of them, as in demo mode.

**Dropping the keys also drops their cascade.** Each key was `on delete
cascade`, so emptying the content tables would have deleted every user's
progress. Account deletion is unaffected: user rows still cascade from
`auth.users`.

**The migration finds the keys in the catalog.** They were declared inline,
so Postgres chose their names. 0010 looks them up in `pg_constraint` and drops
what it finds. A second run finds nothing and does nothing.

### Verified

- `tsc --noEmit` and lint pass. 199 unit tests pass, 22 of them new:
  - `src/lib/backend/supabase/supabaseBackend.test.ts` (10) replaces the
    Supabase client with a fake that applies the backend's filters, orders and
    ranges. It checks that content matches the words file, that no content
    table is queried, the due order and state mapping, that a word missing
    from the file does not take a place in the queue (this test fails if the
    queue reads only one page), new-word order with the list first and the
    tier filter, what the feed leaves out, and the list.
  - `supabase/functions/little-lexicon-generate-personalized/request.test.ts`
    (12). Jest finds it there. tsc and eslint skip `supabase/functions`, so the
    two new function files were typechecked and linted once by hand with the
    app's strict settings.
- Migrations 0001 to 0010 ran in order on PGlite (Postgres 17 compiled to
  WebAssembly, installed in a scratch folder outside the project), with a stub
  `auth` schema and the API roles. Before 0010 there were six foreign keys to
  `words`, and `submit_review` for word 317 failed on
  `user_word_state_word_id_fkey`. After 0010 only the two content-table keys
  remained. `submit_review(317)` wrote the card state, the log and the day's
  stats, and `due_forecast` and `retention_rate` counted them. Inserts into
  `word_list` and `mnemonics` for a file word id worked. A second run of 0010
  changed nothing. Deleting the auth user still removed that user's rows.
- Web, demo mode: a session opened on a new-word card showing its definition,
  and "Make it personal" showed the demo hook.

### Not run

- **Nothing ran against a real Supabase project.** This machine has no `.env`
  with Supabase keys, and no Docker, so `supabase start` cannot run a local
  stack. PGlite is plain Postgres. It does not test RLS as the `authenticated`
  role, the grants PostgREST needs, or the Edge Function runtime.
- **`database.types.ts` was not regenerated.** `npm run gen:types` needs a
  local Supabase. The committed file is hand-maintained and lists no
  relationships for any table, so 0010 changes nothing in it. Regenerate it
  once a database exists.
- **Deno did not run or typecheck the Edge Function.** Deno is not installed.
  Deploy it and call it once with a real token before relying on it.
- Not run on iOS or Android. The app-side change is one prop in `WordIntro`,
  and demo mode's behavior is unchanged.

### Open questions

- **Saved personalized mnemonics are no longer shown.** The old content query
  embedded `mnemonics`, and under RLS that included the user's own. So a
  generated hook could come back as `mnemonics[0]` in All words or on the
  new-word card. The function still saves hooks, but nothing reads them now.
  To bring them back, the backend could read the user's `mnemonics` rows and
  put them first. I left this out: it was not part of the task, and the old
  order between global and personal hooks was never defined.
- **Counts include rows for words that left the file.** `getProgressCounts`
  counts every `user_word_state` row, as demo mode does. So "due now" can be
  higher than the queue once a word the user studied is removed from the file.
- The Postgres content tables are still there, with their client read
  policies. Dropping them is a separate decision.

## Generated content for all 317 words, written by Gemini

Every word now has a plain-language definition, generated example sentences
(so every word supports the cloze game), wrong definitions for multiple choice,
and a memory hook. Before this, words had WordNet content only.

### What was built

- Stage 03 can use Google Gemini when `GEMINI_API_KEY` is set and
  `ANTHROPIC_API_KEY` is not (Brian's choice; there was no Anthropic key). It
  calls the REST `generateContent` endpoint with a JSON response schema, so no
  new dependency. Eight senses go in each request, and every item passes the
  same Zod schema as Claude output before it is written.
- Each request tries `gemini-3.8-flash`, then `gemini-3.7-flash`, then
  `gemini-3.5-flash-lite` (`GEMINI_MODEL` overrides the list). Results are
  saved as each request returns. If no model answers, or every daily quota is
  spent, the stage stops, the export still runs, and the next run continues.
- Generated rows record `source: 'gemini'`. The schema now rejects em dashes.
- The Claude prompt text is unchanged; its field list and rules are shared with
  the Gemini prompt.

### What happened on the run

The free tier was unreliable. `gemini-3.8-flash` answered 503 "high demand"
for minutes at a time, then its free daily quota ran out after about 20
requests (most spent on failed attempts and diagnosis). `gemini-3.7-flash`
wrote 16 senses before its quota ran out. `gemini-3.5-flash-lite` wrote the
other 537. `gemini-3.8-flash` wrote the 4 senses of the first 3 words in a test
run. 553 senses, 0 rejected, about 175,000 tokens: $0.31 if billed at paid
rates, $0 on the free tier.

### Quality, from a read of samples

- Plain definitions and example sentences are good.
- Wrong definitions are usable but often too easy (for capricious: "Related to
  the study of capybaras and similar rodents"). 23 of 2,617 repeat across
  words. At least one has a typo ("Ressembling lace"). The 3.8-flash sample was
  clearly better: its wrong definitions were real meanings of look-alike words.
- Memory hooks are often weak or incoherent (ubiquitous: "you-be-quitters
  because ubiquitous things are everywhere you quit looking for them"). They
  show on every new-word card.
- Three hooks had em dashes; they were fixed by hand in the record.
- "derivative" is still taught as the calculus noun (a WordNet sense choice),
  and its generated content follows that sense.

### Verified

- Pipeline: `tsc` and 28 unit tests pass (new: the Gemini client, fallback,
  rate limits and outages against a fake server, and em dash rejection).
- App: `tsc`, lint and 177 unit tests pass against the new words file (every
  cloze target appears in its sentence, every tier has words).
- Web export: the words script is 812 KB (197 KB compressed), still separate
  from the 2.85 MB entry bundle. In the browser, a new-word card showed the
  plain definition, an example and a memory hook, and multiple choice used the
  generated wrong definitions. No console errors.

### For later

- The weak hooks and easy distractors could be regenerated with
  `gemini-3.8-flash` once its daily quota resets. Stage 03 only fills gaps, so
  that needs a flag to regenerate existing rows, or deleting the rows first.
- At this size a words file for 8,000 words would be about 5 MB compressed.
  Split it (by tier, for example) before the list grows that far.
- The Gemini key was pasted into a chat on 2026-09-27. Rotate it.

## Word curation inside Claude Code sessions, with no paid API

Word entries are now improved by the Claude Code session itself: its model
reads entries, scores them against a rubric, rewrites what is weak, and tools
in `pipeline/` check and apply the result. No API key and no per-token cost.
The process is the `improve-words` project skill,
`.claude/skills/improve-words/SKILL.md`.

### What was built

- `pipeline/src/curate.ts` with four commands: `status`, `next` (writes a
  worksheet of 10 to 15 words to `pipeline/out/curate/`), `check` and `apply`.
  `apply` refuses the whole worksheet if any word fails, then writes the record
  and exports `src/content/words.json`.
- `pipeline/src/lib/curate.ts`: the worksheet format, the rubric's criteria
  (`sense`, `definition`, `plain`, `examples`, `wrongAnswers`, `hook`,
  `related`, scored 1 to 5, done at 4 or more), and the fixed checks.
- A `reviews` table in the record. Each review keeps its rubric version, scores,
  verdict (`pass`, `fixed` or `flagged`), changed fields and notes.
- The Gemini `generate` and `revise` stages skip reviewed words, so they cannot
  overwrite curated content.
- `.gitignore` now commits `.claude/skills/` while the rest of `.claude/`
  (worktrees, launch.json) stays local.

### Decisions

**The fixed checks cover what code can judge.** The plain definition must not
name the word, because the "which word means" question shows it as the prompt
(12 words gave the answer away). Examples must be full sentences that use the
word, with the cloze target as written. Each wrong answer needs a look-alike
word that WordNet lists with the target's part of speech, and no wrong answer
may repeat across words. No em dashes. The hook must name the word. Related
words must be in WordNet and not offensive. Quality beyond that is the rubric's
job, and the scores are stored so it can be audited.

**Only the first sense is curated.** Every screen and game uses it. Changing a
word's part of speech drops its other senses, because they belong to the old
part of speech.

**The skill lives in the repo.** Any session on any machine finds it, and the
rubric changes together with the tools and the content. Bumping
`RUBRIC_VERSION` marks every word unreviewed again.

### First batch

13 words, all `fixed`: 9 of the 12 plain-definition giveaways, plus aesthetic, ascetic and
precipitate (definitions that named the word), and derivative. derivative is
now the adjective ("Copied or adapted from the work of others; not original.")
and precipitate the verb; both keep their ids. A deliberately broken copy of
the worksheet failed with all three planted errors.

### Verified

- Pipeline: `tsc` and 48 unit tests pass (new: curation checks, review rules,
  reading the record), and the dry run still passes.
- App: `tsc`, lint and 199 unit tests pass against the new words file.

### Second review (added the same day)

The writer scoring its own work proved unreliable. A second reviewer (a subagent
that did not write the content) failed 9 of the 13 words the writer had scored 4
or 5. Its main finding: definitions and wrong answers that reproduced Oxford,
Cambridge or Longman wording, confirmed by web search. Models write stock
dictionary definitions without noticing. It also caught related words from the
wrong sense, weak look-alikes (mystic for caustic), examples that give no clue
in the cloze game, and a duplicate sense (catalyst had its everyday meaning twice
and had lost the chemistry one).

What changed in the process:

- `check` and `apply` now require the second reviewer's scores
  (`checker.scores`). A word passes only when both reviewers give 4 or more, or
  when it is flagged. Reviews store `checker_scores` and `checker_notes`.
- The skill holds the exact prompt for the second reviewer, and the line on
  copying: a whole dictionary definition, word for word or with one word
  changed, scores 3; short shared phrasing can score 4. After three review
  rounds a word is flagged instead of looping.
- `otherSenses` is editable and checked (no repeats of the first sense, no
  naming the word). The giveaway check now also catches words built on the
  headword ("aesthetically", "abatement").
- `next` picks words reviewed without a second reviewer first.

All 13 words went through it: three rounds for most, four for aesthetic and
precipitate. Final result: 12 fixed, 1 pass, 0 flagged, every second-reviewer
score 4 or more.

The Gemini first pass probably contains copied dictionary phrasing too, mostly
in wrong answers. Curation will catch it word by word.

### Where to pick up

- Follow `.claude/skills/improve-words/SKILL.md`, starting at "Start here".
- `cd pipeline && npx tsx src/curate.ts status` shows progress. On 2026-10-17
  (after adding 100 more words): all 579 taught words reviewed (26 more are retired), 1 flagged (assiduous, one weak wrong answer), 0 to go. Every word has
  a plain definition, 3 or more examples, 4 or more wrong answers with
  look-alikes, a hook and a pronunciation. anachronism, euphemism,
  idolatry and misanthrope have no synonyms on purpose (none fit without giving the word
  away), so they skip the synonym game.
- Next passes are optional polish. Reviewers' 4s often carry a note on the
  weakest point (`reviews[].checker_notes` in the record); those are the
  place to start. Pronunciations are outside the rubric; see
  "Pronunciation" in the skill.
- To add new words, follow "Adding new words" in the skill.
- For a request like "improve 100 more words", follow "Big runs" in the
  skill: `next --count=100 --split=8`, one writer and one reviewer subagent
  per worksheet, `check` all the worksheets together, then apply them one at
  a time. Read "Traps found so far" first.
- Plan for up to three second-review rounds per word. Most words need one.
- Add a line below for each batch: date, words, verdicts, anything learned.
  Add new failure patterns to "Traps found so far" in the skill.

### Curation log

- 2026-10-04: 13 words (aesthetic, ascetic, capricious, castigate, catalyst,
  caustic, derivative, precipitate, prolific, propensity, propitiate, prosaic,
  reticent). 12 fixed, 1 pass. derivative became the adjective and precipitate
  the verb.
- 2026-10-05: 100 words, from bolster to esoteric in `next` order: bolster,
  impassive, reverent, sagacious, salubrious, then abate through esoteric
  alphabetically. All 100 fixed, 0 flagged. Status now: 113 of 317 reviewed,
  204 to go.
  - How it ran: 8 worksheets of 12 or 13 words. A writer subagent edited each
    one, and a separate reviewer subagent scored it. The main session fixed
    what the reviewers found, sent the changed words back for a second score,
    and applied the worksheets one at a time.
  - The writers were told the last batch's failure list up front: copied
    dictionary wording, weak look-alikes, clueless examples, wrong-sense
    related words, false etymology. They searched the web for their own
    stock-sounding definitions before handing back. On the first review, 15
    of 100 words failed (on the first batch, 9 of 13 did). All 15 passed on
    round 2.
  - What still failed: copied wording, mostly in wrong answers (Oxford,
    Longman, Cambridge, Merriam-Webster Learner's), on 9 words. Other single
    failures: false hooks (sage is not the root of sagacious; cajole does not
    sound like jolly), a near-duplicate other sense (credulous), a rare
    synonym (misdating for anachronism), and WordNet's clumsy boorish
    definition.
  - enervate had kept WordNet's "disturb the composure of" sense. That is
    the misreading tests use the word to catch, so it was dropped. Check
    other words for WordNet senses like this.
  - First senses changed: buttress went from noun to verb ("buttress an
    argument"), and its old meaning is now a verb other sense. These kept
    their part of speech but got a new first sense: abstain, admonish,
    aggrandize, articulate, assuage, audacious, candor, conciliatory,
    convoluted, dubious. Where the old sense was still useful, it is kept as
    an other sense.
  - disseminate's hook ended in stray markup from an earlier generation pass
    (backticks, braces, "[instruction]"). It is replaced. A scan of
    words.json found no other text like it.
  - `check` compares wrong answers only with words already in the record. So
    two worksheets edited in parallel can use the same wrong answer, and only
    the second `apply` refuses it. A script over all 8 worksheets found one
    early (an emanate meaning used by both amalgamate and emulate), and it was
    reworded during the review round instead of after a failed apply.
  - Tooling added afterwards for the next run: `next --split=K` writes K
    worksheets, `check` takes several worksheets and checks them against each
    other, and the checks reject markup, code symbols and invisible
    characters. The skill has a "Big runs" section with the writer prompt and
    a "Traps found so far" list.
- 2026-10-10: 100 more words, eulogy to penchant in record order. All 100
  fixed, 0 flagged. Status now: 213 of 317 reviewed, 104 to go.
  - How it ran: the "Big runs" process, 8 worksheets of 12 or 13 words, one
    writer and one reviewer subagent each. The main session fixed every
    finding itself and sent the changed words back. 51 words failed the
    first review, 9 the second, 1 the third (obtuse, which got a one-word
    fourth round).
  - Most failures were copied wording again, about 35 of the 51, mostly in
    wrong answers. WordUp (dictionary.wordup.com.tw) joined the list of
    sources the reviewers matched, with Dictionary.com, Webster's New World
    and American Heritage.
  - Several of my own fixes took the reviewer's "for example" sentence, and
    the reviewer then scored its own wording. One of those (morose) opened
    with Merriam-Webster's phrase. A fresh subagent checked the 9 such texts;
    1 copy was found (inexcusable, a cut-down WordUp sentence) plus two
    accuracy points (mollify, malleable). Those were fixed in a follow-up
    worksheet with its own second review.
  - First senses changed, keeping the old meaning as an other sense where it
    was useful: goad (noun to verb), gregarious, iconoclast, impertinent,
    impervious, inexorable, inimical, insular, inundate, lassitude,
    mercurial, neophyte, obtuse, opaque, palliate. impertinent's old first
    sense ("lightly pert and exuberant") was wrong.
  - Tooling: `check` now rejects a wrong answer that names its own look-alike
    (it found debunk's bunk option in an earlier batch; eclectic and decorum
    had near misses and were reworded with it). `curate.ts pos <word...>`
    prints a word's parts of speech in WordNet; three writers had each
    written their own script for this. `check` also now requires each
    wrong answer to start the way the definition does, with or without
    "To": a follow-up reviewer saw that debunk's options all began "To" and
    its definition did not, which gave the answer away. corroborate had the
    same problem; both are fixed. corroborate is now flagged: its WordNet
    definition is unclear, and my two rewrites each followed a dictionary
    (Collins COBUILD, then Cambridge) before the review rounds ran out. It
    needs a definition written by a person. 8 unreviewed verbs (placate, preclude,
    satiate, undulate, upbraid, vacillate, venerate, vex) have it too and
    will meet the check when their turn comes.
  - The skill's "Traps found so far" has the new failure patterns.
- 2026-10-11: 59 more words, penury to stolid in record order except
  preclude. All 59 fixed, 0 flagged. Status now: 272 of 317 reviewed, 45 to
  go.
  - How it ran: the "Big runs" process with 5 worksheets of 12 words. 32 of
    60 words failed the first review, 6 the second, 3 the third. puerile
    passed on a fourth round that swapped one look-alike.
  - preclude was left out of `apply`. Its include wrong answer failed three
    rounds for following Oxford Learner's, and the prescribe answer that
    replaced it followed Longman. The record still has preclude's old
    content, so `next` will pick it up again. The rewrite is only in the
    git-ignored `pipeline/out/curate/` folder, so start it fresh.
  - Copied wording was again the main failure, mostly in wrong answers.
    WordUp was matched most. Britannica Learner's, Wordsmyth, Wordiyo and
    the Word Smart test-prep book are new on the list. Some of the copies
    were in fixes I wrote in the main session (include, pedantic), not only
    in the writers' drafts.
  - Other failures: wrong answers of the wrong kind (probate for the person
    noun reprobate, paddle for prattle), look-alikes that share only an
    ending (acrobat, exotic, chaotic, squalid), and remonstrate examples
    where demonstrate, one of its own wrong answers, fit the blank better.
  - First senses changed: pillory (noun to verb, "criticize publicly"),
    refractory (stubborn first, the medical sense kept as an other sense),
    relegate, polemic, puerile, saturnine and savant. pugnacious had
    WordNet's "tough and callous by virtue of experience" (the meaning of
    hard-bitten) as its first sense, and every example followed it; the
    whole entry was rewritten. sanction had its own penalty meaning as one
    of its wrong answers; that meaning is now its other sense.
- 2026-10-11 (second run): 39 more words, preclude and strident to
  insidious. All 39 fixed, 0 flagged. Status now: 311 of 317 reviewed, 6 to
  go.
  - How it ran: 4 worksheets of 11 or 12 words. 36 of 45 words failed the
    first review, 14 the second and 8 the third. turpitude and tangential
    passed on a fourth round that swapped one look-alike; terse failed its
    fourth.
  - Left out after three rounds: terse, umbrage, upbraid, vex, waver and
    zealous. Their failing wrong answers kept following a dictionary
    (perverse and dense for terse; uproot and braid for upbraid; hex and veto
    for vex; quaver for waver) or shared only an ending or a letter
    (homage, courage and mirage for umbrage; zany and credulous for zealous).
  - Two things I got wrong in the writer prompt. I told the writers to
    search the web for every text, and the four of them used up the
    turn's web searches (about 200, shared by all subagents), so the
    reviewers had none. I also told them to describe look-alikes "through a
    concrete case". The wrong answers came back with "like ..." pictures
    beside a plain definition, which gives the answer away; 10 of 11 words
    in one worksheet failed for that and for copying.
  - What worked instead: the reviewers downloaded each word's pages from
    about a dozen dictionaries with curl and compared runs of words with
    small Python scripts. Merriam-Webster, Collins and Britannica block
    curl; one reviewer read them through the built-in browser. Running the
    same scripts on my own fixes before sending them back caught two
    copies, but not all (dense still followed WordUp and Dictionary.com).
  - First senses changed: tenuous (weak, not "thin" of a liquid), undulate,
    vapid, virulent, volatile, voracious, zenith, insidious, superfluous and
    surfeit. vituperate's WordNet sense ("spread negative information") was
    wrong and is replaced.
  - Tooling: `check` now rejects a wrong answer with an example ("like
    ...", "such as ...") when the definition has none.
- 2026-10-11 (third run): the 6 words the second run left (terse, umbrage,
  upbraid, vex, waver, zealous) and corroborate, which had been flagged.
  All 7 fixed, 0 flagged. Status now: 317 of 317 reviewed.
  - This run went through all 45 words of the second run in parallel with
    it, without knowing about it (the second run's branch had no PR yet).
    The second run merged first as #28, so its versions of the 39 words it
    passed were kept, and only these 7 were applied.
  - corroborate got a definition written from scratch ("Add separate
    evidence that agrees with a claim or account already given, making it
    more believable.") and a new plain line. Both passed with no match to
    Collins or Cambridge.
  - The 7 failed main's new "like ..." check at first on four wrong answers
    (trite, tepid and terminal for terse, homage for umbrage, zesty for
    zealous). The examples were taken out and a fresh reviewer scored the
    three words again; tepid needed one more round because its new opening
    matched Oxford.
  - Two new traps are in the skill: a word's own sense used as its wrong
    answer (unctuous, umbrage, vex), and an other sense that is another
    word's meaning (vacillate's wavelike sense is undulate's meaning).
  - Pronunciation: all 317 rewritten in broad General American with the
    new `curate.ts ipa` command. WordNet's mixed US and UK forms and narrow
    symbols; 15 words had none; adulterate and precipitate had the
    adjective's pronunciation; enervate and quiescent had the stress on the
    wrong syllable. A second reviewer checked the list and changed 3
    (urbane, nadir, pristine). It checked 10 against Wiktionary and the rest
    from memory, because Merriam-Webster refused its requests. The syllable
    counts, which had been guessed from spelling, now come from the
    pronunciation. The app does not show them.
  - Lesson: check for open branches on the same words before a big run.
    `git branch -r` showed `claude/improve-last-45-words`, but only after
    this run had started.
- 2026-10-12: added 100 new words (ids 318 to 417), the first new words
  since the original 317. 99 fixed, 1 flagged (assiduous). Status now: 391
  of 391 taught words reviewed (main retired 26 words in #32 while this ran).
  - The words: abjure, accolade, acerbic, acumen, adroit, affable, anathema,
    anodyne, apocryphal, approbation, arcane, assiduous, avarice, bellicose,
    blithe, brusque, bucolic, callow, canard, capitulate, censure, chary,
    chimera, circumspect, clandestine, conflate, consternation, culpable,
    cupidity, decry, demur, denigrate, deprecate, dilettante, discomfit,
    disingenuous, dissolute, duplicity, egregious, equanimity, eschew,
    exhort, expiate, fastidious, feckless, fecund, florid, foible, gainsay,
    garish, germane, grandiloquent, gratuitous, harbinger, hubris,
    idiosyncrasy, ignominious, impetuous, importune, incorrigible,
    indefatigable, insouciant, inure, invective, jocular, judicious,
    lachrymose, lambaste, languid, largesse, lionize, lugubrious,
    malevolent, mawkish, misanthrope, modicum, mordant, obviate, odious,
    ossify, panegyric, pariah, pejorative, peripatetic, phlegmatic, plaudit,
    proscribe, querulous, rapacious, recant, redolent, sanguine, specious,
    supercilious, tacit, temerity, vicarious, vitriolic, vociferous, venal.
  - Each was checked against the seed list and WordNet before it went in,
    because ids are permanent. Then the free `words` and `senses` stages
    ran, and 8 writer and 8 reviewer subagents wrote everything else. The
    steps are now "Adding new words" in the skill.
  - Re-tiering into five equal groups moved 55 of the 291 taught words one
    tier. The level picker's sample words all stayed inside their levels
    (audacious went from tier 3 to 2, still in Advanced; quotidian from 5
    to 4, still in Expert).
  - Merged with #32, which retired 26 rare and fading words. The record was
    taken from main and the 100 words re-added with the same ids, then the
    reviewed worksheets re-applied. `curate.ts status` counted the retired
    words' reviews and showed "To review: -26"; it now counts taught words
    only.
  - 19 of the new words are under #32's modern-frequency cutoff (0.15 per
    million, all inflections, wordfreq): querulous, cupidity, insouciant,
    chary, grandiloquent, gainsay, lachrymose, importune, mawkish,
    supercilious, fecund, expiate, lugubrious, discomfit, phlegmatic,
    lionize, panegyric, abjure, assiduous. #32 also required falling use
    since 1900 (Google Books, 2010-2022 over 1900-1929, under 1). Only 7
    meet both: chary 0.40, cupidity 0.46, gainsay 0.58, importune 0.70,
    assiduous 0.74, mawkish 0.91 and abjure 0.99 (borderline). The other 12
    are steady or rising (insouciant 5.0, lionize 3.4, fecund 2.5). The 7
    are kept for now; whether to retire them is open.
  - WordNet led with the wrong first sense for 11 words (acerbic as a sour
    taste, acumen as a leaf tip, anodyne and mordant as nouns, demur as a
    legal noun, peripatetic as Aristotelian, and others). anodyne, demur
    and mordant changed part of speech.
  - Review rounds: 56 of 100 failed the first review, 14 the second and 4
    the third. Those 4 got a fourth round that swapped in a different
    look-alike: cupidity, denigrate and anodyne passed, and assiduous was
    flagged. Its fourth wrong answer (deciduous) is accurate and not copied,
    but it describes trees, so it tempts nobody. A new word left out of
    `apply` would ship with no plain definition or wrong answers, so it was
    flagged and applied instead; its notes say what to fix. Nearly every failure was copied wording in wrong answers,
    mostly from WordUp, Cambridge, American Heritage and Oxford. New this
    time: WordNet glosses that a writer used to avoid copying turned out to
    track Random House or American Heritage themselves.
  - Pronunciations for all 100 were written by the writers, checked by the
    reviewers (3 changed: idiosyncrasy, discomfit, eschew) and set with
    `curate.ts ipa`.
  - `inflections()` in `pipeline/src/lib/wordnet.ts` now doubles a final
    consonant ("demurred", "abetting"); the checks had rejected "demurred"
    as not a form of demur.
- 2026-10-12: added 88 more words (ids 418 to 517; 470 to 481 unused).
  All 88 fixed, 0 flagged. Status now: 479 of 479 taught words reviewed.
  - The words: acolyte, acquiesce, adulation, aegis, amenable, apostate,
    apropos, arbiter, ascendancy, attenuate, beguile, bereft, cabal,
    cavalier, chagrin, circumscribe, concomitant, connive, consummate,
    contravene, coterie, countenance, craven, deign, demagogue, denizen,
    disinterested, dour, droll, elucidate, erstwhile, evince, extant,
    facile, fealty, furtive, gauche, gerrymander, glib, hapless,
    histrionic, impinge, impugn, incisive, incongruous, inculcate,
    ingratiate, inscrutable, interlocutor, lampoon, litany, loath,
    pastiche, pathos, patina, peruse, philistine, pique, plebeian,
    pontificate, portend, posit, precept, promulgate, putative, qualm,
    regale, remiss, renege, replete, resplendent, rife, roil, ruminate,
    salient, subsume, subterfuge, surmise, tantamount, thrall, trope,
    untenable, untoward, vestige, volition, wanton, welter, wry.
  - Chosen by modern frequency, not from a GRE list. About 1,000
    candidates were checked for WordNet entries, frequency (wordfreq, all
    inflections) and Google Books trend since 1900. 650 fell between 0.3
    and 4 uses per million; 100 were picked by hand from those, and a
    subagent review swapped 5 (presage, allay, paean, bemused, enormity
    out; fealty, myopic, litany, hapless, mores in). The script is now
    `pipeline/tools/word-frequency.py`, and the method is in the skill's
    "Adding new words".
  - 100 went in. 12 (lurid, machination, malfeasance, mettle, milieu,
    miscreant, mores, moribund, myopic, onus, ostensible, parochial) were
    written but never second-reviewed: Brian stopped the run before their
    reviewer scored them. They were taken out of the record and the seed
    list before anything shipped, so their ids (470 to 481) stay unused.
    They passed the frequency checks and can be added in a later run with
    new ids.
  - WordNet led with the wrong meaning or part of speech for many words:
    cavalier, craven and pontificate came through as nouns, countenance
    as a noun (the verb "tolerate" is taught), myopic with eyesight first,
    regale with food, ruminate with chewing cud, moribund as "stagnant".
  - Review rounds: 29 of 88 failed the first review (23 of them on wrong
    answers, mostly copied wording again), 4 the second (cabal's hook,
    lampoon, roil, welter on wrong answers) and 1 the third (welter, which
    passed a fourth round with a swapped look-alike). The writers fixed
    round 2 from the reviewers' notes; the main session wrote rounds 3 and
    4.
  - A usage limit stopped 8 subagents mid-run. Each worksheet was checked
    against the reviewer's saved copy before resuming; none had been
    half-edited.
  - Re-tiering moved 9 of the 391 existing words one tier. Pronunciations
    for the 88 were written by the writers, checked by the reviewers and
    set with `curate.ts ipa` (arbiter and concomitant use ə, to match the
    record).
- 2026-10-17: added 100 more words (ids 518 to 617). All 100 fixed, 0
  flagged. Status now: 579 of 579 taught words reviewed.
  - The words: adjudicate, animus, antithesis, bandy, beholden, broach,
    bulwark, burnish, canny, careen, cede, codify, cognizant, corollary,
    corporeal, debase, depravity, detritus, disaffected, edify, efface,
    entreat, espouse, eviscerate, exegesis, expound, extenuating,
    extricate, feint, foist, forbearance, fraught, frenetic, galling,
    glean, imbue, impel, impunity, indelible, indomitable, inimitable,
    inordinate, insinuate, interminable, irrevocable, jettison, lurid,
    machination, malaise, malfeasance, mete, mettle, milieu, miscreant,
    misnomer, mores, moribund, myopic, nihilism, oblique, onus,
    ostensible, panache, parlance, parochial, prodigious, proffer,
    proselytize, provenance, purview, quagmire, rapprochement,
    recidivism, recrimination, redress, retinue, riposte, schism,
    semblance, spate, squalid, stalwart, sunder, supplant, tantalize,
    titular, travail, tutelage, unassailable, unconscionable,
    unmitigated, unseemly, unwitting, upshot, usurp, variegated, vaunt,
    visceral, whet, wrest.
  - The 12 words held back from the 2026-10-12 run (lurid to parochial)
    went in with new ids and were written and reviewed from scratch.
  - Chosen by modern frequency, as in "Adding new words": about 1,100
    candidates, 759 between 0.3 and 4 uses per million, picked by hand
    with a trend of about 0.6 or more. A subagent review swapped 7
    (discursive, rubric, ulterior, nepotism, scathing, artifice,
    acrimonious out; adjudicate, redress, vaunt, codify, semblance,
    stalwart, upshot in). Re-tiering moved 12 of the 479 existing words.
  - WordNet gave bandy as an adjective (bow-legged) and mete as a noun.
    Both are taught as verbs. WordNet has no verb entry for mete; it
    still exports, because export needs only a sense row and apply writes
    the curated definition as one.
  - Review rounds: 81 of 100 failed the first review, 27 the second and
    about 8 the third; the last ones passed on rounds 4 and 5. Almost
    every failure was copied wording, again mostly in wrong answers.
  - Why so many failed: WordUp keeps its definitions and example
    sentences inside `<script>` tags, and every writer's text extraction
    stripped scripts, so no writer compared against WordUp, the source
    the reviewers matched most. Several examples retold WordUp's or
    Cambridge's example scenes too. Once the writers read the script text,
    round 2 went much better.
  - Eleven options nearly repeated another word's option for the same
    look-alike (vicarious on visceral was vitriolic's option with one comma
    removed). `check` compared texts exactly, so it missed them. It now
    ignores case and punctuation, and rejects an option that shares half
    its content words with another word's option for the same look-alike.
    The older record still has 38 such pairs (for example capacious on
    capricious and on fractious); they show up as problems only when
    those words are next put on a worksheet.
  - The main session wrote rounds 3 to 5, and its own rewrites failed
    on copying six times (metamorphose, cogitate, modify, nepotism,
    skepticism, a landlord example). Dropping a failed option when the
    word still has 4 others worked better than rewording it again.
    `pipeline/tools/dictionary-defs.py` prints seven dictionaries'
    definitions for a word, WordUp's included, and was used before
    writing each main-session option.
  - A usage limit stopped five subagents mid-run. Each was resumed with
    SendMessage after checking its worksheet's state; none had been
    half-edited.
  - Pronunciations for the 100 were written by the writers, checked by
    the reviewers (none changed) and set with `curate.ts ipa`.
- 2026-10-19: fixed the 38 older near-repeat pairs (two words showing
  nearly the same wrong answer for one look-alike). 33 words re-reviewed,
  all fixed, 0 flagged. No pair at 0.5 overlap or more is left, retired
  words included.
  - The words: affable, anachronism, assuage, audacious, beguile, belie,
    cogent, corroborate, credulous, disparate, ebullient, efficacy,
    esoteric, exhort, extraneous, facile, fallacious, fastidious,
    fractious, impute, inimical, luminous, magnanimous, malleable,
    mitigate, officious, opprobrium, parsimony, pungent, reticent,
    regale, saturnine, tacit. One word per pair was changed; the other
    word kept its option.
  - First pass: 26 words dropped the repeated option (each still had 4
    others) and 7 had it rewritten. Five of the pairs involved a retired
    word, which `check` ignores; they were fixed anyway.
  - The second reviewer then failed 29 of the 33 in round 1, nearly all
    on older options and definitions that follow WordUp, Cambridge,
    Oxford or American Heritage. These were reviewed before WordUp's
    script text was readable, so earlier reviewers could not see the
    match. Writers fixed round 2 (one per worksheet); 6 words failed
    again and the main session wrote round 3. efficacy's definition
    needed a fourth round: round 3 said "real-world", but efficacy is
    the result under trial conditions (effectiveness is the real-world
    result).
  - Several drops left two look-alikes that share only an ending (cogent,
    efficacy, esoteric, fallacious, inimical). The writers replaced them,
    sometimes by bringing back the dropped look-alike with new wording.
  - Reviewers objected that two options for one look-alike under
    different words mean the same thing. That cannot be avoided, and it
    is allowed; only near-identical wording fails. The skill now says so.
  - `tools/dictionary-defs.py` had shown the same site-wide line for
    Dictionary.com on every word. It now reads the definition list,
    which also carries Collins text.
  - `curate.ts status` now lists any near-repeat pair left in the record
    (`nearRepeats` in `pipeline/src/lib/curate.ts`).
- 2026-10-23: re-review of older words, batch 1 of 5: the 90 words from
  abate to evanescent in record order, all last reviewed before 2026-10-17
  (before WordUp's script text and Dictionary.com's real text were
  readable). All 90 fixed, 0 flagged. The 446 such words are split into five
  batches, one PR each.
  - The words: abate, aberrant, abscond, abstain, admonish, adulterate,
    aesthetic, aggrandize, alacrity, alleviate, amalgamate, ambiguous,
    ambivalent, ameliorate, analogous, anomaly, antipathy, apathy, appease,
    arduous, articulate, ascetic, austere, aver, banal, beneficent, bolster,
    bombastic, boorish, burgeon, buttress, cacophony, cajole, callous,
    candor, capricious, castigate, catalyst, caustic, chicanery, coagulate,
    coalesce, commensurate, conciliatory, condone, conflagration,
    connoisseur, contrite, conundrum, convoluted, copious, cursory, dearth,
    debacle, debunk, decorum, deference, deleterious, deride, derivative,
    desiccate, diaphanous, diatribe, didactic, diffident, dirge, disabuse,
    discordant, discrepancy, disparage, dissemble, disseminate, dissonance,
    distend, dogmatic, dubious, eclectic, elegy, eloquent, embellish,
    empirical, emulate, engender, ephemeral, epigram, equivocate, erudite,
    eulogy, euphemism, evanescent.
  - The writers found copied wording in nearly every word, and the second
    reviewer still failed 65 of 90 in round 1 (worksheet a 12 of 12, h 10
    of 11, e 10 of 11). Round 2 (by the writers) left 11; the main session
    wrote round 3. engender's definition needed a fourth round: round 3
    swapped WordUp's "feeling, attitude, or situation" list item by item.
  - Example scenes retold from WordUp were the second most common failure.
    `tools/dictionary-defs.py --examples` now prints Oxford, Cambridge,
    Longman and WordUp example sentences, so agents no longer write their
    own extractors (one missed WordUp sentences).
  - Many older words had two or three look-alikes that share only an ending
    (girth and mirth on dearth, studious and tedious on dubious). Most were
    replaced by look-alikes that share the start.
  - Two older examples were wrong in fact: dried insects are not pinned
    (desiccate), and corundum is not "ground into emery".

## The placement test no longer finishes during render

After the 12th answer, the web build logged "Cannot update a component
(`NavigationContainerInner`) while rendering a different component
(`Placement`)". Found 2026-10-10 in demo mode on web.

### Why it happened

`app/onboarding/placement.tsx` had a fallback near the end of the component
that called `finish()` while rendering. `finish()` saves the level estimate
and calls `router.replace('/onboarding/goals')`, and React does not allow a
state change in another component during render. `answer()` already calls
`finish()` on the 12th answer, so the fallback only ran it a second time. The
case it seemed meant for, every placement word used before 12 answers, never
reached it, because its condition needed a current word.

### What changed

- The render-phase call is gone. `answer()` still ends the test at
  `PLACEMENT_LENGTH`.
- A `useEffect` ends the test early when the word pool runs out (words
  loaded, no current word, at least one answer). With no answers at all, for
  example when the words fail to load, the screen stays up and "Skip for now"
  still works.
- `finish()` is guarded by a ref, so it runs once even when `answer()` and
  the effect both fire, or a second tap lands before the screen leaves.

### Verified

- Web, demo mode, after clearing localStorage, sessionStorage and IndexedDB:
  answered all 12. One navigation to `/onboarding/goals`, no console errors.
  The same steps on the old code logged the error above.
- The pool-runs-out path, with the demo word list cut to 5 for the test only
  (reverted): the test ended after question 5, went to goals once, and saved
  a level.
- `npm run typecheck`, `npx eslint app src` and `npx jest` (199 tests) pass.
- In practice the pool does not run out: both backends offer all 317 words.

## First run asks for a word level instead of the placement test

A new learner now starts by choosing a word level: Regular, Advanced or
Expert. The 12-question placement test is still there, behind a "Not sure?
Take a 12-word test" link on the same screen. Brian asked for this on
2026-10-10, so the phase 6 task file now says so.

### What was added

- `src/features/onboarding/levels.ts`: the three levels, the level estimate
  each one saves, and three sample words each. `levelForEstimate` maps any
  saved estimate (1 to 5) back to a level. `needsLevel` replaces
  `needsPlacement`. Unit tested, including a test that each sample word is in
  `words.json` and inside its level's tiers.
- The level picker (`LevelView`, route `app/onboarding/level.tsx`). The app's
  entry route sends a learner who has not finished onboarding here instead of
  to the placement test. Picking a level goes to the goals screen.
- A "Word level" choice in Settings.
- The goals screen says "Starting with Expert words" instead of "Starting
  around level 5". The old wording read like the XP level on home.
- Home's "Placement test" row is now "Choose your level". It still shows only
  when no level is saved, which now only happens to learners who skipped the
  old test.
- The placement test's "Skip for now" is now "Back to levels". It builds on
  #26, which moved the end of the test out of render.
- The Discover feed starts over when the level changes. Before, it kept the
  words it had loaded and only later pages used the new level, so a change in
  Settings would not show until the app restarted. Tested in
  `src/features/feed/useFeedWords.test.ts`, the first test file for a hook.

### Decisions

**No new column.** A level is saved as `level_estimate`, the number the
placement test already writes. Regular is 1, Advanced 3 and Expert 5. Through
`tierWindowForLevel` that gives tiers 1 and 2, tiers 2 to 4, and tiers 4 and
5. A session's new words start at the low end of the window, so Advanced
starts at tier 2. That matches how placement estimates already behaved.

**Estimates 2 and 4 read as Regular and Expert.** The placement test can save
any of 1 to 5. Settings and the goals screen show the nearest level.

**Every onboarding step replaces the one before.** With `router.push` from
the picker to goals, the browser's back button after finishing reopened
`/onboarding/level` with the goals screen inside it. Replacing keeps
onboarding out of the browser history, as the old flow did.

**The level row is local to `LevelView`.** A subtitle on the shared `ListRow`
would have changed `ui.tsx`, which every story imports, so Chromatic would
re-snapshot the whole library.

**Levels are only as good as the tiers.** Tiers are five equal groups by
Datamuse frequency within this word list. They are rough: "debunk",
"burgeon" and "stymie" are in tier 5, and "hegemony" and "refractory" in
tier 1. Every tier is test-prep vocabulary, so Regular is not basic English.

### Verified

- `npm run typecheck`, `npx eslint app src` and `npx jest` (27 suites, 208
  tests) pass.
- Web, demo mode, at 375 x 812 and desktop width: a cleared first visit opens
  on the picker; Regular saves 1 and Expert saves 5 with no known words;
  the test path (open the test, back to levels, take it) saves its estimate
  and 8 known words; onboarding adds no browser history entries; a profile
  with no level shows the home row, which opens the picker and returns home
  with the saved daily goal kept; Settings shows the saved level and
  switching Advanced to Regular moved the Discover feed from tiers 2 to 4 to
  tiers 1 and 2.
- Not run on the iOS simulator or Android emulator.
- Chromatic: new `Screens/Onboarding Level` stories, a new Settings
  `ChangingLevel` story, and changes to the Settings, Goals,
  Placement and Home stories. Home's `PlacementNotTaken` story is renamed
  `NoLevelChosen`.

## Learners can report a problem with a word

A "Report a problem" link now sits on the new-word card, the answer reveal and
an open row of the word list. Tapping it opens a short form in place: what
looks wrong (definition, example sentence, pronunciation, quiz answers, memory
hook, something else) and an optional note. Brian asked for this on
2026-10-11, and chose a silent fix: the learner is thanked when they send it
and is not told when the word is fixed.

### What was added

- `supabase/migrations/0012_word_reports.sql`: the `word_reports` table.
  Learners can add reports as themselves and read their own; they cannot
  change or delete them. Only the service role can mark one resolved.
  Deleting the account removes a learner's reports through the cascade on
  `user_id`. Numbered 0012 because 0011 is on the unmerged
  `claude/supabase-go-live` branch; 0012 grants its own access and does not
  need 0011.
- `src/features/report/`: the reasons and note cleanup (unit tested), and
  `ReportProblem`, the form. It calls `backend.reportWord` directly, as
  `WordIntro` already does for personalized hooks, because the stories have no
  TanStack Query provider.
- `Backend.reportWord` in both backends. The Supabase one inserts a row; the
  demo one keeps reports in its saved state. Both include reports in
  `exportData`. Tested for both.
- `database.types.ts`: the new table, hand-written like the rest of the file.
- Curation (`pipeline/src/curate.ts`, `pipeline/src/lib/reports.ts`):
  `reports` fetches open reports, `next --reported` makes a worksheet of the
  reported words with the reports attached, and `resolve <worksheet>` marks
  them resolved after `apply`. The steps are in the improve-words skill under
  "Learners' reports". The fetch and resolve use the service role key from
  `pipeline/.env`.

### Decisions

**The form opens in place.** A session is already a full-screen modal, and a
second modal on top of it is where earlier layout bugs came from.

**`resolve` compares review ids, not dates.** A worksheet made by `next
--reported` records the newest review id. A report counts as answered only if
its word has a newer review, and the report was filed before the worksheet was
made. With dates alone, a word reviewed earlier the same day counted as
answered; the first end-to-end run did exactly that.

**A learner's report is not taken as fact.** The writer judges it and says in
the review notes what it led to.

### Verified

- `npx tsc --noEmit`, lint, and the app and pipeline unit tests pass.
- Web, demo mode: the form opens on the word list and on the new-word card in
  a session. Sending saves the report with its word, reason, note and screen,
  and shows the thank-you line.
- The migrations 0001 to 0012 on PGlite: the checks reject an unknown reason,
  an unknown screen and a note over 500 characters. As the `authenticated`
  role, a user can insert their own report, cannot insert one for someone else
  or one already resolved, reads only their own, and cannot update or delete.
  Deleting the user removes their reports.
- The curation commands against a local fake of Supabase's REST API: `reports`
  lists and saves; `next --reported` attaches them; `resolve` resolved nothing
  before `apply` and only the applied word's report after it.

### Not run

- **Nothing ran against the real Supabase project.** The migration is not
  applied there. Supabase mode is not live yet (see the go-live branch), so
  reports from the live demo site stay in each visitor's browser.
- Not run on the iOS simulator or Android emulator.

## Supabase mode is set up in games-apps

Supabase mode now works against the real `games-apps` project. Migrations
0001 to 0013 are applied there, and the app was run locally against it with a
real account: sign-in, onboarding, a 13-word session, Progress, Ranks,
achievements, the word list, a word report and "Delete account" all wrote and
read the right rows. The hosted site also has a new address,
https://littlelexicon.byebrianwong.com. It still runs in demo mode.

### What was wrong, and what changed

- **Signed-in users could not reach the tables.** Supabase grants the API
  roles access only in the `public` schema. Migration 0011 grants `select`,
  `insert` and `update` (never `delete`) on the per-user tables to
  `authenticated`. Signed-out users and the old Postgres word tables get
  nothing.
- **`little_lexicon` was not an exposed schema.** Brian added it in the
  dashboard (Integrations, Data API).
- **No trigger on `auth.users`.** It is shared by every app in the project, so
  a trigger there runs for all their sign-ups, and a failure in it would block
  them all. The app creates a person's profile the first time they open Little
  Lexicon (`SupabaseBackend.getProfile`). 0001 no longer creates the trigger.
- **"Delete account" no longer deletes the shared sign-in.** Deleting it would
  cascade into `rotation`, `baby_bean` and `storage_tracker`, and fail for
  anyone with `storage_tracker` items. Migration 0013 adds `delete_my_data()`,
  which deletes the caller's rows in all ten per-user tables. The app calls it
  and signs out. The `little-lexicon-delete-account` Edge Function is removed.
  Settings and `docs/PRIVACY.md` say the sign-in is kept.
- **Sign-up handled email confirmation wrongly.** The project requires it, and
  Supabase returns no session until the link is opened, but the app went home
  anyway. It now says to check email, and the link comes back to Little
  Lexicon (`emailRedirectTo`), not to the project's shared Site URL. The
  message also covers an address that already has an account: Supabase answers
  that case the same way and sends nothing. Brian hit exactly this, because
  his address was already used by another app (auth log: `user_repeated_signup`).
- **Confirmations did nothing on web.** `Alert.alert` is an empty function in
  react-native-web, so "Delete account" never asked and never ran there.
  `src/lib/dialogs.ts` uses the browser's `confirm` and `alert` on web.
- **"Make it personal" and "Continue with Google"** show only when set up
  (`EXPO_PUBLIC_AI_FEATURES`, `EXPO_PUBLIC_GOOGLE_SIGN_IN`). Demo mode shows
  both. The two AI Edge Functions are not deployed: each use is a paid call.
- **`database.types.ts` is generated** (`npm run gen:types`, now pointed at the
  project). It caught two things the hand-written file hid: `supabase gen
  types` marks every function argument non-null, but `submit_review` takes
  nulls on a card's first review, and every view column is nullable.

### How it was applied

The project's migration history already holds hearsay's `0001` to `0005`, so
`supabase db push` would skip Little Lexicon's first five. The Supabase MCP's
`apply_migration` was declined twice: it asks a confirmation form for SQL it
sees as destructive, and this client answered it by itself. Claude Code's auto
mode then blocked running the SQL through the CLI. Brian ran it himself:

```bash
supabase db query --linked -o table -f supabase/.temp/little_lexicon_0001_to_0013.sql
```

That file is migrations 0001 to 0013 from commit 4ff502a in one transaction.
It is not in the migration history table. The next migration (0014) can be run
the same way, on its own.

### Domain

`littlelexicon.byebrianwong.com` is a CNAME at Porkbun to
`b154959b6cb3b3e0.vercel-dns-017.com`, added to the Vercel project and on the
Supabase redirect list. Sign-up links from the native app go there.
`little-lexicon.vercel.app` still works and does not redirect, because demo
progress is kept in each address's browser storage.

### Verified

- `tsc --noEmit`, lint and 230 unit tests pass.
- PGlite, as the `authenticated` and `anon` roles: 38 of 38 checks, including
  that "Delete account" removes one user's rows in all ten tables and nothing
  of another user's.
- Real project, read-only checks after applying: 15 tables with RLS, the
  grants above, no trigger on `auth.users`, the other apps' table counts
  unchanged. Security advisor: three findings for `little_lexicon`, all
  deliberate (the leaderboard view and `delete_my_data` / `bump_ai_usage` run
  as their owner and only touch what they should).
- Local web app against the real project, with every write checked in the
  database: profile created on first open, 13 reviews with card state and day
  stats, retention and forecast, leaderboard and achievements, a word added to
  the list and soft-removed by Undo, a word report, then "Delete account"
  emptied all ten tables and left the sign-in.

### Not done

- **The hosted site is still in demo mode.** Turn on real accounts by setting
  `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY` in Vercel, only
  after this PR is merged: the code on `main` before it expects the old
  trigger and would fail for new users.
- **Export does not work on most desktop browsers.** It uses the system share
  sheet (`Share.share`), which they lack. It now says so instead of failing
  silently. A web download of the JSON would fix it.
- **No password reset in the app**, and the native app does not handle the
  confirmation link (the address is confirmed when the link opens, then the
  person signs in).
- **Advisor follow-ups:** 16 policies use `auth.uid()` where Supabase suggests
  `(select auth.uid())`, and `mnemonics.user_id` and `word_reports.user_id`
  have no index. Both matter only for large tables.
- Not run on the iOS simulator or Android emulator against the real project.

## 26 rare and fading words retired (2026-10-12)

The word list came from GRE prep lists, with no check on how often a word
appears. A frequency audit found 26 words that are both rare in modern text
and used less than they were a century ago. They are no longer taught. The
app now has 291 words.

### How the audit worked

- Modern frequency: the `wordfreq` dataset (news, Wikipedia, web text, film
  subtitles, Reddit, Twitter and books, up to about 2021), counting every
  inflection of a word (vex, vexed, vexing, vexes).
- Trend: Google Books use in 2010-2022 divided by use in 1900-1929, from the
  Ngram Viewer's JSON endpoint.
- A word was retired when it appears under 0.15 times per million words and
  its trend is under 1. Rare words whose use is rising (perspicacious,
  saturnine, exculpate, diaphanous, prevaricate, rancorous) were kept, as were
  beneficent, remonstrate and aver.
- The audit script is not in the repo. It was a one-off run; a pipeline stage
  that does this is future work if the word list grows.

Retired: sedulous, vituperate, complaisant, impecunious, lassitude, recondite,
torpid, fervid, munificent, punctilious, sagacious, timorous, dilatory,
ingenuous, effrontery, propitiate, obdurate, stolid, inchoate, unctuous,
enervate, turpitude, desultory, pillory, redoubtable, salubrious.

### What changed

- A word row can carry `retired: "<reason>"`. The export, the difficulty
  tiers and `curate.ts` skip retired words. The row, its reviewed content and
  its id stay in the record, so a word can come back by removing the field.
- The 26 words are marked retired and removed from the seed list. The tiers
  were recomputed over the 291 remaining words (58 or 59 per tier).
- The Expert level's sample word "recondite" is now "quotidian".
- Two tests required at least 300 words. The floor is now 250; it is there
  to catch an empty or cut-off words file.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx jest` (27 suites, 208 tests) and
  the pipeline's `npm test` (61 tests) pass. A stale, git-ignored
  `.expo/types/router.d.ts` from before the level screen caused route type
  errors locally; it was set aside and is regenerated by `expo start`.
- Web, demo mode: the level picker shows "obsequious, quotidian,
  perspicacious" for Expert.
- Not run on the iOS simulator or Android emulator.
- Chromatic: the Onboarding Level stories show the new sample word.

### For next time

Tiers still come from Datamuse frequency of the base form only, so verbs
look rarer than they are ("burgeon" is tier 5 though "burgeoning" is common).
Tiering by the modern, all-forms frequency would fix that.

## Natural-sounding word and sentence audio (2026-10-12)

The app spoke every word and sentence with the device's speech synthesizer,
because pipeline stage 04 had never run and no audio host was chosen. The
default device voices (iOS compact voices, the browser default) sound robotic.

### Decisions

- **Voice: Google Cloud TTS, Chirp 3 HD** (Brian chose this). Default voice
  `en-US-Chirp3-HD-Kore`, changeable with `GOOGLE_TTS_VOICE`. 1M free
  characters a month, then $30 per 1M
  (https://cloud.google.com/text-to-speech/pricing). The corpus is about
  129,000 characters (291 words, 1,440 sentences), so a full run is free.
- **Clips are bundled in the app** (Brian chose this over Supabase Storage and
  Vercel). Stage 04 writes `assets/audio/words/<wordId>.mp3` and
  `assets/audio/sentences/<exampleId>.mp3`. Stage 05 writes
  `src/content/audioClips.ts`, which `require`s each clip so Metro bundles it.
  Estimated 30 to 50 MB; the stage logs the real total.
- **The word's IPA is passed to the voice** as a Chirp 3 HD custom
  pronunciation, so the clip says the word the way the app writes it. This
  applies to the headword clip and to any sentence that contains the exact
  headword (1,345 of 1,440 do). Inflected or capitalized forms ("abated",
  "Abate") are left to the voice, because Google matches the phrase exactly.
  Ref: https://docs.cloud.google.com/text-to-speech/docs/chirp3-hd
- **Human headword recordings are US only.** Stage 04 already preferred a
  Free Dictionary API recording (SPEC section 6). It took the first MP3, which
  could be a UK or Australian recording that disagrees with the General
  American IPA. It now takes only `-us.mp3` files, and records each one's
  Commons source page and license. When any human clip is bundled, the export
  adds a CC BY-SA credit line to the words file (shown in Settings).
- **Clips are remade when their inputs change.** Each clip stores a key
  hashed from its text, the word's IPA and the voice. The improve-words skill
  rewrites sentences and replaces their rows with new ids, so stage 04 also
  deletes clips whose word or sentence is gone or retired (not on `--limit`
  runs).
- **Better device fallback.** When a word or sentence has no clip, the app
  picks the most natural English voice the device lists
  (`src/lib/voice.ts`): iOS premium or enhanced voices, Android network
  voices, Edge "Natural" or Chrome "Google" voices on web, and never the old
  novelty voices. The choice runs in the background: on web, expo-speech waits
  for the browser's `voiceschanged` event, which never fires in a browser with
  no voices, and awaiting it left speech silent in headless Chromium.

### What changed

- Pipeline: `src/lib/audio.ts` (request body, IPA cleanup, clip key, US
  recording pick, clip module source) with tests; stage 04 rewritten; stage 05
  writes the clip module; the store's audio rows carry key, source, voice,
  source URL and license; live audio goes to `assets/audio`.
- App: `speakWord(word)` and `speakSentence(example)` take the content object
  and play, in order, the bundled clip, a hosted `audioUrl`, or device speech.
  The clip list is loaded with a dynamic import (`src/lib/importAudioClips.ts`)
  so the web build keeps it out of the first download; Jest swaps it for an
  empty list. A turn counter stops a slow call from playing after a newer one.

### Verified

- `npx tsc --noEmit`, `npx eslint .`, `npx jest` (31 suites, 234 tests) and
  the pipeline's `npm test` (70 unit tests plus a dry run) pass.
- Bundling, end to end: two generated test MP3s were added to the record and
  run through the real export. The web build copied both to
  `dist/assets/assets/audio/` and put the clip list in its own chunk. In
  headless Chromium, "Hear abate" and abate's sentence played those MP3s, and
  another word's "Hear it" fell back to device speech. The test clips were
  then removed; the committed `audioClips.ts` is empty.
- Not run: stage 04 against Google (no `GOOGLE_TTS_API_KEY` here), the iOS
  simulator and the Android emulator. The Free Dictionary API returned
  Cloudflare 522 errors during this session, so the US-only filter was written
  against its documented response shape.

### To finish

1. In a Google Cloud project, enable the Cloud Text-to-Speech API and create
   an API key. Put it in `pipeline/.env` as `GOOGLE_TTS_API_KEY`.
2. In `pipeline/`, run `npx tsx src/run.ts --only=audio`, then
   `npx tsx src/run.ts --only=export`.
3. Listen to a few clips in `assets/audio`. To try another voice, set
   `GOOGLE_TTS_VOICE` and rerun; every TTS clip is remade.
4. Commit `assets/audio`, `src/content/audioClips.ts`,
   `src/content/words.json` and `pipeline/data/content-db.json`.

## Fill-the-blank questions with a choice of words (2026-10-19)

Brian asked for more questions where you see a sentence and pick the word
that fills the blank. The app had a fill-the-blank mode, but it asked you to
type the word. This adds a multiple-choice version.

### Decisions

- **New mode `cloze_choice`** ("Choose the missing word"): an example
  sentence with the word blanked and four words to pick from, with the same
  50/50 hint as the other multiple-choice questions. The typed cloze stays.
- **Where it appears.** In sessions it joins the ladders for new, learning
  and relearning words, which SPEC section 1 gives to recognition and cloze:
  one of three modes for new words, one of four for learning words, one of
  three for relearning words. The review ladders are unchanged, so maturing
  words still move on to typed answers. Practice lists it twice, so it comes
  up about twice as often as any other mode (2 in 9).
- **XP 12**, between multiple choice (10) and the typed cloze (16).
- **Wrong options are chosen so grammar does not give the answer away.**
  - Same part of speech as the answer.
  - When "a" or "an" comes right before the blank, every option takes that
    article, judged by the first sound of its IPA ("a eulogy", "an
    aberrant").
  - No word linked to the answer as a synonym or antonym, in either
    direction or through a shared one, since it could also fit.
  - Only sentences whose blank is the headword itself. 12% of sentences
    blank an inflected form ("abated"), which would stand out against
    base-form options; those stay with the typed cloze. 19 words have only
    inflected sentences and do not get this mode (belie, glean, regale and
    others).
- **Wrong options come from the words being played first, then the rest of
  the collection.** A session alone often has too few words of one part of
  speech (of the first 10 words, 3 had no question), so the session now also
  reads the full word list (the `allWords` query practice already used). It
  waits for that list before the first question, so a question's mode cannot
  change when the list arrives.

### Verified

- `npx tsc --noEmit`, `npx eslint .` and `npx jest` (31 suites, 254 tests)
  pass.
- Against the committed words file: 560 of 579 words can be asked this way.
  In 610 generated questions with "a" or "an" before the blank, every option
  took that article.
- Web, demo mode, at 390 x 844: in a session and in practice the question
  appeared, the hint dimmed one wrong word, answering showed the reveal with
  the full sentence, and Continue moved on. No console errors.
- Not run on the iOS simulator or Android emulator.
- Chromatic: new `Games/ClozeChoice` stories.

### For next time

- Wrong options are other headwords picked by rule, not written for each
  sentence. A word of the same type that is not listed as a synonym can still
  fit a sentence now and then. If learners report that, the improve-words
  skill can add the missing synonym, or the pipeline could write wrong words
  for each sentence.

## UI Tests replaces Visual tests as the required visual check (2026-10-20)

Brian chose to make Chromatic's own `UI Tests` commit status the required
check for visual changes, in place of the `Visual tests` Actions job. Before
this, accepting a change in Chromatic left `Visual tests` red until someone
re-ran the job. `UI Tests` turns green when the change is accepted. Chromatic
documents both setups
(https://www.chromatic.com/docs/github-actions/,
https://www.chromatic.com/docs/mandatory-pr-checks/).

### What changed

- `.github/workflows/chromatic.yml`: `exitZeroOnChanges` is `true` again, so
  visual changes no longer fail the `Visual tests` job. A story that errors or
  fails its play function still fails the build, and `UI Tests` with it. The
  job still runs, because it is what publishes Storybook to Chromatic.
- `.github/scripts/check-ui-tests-status.sh` is removed. It read the
  `UI Tests` status from inside the job, to catch builds that TurboSnap
  bypassed (see "A bypassed Chromatic build no longer passes Visual tests").
  Requiring the status directly covers that case.

### Manual step

The `main` ruleset is a GitHub setting and was not changed from this session.
In Settings, Rules, Rulesets, `main`, under "Require status checks to pass",
add `UI Tests` (source: Chromatic) and remove `Visual tests`.

### Trade-offs

- **Fork pull requests.** The job is skipped for forks, so Chromatic posts no
  `UI Tests` status and a fork pull request waits until an admin bypasses the
  ruleset. This is why the status was not required before (see "Visual diffs
  now block").
- **Turning Chromatic off.** If `CHROMATIC_ENABLED` stops being `true`, or the
  Chromatic project is unlinked from the repository, no pull request gets the
  status, so `UI Tests` has to come off the ruleset too.
- **Not yet verified:** whether, on a commit whose build TurboSnap bypassed,
  the carried-over pending status turns green once the earlier build is
  accepted. The commit with this change touches no story files, so PR #40
  should show it when build 108 is accepted.

## First letter shown when typing a word (2026-10-19)

Typing a word from its meaning alone was too hard. "Fill the blank" (cloze)
and "Type the word" (production) now show the word's outline under the
answer box from the start: the first letter, an underlined slot for each
letter, and the length ("9 letters").

### Decisions

- The first letter is part of the question, not a hint. It does not set
  `hintUsed`, so a fast correct answer can still earn Easy.
- The Hint button still exists and still downgrades to Hard. It now fills in
  about a third of the word (at least two letters, never the whole word).
  Before, cloze's hint showed only the first letter and production's showed
  the first third. The two modes now match.
- Production dropped its "Spell the exact word." line. The outline already
  says which word is wanted, so a synonym rarely fits it.
- Each slot is its own underline. The serif's underscores run together and
  made the blanks hard to count.

### What changed

- `src/lib/text.ts`: `FREE_LETTERS`, `hintLetters`, `letterSlots`,
  `letterCount`, with tests.
- `src/features/games/LetterCue.tsx`: the outline, with a spoken label
  ("Starts with "e", 9 letters").
- `Cloze.tsx` and `Production.tsx` use it; their stories check the label
  before and after the hint.

### Verified

- `npx tsc --noEmit`, `npx eslint .` and `npx jest` pass. Storybook builds;
  the cloze and production stories ran in headless Chromium with their play
  checks passing, and the screenshots show the outline before and after the
  hint.
- Not run: iOS simulator and Android emulator.

## Saved words in every mode, and a tracker on each word (2026-10-23)

Brian asked to be able to save a word to learn later from any mode, including
endless practice. The list of saved words should keep everything until the
learner removes it. Each word should track how often it came up lately and how
the learner did, and a setting should control how often practice shows words
the learner knows.

### Decisions (Brian chose each of these)

- **The tracker and the setting control endless practice only.** Sessions
  already space words by FSRS, which pushes a word further out after each right
  answer and brings it back soon after a mistake. Desired retention already
  tunes that. Answers from every mode (sessions, speed rounds, practice) feed
  the tracker.
- **Practice draws from the whole collection, with saved words weighted up.**
  The weights are listed in SPEC section 4.
- **Known means right on 5 separate days with no mistake since.** The days do
  not have to be in a row. Any mistake, in any mode, starts the count again.
- **The setting is Rarely (default), Sometimes or As often as others.** A
  known word has weight 0.2, 0.5 or 1 against 1 for a word being learned.

### Other decisions

- **"Your list" is now "Saved", and "Learn this" is "Save for later".** The
  list keeps a word after a session has introduced it. It shows newest first.
  `word_list` rows already stayed after a session (0009); only the read
  changed. Sessions still introduce saved words they have not shown yet first.
- **Practice answers go to a new table, `practice_logs` (0014).** Practice
  still never writes `review_logs` or reschedules a card. Writing practice into
  `review_logs` would have mixed it into retention stats and future FSRS weight
  fitting.
- **The setting is on the profile** (`known_word_frequency`), like desired
  retention, so it follows the account across devices.
- **The tracker is computed on the device** from the full answer history,
  read a page at a time. This keeps one tested implementation for both
  backends. CLAUDE.md prefers server-computed values, so if histories grow
  large, a SQL function that returns one row per word should replace
  `getAnswerHistory`.
- **Saved-word weight scales with the collection.** A fixed multiplier would
  leave a handful of saved words lost among 579. The boost is set so saved
  words fill half of picks when every word has the same weight, and it drops
  to 1 once saved words outnumber the rest.
- **No repeat within 8 picks.** Practice used to play every word once per
  shuffled round. Weighted picks can repeat, so a word waits 8 picks (fewer in
  a tiny collection) before it can come back.

### What changed

- `src/features/tracker/`: `buildTrackers` and `describeTracker` (unit
  tested), and the answer-history query.
- `src/features/games/practice.ts`: `buildPracticeChunk`, `practiceWeight` and
  the setting's values (unit tested). The shuffled rounds are gone.
  `app/practice.tsx` picks 20 words at a time and logs each answer.
- `SaveWordButton` on the reveal and the new-word card (through
  `GameContext.saved`), the speed round and open rows in All words.
  `useSavedWords` holds the state for every screen.
- Backend: `getAnswerHistory` and `logPracticeAnswer` in both backends;
  `getWordList` no longer drops words a session has shown; the profile carries
  `knownWordFrequency`; exports include practice answers.
- Migration `0014_saved_words_tracker.sql`: `practice_logs` with owner-only
  RLS, `profiles.known_word_frequency`, and `delete_my_data` covering the new
  table. `database.types.ts` was edited by hand first, then checked against
  the types generated from the project after 0014 was applied: identical.
- Settings: "Words you know, in practice". PRIVACY.md mentions practice
  answers and saved words.

### Verified

- `npx tsc --noEmit`, `npx eslint .` and `npx jest` (32 suites, 267 tests)
  pass.
- The web build in headless Chromium, demo mode: saved a word from the
  practice reveal, toggled it in the speed round, saw it as the first word of
  a session, saved a word from All words, and saw both in Saved with their
  tracker lines. Six practice answers were stored, and the setting saved as
  "sometimes". No console errors.
- Storybook: all 169 stories render in a static build with no errors, and
  the new and changed interaction tests pass. axe finds no violations on the
  changed stories.
- Not run: the iOS simulator, the Android emulator and Supabase mode.

### Applied (2026-10-23)

0014 was applied to the games-apps project in one transaction, through the
Management API's SQL endpoint (the same raw-SQL route as 0001 to 0013, so it
is not in the CLI's migration history). Checked afterwards: `practice_logs`
has RLS on, the two owner policies, and only select and insert for
`authenticated`; `profiles.known_word_frequency` defaults to 'rarely' with its
check; `delete_my_data` covers `practice_logs` and is still security definer.
The types generated from the project match the committed
`database.types.ts` byte for byte.
