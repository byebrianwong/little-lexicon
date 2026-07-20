// Server-state hooks for the review loop (Phase 2.2). Components use these; they
// never call the backend directly. Thin wrappers plus TanStack Query hooks.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import type { Profile, SessionItem } from '@/lib/types';
import { buildSessionPlan, type SessionPlan } from './sessionPlan';
import { newAllowance } from '@/features/monetization/limits';

// --- Plain async wrappers (usable outside React, e.g. the session runner) ----
export function getDueQueue(limit: number): Promise<SessionItem[]> {
  return backend.getDueQueue(limit);
}

export function getNewWords(
  limit: number,
  opts?: { minTier?: number; maxTier?: number },
): Promise<SessionItem[]> {
  return backend.getNewWords(limit, opts);
}

export function startSession() {
  return backend.startSession();
}

export function endSession(
  sessionId: string,
  stats: { wordsReviewed: number; newWords: number; xpEarned: number; accuracy: number },
) {
  return backend.endSession(sessionId, stats);
}

// --- Hooks ------------------------------------------------------------------
export function useProfile() {
  return useQuery({ queryKey: qk.profile, queryFn: () => backend.getProfile() });
}

export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Partial<Omit<Profile, 'userId'>>) => backend.updateProfile(patch),
    onSuccess: (profile) => {
      qc.setQueryData(qk.profile, profile);
      qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}

/**
 * Assemble today's session plan: due reviews + new words, capped by the daily
 * goal and the user's new-word allowance. The level estimate from onboarding
 * biases the new-word tier window.
 */
export function useSessionPlan(profile: Profile | undefined) {
  return useQuery({
    queryKey: qk.sessionPlan,
    enabled: !!profile,
    staleTime: 0,
    queryFn: async (): Promise<SessionPlan> => {
      const p = profile!;
      const goal = p.dailyGoal;
      const tierWindow = tierWindowForLevel(p.levelEstimate);
      const [due, fresh] = await Promise.all([
        backend.getDueQueue(goal),
        backend.getNewWords(newAllowance(p), tierWindow),
      ]);
      return buildSessionPlan({
        due,
        newWords: fresh,
        dailyGoal: goal,
        newAllowance: newAllowance(p),
      });
    },
  });
}

/** Map a placement level estimate (1..5) to a tier window for new words. */
export function tierWindowForLevel(
  levelEstimate: number | null,
): { minTier: number; maxTier: number } {
  if (levelEstimate == null) return { minTier: 1, maxTier: 5 };
  const center = Math.min(5, Math.max(1, levelEstimate));
  return { minTier: Math.max(1, center - 1), maxTier: Math.min(5, center + 1) };
}
