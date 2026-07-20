// Server-state hooks for progress, stats, leaderboard, and achievements.

import { useQuery } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';

export function useProgressCounts() {
  return useQuery({ queryKey: qk.stats, queryFn: () => backend.getProgressCounts() });
}

export function useDailyStats(days: number) {
  return useQuery({
    queryKey: [...qk.dailyStats, days],
    queryFn: () => backend.getDailyStatsRange(days),
  });
}

export function useTodayStats() {
  return useQuery({
    queryKey: [...qk.dailyStats, 'today'],
    queryFn: async () => {
      const range = await backend.getDailyStatsRange(1);
      return range[0]!;
    },
  });
}

export function useForecast(days: number) {
  return useQuery({
    queryKey: qk.forecast(days),
    queryFn: () => backend.getForecast(days),
  });
}

export function useRetention(sinceDays: number) {
  return useQuery({
    queryKey: [...qk.stats, 'retention', sinceDays],
    queryFn: () => backend.getRetention(sinceDays),
  });
}

export function useLeaderboard() {
  return useQuery({ queryKey: qk.leaderboard, queryFn: () => backend.getWeeklyLeaderboard() });
}

export function useAchievements() {
  return useQuery({ queryKey: qk.achievements, queryFn: () => backend.getAchievements() });
}
