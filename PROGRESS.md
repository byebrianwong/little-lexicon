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
