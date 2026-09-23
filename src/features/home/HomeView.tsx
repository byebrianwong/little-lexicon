// The home screen's layout. It takes data as props and holds none of its own,
// so every state it can be in (loading, brand new account, goal met) is one
// props object away. app/(app)/index.tsx supplies the real data.

import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Button, Card, H1, H2, Muted, Pill, ProgressBar, Row } from '@/components/ui';
import { levelProgress } from '@/features/gamification/xp';
import type { ProgressCounts } from '@/lib/backend/types';
import type { Profile } from '@/lib/types';

export interface HomeViewProps {
  /** Undefined until the profile query resolves. */
  profile: Profile | undefined;
  reviewsToday: number;
  counts: ProgressCounts | undefined;
  onRefresh: () => void;
  onStartSession: () => void;
  onPractice: () => void;
  onSpeedRound: () => void;
}

export function HomeView({
  profile,
  reviewsToday,
  counts,
  onRefresh,
  onStartSession,
  onPractice,
  onSpeedRound,
}: HomeViewProps) {
  const goal = profile?.dailyGoal ?? 15;
  const goalFraction = Math.min(1, reviewsToday / goal);
  const lvl = profile ? levelProgress(profile.xpTotal) : null;

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#6C8CFF" />
        }
      >
        <Row className="justify-between">
          <View>
            <Muted>Welcome back</Muted>
            <H1>{profile?.displayName ?? 'Learner'}</H1>
          </View>
          <View className="items-end">
            <Pill tone="gold">{`🔥 ${profile?.streakCount ?? 0}`}</Pill>
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
          <Button title="Start session" onPress={onStartSession} />
          <Button title="♾️ Endless practice" variant="secondary" onPress={onPractice} />
          <Button title="⚡️ Speed round" variant="secondary" onPress={onSpeedRound} />
        </View>

        <Row className="mt-5 gap-3">
          <StatTile label="Due now" value={counts?.due ?? 0} />
          <StatTile label="Learning" value={counts?.learning ?? 0} />
          <StatTile label="Known" value={counts?.knownTotal ?? 0} />
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
