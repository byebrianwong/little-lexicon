// Local device settings (Zustand). Sound/haptic feedback toggle for the
// correct-answer feedback (Phase 5.5). Server-synced preferences like desired
// retention and daily goal live on the profile, not here.
//
// Persisted to AsyncStorage manually rather than via zustand/middleware: the
// middleware bundle pulls in the devtools helper, which uses `import.meta.env`
// and breaks the Metro web (classic script) bundle at runtime.

import { create } from 'zustand';
import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_KEY = 'little_lexicon.settings.v1';

interface SettingsState {
  soundEnabled: boolean;
  hydrated: boolean;
  setSoundEnabled: (v: boolean) => void;
  hydrate: () => Promise<void>;
}

export const useSettingsStore = create<SettingsState>((set, get) => ({
  soundEnabled: true,
  hydrated: false,

  setSoundEnabled: (v) => {
    set({ soundEnabled: v });
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify({ soundEnabled: v })).catch(() => {});
  },

  hydrate: async () => {
    if (get().hydrated) return;
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as { soundEnabled?: boolean };
        if (typeof parsed.soundEnabled === 'boolean') {
          set({ soundEnabled: parsed.soundEnabled });
        }
      }
    } catch {
      // Ignore corrupt/missing settings; defaults apply.
    } finally {
      set({ hydrated: true });
    }
  },
}));
