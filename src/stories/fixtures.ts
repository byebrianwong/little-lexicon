// Fixed data for stories. Nothing here reads the clock, a random seed, or the
// network: Chromatic compares images, so a story whose data moves on its own
// reports a diff on every run.
//
// Word content comes from the bundled demo corpus rather than a second set of
// invented words, so stories show the same text the app shows in demo mode.

import { buildOptionPool, type OptionPool } from '@/features/games/optionPool';
import { DEMO_WORDS } from '@/lib/backend/demo/content';
import type {
  DailyStats,
  Profile,
  SessionItem,
  UserWordState,
  WordContent,
} from '@/lib/types';
import type { ForecastDay, LeaderboardEntry, ProgressCounts } from '@/lib/backend/types';

/** Every demo word, easiest first. */
export const WORDS: WordContent[] = DEMO_WORDS;

/** One word by headword. Throws on a typo rather than rendering a blank story. */
export function word(headword: string): WordContent {
  const found = WORDS.find((w) => w.headword === headword);
  if (!found) throw new Error(`No demo word named "${headword}"`);
  return found;
}

// A Monday, so week-aligned grids (the heatmap) start in a stable place.
const DAY_MS = 24 * 60 * 60 * 1000;
export const TODAY = '2026-01-19';
const TODAY_MS = Date.UTC(2026, 0, 19);

function isoDay(offsetDays: number): string {
  return new Date(TODAY_MS + offsetDays * DAY_MS).toISOString().slice(0, 10);
}

/** SRS state for a word that has been reviewed a few times. */
export function reviewState(overrides: Partial<UserWordState> = {}): UserWordState {
  return {
    wordId: 1,
    due: `${isoDay(2)}T09:00:00.000Z`,
    stability: 12.4,
    difficulty: 5.1,
    elapsedDays: 6,
    scheduledDays: 8,
    reps: 4,
    lapses: 1,
    state: 'review',
    lastReview: `${isoDay(-6)}T09:00:00.000Z`,
    learningSteps: 0,
    isKnown: false,
    isSuspended: false,
    ...overrides,
  };
}

/** A word the user has never seen. */
export function newItem(headword: string): SessionItem {
  const content = word(headword);
  return { content, state: null, isNew: true };
}

/** A word already in the schedule. */
export function reviewItem(
  headword: string,
  overrides: Partial<UserWordState> = {},
): SessionItem {
  const content = word(headword);
  return {
    content,
    state: reviewState({ wordId: content.wordId, ...overrides }),
    isNew: false,
  };
}

/** A mixed queue: due reviews first, then new words, as the planner orders them. */
export const SESSION_ITEMS: SessionItem[] = [
  reviewItem('ephemeral'),
  reviewItem('laconic', { reps: 9, stability: 40, state: 'review' }),
  reviewItem('obfuscate', { reps: 1, state: 'learning', learningSteps: 1 }),
  newItem('quixotic'),
  newItem('sycophant'),
];

/**
 * Distractors for the recognition modes. Built from the whole corpus so options
 * are plausible, and deterministic because the corpus order is fixed.
 */
export const POOL: OptionPool = buildOptionPool(
  WORDS.map<SessionItem>((content) => ({ content, state: null, isNew: false })),
);

export function profile(overrides: Partial<Profile> = {}): Profile {
  return {
    userId: 'story-user',
    displayName: 'Ada',
    levelEstimate: 3,
    dailyGoal: 15,
    desiredRetention: 0.9,
    interests: ['Science', 'Literature'],
    streakCount: 7,
    streakFreezeCount: 1,
    xpTotal: 2450,
    isPro: false,
    onboardedAt: `${isoDay(-60)}T10:00:00.000Z`,
    reminderHour: 18,
    lastGoalMetDay: isoDay(-1),
    ...overrides,
  };
}

/** Signed up minutes ago: no streak, no XP, no name. */
export const NEW_PROFILE: Profile = profile({
  displayName: null,
  levelEstimate: null,
  streakCount: 0,
  streakFreezeCount: 0,
  xpTotal: 0,
  interests: [],
  onboardedAt: null,
  reminderHour: null,
  lastGoalMetDay: null,
});

export const PRO_PROFILE: Profile = profile({ isPro: true, xpTotal: 18200, streakCount: 63 });

export function counts(overrides: Partial<ProgressCounts> = {}): ProgressCounts {
  return {
    known: 84,
    learning: 12,
    due: 23,
    reviewCount: 96,
    knownTotal: 84,
    total: 140,
    ...overrides,
  };
}

export const EMPTY_COUNTS: ProgressCounts = counts({
  known: 0,
  learning: 0,
  due: 0,
  reviewCount: 0,
  knownTotal: 0,
  total: 0,
});

/**
 * Daily activity ending today, cycling through every shade the heatmap defines
 * (0, under 5, under 10, under 20, 20 and over) so the legend is fully covered.
 */
const ACTIVITY = [12, 8, 0, 25, 3, 17, 0, 6, 21, 0, 9, 14, 2, 30];

export function dailyStats(count: number, pattern: number[] = ACTIVITY): DailyStats[] {
  return Array.from({ length: count }, (_, i) => {
    const reviewsDone = pattern[i % pattern.length] ?? 0;
    return {
      day: isoDay(i - (count - 1)),
      reviewsDone,
      newLearned: reviewsDone > 0 ? i % 4 : 0,
      xp: reviewsDone * 10,
      goalMet: reviewsDone >= 10,
    };
  });
}

export function today(overrides: Partial<DailyStats> = {}): DailyStats {
  return { day: TODAY, reviewsDone: 9, newLearned: 2, xp: 130, goalMet: false, ...overrides };
}

// Review load that rises and falls, including two quiet days, so the bar chart
// shows both a full bar and an empty one.
const FORECAST = [14, 9, 0, 22, 18, 5, 11, 0, 7, 26, 13, 4, 16, 8];

export function forecast(days = 14): ForecastDay[] {
  return Array.from({ length: days }, (_, i) => ({
    day: isoDay(i + 1),
    dueCount: FORECAST[i % FORECAST.length] ?? 0,
  }));
}

export const LEADERBOARD: LeaderboardEntry[] = [
  { userId: 'u1', displayName: 'Mira', cohort: 3, weeklyXp: 1820, rankInCohort: 1, isCurrentUser: false },
  { userId: 'u2', displayName: 'Tomas', cohort: 3, weeklyXp: 1465, rankInCohort: 2, isCurrentUser: false },
  { userId: 'story-user', displayName: 'Ada', cohort: 3, weeklyXp: 1190, rankInCohort: 3, isCurrentUser: true },
  { userId: 'u4', displayName: null, cohort: 3, weeklyXp: 940, rankInCohort: 4, isCurrentUser: false },
  { userId: 'u5', displayName: 'Priya', cohort: 3, weeklyXp: 615, rankInCohort: 5, isCurrentUser: false },
  { userId: 'u6', displayName: 'Ken', cohort: 3, weeklyXp: 120, rankInCohort: 6, isCurrentUser: false },
];

export const UNLOCKED_ACHIEVEMENTS = ['first_session', 'ten_words', 'streak_7'];
