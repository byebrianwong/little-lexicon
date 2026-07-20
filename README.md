# Little Lexicon (Claude Code Handoff Package)

This package is an execution spec for building an advanced-English vocabulary app. It is written for an agent (Claude Code) to implement with limited back-and-forth, and it is structured so phases can be parceled out to sub-agents.

The product is named **Little Lexicon** (working name). `little_lexicon` remains the internal namespace, used for the repo directory, the Postgres schema, the `little-lexicon-audio` bucket, the `little-lexicon-` Edge Function prefix, and storage keys. Only the display name and store-facing copy carry "Little Lexicon"; renaming the internal `little_lexicon` namespace is optional and separate.

## Implementation status

All eight phases are built. See `PROGRESS.md` for the full per-phase log and every decision made.

- Universal Expo app (iOS / Android / web from one codebase) under `app/` and `src/`.
- SRS core on `ts-fsrs`, seven game modes plus a speed round, XP/streaks/leaderboard/achievements, adaptive onboarding, and the freemium paywall.
- Supabase schema (`supabase/migrations/`), the transactional review RPC, stats functions, the weekly leaderboard, and four `little-lexicon-*` Edge Functions (`supabase/functions/`).
- The offline content-and-audio pipeline (`pipeline/`), standalone Node with a no-network dry run.
- Store-readiness docs in `docs/`, `eas.json`, and CI in `.github/workflows/ci.yml`.

Verified in this build: `tsc --noEmit` (0 errors), ESLint (0 warnings), 64 Jest unit tests, a successful `expo export --platform web`, and a manual walk of the onboarding-to-session loop in the browser. Not exercised here (needs infra): iOS/Android simulators, a live Supabase database, EAS builds, and any paid API call.

### Quickstart

```
npm install
cp .env.example .env      # runs in demo mode as-is; add Supabase keys to go live
npm test                  # unit tests
npm run typecheck         # tsc --noEmit
npm run lint
npx expo start            # run on iOS / Android / web
```

The app runs in **demo mode** by default (a bundled in-memory corpus, no network) so it is playable immediately. To use the real backend, set `EXPO_PUBLIC_SUPABASE_URL` and `EXPO_PUBLIC_SUPABASE_ANON_KEY`, apply the migrations, deploy the Edge Functions, run the Phase 1 pipeline, and regenerate `src/lib/database.types.ts` with `npm run gen:types`.

## What this app is

A native (iOS/Android) plus web vocabulary app for native English speakers learning erudite / GRE-and-beyond words. It combines a spaced-repetition engine (FSRS), retrieval-based game modes, example sentences at every encounter, and audio. The learning-science rationale and competitive analysis behind these choices live in the separate design brief; this package assumes those decisions are settled and focuses on building.

## How to use this package

1. Read `SPEC.md` for the architecture, data model, and product loop.
2. Read `CLAUDE.md` for conventions, guardrails, and the definition of done every task must meet.
3. Work the phases in `tasks/` in order. Each task file is self-contained: goal, dependencies, deliverables, steps, and acceptance criteria.
4. `supabase/migrations/0001_init_little_lexicon_schema.sql` and `src/srs/srs.ts` are starting artifacts, not throwaway examples. Use them as the basis for Phase 0 and Phase 2.

## File tree

```
little-lexicon-app-handoff/
├── README.md                              This file
├── CLAUDE.md                              Conventions, stack, guardrails, definition of done
├── SPEC.md                                Product loop, architecture, data model, cost model
├── supabase/
│   └── migrations/
│       └── 0001_init_little_lexicon_schema.sql     Full initial schema (little_lexicon schema, RLS)
├── src/
│   └── srs/
│       └── srs.ts                          FSRS wrapper + rating mapping (ts-fsrs)
└── tasks/
    ├── phase-0-foundations.md
    ├── phase-1-content-pipeline.md
    ├── phase-2-srs-core.md
    ├── phase-3-learning-loop.md
    ├── phase-4-game-modes.md
    ├── phase-5-gamification.md
    ├── phase-6-onboarding-personalization.md
    └── phase-7-monetization-polish.md
```

## Phase dependency graph

```
Phase 0 (foundations)
   ├──> Phase 1 (content pipeline)  ─── independent of the app UI; can run in parallel with 2/3
   └──> Phase 2 (SRS core)
           └──> Phase 3 (learning loop + first games)   [needs Phase 1 data seeded]
                   └──> Phase 4 (more game modes)
                           └──> Phase 5 (gamification + progress)
                                   └──> Phase 6 (onboarding + personalization)
                                           └──> Phase 7 (monetization + polish + ship)
```

## Fanning out to sub-agents

Phase 1 (content/data pipeline, standalone Node scripts) shares no source with the app runtime and can run as its own agent while another agent does Phases 0 and 2. Within a phase, each task lists whether it can be split. Suggested concurrent tracks after Phase 0 lands:

- Track A (data): Phase 1.
- Track B (app): Phase 2, then 3, then 4+.

Keep each sub-agent scoped to one task file at a time. Have it open a branch per task, satisfy the acceptance criteria, and stop. Do not let a sub-agent modify the schema outside the migration files, or change `src/srs/srs.ts` outside Phase 2.
