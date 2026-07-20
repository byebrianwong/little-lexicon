// src/srs/srs.ts
// FSRS wrapper and game-outcome -> rating mapping.
// Starting artifact for Phase 2. Keep pure and unit-tested; no React, no Supabase here.
//
// Depends on: ts-fsrs  (https://github.com/open-spaced-repetition/ts-fsrs)
//   npm i ts-fsrs
// Version-pin it. The Card interface has changed across majors:
//   - elapsed_days is deprecated in v6
//   - learning_steps was added in v4+
// Pin to the version you install and adjust the row mapping below to match.

import {
  fsrs,
  generatorParameters,
  createEmptyCard,
  Rating,
  State,
  type Card,
  type FSRS,
  type Grade,
  type RecordLogItem,
} from 'ts-fsrs';

// ---------------------------------------------------------------------------
// Instance
// ---------------------------------------------------------------------------

/**
 * Build an FSRS scheduler for a given desired retention (0.80 - 0.95).
 * Pass a user's stored weights once per-user optimization exists; until then,
 * omit `w` to use library defaults.
 */
export function makeScheduler(desiredRetention = 0.9, w?: number[]): FSRS {
  const params = generatorParameters({
    request_retention: desiredRetention,
    enable_fuzz: true, // small interval randomization to avoid review pile-ups
    ...(w ? { w } : {}),
  });
  return fsrs(params);
}

/** A brand-new card for a (user, word) that has never been seen. */
export function newCard(now: Date = new Date()): Card {
  return createEmptyCard(now);
}

// ---------------------------------------------------------------------------
// Outcome -> Rating mapping
// ---------------------------------------------------------------------------

export interface GameOutcome {
  correct: boolean;
  firstAttempt: boolean;
  hintUsed: boolean;
  responseMs: number;
}

/** Response slower than this still counts as correct, but downgraded to Hard. */
export const SLOW_THRESHOLD_MS = 8000;
/** Fast-and-clean answers earn Easy. */
export const FAST_THRESHOLD_MS = 3000;

/**
 * Map a game result to an FSRS grade.
 *   incorrect                              -> Again
 *   correct, but hint used or slow         -> Hard
 *   correct, fast, first attempt, no hint  -> Easy
 *   correct otherwise                      -> Good
 *
 * Returns a Grade (Again/Hard/Good/Easy); never the Manual rating.
 */
export function outcomeToRating(o: GameOutcome): Grade {
  if (!o.correct) return Rating.Again;
  if (o.hintUsed || o.responseMs > SLOW_THRESHOLD_MS) return Rating.Hard;
  if (o.firstAttempt && o.responseMs <= FAST_THRESHOLD_MS) return Rating.Easy;
  return Rating.Good;
}

// ---------------------------------------------------------------------------
// Review
// ---------------------------------------------------------------------------

/**
 * Apply a review. Returns the updated card and the log entry.
 * Persist `card` to little_lexicon.user_word_state and `log` to little_lexicon.review_logs.
 */
export function review(
  scheduler: FSRS,
  card: Card,
  rating: Grade,
  now: Date = new Date(),
): RecordLogItem {
  return scheduler.next(card, now, rating);
}

/**
 * Preview the four possible next intervals without committing.
 * Useful for showing "next review in ..." hints per answer choice.
 */
export function previewIntervals(scheduler: FSRS, card: Card, now: Date = new Date()) {
  const log = scheduler.repeat(card, now);
  return {
    again: log[Rating.Again].card.due,
    hard: log[Rating.Hard].card.due,
    good: log[Rating.Good].card.due,
    easy: log[Rating.Easy].card.due,
  };
}

// ---------------------------------------------------------------------------
// DB row <-> Card mapping
// Column names match little_lexicon.user_word_state in migration 0001.
// ---------------------------------------------------------------------------

const STATE_TO_DB: Record<State, string> = {
  [State.New]: 'new',
  [State.Learning]: 'learning',
  [State.Review]: 'review',
  [State.Relearning]: 'relearning',
};

const DB_TO_STATE: Record<string, State> = {
  new: State.New,
  learning: State.Learning,
  review: State.Review,
  relearning: State.Relearning,
};

export interface UserWordStateRow {
  due: string; // ISO timestamptz
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: string;
  last_review: string | null;
  learning_steps: number;
}

export function cardToRow(card: Card): UserWordStateRow {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    // If your pinned ts-fsrs version dropped elapsed_days, default to 0.
    elapsed_days: (card as unknown as { elapsed_days?: number }).elapsed_days ?? 0,
    scheduled_days: card.scheduled_days,
    reps: card.reps,
    lapses: card.lapses,
    state: STATE_TO_DB[card.state],
    last_review: card.last_review ? card.last_review.toISOString() : null,
    learning_steps: (card as unknown as { learning_steps?: number }).learning_steps ?? 0,
  };
}

export function rowToCard(row: UserWordStateRow): Card {
  return {
    due: new Date(row.due),
    stability: row.stability,
    difficulty: row.difficulty,
    elapsed_days: row.elapsed_days,
    scheduled_days: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: DB_TO_STATE[row.state] ?? State.New,
    last_review: row.last_review ? new Date(row.last_review) : undefined,
    learning_steps: row.learning_steps,
  } as unknown as Card;
}

export { Rating, State };
