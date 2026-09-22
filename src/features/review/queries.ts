// Server-state hooks for the review loop (Phase 2.2). Components use these; they
// never call the backend directly. Thin wrappers plus TanStack Query hooks.

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import type { Profile, SessionItem } from '@/lib/types';
import { buildSessionPlan, type SessionPlan } from './sessionPlan';
import { OPENING_DUE_PAGE, OPENING_NEW_WORD_PAGE } from './pageSizes';

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
 * Assemble the opening queue for a session: due reviews plus new words, with
 * new words interleaved. Nothing here is capped. The daily goal is a target for
 * the streak and the progress bar, not a limit on the session, and the page
 * sizes below only bound the first fetch: the session refills as it is played.
 * The level estimate from onboarding biases the new-word tier window.
 */
export function useSessionPlan(profile: Profile | undefined) {
  return useQuery({
    queryKey: qk.sessionPlan,
    enabled: !!profile,
    staleTime: 0,
    queryFn: async (): Promise<SessionPlan> => {
      const p = profile!;
      const tierWindow = tierWindowForLevel(p.levelEstimate);
      // The tier window orders new words near the user's level first; it does
      // not fence them in. Anything outside the window is appended after, so a
      // session is never starved of material by the placement estimate.
      const [due, inWindow, everything] = await Promise.all([
        backend.getDueQueue(OPENING_DUE_PAGE),
        backend.getNewWords(OPENING_NEW_WORD_PAGE, tierWindow),
        backend.getNewWords(OPENING_NEW_WORD_PAGE),
      ]);
      const seen = new Set(inWindow.map((i) => i.content.wordId));
      const fresh = [...inWindow, ...everything.filter((i) => !seen.has(i.content.wordId))];
      return buildSessionPlan({ due, newWords: fresh });
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
