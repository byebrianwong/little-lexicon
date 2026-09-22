import { useFocusEffect } from 'expo-router';
import { useCallback } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { HomeView } from '@/features/home/HomeView';
import { useProfile } from '@/features/review/queries';
import { useProgressCounts, useTodayStats } from '@/features/stats/queries';
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

  return (
    <HomeView
      profile={profile.data}
      reviewsToday={today.data?.reviewsDone ?? 0}
      counts={counts.data}
      onRefresh={() => qc.invalidateQueries()}
      onStartSession={() => pushOnce('/session')}
      onPractice={() => pushOnce('/practice')}
      onSpeedRound={() => pushOnce('/speed')}
    />
  );
}
