// Runtime configuration: parse CLI flags, load pipeline/.env, decide dry-run vs
// live, and assemble the RunContext handed to every stage.
//
// Dry-run rule (SPEC + task): if --dry-run is passed OR the Supabase service
// credentials are absent, the whole run goes offline. It uses the bundled seed
// list and stub generators and writes to pipeline/out/dry-run.json instead of
// Supabase. No API keys, no network, no spend.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Logger } from './lib/logger.ts';
import { CachedFetcher } from './lib/fetch.ts';
import { JsonFileStore, SupabaseStore, type Store } from './lib/store.ts';

export const STAGES = ['words', 'senses', 'generate', 'audio'] as const;
export type StageName = (typeof STAGES)[number];

export interface Flags {
  only: StageName | null;
  dryRun: boolean;
  limit: number | null;
  verbose: boolean;
}

export interface Env {
  supabaseUrl: string | undefined;
  supabaseServiceKey: string | undefined;
  anthropicKey: string | undefined;
  googleTtsKey: string | undefined;
  googleTtsVoice: string;
  googleTtsLanguage: string;
}

export interface Paths {
  root: string;
  seedFile: string;
  cacheDir: string;
  outFile: string;
}

export class Metrics {
  wordsInserted = 0;
  wordsSkipped = 0;
  wordsDropped = 0;
  sensesInserted = 0;
  sensesSkipped = 0;
  relationsInserted = 0;
  realExamples = 0;
  generatedExamples = 0;
  distractorsInserted = 0;
  mnemonicsInserted = 0;
  plainDefsWritten = 0;
  invalidRejected = 0;
  escalatedToSonnet = 0;
  claudeInputTokens = 0;
  claudeOutputTokens = 0;
  claudeCostUsd = 0;
  ttsChars = 0;
  ttsCostUsd = 0;
  audioWordsSynthed = 0;
  audioSentencesSynthed = 0;
  audioReusedHuman = 0;
  audioBytes = 0;
  bucketBytes = 0;
}

export interface RunContext {
  flags: Flags;
  env: Env;
  dryRun: boolean;
  useClaude: boolean;
  useTts: boolean;
  limit: number | null;
  paths: Paths;
  store: Store;
  http: CachedFetcher;
  log: Logger;
  metrics: Metrics;
}

const PIPELINE_ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

export function parseFlags(argv: string[]): Flags {
  const flags: Flags = { only: null, dryRun: false, limit: null, verbose: false };
  for (const arg of argv) {
    if (arg === '--dry-run') flags.dryRun = true;
    else if (arg === '--verbose' || arg === '-v') flags.verbose = true;
    else if (arg.startsWith('--only=')) {
      const value = arg.slice('--only='.length);
      if ((STAGES as readonly string[]).includes(value)) {
        flags.only = value as StageName;
      } else {
        throw new Error(`--only must be one of ${STAGES.join('|')}, got "${value}"`);
      }
    } else if (arg.startsWith('--limit=')) {
      const n = Number.parseInt(arg.slice('--limit='.length), 10);
      if (!Number.isFinite(n) || n <= 0) throw new Error(`--limit must be a positive integer`);
      flags.limit = n;
    } else if (arg.startsWith('--')) {
      throw new Error(`Unknown flag: ${arg}`);
    }
  }
  return flags;
}

function loadEnv(): Env {
  const envPath = join(PIPELINE_ROOT, '.env');
  if (existsSync(envPath)) {
    dotenv.config({ path: envPath });
  }
  return {
    supabaseUrl: process.env.SUPABASE_URL,
    supabaseServiceKey: process.env.SUPABASE_SERVICE_ROLE_KEY,
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    googleTtsKey: process.env.GOOGLE_TTS_API_KEY,
    googleTtsVoice: process.env.GOOGLE_TTS_VOICE ?? 'en-US-Neural2-D',
    googleTtsLanguage: process.env.GOOGLE_TTS_LANGUAGE ?? 'en-US',
  };
}

export async function createContext(flags: Flags): Promise<RunContext> {
  const log = new Logger(flags.verbose);
  const env = loadEnv();

  const paths: Paths = {
    root: PIPELINE_ROOT,
    seedFile: join(PIPELINE_ROOT, 'data', 'seed-words.sample.txt'),
    cacheDir: join(PIPELINE_ROOT, '.cache'),
    outFile: join(PIPELINE_ROOT, 'out', 'dry-run.json'),
  };

  const hasSupabase = Boolean(env.supabaseUrl && env.supabaseServiceKey);
  const dryRun = flags.dryRun || !hasSupabase;

  if (flags.dryRun) {
    log.info('Mode: DRY-RUN (--dry-run). Offline stubs; writing to out/dry-run.json.');
  } else if (!hasSupabase) {
    log.warn('Mode: DRY-RUN (no Supabase credentials found). Writing to out/dry-run.json.');
  } else {
    log.info('Mode: LIVE. Writing to Supabase with the service role.');
  }

  const store: Store = dryRun
    ? new JsonFileStore(paths.outFile, log)
    : new SupabaseStore(env.supabaseUrl!, env.supabaseServiceKey!, log);

  const useClaude = !dryRun && Boolean(env.anthropicKey);
  const useTts = !dryRun && Boolean(env.googleTtsKey);

  if (!dryRun && !env.anthropicKey) {
    log.warn('ANTHROPIC_API_KEY not set: stage 03 will use stub generation.');
  }
  if (!dryRun && !env.googleTtsKey) {
    log.warn('GOOGLE_TTS_API_KEY not set: stage 04 will use stub audio.');
  }

  const http = new CachedFetcher({ cacheDir: paths.cacheDir, logger: log });

  return {
    flags,
    env,
    dryRun,
    useClaude,
    useTts,
    limit: flags.limit,
    paths,
    store,
    http,
    log,
    metrics: new Metrics(),
  };
}
