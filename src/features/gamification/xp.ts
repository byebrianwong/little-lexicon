// XP scoring, weighted by retrieval difficulty (SPEC section 8, Phase 5.1).
// Anti-gaming: harder retrieval (production, use-it) is worth more than
// recognition (multiple choice). Pure logic, unit tested.

import type { GameModeId } from '@/lib/types';
import { Rating } from '@/srs/srs';

// Base XP per mode. Production and "use it" (full recall / generation) reward
// most; cloze and relation-matching sit in the middle; multiple choice least.
export const BASE_XP: Record<GameModeId, number> = {
  mc_def_to_word: 10,
  mc_word_to_def: 10,
  listening: 12,
  synonym_match: 14,
  antonym_match: 14,
  cloze: 16,
  production: 22,
  use_it: 25,
};

export const FIRST_ATTEMPT_BONUS = 3;
export const SPEED_BONUS = 3;

export interface XpInput {
  mode: GameModeId;
  rating: Rating; // outcome-mapped FSRS rating
  firstAttempt: boolean;
  fast: boolean; // answered under the fast threshold
}

/**
 * XP for one encounter. Incorrect answers (Again) earn nothing: streaks and XP
 * must reflect genuine retrieval, not taps. Bonuses apply only when correct.
 */
export function xpForOutcome(input: XpInput): number {
  if (input.rating === Rating.Again) return 0;
  let xp = BASE_XP[input.mode];
  if (input.firstAttempt) xp += FIRST_ATTEMPT_BONUS;
  if (input.fast && input.rating === Rating.Easy) xp += SPEED_BONUS;
  // Hard answers (slow or hint) are correct but discounted.
  if (input.rating === Rating.Hard) xp = Math.round(xp * 0.7);
  return xp;
}

// ---------------------------------------------------------------------------
// Levels. A gently increasing curve: level n needs a quadratic-ish total.
// level(xp) = floor( sqrt(xp / 40) ) + 1, capped for sanity.
// ---------------------------------------------------------------------------

export function levelForXp(xpTotal: number): number {
  if (xpTotal <= 0) return 1;
  return Math.floor(Math.sqrt(xpTotal / 40)) + 1;
}

/** Total XP required to reach a given level (inverse of levelForXp). */
export function xpForLevel(level: number): number {
  const l = Math.max(1, Math.floor(level));
  return (l - 1) * (l - 1) * 40;
}

export interface LevelProgress {
  level: number;
  xpIntoLevel: number;
  xpForNextLevel: number;
  fraction: number; // 0..1 progress toward next level
}

export function levelProgress(xpTotal: number): LevelProgress {
  const level = levelForXp(xpTotal);
  const floor = xpForLevel(level);
  const ceil = xpForLevel(level + 1);
  const span = Math.max(1, ceil - floor);
  const into = Math.max(0, xpTotal - floor);
  return {
    level,
    xpIntoLevel: into,
    xpForNextLevel: ceil - floor,
    fraction: Math.min(1, into / span),
  };
}
