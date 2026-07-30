// The single data-access contract the app depends on. Two implementations
// satisfy it: a Supabase-backed one (production) and an in-memory demo one.
// UI and TanStack Query hooks talk to this interface, never to supabase-js
// directly (CLAUDE.md: no raw fetches to Supabase from components).

import type { UserWordStateRow } from '@/srs/srs';
import type {
  DailyStats,
  Profile,
  SessionItem,
  WordContent,
} from '@/lib/types';

export interface AuthSession {
  userId: string;
  email: string | null;
}

export type OAuthProvider = 'google' | 'apple';

export interface AuthResult {
  session: AuthSession | null;
  error: string | null;
}

export interface SubmitReviewInput {
  wordId: number;
  card: UserWordStateRow; // FSRS card fields (from cardToRow)
  rating: number; // 1..4
  stateBefore: string | null;
  gameMode: string;
  responseMs: number;
  retrievability: number | null;
  xp: number;
  isNew: boolean;
}

export interface SubmitReviewResult {
  goalMet: boolean;
  reviewsDone: number;
  newLearned: number;
  xpToday: number;
  xpTotal: number;
  state: string;
}

export interface ProgressCounts {
  known: number;
  learning: number;
  due: number;
  reviewCount: number; // cards in 'review' state
  // Distinct words that count as known: is_known OR state 'review'. These two
  // sets overlap (markKnown sets both), so they cannot be added together.
  knownTotal: number;
  total: number; // words with any state row
}

export interface ForecastDay {
  day: string; // YYYY-MM-DD
  dueCount: number;
}

export interface LeaderboardEntry {
  userId: string;
  displayName: string | null;
  cohort: number;
  weeklyXp: number;
  rankInCohort: number;
  isCurrentUser: boolean;
}

export interface SentenceFeedback {
  correct: boolean | null; // null = degraded / not evaluated
  feedback: string;
  suggestion?: string;
}

export interface Backend {
  readonly kind: 'demo' | 'supabase';

  // Auth
  getSession(): Promise<AuthSession | null>;
  onAuthStateChange(cb: (session: AuthSession | null) => void): () => void;
  signInWithPassword(email: string, password: string): Promise<AuthResult>;
  signUp(email: string, password: string, displayName?: string): Promise<AuthResult>;
  signInWithOAuth(provider: OAuthProvider): Promise<AuthResult>;
  signOut(): Promise<void>;

  // Profile
  getProfile(): Promise<Profile>;
  updateProfile(patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile>;

  // Content
  getWordContent(wordId: number): Promise<WordContent | null>;

  // Review queue
  getDueQueue(limit: number): Promise<SessionItem[]>;
  getNewWords(
    limit: number,
    opts?: { minTier?: number; maxTier?: number },
  ): Promise<SessionItem[]>;

  // Session lifecycle + review commit
  startSession(): Promise<{ sessionId: string }>;
  endSession(
    sessionId: string,
    stats: { wordsReviewed: number; newWords: number; xpEarned: number; accuracy: number },
  ): Promise<void>;
  submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult>;

  // Progress + stats
  getProgressCounts(): Promise<ProgressCounts>;
  getRetention(sinceDays: number): Promise<number>;
  getForecast(days: number): Promise<ForecastDay[]>;
  getDailyStatsRange(days: number): Promise<DailyStats[]>;

  // Leaderboard
  getWeeklyLeaderboard(): Promise<LeaderboardEntry[]>;

  // Achievements
  getAchievements(): Promise<string[]>;
  unlockAchievement(code: string): Promise<void>;

  // Onboarding placement
  getPlacementWords(): Promise<WordContent[]>;
  markKnown(wordIds: number[]): Promise<void>;

  // Gated AI (Edge Functions in production; stubbed in demo)
  evaluateSentence(input: {
    wordId: number;
    headword: string;
    sentence: string;
  }): Promise<SentenceFeedback>;
  generatePersonalized(input: {
    wordId: number;
    kind: 'mnemonic' | 'sentence';
    interests: string[];
  }): Promise<{ text: string }>;

  // Account management (Phase 7.4)
  exportData(): Promise<Record<string, unknown>>;
  deleteAccount(): Promise<void>;
}
