import type { GameOutcome } from '@/srs/srs';
import type { GameModeId, SessionItem } from '@/lib/types';

// Shared contract: every mode renders its own UI and calls onOutcome exactly
// once when the user finishes the encounter (Phase 4 shared contract).
export interface GameModeProps {
  item: SessionItem;
  mode: GameModeId;
  onOutcome: (outcome: GameOutcome) => void;
  soundEnabled: boolean;
}

// Single scored attempt per encounter (one FSRS rating per review). `hintUsed`
// is the main downgrade signal; a fast, hint-free correct answer earns Easy.
export function makeOutcome(
  correct: boolean,
  startedAt: number,
  hintUsed: boolean,
): GameOutcome {
  return {
    correct,
    firstAttempt: true,
    hintUsed,
    responseMs: Date.now() - startedAt,
  };
}
