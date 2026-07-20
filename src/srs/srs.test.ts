import {
  makeScheduler,
  newCard,
  outcomeToRating,
  review,
  previewIntervals,
  cardToRow,
  rowToCard,
  Rating,
  State,
  SLOW_THRESHOLD_MS,
  FAST_THRESHOLD_MS,
} from './srs';

const now = new Date('2026-07-18T12:00:00Z');

describe('outcomeToRating', () => {
  it('maps an incorrect answer to Again', () => {
    expect(
      outcomeToRating({ correct: false, firstAttempt: true, hintUsed: false, responseMs: 500 }),
    ).toBe(Rating.Again);
  });

  it('maps a hint or a slow answer to Hard', () => {
    expect(
      outcomeToRating({ correct: true, firstAttempt: true, hintUsed: true, responseMs: 500 }),
    ).toBe(Rating.Hard);
    expect(
      outcomeToRating({
        correct: true,
        firstAttempt: true,
        hintUsed: false,
        responseMs: SLOW_THRESHOLD_MS + 1,
      }),
    ).toBe(Rating.Hard);
  });

  it('maps a fast clean first attempt to Easy', () => {
    expect(
      outcomeToRating({
        correct: true,
        firstAttempt: true,
        hintUsed: false,
        responseMs: FAST_THRESHOLD_MS - 1,
      }),
    ).toBe(Rating.Easy);
  });

  it('maps an ordinary correct answer to Good', () => {
    expect(
      outcomeToRating({
        correct: true,
        firstAttempt: false,
        hintUsed: false,
        responseMs: 4000,
      }),
    ).toBe(Rating.Good);
  });
});

describe('review scheduling', () => {
  it('pushes the due date into the future after a Good review', () => {
    const scheduler = makeScheduler(0.9);
    const card = newCard(now);
    const { card: next } = review(scheduler, card, Rating.Good, now);
    expect(next.due.getTime()).toBeGreaterThan(now.getTime());
    expect(next.reps).toBe(1);
  });

  it('previewIntervals returns four future dates ordered Again <= Hard <= Good <= Easy', () => {
    const scheduler = makeScheduler(0.9);
    const card = newCard(now);
    const p = previewIntervals(scheduler, card, now);
    expect(p.again.getTime()).toBeLessThanOrEqual(p.hard.getTime());
    expect(p.hard.getTime()).toBeLessThanOrEqual(p.good.getTime());
    expect(p.good.getTime()).toBeLessThanOrEqual(p.easy.getTime());
  });
});

describe('card <-> row round trip', () => {
  it('preserves the FSRS fields through cardToRow/rowToCard', () => {
    const scheduler = makeScheduler(0.9);
    const start = newCard(now);
    const { card } = review(scheduler, start, Rating.Good, now);
    const row = cardToRow(card);
    const back = rowToCard(row);

    expect(back.stability).toBeCloseTo(card.stability, 6);
    expect(back.difficulty).toBeCloseTo(card.difficulty, 6);
    expect(back.reps).toBe(card.reps);
    expect(back.lapses).toBe(card.lapses);
    expect(back.state).toBe(card.state);
    expect(back.due.toISOString()).toBe(card.due.toISOString());
    expect(rowToCard(row).state).not.toBeUndefined();
  });

  it('maps every enum state to a db string and back', () => {
    for (const state of [State.New, State.Learning, State.Review, State.Relearning]) {
      const row = cardToRow({ ...newCard(now), state } as never);
      expect(rowToCard(row).state).toBe(state);
    }
  });
});
