import { applyGoalMet, daysBetween, streakAtRisk } from './streak';

const base = { streakCount: 5, streakFreezeCount: 1, lastGoalMetDay: '2026-07-10' };

describe('daysBetween', () => {
  it('counts calendar days at UTC', () => {
    expect(daysBetween('2026-07-10', '2026-07-11')).toBe(1);
    expect(daysBetween('2026-07-10', '2026-07-12')).toBe(2);
    expect(daysBetween('2026-02-28', '2026-03-01')).toBe(1);
  });
});

describe('applyGoalMet', () => {
  it('starts a streak at 1 on the first goal-met day', () => {
    const r = applyGoalMet(
      { streakCount: 0, streakFreezeCount: 0, lastGoalMetDay: null },
      '2026-07-18',
    );
    expect(r.streakCount).toBe(1);
    expect(r.advanced).toBe(true);
  });

  it('advances once on a consecutive day', () => {
    const r = applyGoalMet(base, '2026-07-11');
    expect(r.streakCount).toBe(6);
    expect(r.freezeConsumed).toBe(false);
  });

  it('is a no-op when the same day is counted twice', () => {
    const r = applyGoalMet(base, '2026-07-10');
    expect(r.streakCount).toBe(5);
    expect(r.advanced).toBe(false);
  });

  it('consumes a freeze to survive exactly one missed day', () => {
    const r = applyGoalMet(base, '2026-07-12'); // gap 2
    expect(r.streakCount).toBe(6);
    expect(r.streakFreezeCount).toBe(0);
    expect(r.freezeConsumed).toBe(true);
  });

  it('resets when a day is missed and no freeze is available', () => {
    const r = applyGoalMet(
      { streakCount: 5, streakFreezeCount: 0, lastGoalMetDay: '2026-07-10' },
      '2026-07-12',
    );
    expect(r.streakCount).toBe(1);
    expect(r.freezeConsumed).toBe(false);
  });

  it('resets when two or more days are missed even with a freeze', () => {
    const r = applyGoalMet(base, '2026-07-14'); // gap 4
    expect(r.streakCount).toBe(1);
    expect(r.streakFreezeCount).toBe(1); // freeze not spent on a lost streak
  });
});

describe('streakAtRisk', () => {
  it('is true once a day has passed since the last goal met', () => {
    expect(streakAtRisk(base, '2026-07-11')).toBe(true);
    expect(streakAtRisk(base, '2026-07-10')).toBe(false);
  });
});
