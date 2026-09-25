// Session-scoped context available to every game mode: the distractor pool,
// the user's profile (for gating), and, in a scheduled session, a way to
// preview when a word comes back. Set once by the session runner.

import { createContext, useContext, useMemo } from 'react';
import type { Profile, SessionItem } from '@/lib/types';
import type { GameOutcome } from '@/srs/srs';
import { formatNextDue } from '@/lib/date';
import { reviewTime } from '@/features/review/nextDue';
import type { OptionPool } from './optionPool';

export interface GameContextValue {
  pool: OptionPool;
  profile: Profile;
  /**
   * When the word would come back if this outcome were committed. The session
   * supplies it. Practice leaves it out, because practice never reschedules a
   * word, and the reveal then shows no "next review" line.
   */
  previewNextDue?: (item: SessionItem, outcome: GameOutcome) => Date;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider = GameContext.Provider;

export function useGameContext(): GameContextValue {
  const v = useContext(GameContext);
  if (!v) throw new Error('useGameContext must be used within a GameProvider');
  return v;
}

/**
 * The reveal panel's "Next review …" text for an answered item, or null while
 * the item is unanswered or when nothing will be rescheduled.
 */
export function useNextDueLabel(item: SessionItem, outcome: GameOutcome | null): string | null {
  const { previewNextDue } = useGameContext();
  return useMemo(() => {
    if (!outcome || !previewNextDue) return null;
    return formatNextDue(previewNextDue(item, outcome), reviewTime(outcome));
  }, [item, outcome, previewNextDue]);
}
