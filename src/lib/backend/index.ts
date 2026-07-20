// Selects the data backend once, at import time. Demo mode (no Supabase
// configured) uses the in-memory backend; otherwise the Supabase backend.
// Everything else in the app imports `backend` from here and never branches
// on the mode itself.

import { isDemoMode } from '@/lib/env';
import type { Backend } from './types';
import { DemoBackend } from './demo/demoBackend';
import { SupabaseBackend } from './supabase/supabaseBackend';

export const backend: Backend = isDemoMode ? new DemoBackend() : new SupabaseBackend();

export type {
  Backend,
  AuthSession,
  AuthResult,
  OAuthProvider,
  SubmitReviewInput,
  SubmitReviewResult,
  ProgressCounts,
  ForecastDay,
  LeaderboardEntry,
  SentenceFeedback,
} from './types';
