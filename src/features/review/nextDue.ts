// Where a review lands on the calendar, worked out before it is committed.
//
// The reveal panel says "Next review in 3 days" while the user is still
// looking at the answer, so the schedule has to be computed ahead of the
// commit. It also has to match the commit exactly. FSRS fuzzes intervals with
// a seed that includes the review timestamp, so the preview and the commit
// both date the review from the same instant: the moment the answer was given.

import type { SessionItem, UserWordState } from '@/lib/types';
import {
  makeScheduler,
  newCard,
  outcomeToRating,
  review,
  rowToCard,
  type GameOutcome,
  type UserWordStateRow,
} from '@/srs/srs';

export function stateToRow(state: UserWordState): UserWordStateRow {
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

/** The instant a review counts from: when the answer was given, or now. */
export function reviewTime(outcome: GameOutcome): Date {
  return outcome.answeredAt ? new Date(outcome.answeredAt) : new Date();
}

/** When the word comes back if this outcome is committed. */
export function previewNextDue(
  item: SessionItem,
  outcome: GameOutcome,
  desiredRetention: number,
): Date {
  const now = reviewTime(outcome);
  const scheduler = makeScheduler(desiredRetention);
  const card = item.state ? rowToCard(stateToRow(item.state)) : newCard(now);
  return review(scheduler, card, outcomeToRating(outcome), now).card.due;
}
