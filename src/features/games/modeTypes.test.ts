import { makeOutcome } from './modeTypes';

describe('makeOutcome', () => {
  it('measures the response up to the moment of answering', () => {
    const o = makeOutcome(true, 1_000, false, 3_500);
    expect(o.responseMs).toBe(2_500);
    expect(o.answeredAt).toBe(3_500);
    expect(o.correct).toBe(true);
    expect(o.hintUsed).toBe(false);
    expect(o.firstAttempt).toBe(true);
  });

  it('dates the answer now when no answer time is given', () => {
    const before = Date.now();
    const o = makeOutcome(false, before - 100, true);
    expect(o.answeredAt).toBeGreaterThanOrEqual(before);
    expect(o.responseMs).toBeGreaterThanOrEqual(100);
  });
});
