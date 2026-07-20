// Auth session state (Zustand). Subscribes to the backend's auth changes once
// and exposes a simple status for the route guard.

import { create } from 'zustand';
import { backend, type AuthSession } from '@/lib/backend';

type AuthStatus = 'loading' | 'signedIn' | 'signedOut';

interface AuthState {
  status: AuthStatus;
  session: AuthSession | null;
  initialized: boolean;
  init: () => Promise<void>;
  signOut: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  status: 'loading',
  session: null,
  initialized: false,

  init: async () => {
    if (get().initialized) return;
    set({ initialized: true });
    backend.onAuthStateChange((session) => {
      set({ session, status: session ? 'signedIn' : 'signedOut' });
    });
    const session = await backend.getSession();
    set({ session, status: session ? 'signedIn' : 'signedOut' });
  },

  signOut: async () => {
    await backend.signOut();
    set({ session: null, status: 'signedOut' });
  },
}));
