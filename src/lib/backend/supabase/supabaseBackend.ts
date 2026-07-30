// Production backend backed by Supabase (Postgres + Auth + Edge Functions).
// All schema access goes through the little-lexicon-scoped client. Review commit is the
// transactional `submit_review` RPC (see migration 0002). Content queries embed
// senses/examples/distractors/relations/mnemonics in one round trip.

import { supabase } from '@/lib/supabase';
import type { UserWordStateRow } from '@/srs/srs';
import type {
  DailyStats,
  Profile,
  SessionItem,
  UserWordState,
  WordContent,
} from '@/lib/types';
import { addDays, toDayString } from '@/lib/date';
import type {
  AuthResult,
  AuthSession,
  Backend,
  ForecastDay,
  LeaderboardEntry,
  OAuthProvider,
  ProgressCounts,
  SentenceFeedback,
  SubmitReviewInput,
  SubmitReviewResult,
} from '../types';
import { mapWordRow, WORD_SELECT, type RawWordRow } from './mapContent';

type StateRow = {
  word_id: number;
  due: string;
  stability: number;
  difficulty: number;
  elapsed_days: number;
  scheduled_days: number;
  reps: number;
  lapses: number;
  state: UserWordState['state'];
  last_review: string | null;
  learning_steps: number;
  is_known: boolean;
  is_suspended: boolean;
};

function rowToUserWordState(r: StateRow): UserWordState {
  return {
    wordId: r.word_id,
    due: r.due,
    stability: r.stability,
    difficulty: r.difficulty,
    elapsedDays: r.elapsed_days,
    scheduledDays: r.scheduled_days,
    reps: r.reps,
    lapses: r.lapses,
    state: r.state,
    lastReview: r.last_review,
    learningSteps: r.learning_steps,
    isKnown: r.is_known,
    isSuspended: r.is_suspended,
  };
}

function mapProfile(row: {
  user_id: string;
  display_name: string | null;
  level_estimate: number | null;
  daily_goal: number;
  desired_retention: number;
  interests: string[];
  streak_count: number;
  streak_freeze_count: number;
  xp_total: number;
  is_pro: boolean;
  onboarded_at: string | null;
  reminder_hour: number | null;
  last_goal_met_day: string | null;
}): Profile {
  return {
    userId: row.user_id,
    displayName: row.display_name,
    levelEstimate: row.level_estimate,
    dailyGoal: row.daily_goal,
    desiredRetention: row.desired_retention,
    interests: row.interests ?? [],
    streakCount: row.streak_count,
    streakFreezeCount: row.streak_freeze_count,
    xpTotal: Number(row.xp_total),
    isPro: row.is_pro,
    onboardedAt: row.onboarded_at,
    reminderHour: row.reminder_hour,
    lastGoalMetDay: row.last_goal_met_day,
  };
}

export class SupabaseBackend implements Backend {
  readonly kind = 'supabase' as const;

  private async requireUserId(): Promise<string> {
    const { data } = await supabase.auth.getUser();
    const id = data.user?.id;
    if (!id) throw new Error('Not authenticated');
    return id;
  }

  // --- Auth -----------------------------------------------------------------
  async getSession(): Promise<AuthSession | null> {
    const { data } = await supabase.auth.getSession();
    const s = data.session;
    return s ? { userId: s.user.id, email: s.user.email ?? null } : null;
  }

