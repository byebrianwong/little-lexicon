// Holds onboarding answers across the multi-step flow, committed to the profile
// at the end (Phase 6.1 / 6.2).

import { create } from 'zustand';

interface OnboardingState {
  levelEstimate: number | null;
  knownWordIds: number[];
  dailyGoal: number;
  interests: string[];
  setPlacement: (levelEstimate: number, knownWordIds: number[]) => void;
  setGoal: (dailyGoal: number) => void;
  setInterests: (interests: string[]) => void;
  reset: () => void;
}

export const useOnboardingStore = create<OnboardingState>((set) => ({
  levelEstimate: null,
  knownWordIds: [],
  dailyGoal: 15,
  interests: [],
  setPlacement: (levelEstimate, knownWordIds) => set({ levelEstimate, knownWordIds }),
  setGoal: (dailyGoal) => set({ dailyGoal }),
  setInterests: (interests) => set({ interests }),
  reset: () => set({ levelEstimate: null, knownWordIds: [], dailyGoal: 15, interests: [] }),
}));
