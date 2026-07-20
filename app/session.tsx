import { useCallback, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, ScrollView, Text, View } from 'react-native';
import { router } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Button, H2, Muted, ProgressBar, Row } from '@/components/ui';
import type { GameModeId, SessionItem } from '@/lib/types';
import type { GameOutcome } from '@/srs/srs';
import { useProfile, useSessionPlan } from '@/features/review/queries';
import { backend } from '@/lib/backend';
import { submitReview } from '@/features/review/submitReview';
import { enqueueReview } from '@/features/offline/reviewQueue';
import { buildOptionPool, capsForWord } from '@/features/games/optionPool';
import { chooseMode } from '@/features/games/ladder';
import { isModeAllowed } from '@/features/monetization/limits';
import { GameProvider } from '@/features/games/GameContext';
import { GameHost } from '@/features/games/GameHost';
import { WordIntro } from '@/features/games/WordIntro';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { useSessionResult } from '@/features/session/sessionResult';
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
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const setSummary = useSessionResult((s) => s.setSummary);
  const qc = useQueryClient();

  const [index, setIndex] = useState(0);
  const [introduced, setIntroduced] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
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

  const items = useMemo(() => planQuery.data?.items ?? [], [planQuery.data]);
  const pool = useMemo(() => buildOptionPool(items), [items]);
  const profile = profileQuery.data;

  // Start the session row once when a plan is ready.
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
    return isModeAllowed(chosen, profile) ? chosen : 'production';
  }, [current, profile]);

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
          const { card: next } = review(scheduler, card, rating);
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
        if (nextIndex >= items.length) {
          await finish(totals.current);
        } else {
          setIndex(nextIndex);
        }
      } finally {
        setSubmitting(false);
      }
    },
    [current, profile, effectiveMode, submitting, index, items.length, finish],
  );

  // --- Render states ---
  if (profileQuery.isLoading || planQuery.isLoading) {
    return <Center>{<ActivityIndicator color="#6C8CFF" size="large" />}</Center>;
  }

  if (items.length === 0) {
    return (
      <Center>
        <View className="items-center px-8">
          <Text className="text-5xl">✅</Text>
          <H2 className="mt-4 text-center">You are all caught up</H2>
          <Muted className="mt-2 text-center">
            No reviews are due and today&apos;s new words are done. Come back later or raise your
            daily goal in settings.
          </Muted>
          <View className="mt-6 w-full">
            <Button title="Back to home" onPress={() => router.replace('/(app)')} />
          </View>
        </View>
      </Center>
    );
  }

  if (!current || !profile || !effectiveMode) return <Center>{null}</Center>;

  const showIntro = current.isNew && !introduced.has(current.content.wordId);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top', 'bottom']}>
      <View className="px-5 pt-2">
        <Row className="items-center gap-3">
          <Pressable
            accessibilityLabel="Close session"
            onPress={() => router.replace('/(app)')}
            className="h-9 w-9 items-center justify-center rounded-full bg-surface2"
          >
            <Text className="text-text text-lg">✕</Text>
          </Pressable>
          <View className="flex-1">
            <ProgressBar fraction={index / items.length} />
          </View>
          <Muted>{`${index + 1}/${items.length}`}</Muted>
        </Row>
      </View>

      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 24, paddingBottom: 32, flexGrow: 1 }}
        keyboardShouldPersistTaps="handled"
      >
        <GameProvider value={{ pool, profile }}>
          {showIntro ? (
            <WordIntro
              content={current.content}
              onStart={() =>
                setIntroduced((prev) => new Set(prev).add(current.content.wordId))
              }
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
      </ScrollView>

      {submitting ? (
        <View className="absolute inset-0 items-center justify-center bg-bg/40">
          <ActivityIndicator color="#6C8CFF" />
        </View>
      ) : null}
    </SafeAreaView>
  );
}

function Center({ children }: { children: React.ReactNode }) {
  return (
    <SafeAreaView className="flex-1 items-center justify-center bg-bg">
      <View className="flex-1 w-full items-center justify-center">{children}</View>
    </SafeAreaView>
  );
}
