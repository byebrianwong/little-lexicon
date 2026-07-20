import { QueryClient } from '@tanstack/react-query';

// One shared client. Server state (due queue, profile, stats) lives here;
// session/client state lives in Zustand stores.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 5 * 60_000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
    mutations: {
      retry: 0,
    },
  },
});

// Centralized query keys so invalidation stays consistent across features.
export const qk = {
  profile: ['profile'] as const,
  dueQueue: (limit: number) => ['dueQueue', limit] as const,
  newWords: (limit: number) => ['newWords', limit] as const,
  sessionPlan: ['sessionPlan'] as const,
  stats: ['stats'] as const,
  dailyStats: ['dailyStats'] as const,
  forecast: (days: number) => ['forecast', days] as const,
  leaderboard: ['leaderboard'] as const,
  achievements: ['achievements'] as const,
  wordContent: (wordId: number) => ['wordContent', wordId] as const,
};
