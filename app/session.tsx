// The scheduled session.
//
// The session does not end on its own. Its queue refills from the server as the
// user works through it, so one sitting can cover as many words as they have
// the energy for. The user ends the session by closing it; the only other stop
// is running out of schedulable material, and that offers practice rather than
// a dead end.
//
// See features/review/continuation.ts for why a session refills only with due
// cards and unseen words, and never replays a word it already graded.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { router } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import type { GameModeId, SessionItem } from '@/lib/types';
import type { GameOutcome } from '@/srs/srs';
import { useProfile, useSessionPlan } from '@/features/review/queries';
import { useTodayStats } from '@/features/stats/queries';
import { buildRefill, shouldRefill, REFILL_PAGE } from '@/features/review/continuation';
import { backend } from '@/lib/backend';
import { submitReview } from '@/features/review/submitReview';
import { previewNextDue as previewNextDueFor, reviewTime } from '@/features/review/nextDue';
import { enqueueReview } from '@/features/offline/reviewQueue';
import { buildOptionPool, capsForWord } from '@/features/games/optionPool';
import { chooseMode } from '@/features/games/ladder';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { WordIntro } from '@/features/games/WordIntro';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useSessionResult } from '@/features/session/sessionResult';
import {
  SessionCenter,
  SessionLoading,
  SessionNothingScheduled,
  SessionRanDry,
  SessionRunner,
} from '@/features/session/SessionView';
import { applyGoalMet } from '@/features/gamification/streak';
import { newlyUnlocked } from '@/features/gamification/achievements';
import { todayString } from '@/lib/date';

interface Totals {
  reviewed: number;
  correct: number;
  xp: number;
  newWords: number;
  xpTotal: number;
  goalMet: boolean;
}

