// Adaptive placement (Phase 6.1). Pure logic: pick the next difficulty tier
// from the last answer, and turn a set of answers into a level estimate plus the
// set of clearly-known words to skip. Unit tested.

export type PlacementAnswer = 'know' | 'unsure' | 'dont_know';

export interface PlacementResponse {
  wordId: number;
  tier: number; // 1..5
  answer: PlacementAnswer;
}

export const PLACEMENT_LENGTH = 12;
export const START_TIER = 3;

/** Adjust difficulty: harder after "know", easier after "don't know". */
export function nextTier(currentTier: number, answer: PlacementAnswer): number {
  const delta = answer === 'know' ? 1 : answer === 'dont_know' ? -1 : 0;
  return Math.min(5, Math.max(1, currentTier + delta));
}

/** Words the user clearly knows (answered "know"), to skip from the new queue. */
export function knownWordIds(responses: PlacementResponse[]): number[] {
  return responses.filter((r) => r.answer === 'know').map((r) => r.wordId);
}

/**
 * Estimate a starting level (1..5). The estimate sits just above the hardest
 * tier the user reliably knows, so the new-word queue starts near their edge
 * rather than at tier 1. Defaults to 2 when nothing is known.
 */
export function estimateLevel(responses: PlacementResponse[]): number {
  const knownTiers = responses.filter((r) => r.answer === 'know').map((r) => r.tier);
  if (knownTiers.length === 0) return 2;
  const hardestKnown = Math.max(...knownTiers);
  // If they also missed words at that tier, hold; otherwise nudge up one.
  const missedAtOrBelow = responses.some(
    (r) => r.answer === 'dont_know' && r.tier <= hardestKnown,
  );
  return Math.min(5, missedAtOrBelow ? hardestKnown : hardestKnown + 1);
}
