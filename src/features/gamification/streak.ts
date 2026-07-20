// Streak logic with a limited freeze (SPEC section 8, Phase 5.2).
// Pure and unit tested. Streak credit is only ever computed from a real
// goal-met day; there is no path here that advances a streak without one.

export interface StreakState {
  streakCount: number;
  streakFreezeCount: number;
  lastGoalMetDay: string | null; // YYYY-MM-DD
}

export interface StreakResult extends StreakState {
  freezeConsumed: boolean;
  advanced: boolean;
}

/** Whole days between two YYYY-MM-DD strings, computed at UTC midnight. */
export function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}

/**
 * Recompute streak when `today`'s goal has just been met.
 * - First ever goal-met day -> streak 1.
 * - Consecutive day -> +1.
 * - Exactly one missed day -> a freeze (if available) preserves and extends the
 *   streak, consuming one freeze; otherwise the streak resets to 1.
 * - Two or more missed days -> reset to 1 (a single freeze covers one day only).
 * Re-running for the same day is a no-op.
 */
export function applyGoalMet(state: StreakState, today: string): StreakResult {
  const base: StreakResult = { ...state, freezeConsumed: false, advanced: false };

  if (state.lastGoalMetDay === today) {
    return base; // already counted today
  }

  if (state.lastGoalMetDay === null) {
    return { ...base, streakCount: 1, lastGoalMetDay: today, advanced: true };
  }

  const gap = daysBetween(state.lastGoalMetDay, today);

  if (gap <= 0) {
    // Clock skew or out-of-order day; do not corrupt the streak.
    return base;
  }

  if (gap === 1) {
    return {
      ...base,
      streakCount: state.streakCount + 1,
      lastGoalMetDay: today,
      advanced: true,
    };
  }

  if (gap === 2 && state.streakFreezeCount > 0) {
    return {
      ...base,
      streakCount: state.streakCount + 1,
      streakFreezeCount: state.streakFreezeCount - 1,
      lastGoalMetDay: today,
      freezeConsumed: true,
      advanced: true,
    };
  }

  // Missed too many days (or no freeze available): start over at 1.
  return { ...base, streakCount: 1, lastGoalMetDay: today, advanced: true };
}

/**
 * Whether the streak is currently at risk of resetting on the next miss.
 * Used to nudge the user; does not mutate anything.
 */
export function streakAtRisk(state: StreakState, today: string): boolean {
  if (state.lastGoalMetDay === null) return false;
  const gap = daysBetween(state.lastGoalMetDay, today);
  return gap >= 1 && state.streakCount > 0;
}
