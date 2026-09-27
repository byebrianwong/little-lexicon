// In-memory backend for demo mode. Fully playable with no network. Persists to
// AsyncStorage so progress survives reloads. Uses the same view models as the
// Supabase backend so the rest of the app is identical either way. Words come
// from the bundled words file (src/lib/content).

import AsyncStorage from '@react-native-async-storage/async-storage';
import type { UserWordStateRow } from '@/srs/srs';
import type {
  DailyStats,
  Profile,
  SessionItem,
  UserWordState,
  WordContent,
} from '@/lib/types';
import { todayString, toDayString, addDays } from '@/lib/date';
import type {
  AuthResult,
  AuthSession,
  Backend,
  ForecastDay,
  LeaderboardEntry,
  ProgressCounts,
  SentenceFeedback,
  SubmitReviewInput,
  SubmitReviewResult,
} from '../types';
import { loadContent, type ContentIndex } from '@/lib/content';
import { normalizeAnswer } from '@/lib/text';
import { legacyIdMap, remapWordIds } from './legacyWordIds';

const STORAGE_KEY = 'little_lexicon.demo.v1';
const DEMO_USER_ID = 'demo-user';

interface StateRow extends UserWordStateRow {
  word_id: number;
  is_known: boolean;
  is_suspended: boolean;
  first_seen_at: string;
}

interface LogRow {
  word_id: number;
  rating: number;
  reviewed_at: string;
}

// Saved progress refers to words by id. 'words-file' means ids from the words
// file; data saved without it used the old 12-word numbering and is converted
// on load (see legacyWordIds).
const WORD_ID_SCHEME = 'words-file';

interface PersistShape {
  session: AuthSession | null;
  profile: Profile;
  states: Record<number, StateRow>;
  logs: LogRow[];
  daily: Record<string, DailyStats>;
  achievements: string[];
  wordIdScheme?: string;
  /** Progress on words that are no longer in the words file. Kept, not shown. */
  retired?: { states: StateRow[]; logs: LogRow[] };
}

function defaultProfile(): Profile {
  return {
    userId: DEMO_USER_ID,
    displayName: 'Demo Learner',
    levelEstimate: null,
    dailyGoal: 15,
    desiredRetention: 0.9,
    interests: [],
    streakCount: 0,
    streakFreezeCount: 2,
    xpTotal: 0,
    isPro: false,
    onboardedAt: null,
    reminderHour: null,
    lastGoalMetDay: null,
  };
}

function emptyState(): PersistShape {
  return {
    session: { userId: DEMO_USER_ID, email: 'demo@little_lexicon.app' },
    profile: defaultProfile(),
    states: {},
    logs: [],
    daily: {},
    achievements: [],
    wordIdScheme: WORD_ID_SCHEME,
  };
}

function rowToUserWordState(row: StateRow): UserWordState {
  return {
    wordId: row.word_id,
    due: row.due,
    stability: row.stability,
    difficulty: row.difficulty,
    elapsedDays: row.elapsed_days,
    scheduledDays: row.scheduled_days,
    reps: row.reps,
    lapses: row.lapses,
    state: row.state as UserWordState['state'],
    lastReview: row.last_review,
    learningSteps: row.learning_steps,
    isKnown: row.is_known,
    isSuspended: row.is_suspended,
  };
}

/** A review item, or null when the word has left the words file. */
function toSessionItem(content: ContentIndex, row: StateRow): SessionItem | null {
  const word = content.byId.get(row.word_id);
  return word ? { content: word, state: rowToUserWordState(row), isNew: false } : null;
}

export class DemoBackend implements Backend {
  readonly kind = 'demo' as const;
  private data: PersistShape = emptyState();
  private loading: Promise<void> | null = null;
  private authListeners = new Set<(s: AuthSession | null) => void>();

  // One load per backend, shared by every caller. Screens fire several queries
  // at once, and the id conversion must run exactly once: a second pass would
  // not recognize the new ids and would retire all progress.
  private ensureLoaded(): Promise<void> {
    this.loading ??= this.load().catch((err: unknown) => {
      this.loading = null; // let the next call retry
      throw err;
    });
    return this.loading;
  }

