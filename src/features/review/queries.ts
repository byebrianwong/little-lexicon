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
  opts?: { levelEstimate?: number | null },
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
 * New words lean toward the learner's level without being limited to it.
 */
export function useSessionPlan(profile: Profile | undefined) {
  return useQuery({
    queryKey: qk.sessionPlan,
    enabled: !!profile,
    staleTime: 0,
    queryFn: async (): Promise<SessionPlan> => {
      const p = profile!;
      const [due, newWords] = await Promise.all([
        backend.getDueQueue(OPENING_DUE_PAGE),
        backend.getNewWords(OPENING_NEW_WORD_PAGE, { levelEstimate: p.levelEstimate }),
      ]);
      return buildSessionPlan({ due, newWords });
    },
  });
}
