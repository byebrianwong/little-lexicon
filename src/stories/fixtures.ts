// Fixed data for stories. Nothing here reads the clock, a random seed, or the
// network: Chromatic compares images, so a story whose data moves on its own
// reports a diff on every run.
//
// Word content comes from twelve hand-written sample words (sampleCorpus.ts),
// not from the app's words file, so regenerating that file does not change
// any snapshot.

import { buildOptionPool, type OptionPool } from '@/features/games/optionPool';
import { groupWords, type WordCounts, type YourWords } from '@/features/learning/wordProgress';
import { buildTrackers, type AnswerRecord } from '@/features/tracker/tracker';
import { SAMPLE_WORDS } from './sampleWords';
import type {
  DailyStats,
  Profile,
  SessionItem,
  UserWordState,
  WordContent,
  WordSchedule,
} from '@/lib/types';
import type { ForecastDay, LeaderboardEntry } from '@/lib/backend/types';

/** The credit line the words file carries (see pipeline/src/lib/wordnet.ts). */
export const CREDITS: string[] = [
  'Definitions, dictionary examples, synonyms, antonyms and pronunciations from ' +
    'Open English WordNet 2025 (https://en-word.net/), licensed CC BY 4.0.',
];

/** Every sample word, in corpus order. */
export const WORDS: WordContent[] = SAMPLE_WORDS;

/** One word by headword. Throws on a typo rather than rendering a blank story. */
export function word(headword: string): WordContent {
  const found = WORDS.find((w) => w.headword === headword);
  if (!found) throw new Error(`No sample word named "${headword}"`);
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
    knownWordFrequency: 'rarely',
    interests: ['Science', 'Literature'],
    streakCount: 7,
    streakFreezeCount: 1,
    xpTotal: 2450,
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

/** A long-time learner: a big streak and a lot of XP. */
export const VETERAN_PROFILE: Profile = profile({ xpTotal: 18200, streakCount: 63 });

/** The word counts on Home and Progress. */
export function counts(overrides: Partial<WordCounts> = {}): WordCounts {
  return { learning: 12, due: 23, known: 84, ...overrides };
}

export const EMPTY_COUNTS: WordCounts = counts({ learning: 0, due: 0, known: 0 });

// --- The Learning view -------------------------------------------------------

/**
 * The moment the Learning view stories describe their words from. Noon UTC,
 * so "today" and "3 days ago" come out the same in any time zone a snapshot
 * is taken in.
 */
export const STORY_NOW = new Date(TODAY_MS + 12 * 60 * 60 * 1000);

function daysAgo(n: number): string {
  return new Date(STORY_NOW.getTime() - n * DAY_MS).toISOString();
}

/** Answers on the given days ago, right unless the day is in `wrong`. */
function answers(headword: string, days: number[], wrong: number[] = []): AnswerRecord[] {
  const wordId = word(headword).wordId;
  return days.map((d) => ({ wordId, correct: !wrong.includes(d), at: daysAgo(d) }));
}

function scheduled(headword: string, dueInDays: number, extra: Partial<WordSchedule> = {}): WordSchedule {
  return {
    wordId: word(headword).wordId,
    due: new Date(STORY_NOW.getTime() + dueInDays * DAY_MS).toISOString(),
    isKnown: false,
    isSuspended: false,
    ...extra,
  };
}

const HISTORY: AnswerRecord[] = [
  // Learning: a mistake four days ago, right on the two days since.
  ...answers('laconic', [9, 6, 4, 2, 0], [4]),
  // Learning: answered once, in practice only, so never scheduled.
  ...answers('quixotic', [1]),
  // Learning: wrong the last time, so back to no days.
  ...answers('obfuscate', [12, 8, 3], [3]),
  // Learning: three clean days, due again now.
  ...answers('pernicious', [7, 5, 2]),
  // Known: right on six separate days.
  ...answers('ephemeral', [30, 21, 14, 9, 5, 3]),
  ...answers('pragmatic', [40, 25, 18, 11, 6]),
];

const SCHEDULES: WordSchedule[] = [
  scheduled('laconic', 3),
  scheduled('obfuscate', 0),
  scheduled('pernicious', -1),
  scheduled('ephemeral', 24),
  scheduled('pragmatic', 41),
];

/** A learner part way through: four words in progress, two due, two known. */
export const YOUR_WORDS: YourWords = groupWords(
  {
    content: new Map(WORDS.map((w) => [w.wordId, w])),
    trackers: buildTrackers(HISTORY, STORY_NOW),
    schedules: SCHEDULES,
    savedAt: new Map([
      [word('laconic').wordId, daysAgo(11)],
      [word('quixotic').wordId, daysAgo(2)],
    ]),
  },
  STORY_NOW,
);

export const NO_WORDS: YourWords = { learning: [], due: [], known: [] };

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
