import type { SessionItem, UserWordState, WordContent } from '@/lib/types';
import { makeScheduler, outcomeToRating, review, rowToCard, type GameOutcome } from '@/srs/srs';
import { previewNextDue, reviewTime, stateToRow } from './nextDue';

const content = { wordId: 1 } as unknown as WordContent;
const answeredAt = Date.UTC(2026, 8, 24, 9, 0, 0);

function outcome(overrides: Partial<GameOutcome>): GameOutcome {
  return { correct: true, firstAttempt: true, hintUsed: false, responseMs: 4000, answeredAt, ...overrides };
}

function reviewItem(overrides: Partial<UserWordState> = {}): SessionItem {
  const state: UserWordState = {
    wordId: 1,
    due: new Date(answeredAt).toISOString(),
    stability: 12,
    difficulty: 5,
    elapsedDays: 12,
    scheduledDays: 12,
    reps: 4,
    lapses: 0,
    state: 'review',
    lastReview: new Date(answeredAt - 12 * 86_400_000).toISOString(),
    learningSteps: 0,
    isKnown: false,
    isSuspended: false,
    ...overrides,
  };
  return { content, state, isNew: false };
}

describe('reviewTime', () => {
  it('dates the review from the answer when the outcome carries one', () => {
    expect(reviewTime(outcome({})).getTime()).toBe(answeredAt);
  });
  it('falls back to now', () => {
    const before = Date.now();
    expect(reviewTime(outcome({ answeredAt: undefined })).getTime()).toBeGreaterThanOrEqual(before);
  });
});

describe('previewNextDue', () => {
  it('matches what a commit at the same instant would schedule, fuzz included', () => {
    const item = reviewItem();
    const o = outcome({});
    const expected = review(
      makeScheduler(0.9),
      rowToCard(stateToRow(item.state!)),
      outcomeToRating(o),
      new Date(answeredAt),
    ).card.due;
    expect(previewNextDue(item, o, 0.9).getTime()).toBe(expected.getTime());
  });

  it('schedules a better answer further out', () => {
    const item = reviewItem();
    const hard = previewNextDue(item, outcome({ hintUsed: true }), 0.9);
    const good = previewNextDue(item, outcome({}), 0.9);
    const easy = previewNextDue(item, outcome({ responseMs: 1000 }), 0.9);
    expect(good.getTime()).toBeGreaterThan(hard.getTime());
    expect(easy.getTime()).toBeGreaterThan(good.getTime());
  });

  it('brings a missed word back within minutes', () => {
    const due = previewNextDue(reviewItem(), outcome({ correct: false }), 0.9);
    expect(due.getTime() - answeredAt).toBeLessThanOrEqual(10 * 60_000);
  });

  it('starts a new word in the learning steps', () => {
    const item: SessionItem = { content, state: null, isNew: true };
    const due = previewNextDue(item, outcome({}), 0.9);
    expect(due.getTime() - answeredAt).toBe(10 * 60_000);
  });
});