  private async load(): Promise<void> {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<PersistShape>;
        // Data saved before the scheme field existed uses the old numbering.
        this.data = { ...emptyState(), wordIdScheme: undefined, ...saved };
      }
    } catch (e) {
      console.warn('demo backend: failed to load persisted state', e);
    }
    if (this.data.wordIdScheme !== WORD_ID_SCHEME) await this.convertLegacyWordIds();
  }

  private async convertLegacyWordIds(): Promise<void> {
    const content = await loadContent();
    const idMap = legacyIdMap((headword) => content.byHeadword.get(headword)?.wordId);
    const out = remapWordIds(this.data.states, this.data.logs, idMap);
    this.data.states = out.states;
    this.data.logs = out.logs;
    if (out.unmapped.states.length > 0 || out.unmapped.logs.length > 0) {
      this.data.retired = {
        states: [...(this.data.retired?.states ?? []), ...out.unmapped.states],
        logs: [...(this.data.retired?.logs ?? []), ...out.unmapped.logs],
      };
    }
    this.data.wordIdScheme = WORD_ID_SCHEME;
    await this.persist();
  }

  private async persist(): Promise<void> {
    try {
      await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(this.data));
    } catch (e) {
      console.warn('demo backend: failed to persist state', e);
    }
  }

  // --- Auth -----------------------------------------------------------------
  async getSession(): Promise<AuthSession | null> {
    await this.ensureLoaded();
    return this.data.session;
  }

  onAuthStateChange(cb: (s: AuthSession | null) => void): () => void {
    this.authListeners.add(cb);
    return () => this.authListeners.delete(cb);
  }

  private notifyAuth(): void {
    for (const cb of this.authListeners) cb(this.data.session);
  }

  async signInWithPassword(email: string): Promise<AuthResult> {
    await this.ensureLoaded();
    this.data.session = { userId: DEMO_USER_ID, email };
    await this.persist();
    this.notifyAuth();
    return { session: this.data.session, error: null };
  }

  async signUp(email: string, _password: string, displayName?: string): Promise<AuthResult> {
    await this.ensureLoaded();
    this.data.session = { userId: DEMO_USER_ID, email };
    if (displayName) this.data.profile.displayName = displayName;
    await this.persist();
    this.notifyAuth();
    return { session: this.data.session, error: null };
  }

  async signInWithOAuth(): Promise<AuthResult> {
    return this.signInWithPassword('demo@little_lexicon.app');
  }

  async signOut(): Promise<void> {
    await this.ensureLoaded();
    this.data.session = null;
    await this.persist();
    this.notifyAuth();
  }

  // --- Profile --------------------------------------------------------------
  async getProfile(): Promise<Profile> {
    await this.ensureLoaded();
    return { ...this.data.profile };
  }

  async updateProfile(patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile> {
    await this.ensureLoaded();
    this.data.profile = { ...this.data.profile, ...patch };
    await this.persist();
    return { ...this.data.profile };
  }

  // --- Content --------------------------------------------------------------
  async getWordContent(wordId: number): Promise<WordContent | null> {
    return (await loadContent()).byId.get(wordId) ?? null;
  }

  async getAllWords(limit?: number): Promise<WordContent[]> {
    const { words } = await loadContent(); // already easiest first
    return words.slice(0, limit);
  }

  // --- Queue ----------------------------------------------------------------
  async getDueQueue(limit: number): Promise<SessionItem[]> {
    await this.ensureLoaded();
    const content = await loadContent();
    const now = Date.now();
    return Object.values(this.data.states)
      .filter((r) => !r.is_suspended && !r.is_known && Date.parse(r.due) <= now)
      .sort((a, b) => Date.parse(a.due) - Date.parse(b.due))
      .map((r) => toSessionItem(content, r))
      .filter((item): item is SessionItem => item !== null)
      .slice(0, limit);
  }

  async getNewWords(
    limit: number,
    opts?: { minTier?: number; maxTier?: number },
  ): Promise<SessionItem[]> {
    await this.ensureLoaded();
    const { words } = await loadContent(); // already easiest first
    const seen = new Set(Object.keys(this.data.states).map(Number));
    const minTier = opts?.minTier ?? 1;
    const maxTier = opts?.maxTier ?? 5;
    return words
      .filter(
        (w) =>
          !seen.has(w.wordId) &&
          w.difficultyTier >= minTier &&
          w.difficultyTier <= maxTier,
      )
      .slice(0, limit)
      .map<SessionItem>((content) => ({ content, state: null, isNew: true }));
  }

  // --- Session + review commit ----------------------------------------------
  async startSession(): Promise<{ sessionId: string }> {
    return { sessionId: `demo-${todayString()}` };
  }

  async endSession(): Promise<void> {
    // Session rows are not surfaced in demo mode; no-op.
  }

  async submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
    await this.ensureLoaded();
    const existing = this.data.states[input.wordId];
    const row: StateRow = {
      ...input.card,
      word_id: input.wordId,
      is_known: existing?.is_known ?? false,
      is_suspended: existing?.is_suspended ?? false,
      first_seen_at: existing?.first_seen_at ?? new Date().toISOString(),
    };
    this.data.states[input.wordId] = row;
    this.data.logs.push({
      word_id: input.wordId,
      rating: input.rating,
      reviewed_at: new Date().toISOString(),
    });

    const day = todayString();
    const prev = this.data.daily[day] ?? {
      day,
      reviewsDone: 0,
      newLearned: 0,
      xp: 0,
      goalMet: false,
    };
    const reviewsDone = prev.reviewsDone + 1;
    const newLearned = prev.newLearned + (input.isNew ? 1 : 0);
    const xp = prev.xp + input.xp;
    const goalMet = reviewsDone >= this.data.profile.dailyGoal;
    this.data.daily[day] = { day, reviewsDone, newLearned, xp, goalMet };

    this.data.profile.xpTotal += input.xp;
    await this.persist();

    return {
      goalMet,
      reviewsDone,
      newLearned,
      xpToday: xp,
      xpTotal: this.data.profile.xpTotal,
      state: input.card.state,
    };
  }

  // --- Stats ----------------------------------------------------------------
  async getProgressCounts(): Promise<ProgressCounts> {
    await this.ensureLoaded();
    const rows = Object.values(this.data.states);
    const now = Date.now();
    let known = 0;
    let learning = 0;
    let reviewCount = 0;
    let knownTotal = 0;
    let due = 0;
    for (const r of rows) {
      if (r.is_known) known++;
      if (r.state === 'learning' || r.state === 'relearning') learning++;
      if (r.state === 'review') reviewCount++;
      // Union, not a sum: markKnown sets is_known and state 'review' on the
      // same row, so adding known + reviewCount would count it twice.
      if (r.is_known || r.state === 'review') knownTotal++;
      if (!r.is_suspended && !r.is_known && Date.parse(r.due) <= now) due++;
    }
    return { known, learning, reviewCount, knownTotal, due, total: rows.length };
  }

  async getRetention(sinceDays: number): Promise<number> {
    await this.ensureLoaded();
    const cutoff = Date.now() - sinceDays * 86_400_000;
    const logs = this.data.logs.filter((l) => Date.parse(l.reviewed_at) >= cutoff);
    if (logs.length === 0) return 0;
    const success = logs.filter((l) => l.rating >= 3).length;
    return success / logs.length;
  }

  async getForecast(days: number): Promise<ForecastDay[]> {
    await this.ensureLoaded();
    const out: ForecastDay[] = [];
    const base = new Date();
    for (let i = 0; i < days; i++) {
      const day = toDayString(addDays(base, i));
      const dueCount = Object.values(this.data.states).filter(
        (r) => !r.is_suspended && !r.is_known && toDayString(new Date(r.due)) === day,
      ).length;
      out.push({ day, dueCount });
    }
    return out;
  }

  async getDailyStatsRange(days: number): Promise<DailyStats[]> {
    await this.ensureLoaded();
    const out: DailyStats[] = [];
    const base = new Date();
    for (let i = days - 1; i >= 0; i--) {
      const day = toDayString(addDays(base, -i));
      out.push(
        this.data.daily[day] ?? {
          day,
          reviewsDone: 0,
          newLearned: 0,
          xp: 0,
          goalMet: false,
        },
      );
    }
    return out;
  }

  // --- Leaderboard ----------------------------------------------------------
  async getWeeklyLeaderboard(): Promise<LeaderboardEntry[]> {
    await this.ensureLoaded();
    // Weekly XP for the demo user from daily stats.
    const weekStart = addDays(new Date(), -6);
    let myWeekly = 0;
    for (const [day, s] of Object.entries(this.data.daily)) {
      if (Date.parse(`${day}T00:00:00`) >= weekStart.getTime()) myWeekly += s.xp;
    }
    const bots = [
      { userId: 'bot-1', displayName: 'Wordsmith', weeklyXp: 480 },
      { userId: 'bot-2', displayName: 'Lexi', weeklyXp: 360 },
      { userId: 'bot-3', displayName: 'Verbose Vera', weeklyXp: 210 },
      { userId: 'bot-4', displayName: 'Quiet Quinn', weeklyXp: 120 },
    ];
    const rows = [
      {
        userId: DEMO_USER_ID,
        displayName: this.data.profile.displayName ?? 'You',
        weeklyXp: myWeekly,
      },
      ...bots,
    ]
      .sort((a, b) => b.weeklyXp - a.weeklyXp)
      .map<LeaderboardEntry>((r, i) => ({
        userId: r.userId,
        displayName: r.displayName,
        cohort: 1,
        weeklyXp: r.weeklyXp,
        rankInCohort: i + 1,
        isCurrentUser: r.userId === DEMO_USER_ID,
      }));
    return rows;
  }

  // --- Achievements ---------------------------------------------------------
  async getAchievements(): Promise<string[]> {
    await this.ensureLoaded();
    return [...this.data.achievements];
  }

  async unlockAchievement(code: string): Promise<void> {
    await this.ensureLoaded();
    if (!this.data.achievements.includes(code)) {
      this.data.achievements.push(code);
      await this.persist();
    }
  }

  // --- Placement ------------------------------------------------------------
  async getPlacementWords(): Promise<WordContent[]> {
    // Every tier, easiest first; placement picks a few from each.
    return [...(await loadContent()).words];
  }

  async markKnown(wordIds: number[]): Promise<void> {
    await this.ensureLoaded();
    const iso = new Date().toISOString();
    for (const wordId of wordIds) {
      this.data.states[wordId] = {
        due: iso,
        stability: 0,
        difficulty: 0,
        elapsed_days: 0,
        scheduled_days: 0,
        reps: 0,
        lapses: 0,
        state: 'review',
        last_review: null,
        learning_steps: 0,
        word_id: wordId,
        is_known: true,
        is_suspended: false,
        first_seen_at: iso,
      };
    }
    await this.persist();
  }

  // --- Gated AI (demo stubs, clearly heuristic) -----------------------------
  async evaluateSentence(input: {
    wordId: number;
    headword: string;
    sentence: string;
  }): Promise<SentenceFeedback> {
    const s = normalizeAnswer(input.sentence);
    const usesWord = s.includes(normalizeAnswer(input.headword));
    const longEnough = input.sentence.trim().split(/\s+/).length >= 5;
    if (!usesWord) {
      return {
        correct: false,
        feedback: `Try to actually use "${input.headword}" in the sentence.`,
        suggestion: `Include the word "${input.headword}" once, in a natural context.`,
      };
    }
    if (!longEnough) {
      return {
        correct: false,
        feedback: 'Give the word more context so its meaning is clear.',
        suggestion: 'Aim for a full sentence of at least a few clauses.',
      };
    }
    return {
      correct: true,
      feedback: 'Nice: the word is used in a clear, natural context.',
      suggestion: 'For extra polish, vary your sentence openings.',
    };
  }

  async generatePersonalized(input: {
    wordId: number;
    /** The word on screen, so the backend does not have to look it up by id. */
    headword: string;
    kind: 'mnemonic' | 'sentence';
    interests: string[];
  }): Promise<{ text: string }> {
    const head = input.headword;
    const theme = input.interests[0] ?? 'everyday life';
    if (input.kind === 'mnemonic') {
      return { text: `Picture ${theme}: that scene helps you remember "${head}".` };
    }
    return {
      text: `In ${theme}, you might say something ${head} to make your point.`,
    };
  }

  // --- Account management ---------------------------------------------------
  async exportData(): Promise<Record<string, unknown>> {
    await this.ensureLoaded();
    return {
      exportedAt: new Date().toISOString(),
      profile: this.data.profile,
      wordStates: Object.values(this.data.states),
      reviewLogs: this.data.logs,
      dailyStats: Object.values(this.data.daily),
      achievements: this.data.achievements,
      retiredProgress: this.data.retired ?? null,
    };
  }

  async deleteAccount(): Promise<void> {
    // Soft path for demo: clear all local data and sign out. No content data is
    // touched. Production removes the auth user (cascades) via an Edge Function.
    this.data = emptyState();
    this.data.session = null;
    await this.persist();
    this.notifyAuth();
  }
}
