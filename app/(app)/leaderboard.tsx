import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { LeaderboardView } from '@/features/gamification/LeaderboardView';
import { useAchievements, useLeaderboard } from '@/features/stats/queries';

export default function Leaderboard() {
  const qc = useQueryClient();
  const board = useLeaderboard();
  const achievements = useAchievements();

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries();
    }, [qc]),
  );

  return (
    <LeaderboardView
      entries={board.data}
      unlockedCodes={achievements.data}
      onRefresh={() => qc.invalidateQueries()}
    />
  );
}
