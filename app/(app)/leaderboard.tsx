import { RefreshControl, ScrollView, View } from 'react-native';
import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useQueryClient } from '@tanstack/react-query';
import { Body, Card, H1, Muted, Row } from '@/components/ui';
import { useLeaderboard , useAchievements } from '@/features/stats/queries';
import { ACHIEVEMENTS, achievementByCode } from '@/features/gamification/achievements';

export default function Leaderboard() {
  const qc = useQueryClient();
  const board = useLeaderboard();
  const achievements = useAchievements();
  const unlocked = new Set(achievements.data ?? []);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries();
    }, [qc]),
  );

  return (
    <SafeAreaView className="flex-1 bg-bg" edges={['top']}>
      <ScrollView
        contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
        refreshControl={
          <RefreshControl refreshing={false} onRefresh={() => qc.invalidateQueries()} tintColor="#6C8CFF" />
        }
      >
        <H1>This week</H1>
        <Muted className="mt-1">
          You are grouped with a small cohort. Ranks reset at the start of each week.
        </Muted>

        <Card className="mt-5 p-0">
          {(board.data ?? []).map((row, i) => (
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
          {board.data && board.data.length === 0 ? (
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
