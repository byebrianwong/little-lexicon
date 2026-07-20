# CLAUDE.md

Conventions and guardrails for this repo. Read before starting any task. Apply to every task and every sub-agent.

## Stack (do not substitute without flagging)

- **App:** Expo (latest SDK) + React Native + Expo Router, universal (iOS, Android, web from one codebase). Web is a companion surface; native is primary. Ref: https://docs.expo.dev/router/introduction/
- **Language:** TypeScript, strict mode on. No `any` without a comment justifying it.
- **Backend:** Supabase (Postgres + Auth + Storage + Edge Functions), inside the shared `games-apps` project. Ref: https://supabase.com/docs
- **Data layer:** `@supabase/supabase-js` v2, wrapped in TanStack Query. No raw fetches to Supabase from components.
- **State:** Zustand for client/session state, TanStack Query for server state.
- **SRS:** `ts-fsrs`. Ref: https://github.com/open-spaced-repetition/ts-fsrs
- **Styling:** NativeWind (Tailwind for RN). If a component needs primitives NativeWind can't express cleanly, use plain StyleSheet, not a second styling library.
- **Payments:** RevenueCat (`react-native-purchases`). Ref: https://www.revenuecat.com/docs/
- **LLM (build-time and optional runtime):** Anthropic Claude API via `@anthropic-ai/sdk`. Never called directly from the client; only from Node scripts (Phase 1) or Supabase Edge Functions.

Version-pin everything in `package.json`. Do not float major versions.

## Supabase multi-app isolation

The `games-apps` project is shared with other side projects. Isolation rules:

- All tables live in a dedicated Postgres schema named `little_lexicon`. Never create app tables in `public`.
- Storage lives in a single bucket named `little-lexicon-audio`.
- Edge Functions are prefixed `little-lexicon-` (for example `little-lexicon-generate-sentence`).
- Row Level Security is on for every table that holds user data. A user can read and write only their own rows.
- The free tier is shared across all apps in the project. Keep tables lean, avoid storing large blobs in Postgres (audio goes to Storage), and watch aggregate Storage against the ~1 GB free limit. Flag in the task if a step risks crossing it.

## Secrets

- Client-safe values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`) go in `.env` and are read via `process.env.EXPO_PUBLIC_*`.
- Server-only secrets (`ANTHROPIC_API_KEY`, TTS provider keys, `SUPABASE_SERVICE_ROLE_KEY`) are never imported into the app bundle. They live in the pipeline's own `.env` (git-ignored) and in Supabase Edge Function secrets.
- If a task seems to require a client to hold a server secret, stop and flag it. The design is wrong.

## Code conventions

- File-based routing under `app/`. Shared logic under `src/` (`src/srs`, `src/lib`, `src/components`, `src/features/<feature>`).
- Pure logic (SRS math, rating mapping, game scoring) lives in plain TS modules with unit tests, separate from React components.
- Every Supabase table has a generated TypeScript type. Run `supabase gen types typescript` and commit the output to `src/lib/database.types.ts`. Do not hand-write these types.
- Prefer server-computed values (due queue, streak) fetched via query over recomputing on the client.
- Errors: no silent catches. Surface to the user or log with context.

## Writing style for docs and user-facing copy

- No em dashes. Use commas, parentheses, or two sentences.
- Factual and plain. Avoid hype and "not X, but Y" constructions.
- In-app copy is concise. A definition screen shows the word, part of speech, definition, one example, and audio without a wall of text.

## Definition of done (every task)

A task is complete only when all of these hold:

1. Deliverables in the task file exist and match its acceptance criteria.
2. `tsc --noEmit` passes. Lint passes.
3. Unit tests exist for any pure logic added, and pass.
4. It runs on iOS simulator, Android emulator, and web without a crash on the happy path (for app tasks) or the script runs end to end on a sample input (for pipeline tasks).
5. No server secret is reachable from the client bundle.
6. New tables or columns are added via a numbered migration file, never by editing an applied migration. Regenerate `database.types.ts`.
7. A short note is appended to `PROGRESS.md` (create it if missing): what was built, decisions made, and anything the next phase needs to know.

## Guardrails

- Do not hard-delete user data anywhere. Use soft-delete flags. Account deletion is a Phase 7 concern with explicit handling.
- Do not add analytics that send word-level user performance to third parties beyond what a task specifies.
- Do not call paid APIs (Claude, TTS) at app runtime for content that Phase 1 pre-generates and caches. Runtime paid calls are allowed only where a task explicitly says so (for example, the optional "evaluate my sentence" feature), and must be gated.
- If a task's acceptance criteria conflict with something in `SPEC.md`, stop and flag the conflict rather than guessing.
