// Free vs Pro limits (Phase 7.1). Kept as pure helpers so the session planner
// and paywall gate share one source of truth. Server-side entitlement
// (profiles.is_pro via the RevenueCat webhook) is the real gate; these limits
// only shape the client experience.

import type { GameModeId, Profile } from '@/lib/types';

export const FREE_DAILY_NEW_CAP = 10;
export const PRO_DAILY_NEW_CAP = 100; // effectively unlimited for a day's session

// Modes gated to Pro. "Use it" (Claude evaluation) and personalized generation
// are Pro-only; the core recognition/recall modes are free.
export const PRO_ONLY_MODES: ReadonlySet<GameModeId> = new Set<GameModeId>(['use_it']);

export function newAllowance(profile: Pick<Profile, 'isPro'>): number {
  return profile.isPro ? PRO_DAILY_NEW_CAP : FREE_DAILY_NEW_CAP;
}

export function isModeAllowed(mode: GameModeId, profile: Pick<Profile, 'isPro'>): boolean {
  if (profile.isPro) return true;
  return !PRO_ONLY_MODES.has(mode);
}

/** True when the free user has spent today's new-word budget. */
export function hitNewWordCap(profile: Pick<Profile, 'isPro'>, newLearnedToday: number): boolean {
  if (profile.isPro) return false;
  return newLearnedToday >= FREE_DAILY_NEW_CAP;
}
