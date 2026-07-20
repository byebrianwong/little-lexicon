# Phase 2: SRS Core

Wire FSRS into the app and backend so words can be scheduled and reviewed. No games yet, just the scheduling engine and the queries around it.

**Depends on:** Phase 0. Uses `src/srs/srs.ts` (provided).
**Splittable:** 2.1 and 2.2 can run concurrently; 2.3 depends on both.

## 2.1 Finalize the FSRS wrapper

- Install and version-pin `ts-fsrs`. Ref: https://github.com/open-spaced-repetition/ts-fsrs
- Confirm `src/srs/srs.ts` compiles against the pinned version. Adjust `cardToRow` / `rowToCard` if the pinned `Card` interface differs (note the `elapsed_days` and `learning_steps` caveats in the file).
- Unit test: `outcomeToRating` for each branch; a new card reviewed `Good` produces an increasing due date; `previewIntervals` returns four ordered future dates.

**Acceptance:** unit tests pass; the wrapper round-trips a card through `cardToRow` and `rowToCard` without loss.

## 2.2 Scheduling queries

- Add a data module `src/features/review/queries.ts` with:
  - `getDueQueue(limit)`: rows from `little_lexicon.user_word_state` where `due <= now()` and not suspended, ordered by `due`, joined to word content needed to render a card.
  - `getNewWords(limit)`: words with no `user_word_state` row for this user, ordered by `difficulty_tier` then `frequency_rank`, excluding words marked known.
  - `startSession()` / `endSession(stats)` against `little_lexicon.game_sessions`.
- Respect the daily new-word cap from `profiles.daily_goal` (and later the Pro/free limit).

**Acceptance:** for a seeded test user, `getDueQueue` and `getNewWords` return correct sets; queries use the `idx_uws_due` index (verify with `explain`).

## 2.3 Review commit path

- Implement `submitReview(wordId, outcome)`:
  1. Load or create the card (`newCard` if no row).
  2. `outcomeToRating(outcome)` then `review(scheduler, card, rating)`.
  3. Upsert the updated card into `little_lexicon.user_word_state` (via `cardToRow`).
  4. Insert a `little_lexicon.review_logs` row (rating, state_before, game_mode, response_ms, scheduled_days, retrievability).
  5. Update `little_lexicon.daily_stats` for today.
- Build the scheduler from the user's `desired_retention` (and `fsrs_weights` if present, else defaults).
- Do steps 3 to 5 in one transaction (an Edge Function `little-lexicon-submit-review`, or a Postgres RPC) so a card update and its log stay consistent. Refs: https://supabase.com/docs/guides/database/functions

**Acceptance:** submitting a review updates the card, writes exactly one log row, and updates `daily_stats`; a failure rolls all three back; concurrent submits for the same card do not corrupt state.

## Definition of done

All acceptance criteria above, plus the shared checklist in `CLAUDE.md`. Append a Phase 2 note to `PROGRESS.md`: pinned `ts-fsrs` version, whether review commit is an Edge Function or RPC, and the rating thresholds used.
