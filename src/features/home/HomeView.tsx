// The home screen's layout. It takes data as props and holds none of its own,
// so every state it can be in (loading, brand new account, goal met) is one
// props object away. app/(app)/index.tsx supplies the real data.

import { Text, View } from 'react-native';
import {
  H1,
  Label,
  ListRow,
  Muted,
  Note,
  Row,
  Screen,
  Section,
  Stat,
} from '@/components/ui';
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
  const goalMet = reviewsToday >= goal;
  const toGo = Math.max(0, goal - reviewsToday);
  const lvl = profile ? levelProgress(profile.xpTotal) : null;
  const streak = profile?.streakCount ?? 0;

  return (
    <Screen scroll edges={['top']} onRefresh={onRefresh}>
      <Row className="items-end justify-between gap-4 pt-4">
        <View className="flex-shrink">
          <Note className="text-[17px]">Welcome back</Note>
          <H1 className="text-[44px] leading-[48px]">
            {profile?.displayName ?? 'Learner'}
          </H1>
        </View>
        <View className="items-end pb-1">
          <Label>Streak</Label>
          <Text className="mt-1 font-serif-medium text-[22px] leading-[26px] text-ink">
            {`${streak} day${streak === 1 ? '' : 's'}`}
          </Text>
        </View>
      </Row>

      <Section label="Today" className="mt-10">
        <Row className="items-baseline gap-3">
          <Text className="font-serif-medium text-[64px] leading-[68px] tracking-[-1px] text-ink">
            {reviewsToday}
          </Text>
          <Note className="text-[22px] leading-[28px]">{`of ${goal} reviews`}</Note>
        </Row>
        <Muted className="mt-1 text-[17px]">
          {goalMet ? 'Daily goal met. Nice work.' : `${toGo} to go to keep your streak.`}
        </Muted>
      </Section>

      <View className="mt-9">
        <ListRow title="Start session" emphasis showArrow onPress={onStartSession} />
        <ListRow title="Endless practice" detail="no timer" onPress={onPractice} />
        <ListRow title="Speed round" detail="sixty seconds" onPress={onSpeedRound} last />
      </View>

      <Row className="mt-9 items-start gap-4">
        <Stat value={counts?.due ?? 0} label="Due now" />
        <Stat value={counts?.learning ?? 0} label="Learning" />
        <Stat value={counts?.knownTotal ?? 0} label="Known" />
      </Row>

      {lvl ? (
        <Note className="mt-10 text-[15px]">
          {`Level ${lvl.level}. ${lvl.xpIntoLevel} of ${lvl.xpForNextLevel} XP toward level ${lvl.level + 1}.`}
        </Note>
      ) : null}
    </Screen>
  );
}
