import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/features/review/queries';
import {
  useDailyStats,
  useForecast,
  useProgressCounts,
  useRetention,
} from '@/features/stats/queries';
import { StatsView } from '@/features/stats/StatsView';

export default function Stats() {
  const qc = useQueryClient();
  const profile = useProfile();
  const counts = useProgressCounts();
  const retention = useRetention(30);
  const daily = useDailyStats(84);
  const forecast = useForecast(14);

  useFocusEffect(
    useCallback(() => {
      qc.invalidateQueries();
    }, [qc]),
  );

  return (
    <StatsView
      profile={profile.data}
      counts={counts.data}
      retention={retention.data}
      daily={daily.data}
      forecast={forecast.data}
      onRefresh={() => qc.invalidateQueries()}
    />
  );
}
