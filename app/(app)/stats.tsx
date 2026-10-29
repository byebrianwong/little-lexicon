import { useCallback } from 'react';
import { useFocusEffect } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { useProfile } from '@/features/review/queries';
import { openWords } from '@/features/learning/links';
import { useYourWords } from '@/features/learning/queries';
import { useDailyStats, useForecast, useRetention } from '@/features/stats/queries';
import { StatsView } from '@/features/stats/StatsView';

export default function Stats() {
  const qc = useQueryClient();
  const profile = useProfile();
  const { counts } = useYourWords();
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
      counts={counts}
      onOpenWords={openWords}
      retention={retention.data}
      daily={daily.data}
      forecast={forecast.data}
      onRefresh={() => qc.invalidateQueries()}
    />
  );
}
