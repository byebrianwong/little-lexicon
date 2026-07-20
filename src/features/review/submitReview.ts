// The review commit path (Phase 2.3). Given a session item and the game
// outcome, this computes the FSRS update and the XP, then hands a single
// atomic write to the backend (an RPC transaction in production).

import type { GameModeId, Profile, SessionItem, UserWordState } from '@/lib/types';
import {
  makeScheduler,
  newCard,
  outcomeToRating,
  review,
  cardToRow,
  rowToCard,
  FAST_THRESHOLD_MS,
  Rating,
  type GameOutcome,
  type UserWordStateRow,
} from '@/srs/srs';
import { xpForOutcome } from '@/features/gamification/xp';
import { backend } from '@/lib/backend';
import type { SubmitReviewResult } from '@/lib/backend';

function stateToRow(state: UserWordState): UserWordStateRow {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    elapsed_days: state.elapsedDays,
    scheduled_days: state.scheduledDays,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state,
    last_review: state.lastReview,
    learning_steps: state.learningSteps,
  };
}

export interface ReviewCommit {
  result: SubmitReviewResult;
  rating: Rating;
  xp: number;
  nextDue: Date;
  correct: boolean;
}

export interface SubmitReviewParams {
  item: SessionItem;
  outcome: GameOutcome;
  mode: GameModeId;
  profile: Profile;
  now?: Date;
}

export async function submitReview(params: SubmitReviewParams): Promise<ReviewCommit> {
  const { item, outcome, mode, profile } = params;
  const now = params.now ?? new Date();

  // Per-user weight optimization is future scope; build from desired retention.
  const scheduler = makeScheduler(profile.desiredRetention);
  const card = item.state ? rowToCard(stateToRow(item.state)) : newCard(now);

  const rating = outcomeToRating(outcome);

  // Predicted recall at review time, logged for later analysis. Guarded because
  // it is undefined for brand-new cards in some ts-fsrs versions.
  let retrievability: number | null = null;
  try {
    if (item.state && item.state.reps > 0) {
      const r = (scheduler as unknown as {
        get_retrievability?: (c: unknown, n: Date, fmt: boolean) => number;
      }).get_retrievability?.(card, now, false);
      retrievability = typeof r === 'number' ? r : null;
    }
  } catch {
    retrievability = null;
  }

  const { card: next } = review(scheduler, card, rating, now);
  const row = cardToRow(next);

  const xp = xpForOutcome({
    mode,
    rating,
    firstAttempt: outcome.firstAttempt,
    fast: outcome.responseMs <= FAST_THRESHOLD_MS,
  });

  const result = await backend.submitReview({
    wordId: item.content.wordId,
    card: row,
    rating,
    stateBefore: item.state?.state ?? 'new',
    gameMode: mode,
    responseMs: Math.round(outcome.responseMs),
    retrievability,
    xp,
    isNew: item.isNew,
  });

  return {
    result,
    rating,
    xp,
    nextDue: next.due,
    correct: rating !== Rating.Again,
  };
}
