// Session-scoped context available to every game mode: the distractor pool and
// the user's profile (for gating). Set once by the session runner.

import { createContext, useContext } from 'react';
import type { Profile } from '@/lib/types';
import type { OptionPool } from './optionPool';

export interface GameContextValue {
  pool: OptionPool;
  profile: Profile;
}

const GameContext = createContext<GameContextValue | null>(null);

export const GameProvider = GameContext.Provider;

export function useGameContext(): GameContextValue {
  const v = useContext(GameContext);
  if (!v) throw new Error('useGameContext must be used within a GameProvider');
  return v;
}
