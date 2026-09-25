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
//
// Build it the moment the answer is given, not when Continue is tapped. The
// response time feeds the rating (under 3 s can earn Easy, over 8 s drops to
// Hard), and the seconds spent reading the reveal are not answering.
export function makeOutcome(
  correct: boolean,
  startedAt: number,
  hintUsed: boolean,
  answeredAt: number = Date.now(),
): GameOutcome {
  return {
    correct,
    firstAttempt: true,
    hintUsed,
    responseMs: answeredAt - startedAt,
    answeredAt,
  };
}
