// Holds the just-finished session summary for the summary screen (Zustand).
// A store keeps the handoff simple and avoids serializing rich data into route
// params.

import { create } from 'zustand';

export interface SessionSummary {
  reviewed: number;
  correct: number;
  xpEarned: number;
  newWords: number;
  accuracy: number; // 0..1
  goalMet: boolean;
  streakCount: number;
  newAchievements: string[];
}

interface SessionResultState {
  summary: SessionSummary | null;
  setSummary: (s: SessionSummary) => void;
  clear: () => void;
}

export const useSessionResult = create<SessionResultState>((set) => ({
  summary: null,
  setSummary: (summary) => set({ summary }),
  clear: () => set({ summary: null }),
}));
