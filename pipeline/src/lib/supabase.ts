// Supabase service-role client for the pipeline. The service role bypasses RLS,
// which is exactly what the offline seeder needs to write the content tables
// (words, senses, ...). This key is server-only and must never reach the app
// bundle (CLAUDE.md > Secrets). It is read from pipeline/.env via dotenv.

import { createClient } from '@supabase/supabase-js';

/**
 * Build a service-role client scoped to the `little_lexicon` schema. Auth persistence is
 * disabled because this is a one-shot server process, not a session. The return
 * type is inferred so the `little_lexicon` schema flows through to `.from(...)` calls.
 */
export function createServiceRoleClient(url: string, serviceRoleKey: string) {
  return createClient(url, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    db: { schema: 'little_lexicon' },
    global: { headers: { 'x-application-name': 'little-lexicon-pipeline' } },
  });
}

/** The concrete client type used across the pipeline. */
export type PipelineSupabaseClient = ReturnType<typeof createServiceRoleClient>;

export const STORAGE_BUCKET = process.env.STORAGE_BUCKET ?? 'little-lexicon-audio';
