// Supabase client, configured for React Native + Expo (and web).
// Session persistence uses AsyncStorage per the Expo + Supabase guide:
// https://docs.expo.dev/guides/using-supabase/
//
// In demo mode (no Supabase configured) this exports a client that is never
// actually called; the repository layer routes to the in-memory backend
// instead. See src/lib/backend.ts.

import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';
import { env, isDemoMode } from './env';
import type { Database } from './database.types';

// A single shared client. `db: { schema: 'little_lexicon' }` scopes PostgREST calls to
// our isolated schema inside the shared games-apps project.
function makeClient(): SupabaseClient<Database, 'little_lexicon'> {
  // Fall back to harmless placeholders in demo mode so createClient does not
  // throw on an empty URL. The client is never invoked in that mode.
  const url = env.supabaseUrl || 'https://demo.invalid';
  const key = env.supabaseAnonKey || 'demo-anon-key';

  return createClient<Database, 'little_lexicon'>(url, key, {
    db: { schema: 'little_lexicon' },
    auth: {
      storage: AsyncStorage,
      autoRefreshToken: true,
      persistSession: true,
      // On native there is no URL to parse; on web we let Supabase read the
      // OAuth redirect fragment.
      detectSessionInUrl: Platform.OS === 'web',
    },
  });
}

export const supabase = makeClient();

export function requireRealBackend(): void {
  if (isDemoMode) {
    throw new Error(
      'Supabase is not configured (demo mode). Set EXPO_PUBLIC_SUPABASE_URL and ' +
        'EXPO_PUBLIC_SUPABASE_ANON_KEY to use the real backend.',
    );
  }
}