  onAuthStateChange(cb: (s: AuthSession | null) => void): () => void {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      cb(session ? { userId: session.user.id, email: session.user.email ?? null } : null);
    });
    return () => data.subscription.unsubscribe();
  }

  async signInWithPassword(email: string, password: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) return { session: null, error: error.message };
    const u = data.user;
    return { session: u ? { userId: u.id, email: u.email ?? null } : null, error: null };
  }

  async signUp(email: string, password: string, displayName?: string): Promise<AuthResult> {
    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: { data: displayName ? { display_name: displayName } : undefined },
    });
    if (error) return { session: null, error: error.message };
    const u = data.user;
    return { session: u ? { userId: u.id, email: u.email ?? null } : null, error: null };
  }

  async signInWithOAuth(provider: OAuthProvider): Promise<AuthResult> {
    const { error } = await supabase.auth.signInWithOAuth({ provider });
    // On native/web this redirects; the session arrives via onAuthStateChange.
    return { session: null, error: error ? error.message : null };
  }

  async signOut(): Promise<void> {
    const { error } = await supabase.auth.signOut();
    if (error) throw new Error(error.message);
  }

  // --- Profile --------------------------------------------------------------
  async getProfile(): Promise<Profile> {
    const userId = await this.requireUserId();
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('user_id', userId)
      .single();
    if (error) throw new Error(error.message);
    return mapProfile(data);
  }

  async updateProfile(patch: Partial<Omit<Profile, 'userId'>>): Promise<Profile> {
    const userId = await this.requireUserId();
    const update: Record<string, unknown> = {};
    if (patch.displayName !== undefined) update.display_name = patch.displayName;
    if (patch.levelEstimate !== undefined) update.level_estimate = patch.levelEstimate;
    if (patch.dailyGoal !== undefined) update.daily_goal = patch.dailyGoal;
    if (patch.desiredRetention !== undefined) update.desired_retention = patch.desiredRetention;
    if (patch.interests !== undefined) update.interests = patch.interests;
    if (patch.streakCount !== undefined) update.streak_count = patch.streakCount;
    if (patch.streakFreezeCount !== undefined) {
      update.streak_freeze_count = patch.streakFreezeCount;
    }
    if (patch.xpTotal !== undefined) update.xp_total = patch.xpTotal;
    if (patch.isPro !== undefined) update.is_pro = patch.isPro;
    if (patch.onboardedAt !== undefined) update.onboarded_at = patch.onboardedAt;
    if (patch.reminderHour !== undefined) update.reminder_hour = patch.reminderHour;
    if (patch.lastGoalMetDay !== undefined) update.last_goal_met_day = patch.lastGoalMetDay;
    update.updated_at = new Date().toISOString();

    const { data, error } = await supabase
      .from('profiles')
      .update(update)
      .eq('user_id', userId)
      .select('*')
      .single();
    if (error) throw new Error(error.message);
    return mapProfile(data);
  }

  // --- Content --------------------------------------------------------------
  private async getWordContentBatch(wordIds: number[]): Promise<Map<number, WordContent>> {
    if (wordIds.length === 0) return new Map();
    const { data, error } = await supabase
      .from('words')
      .select(WORD_SELECT)
      .in('id', wordIds);
    if (error) throw new Error(error.message);
    // Deep embeds are not fully inferred by the generated types; map explicitly.
    const rows = (data ?? []) as unknown as RawWordRow[];
    return new Map(rows.map((r) => [r.id, mapWordRow(r)]));
  }

  async getWordContent(wordId: number): Promise<WordContent | null> {
    const map = await this.getWordContentBatch([wordId]);
    return map.get(wordId) ?? null;
  }

  // --- Queue ----------------------------------------------------------------
  async getDueQueue(limit: number): Promise<SessionItem[]> {
    const nowIso = new Date().toISOString();
    const { data, error } = await supabase
      .from('user_word_state')
      .select(
        'word_id, due, stability, difficulty, elapsed_days, scheduled_days, reps, lapses, state, last_review, learning_steps, is_known, is_suspended',
      )
      .eq('is_suspended', false)
      .eq('is_known', false)
      .lte('due', nowIso)
      .order('due', { ascending: true })
      .limit(limit);
    if (error) throw new Error(error.message);
    const rows = (data ?? []) as StateRow[];
    const content = await this.getWordContentBatch(rows.map((r) => r.word_id));
    return rows
      .map<SessionItem | null>((r) => {
        const c = content.get(r.word_id);
        return c ? { content: c, state: rowToUserWordState(r), isNew: false } : null;
      })
      .filter((x): x is SessionItem => x !== null);
  }

  async getNewWords(
    limit: number,
    opts?: { minTier?: number; maxTier?: number },
  ): Promise<SessionItem[]> {
    // Words with no user_word_state row for this user. We exclude the user's
    // seen ids client-side. For very large study histories, replace this with a
    // dedicated RPC (see PROGRESS Phase 2 note).
    const { data: seenRows, error: seenErr } = await supabase
      .from('user_word_state')
      .select('word_id');
    if (seenErr) throw new Error(seenErr.message);
    const seen = (seenRows ?? []).map((r) => r.word_id);

    let q = supabase
      .from('words')
      .select('id')
      .gte('difficulty_tier', opts?.minTier ?? 1)
      .lte('difficulty_tier', opts?.maxTier ?? 5)
      .order('difficulty_tier', { ascending: true })
      .order('frequency_rank', { ascending: true, nullsFirst: false })
      .limit(limit + Math.min(seen.length, 500));
    if (seen.length > 0) q = q.not('id', 'in', `(${seen.join(',')})`);

    const { data, error } = await q;
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.id).slice(0, limit);
    const content = await this.getWordContentBatch(ids);
    return ids
      .map((id) => content.get(id))
      .filter((c): c is WordContent => c !== undefined)
      .map<SessionItem>((content) => ({ content, state: null, isNew: true }));
  }

  // --- Session + review commit ----------------------------------------------
  async startSession(): Promise<{ sessionId: string }> {
    const userId = await this.requireUserId();
    const { data, error } = await supabase
      .from('game_sessions')
      .insert({ user_id: userId })
      .select('id')
      .single();
    if (error) throw new Error(error.message);
    return { sessionId: String(data.id) };
  }

  async endSession(
    sessionId: string,
    stats: { wordsReviewed: number; newWords: number; xpEarned: number; accuracy: number },
  ): Promise<void> {
    const { error } = await supabase
      .from('game_sessions')
      .update({
        ended_at: new Date().toISOString(),
        words_reviewed: stats.wordsReviewed,
        new_words: stats.newWords,
        xp_earned: stats.xpEarned,
        accuracy: stats.accuracy,
      })
      .eq('id', Number(sessionId));
    if (error) throw new Error(error.message);
  }

  async submitReview(input: SubmitReviewInput): Promise<SubmitReviewResult> {
    const c: UserWordStateRow = input.card;
    const { data, error } = await supabase.rpc('submit_review', {
      p_word_id: input.wordId,
      p_due: c.due,
      p_stability: c.stability,
      p_difficulty: c.difficulty,
      p_elapsed_days: c.elapsed_days,
      p_scheduled_days: c.scheduled_days,
      p_reps: c.reps,
      p_lapses: c.lapses,
      p_state: c.state as 'new' | 'learning' | 'review' | 'relearning',
      p_last_review: c.last_review,
      p_learning_steps: c.learning_steps,
      p_rating: input.rating,
      p_state_before: (input.stateBefore ?? null) as
        | 'new'
        | 'learning'
        | 'review'
        | 'relearning'
        | null,
      p_game_mode: input.gameMode,
      p_response_ms: input.responseMs,
      p_retrievability: input.retrievability,
      p_xp: input.xp,
      p_is_new: input.isNew,
    });
    if (error) throw new Error(error.message);
    const r = data as {
      goal_met: boolean;
      reviews_done: number;
      new_learned: number;
      xp_today: number;
      xp_total: number;
      state: string;
    };
    return {
      goalMet: r.goal_met,
      reviewsDone: r.reviews_done,
      newLearned: r.new_learned,
      xpToday: r.xp_today,
      xpTotal: Number(r.xp_total),
      state: r.state,
    };
  }

  // --- Stats ----------------------------------------------------------------
  async getProgressCounts(): Promise<ProgressCounts> {
    const countOf = async (
      apply: (q: ReturnType<typeof baseCount>) => ReturnType<typeof baseCount>,
    ): Promise<number> => {
      const { count, error } = await apply(baseCount());
      if (error) throw new Error(error.message);
      return count ?? 0;
    };
    const baseCount = () =>
      supabase.from('user_word_state').select('word_id', { count: 'exact', head: true });

    const nowIso = new Date().toISOString();
    const [total, known, learning, relearning, reviewCount, knownTotal, due] = await Promise.all([
      countOf((q) => q),
      countOf((q) => q.eq('is_known', true)),
      countOf((q) => q.eq('state', 'learning')),
      countOf((q) => q.eq('state', 'relearning')),
      countOf((q) => q.eq('state', 'review')),
      // Union, not a sum: markKnown sets is_known and state 'review' on the
      // same row, so adding known + reviewCount would count it twice.
      countOf((q) => q.or('is_known.eq.true,state.eq.review')),
      countOf((q) =>
        q.eq('is_suspended', false).eq('is_known', false).lte('due', nowIso),
      ),
    ]);
    return { known, learning: learning + relearning, reviewCount, knownTotal, due, total };
  }

  async getRetention(sinceDays: number): Promise<number> {
    const since = new Date(Date.now() - sinceDays * 86_400_000).toISOString();
    const { data, error } = await supabase.rpc('retention_rate', { p_since: since });
    if (error) throw new Error(error.message);
    return typeof data === 'number' ? data : 0;
  }

  async getForecast(days: number): Promise<ForecastDay[]> {
    const { data, error } = await supabase.rpc('due_forecast', { p_days: days });
    if (error) throw new Error(error.message);
    return (data ?? []).map((r: { day: string; due_count: number }) => ({
      day: r.day,
      dueCount: Number(r.due_count),
    }));
  }

  async getDailyStatsRange(days: number): Promise<DailyStats[]> {
    const start = toDayString(addDays(new Date(), -(days - 1)));
    const { data, error } = await supabase
      .from('daily_stats')
      .select('day, reviews_done, new_learned, xp, goal_met')
      .gte('day', start)
      .order('day', { ascending: true });
    if (error) throw new Error(error.message);
    const byDay = new Map(
      (data ?? []).map((r) => [
        r.day,
        {
          day: r.day,
          reviewsDone: r.reviews_done,
          newLearned: r.new_learned,
          xp: r.xp,
          goalMet: r.goal_met,
        } satisfies DailyStats,
      ]),
    );
    const out: DailyStats[] = [];
    for (let i = days - 1; i >= 0; i--) {
      const day = toDayString(addDays(new Date(), -i));
      out.push(
        byDay.get(day) ?? { day, reviewsDone: 0, newLearned: 0, xp: 0, goalMet: false },
      );
    }
    return out;
  }

  // --- Leaderboard ----------------------------------------------------------
  async getWeeklyLeaderboard(): Promise<LeaderboardEntry[]> {
    const userId = await this.requireUserId();
    const { data, error } = await supabase
      .from('weekly_leaderboard')
      .select('user_id, display_name, cohort, weekly_xp, rank_in_cohort')
      .order('rank_in_cohort', { ascending: true });
    if (error) throw new Error(error.message);
    return (data ?? []).map<LeaderboardEntry>((r) => ({
      userId: r.user_id,
      displayName: r.display_name,
      cohort: r.cohort,
      weeklyXp: Number(r.weekly_xp),
      rankInCohort: r.rank_in_cohort,
      isCurrentUser: r.user_id === userId,
    }));
  }

  // --- Achievements ---------------------------------------------------------
  async getAchievements(): Promise<string[]> {
    const { data, error } = await supabase.from('achievements').select('code');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.code);
  }

  async unlockAchievement(code: string): Promise<void> {
    const userId = await this.requireUserId();
    const { error } = await supabase
      .from('achievements')
      .upsert({ user_id: userId, code }, { onConflict: 'user_id,code' });
    if (error) throw new Error(error.message);
  }

  // --- Placement ------------------------------------------------------------
  async getPlacementWords(): Promise<WordContent[]> {
    const { data, error } = await supabase
      .from('words')
      .select('id')
      .order('difficulty_tier', { ascending: true })
      .order('frequency_rank', { ascending: true, nullsFirst: false })
      .limit(30);
    if (error) throw new Error(error.message);
    const ids = (data ?? []).map((r) => r.id);
    const content = await this.getWordContentBatch(ids);
    return ids
      .map((id) => content.get(id))
      .filter((c): c is WordContent => c !== undefined);
  }

  async markKnown(wordIds: number[]): Promise<void> {
    const userId = await this.requireUserId();
    if (wordIds.length === 0) return;
    const iso = new Date().toISOString();
    const rows = wordIds.map((word_id) => ({
      user_id: userId,
      word_id,
      is_known: true,
      state: 'review' as const,
      due: iso,
      first_seen_at: iso,
    }));
    const { error } = await supabase
      .from('user_word_state')
      .upsert(rows, { onConflict: 'user_id,word_id' });
    if (error) throw new Error(error.message);
  }

  // --- Gated AI (Edge Functions) --------------------------------------------
  async evaluateSentence(input: {
    wordId: number;
    headword: string;
    sentence: string;
  }): Promise<SentenceFeedback> {
    const { data, error } = await supabase.functions.invoke('little-lexicon-evaluate-sentence', {
      body: input,
    });
    if (error) {
      // Degrade rather than crash (Phase 4.4 acceptance).
      return { correct: null, feedback: 'Saved. Evaluation is unavailable right now.' };
    }
    return data as SentenceFeedback;
  }

  async generatePersonalized(input: {
    wordId: number;
    kind: 'mnemonic' | 'sentence';
    interests: string[];
  }): Promise<{ text: string }> {
    const { data, error } = await supabase.functions.invoke('little-lexicon-generate-personalized', {
      body: input,
    });
    if (error) throw new Error(error.message);
    return data as { text: string };
  }

  // --- Account management ---------------------------------------------------
  async exportData(): Promise<Record<string, unknown>> {
    const userId = await this.requireUserId();
    const [profile, states, logs, daily, achievements] = await Promise.all([
      supabase.from('profiles').select('*').eq('user_id', userId).single(),
      supabase.from('user_word_state').select('*'),
      supabase.from('review_logs').select('*'),
      supabase.from('daily_stats').select('*'),
      supabase.from('achievements').select('*'),
    ]);
    return {
      exportedAt: new Date().toISOString(),
      profile: profile.data,
      wordStates: states.data ?? [],
      reviewLogs: logs.data ?? [],
      dailyStats: daily.data ?? [],
      achievements: achievements.data ?? [],
    };
  }

  async deleteAccount(): Promise<void> {
    // Deleting the auth user cascades to every Little Lexicon per-user row via the
    // on-delete-cascade foreign keys. The client cannot delete an auth user, so
    // this is routed through an Edge Function holding the service role key.
    const { error } = await supabase.functions.invoke('little-lexicon-delete-account', { body: {} });
    if (error) throw new Error(error.message);
    await supabase.auth.signOut();
  }
}
