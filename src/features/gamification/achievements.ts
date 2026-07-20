// Achievements (Phase 5.5). Pure condition checks so unlocks fire on real
// conditions and are unit tested. The runner evaluates these after a session and
// persists any newly unlocked codes.

export interface AchievementContext {
  wordsStarted: number; // words with any state (learning/known/review)
  streakCount: number;
  xpTotal: number;
  sessionReviewed: number;
  sessionCorrect: number;
}

export interface Achievement {
  code: string;
  title: string;
  description: string;
  test: (ctx: AchievementContext) => boolean;
}

export const ACHIEVEMENTS: Achievement[] = [
  {
    code: 'first_session',
    title: 'First steps',
    description: 'Complete your first review session.',
    test: (c) => c.sessionReviewed >= 1,
  },
  {
    code: 'ten_words',
    title: 'Getting going',
    description: 'Start learning 10 words.',
    test: (c) => c.wordsStarted >= 10,
  },
  {
    code: 'hundred_words',
    title: 'Century',
    description: 'Start learning 100 words.',
    test: (c) => c.wordsStarted >= 100,
  },
  {
    code: 'streak_7',
    title: 'Seven-day streak',
    description: 'Meet your daily goal seven days running.',
    test: (c) => c.streakCount >= 7,
  },
  {
    code: 'perfect_session',
    title: 'Flawless',
    description: 'Finish a session of five or more with no mistakes.',
    test: (c) => c.sessionReviewed >= 5 && c.sessionCorrect === c.sessionReviewed,
  },
  {
    code: 'xp_1000',
    title: 'Wordsmith',
    description: 'Earn 1,000 total XP.',
    test: (c) => c.xpTotal >= 1000,
  },
];

const BY_CODE = new Map(ACHIEVEMENTS.map((a) => [a.code, a]));

export function achievementByCode(code: string): Achievement | undefined {
  return BY_CODE.get(code);
}

/** Codes newly satisfied by `ctx` that are not already in `alreadyUnlocked`. */
export function newlyUnlocked(
  ctx: AchievementContext,
  alreadyUnlocked: Iterable<string>,
): string[] {
  const have = new Set(alreadyUnlocked);
  return ACHIEVEMENTS.filter((a) => !have.has(a.code) && a.test(ctx)).map((a) => a.code);
}
