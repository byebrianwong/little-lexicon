// The weekly leaderboard and the achievement list, with no data fetching.
// app/(app)/leaderboard.tsx supplies both lists.

import { RefreshControl, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Body, Card, H1, Muted, Row } from '@/components/ui';
import type { LeaderboardEntry } from '@/lib/backend/types';
import { ACHIEVEMENTS, achievementByCode } from './achievements';

export interface LeaderboardViewProps {
  /** Undefined while loading; an empty array means nobody has scored yet. */
  entries: LeaderboardEntry[] | undefined;
  unlockedCodes: string[] | undefined;
  onRefresh: () => void;
}

export function LeaderboardView({ entries, unlockedCodes, onRefresh }: LeaderboardViewProps) {
  const unlocked = new Set(unlockedCodes ?? []);

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={onRefresh} tintColor="#6C8CFF" />
        }
      >
        <H1>This week</H1>
        <Muted className="mt-1">
          You are grouped with a small cohort. Ranks reset at the start of each week.
        </Muted>

        <Card className="mt-5 p-0">
          {(entries ?? []).map((row, i) => (
            <Row
              key={row.userId}
              className={`justify-between px-4 py-3 ${
                i > 0 ? 'border-t border-border' : ''
              } ${row.isCurrentUser ? 'bg-primary/10' : ''}`}
            >
              <Row className="gap-3">
                <Muted className="w-6">{row.rankInCohort}</Muted>
                <Body className={row.isCurrentUser ? 'font-bold text-primary' : ''}>
                  {row.displayName ?? 'Learner'}
                  {row.isCurrentUser ? ' (you)' : ''}
                </Body>
              </Row>
              <Body className="font-semibold">{`${row.weeklyXp} XP`}</Body>
            </Row>
          ))}
          {entries && entries.length === 0 ? (
            <Body className="p-4 text-muted">No scores yet this week. Be the first.</Body>
          ) : null}
        </Card>

        <H1 className="mt-8">Achievements</H1>
        <View className="mt-4 gap-3">
          {ACHIEVEMENTS.map((a) => {
            const has = unlocked.has(a.code);
            const meta = achievementByCode(a.code)!;
            return (
              <Card key={a.code} className={has ? 'border-gold' : 'opacity-60'}>
                <Row className="gap-3">
                  <Body className="text-xl">{has ? '★' : '☆'}</Body>
                  <View className="flex-1">
                    <Body className="font-semibold">{meta.title}</Body>
                    <Muted>{meta.description}</Muted>
                  </View>
                </Row>
              </Card>
            );
          })}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}
