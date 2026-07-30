import { RefreshControl, ScrollView, View } from 'react-native';
import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Body, Button, Card, H1, H2, Muted, Pill, ProgressBar, Row } from '@/components/ui';
import { useProfile } from '@/features/review/queries';
import { useProgressCounts, useTodayStats } from '@/features/stats/queries';
import { levelProgress } from '@/features/gamification/xp';
import { hitNewWordCap } from '@/features/monetization/limits';
import { pushOnce } from '@/lib/navigation';

export default function Home() {
  const qc = useQueryClient();
  const profile = useProfile();
  const counts = useProgressCounts();
  const today = useTodayStats();

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries();
    }, [qc]),
  );

  const p = profile.data;
  const reviewsToday = today.data?.reviewsDone ?? 0;
  const goal = p?.dailyGoal ?? 15;
  const goalFraction = Math.min(1, reviewsToday / goal);
  const lvl = p ? levelProgress(p.xpTotal) : null;
  const atCap = p ? hitNewWordCap(p, today.data?.newLearned ?? 0) : false;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl
            refreshing={false}
            onRefresh={() => qc.invalidateQueries()}
            tintColor="#6C8CFF"
          />
        }
      >
        <Row className="justify-between">
          <View>
            <Muted>Welcome back</Muted>
            <H1>{p?.displayName ?? 'Learner'}</H1>
          </View>
          <View className="items-end">
            <Pill tone="gold">{`🔥 ${p?.streakCount ?? 0}`}</Pill>
            {lvl ? <Muted className="mt-2">{`Level ${lvl.level}`}</Muted> : null}
          </View>
        </Row>

        <Card className="mt-5">
          <Row className="justify-between">
            <H2>Today</H2>
            <Muted>{`${reviewsToday} / ${goal}`}</Muted>
          </Row>
          <View className="mt-3">
            <ProgressBar fraction={goalFraction} />
          </View>
          <Muted className="mt-2">
            {goalFraction >= 1
              ? 'Daily goal met. Nice work.'
              : `${Math.max(0, goal - reviewsToday)} to go to keep your streak.`}
          </Muted>
        </Card>

        <View className="mt-5 gap-3">
          <Button title="Start session" onPress={() => pushOnce('/session')} />
          <Button
            title="⚡️ Speed round"
            variant="secondary"
            onPress={() => pushOnce('/speed')}
          />
        </View>

        {atCap && !p?.isPro ? (
          <Card className="mt-4 border-gold">
            <Body className="font-semibold">Daily new-word limit reached</Body>
            <Muted className="mt-1">
              You have hit the free limit of new words for today. Reviews are still unlimited.
              Go Pro for unlimited new words and every game mode.
            </Muted>
            <View className="mt-3">
              <Button title="See Pro" variant="secondary" onPress={() => pushOnce('/paywall')} />
            </View>
          </Card>
        ) : null}

        <Row className="mt-5 gap-3">
          <StatTile label="Due now" value={counts.data?.due ?? 0} />
          <StatTile label="Learning" value={counts.data?.learning ?? 0} />
          <StatTile label="Known" value={counts.data?.knownTotal ?? 0} />
        </Row>

        {lvl ? (
          <Card className="mt-5">
            <Row className="justify-between">
              <Muted>{`Level ${lvl.level}`}</Muted>
              <Muted>{`${lvl.xpIntoLevel} / ${lvl.xpForNextLevel} XP`}</Muted>
            </Row>
            <View className="mt-2">
              <ProgressBar fraction={lvl.fraction} />
            </View>
          </Card>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

function StatTile({ label, value }: { label: string; value: number }) {
  return (
    <Card className="flex-1 items-center">
      <H2>{value}</H2>
      <Muted className="mt-1">{label}</Muted>
    </Card>
  );
}