export default function SessionScreen() {
  const profileQuery = useProfile();
  const planQuery = useSessionPlan(profileQuery.data);
  const todayQuery = useTodayStats();
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSummary = useSessionResult((s) => s.setSummary);
  const qc = useQueryClient();

  const [index, setIndex] = useState(0);
  const [introduced, setIntroduced] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  // The queue grows as the session runs, so it is state rather than a view of
  // the opening plan. `ranDry` means a refill came back empty: everything
  // schedulable is done, and the only way to carry on is practice.
  const [items, setItems] = useState<SessionItem[]>([]);
  const [ranDry, setRanDry] = useState(false);
  const seeded = useRef(false);
  const refilling = useRef(false);
  const exhausted = useRef(false);
  const totals = useRef<Totals>({
    reviewed: 0,
    correct: 0,
    xp: 0,
    newWords: 0,
    xpTotal: profileQuery.data?.xpTotal ?? 0,
    goalMet: false,
  });
  const sessionId = useRef<string | null>(null);
  const finishing = useRef(false);

  // Seed the queue from the opening plan, once. After this the plan query is
  // no longer the source of truth; refills append to `items` directly.
  useEffect(() => {
    if (seeded.current || !planQuery.data) return;
    seeded.current = true;
    setItems(planQuery.data.items);
  }, [planQuery.data]);

  // Read the live queue from inside async callbacks without re-creating them.
  const itemsRef = useRef<SessionItem[]>([]);
  itemsRef.current = items;

  const pool = useMemo(() => buildOptionPool(items), [items]);
  const profile = profileQuery.data;

  // Lets the reveal say when the word comes back, using the same scheduler
  // and the same instant the commit will use.
  const previewNextDue = useCallback(
    (item: SessionItem, outcome: GameOutcome) =>
      previewNextDueFor(item, outcome, profile?.desiredRetention ?? 0.9),
    [profile],
  );

  // Start the session row once there is something to play.
  if (planQuery.data && sessionId.current === null && items.length > 0) {
    sessionId.current = 'pending';
    backend
      .startSession()
      .then((r) => (sessionId.current = r.sessionId))
      .catch(() => (sessionId.current = null));
  }

  const current: SessionItem | undefined = items[index];
  const effectiveMode: GameModeId | null = useMemo(() => {
    if (!current || !profile) return null;
    const chosen = chooseMode({
      isNew: current.isNew,
      state: current.state?.state ?? 'new',
      reps: current.state?.reps ?? 0,
      stability: current.state?.stability ?? 0,
      caps: capsForWord(current.content),
      variantSeed: current.content.wordId + (current.state?.reps ?? 0),
    });
    return chosen;
  }, [current, profile]);

  /**
   * Pull another page and append whatever is genuinely new. Returns how many
   * items were added, so the caller can tell "more to play" from "run dry".
   *
   * `force` retries even after a previous refill came back empty. Cards in a
   * learning step fall due again within minutes, so an exhausted session can
   * legitimately have material again a little later.
   */
  const refill = useCallback(async (force = false): Promise<number> => {
    if (refilling.current) return 0;
    if (exhausted.current && !force) return 0;
    refilling.current = true;
    try {
      const [due, fresh] = await Promise.all([
        backend.getDueQueue(REFILL_PAGE),
        backend.getNewWords(REFILL_PAGE),
      ]);
      const chunk = buildRefill({ queue: itemsRef.current, due, newWords: fresh });
      if (chunk.length === 0) {
        exhausted.current = true;
        return 0;
      }
      exhausted.current = false;
      setItems((prev) => [...prev, ...chunk]);
      return chunk.length;
    } catch {
      // Offline or a failed fetch is not the same as having run out, so the
      // exhausted flag is left alone and the next attempt can still succeed.
      return 0;
    } finally {
      refilling.current = false;
    }
  }, []);

  const finish = useCallback(
    async (t: Totals) => {
      if (finishing.current) return;
      finishing.current = true;
      const accuracy = t.reviewed > 0 ? t.correct / t.reviewed : 0;

      if (sessionId.current && sessionId.current !== 'pending') {
        await backend
          .endSession(sessionId.current, {
            wordsReviewed: t.reviewed,
            newWords: t.newWords,
            xpEarned: t.xp,
            accuracy,
          })
          .catch(() => {});
      }

      // Streak reconciliation (idempotent per day).
      let streakCount = profile?.streakCount ?? 0;
      if (t.goalMet && profile) {
        const res = applyGoalMet(
          {
            streakCount: profile.streakCount,
            streakFreezeCount: profile.streakFreezeCount,
            lastGoalMetDay: profile.lastGoalMetDay,
          },
          todayString(),
        );
        if (res.advanced) {
          await backend
            .updateProfile({
              streakCount: res.streakCount,
              streakFreezeCount: res.streakFreezeCount,
              lastGoalMetDay: todayString(),
            })
            .catch(() => {});
          streakCount = res.streakCount;
        }
      }

      // Achievements.
      let newAchievements: string[] = [];
      try {
        const [counts, existing] = await Promise.all([
          backend.getProgressCounts(),
          backend.getAchievements(),
        ]);
        newAchievements = newlyUnlocked(
          {
            wordsStarted: counts.total,
            streakCount,
            xpTotal: t.xpTotal,
            sessionReviewed: t.reviewed,
            sessionCorrect: t.correct,
          },
          existing,
        );
        for (const code of newAchievements) await backend.unlockAchievement(code);
      } catch {
        // Non-fatal.
      }

      setSummary({
        reviewed: t.reviewed,
        correct: t.correct,
        xpEarned: t.xp,
        newWords: t.newWords,
        accuracy,
        goalMet: t.goalMet,
        streakCount,
        newAchievements,
      });
      qc.invalidateQueries();
      router.replace('/summary');
    },
    [profile, qc, setSummary],
  );

  /**
   * Closing the session is now the normal way to end one, so it has to run the
   * same wrap-up the old end-of-queue path did: the session row, the streak and
   * any achievements. Leaving without answering anything just goes home.
   */
  const close = useCallback(() => {
    if (totals.current.reviewed === 0) {
      router.replace('/(app)');
      return;
    }
    void finish(totals.current);
  }, [finish]);

  const onOutcome = useCallback(
    async (outcome: GameOutcome) => {
      if (!current || !profile || !effectiveMode || submitting) return;
      setSubmitting(true);
      try {
        let committedXp = 0;
        let goalMet = totals.current.goalMet;
        let xpTotal = totals.current.xpTotal;
        let correct = outcome.correct;
        try {
          const commit = await submitReview({
            item: current,
            outcome,
            mode: effectiveMode,
            profile,
          });
          committedXp = commit.xp;
          goalMet = commit.result.goalMet;
          xpTotal = commit.result.xpTotal;
          correct = commit.correct;
        } catch {
          // Offline: queue the commit and keep the session going optimistically.
          const { cardToRow, makeScheduler, newCard, outcomeToRating, review, rowToCard } =
            await import('@/srs/srs');
          const scheduler = makeScheduler(profile.desiredRetention);
          const rating = outcomeToRating(outcome);
          const card = current.state
            ? rowToCard({
                due: current.state.due,
                stability: current.state.stability,
                difficulty: current.state.difficulty,
                elapsed_days: current.state.elapsedDays,
                scheduled_days: current.state.scheduledDays,
                reps: current.state.reps,
                lapses: current.state.lapses,
                state: current.state.state,
                last_review: current.state.lastReview,
                learning_steps: current.state.learningSteps,
              })
            : newCard();
          const { card: next } = review(scheduler, card, rating, reviewTime(outcome));
          await enqueueReview({
            wordId: current.content.wordId,
            card: cardToRow(next),
            rating,
            stateBefore: current.state?.state ?? 'new',
            gameMode: effectiveMode,
            responseMs: Math.round(outcome.responseMs),
            retrievability: null,
            xp: 0,
            isNew: current.isNew,
          });
        }

        totals.current = {
          reviewed: totals.current.reviewed + 1,
          correct: totals.current.correct + (correct ? 1 : 0),
          xp: totals.current.xp + committedXp,
          newWords: totals.current.newWords + (current.isNew ? 1 : 0),
          xpTotal,
          goalMet: goalMet || totals.current.goalMet,
        };

        const nextIndex = index + 1;
        if (nextIndex < itemsRef.current.length) {
          setIndex(nextIndex);
          // Top up ahead of the play head so the next item is always ready.
          if (shouldRefill(nextIndex, itemsRef.current.length)) void refill();
          return;
        }
        // At the end of the queue: try once more before concluding anything.
        const added = await refill(true);
        if (added > 0) setIndex(nextIndex);
        else setRanDry(true);
      } finally {
        setSubmitting(false);
      }
    },
    [current, profile, effectiveMode, submitting, index, refill],
  );

  // --- Render states ---
  if (profileQuery.isLoading || planQuery.isLoading) return <SessionLoading />;

  if (items.length === 0) {
    return (
      <SessionNothingScheduled
        onPractice={() => router.replace('/practice')}
        onBack={() => router.replace('/(app)')}
      />
    );
  }

  if (ranDry) {
    return (
      <SessionRanDry
        answered={totals.current.reviewed}
        onPractice={() => router.replace('/practice')}
        onFinish={() => void finish(totals.current)}
      />
    );
  }

  if (!current || !profile || !effectiveMode) return <SessionCenter>{null}</SessionCenter>;

  const showIntro = current.isNew && !introduced.has(current.content.wordId);
  // The queue has no fixed end any more, so a bar that fills toward it would be
  // meaningless. Show the daily goal instead: a real target that the session is
  // free to run past.
  const answered = totals.current.reviewed;
  const goal = profile.dailyGoal > 0 ? profile.dailyGoal : 15;
  const reviewsToday = (todayQuery.data?.reviewsDone ?? 0) + answered;

  return (
    <SessionRunner
      answered={answered}
      goalFraction={Math.min(1, reviewsToday / goal)}
      submitting={submitting}
      onClose={close}
    >
      <GameProvider value={{ pool, profile, previewNextDue }}>
        {showIntro ? (
          <WordIntro
            content={current.content}
            onStart={() => setIntroduced((prev) => new Set(prev).add(current.content.wordId))}
          />
        ) : (
          <GameHost
            key={`${current.content.wordId}-${index}`}
            item={current}
            mode={effectiveMode}
            onOutcome={onOutcome}
            soundEnabled={soundEnabled}
          />
        )}
      </GameProvider>
    </SessionRunner>
  );
}
