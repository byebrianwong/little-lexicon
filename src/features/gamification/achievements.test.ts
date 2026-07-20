import { newlyUnlocked, ACHIEVEMENTS } from './achievements';

const zero = {
  wordsStarted: 0,
  streakCount: 0,
  xpTotal: 0,
  sessionReviewed: 0,
  sessionCorrect: 0,
};

describe('newlyUnlocked', () => {
  it('unlocks first_session after one review', () => {
    const codes = newlyUnlocked({ ...zero, sessionReviewed: 1 }, []);
    expect(codes).toContain('first_session');
  });

  it('does not re-report already unlocked codes', () => {
    const codes = newlyUnlocked({ ...zero, sessionReviewed: 1 }, ['first_session']);
    expect(codes).not.toContain('first_session');
  });

  it('unlocks perfect_session only on a clean session of five or more', () => {
    expect(newlyUnlocked({ ...zero, sessionReviewed: 5, sessionCorrect: 5 }, [])).toContain(
      'perfect_session',
    );
    expect(newlyUnlocked({ ...zero, sessionReviewed: 5, sessionCorrect: 4 }, [])).not.toContain(
      'perfect_session',
    );
    expect(newlyUnlocked({ ...zero, sessionReviewed: 3, sessionCorrect: 3 }, [])).not.toContain(
      'perfect_session',
    );
  });

  it('unlocks streak and xp milestones on their real thresholds', () => {
    expect(newlyUnlocked({ ...zero, streakCount: 7 }, [])).toContain('streak_7');
    expect(newlyUnlocked({ ...zero, streakCount: 6 }, [])).not.toContain('streak_7');
    expect(newlyUnlocked({ ...zero, xpTotal: 1000 }, [])).toContain('xp_1000');
  });

  it('every achievement has a unique code', () => {
    const codes = ACHIEVEMENTS.map((a) => a.code);
    expect(new Set(codes).size).toBe(codes.length);
  });
});
