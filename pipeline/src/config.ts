// Runtime configuration: parse CLI flags, load pipeline/.env, decide dry-run vs
// live, and assemble the RunContext handed to every stage.
//
// Live (the default) reads real sources and writes the committed pipeline
// record, data/content-db.json, then exports src/content/words.json for the
// app. Paid stages run only when their key is set; without it they are skipped,
// never filled with stub text.
//
// Dry-run (--dry-run) uses the bundled seed list and stub generators, writes
// out/dry-run.json and out/words.dry-run.json, and never touches the network or
// the committed files.

import { existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Logger } from './lib/logger.ts';
import { CachedFetcher } from './lib/fetch.ts';
import { JsonFileStore, type Store } from './lib/store.ts';

export const STAGES = ['words', 'senses', 'generate', 'audio', 'export'] as const;
export type StageName = (typeof STAGES)[number];

export interface Flags {
  only: StageName | null;
  dryRun: boolean;
  limit: number | null;
  verbose: boolean;
}

export interface Env {
  anthropicKey: string | undefined;
  googleTtsKey: string | undefined;
  googleTtsVoice: string;
  googleTtsLanguage: string;
}

export interface Paths {
  root: string;
  seedFile: string;
  cacheDir: string;
  /** The pipeline's record of every row and id (committed in live mode). */
  dbFile: string;
  /** The words file the app bundles (src/content/words.json in live mode). */
  exportFile: string;
  /** Where synthesized MP3s are written until an audio host is chosen. */
  audioDir: string;
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
  audioClips = 0;
  wordsExported = 0;
  wordsHeldBack = 0;
  exportBytes = 0;
  exportGzipBytes = 0;
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
    anthropicKey: process.env.ANTHROPIC_API_KEY,
    googleTtsKey: process.env.GOOGLE_TTS_API_KEY,
    googleTtsVoice: process.env.GOOGLE_TTS_VOICE ?? 'en-US-Neural2-D',
    googleTtsLanguage: process.env.GOOGLE_TTS_LANGUAGE ?? 'en-US',
  };
}

export async function createContext(flags: Flags): Promise<RunContext> {
  const log = new Logger(flags.verbose);
  const env = loadEnv();

  const dryRun = flags.dryRun;
  const out = join(PIPELINE_ROOT, 'out');
  const paths: Paths = {
    root: PIPELINE_ROOT,
    seedFile: join(PIPELINE_ROOT, 'data', 'seed-words.sample.txt'),
    cacheDir: join(PIPELINE_ROOT, '.cache'),
    dbFile: dryRun ? join(out, 'dry-run.json') : join(PIPELINE_ROOT, 'data', 'content-db.json'),
    exportFile: dryRun
      ? join(out, 'words.dry-run.json')
      : join(PIPELINE_ROOT, '..', 'src', 'content', 'words.json'),
    audioDir: join(out, 'audio'),
  };

  if (dryRun) {
    log.info('Mode: DRY-RUN. Offline stubs; writing to out/.');
  } else {
    log.info('Mode: LIVE. Writing data/content-db.json and src/content/words.json.');
  }

  const store: Store = new JsonFileStore(paths.dbFile, paths.audioDir, dryRun, log);

  const useClaude = !dryRun && Boolean(env.anthropicKey);
  const useTts = !dryRun && Boolean(env.googleTtsKey);

  if (!dryRun && !env.anthropicKey) {
    log.warn('ANTHROPIC_API_KEY not set: stage 03 will be skipped.');
  }
  if (!dryRun && !env.googleTtsKey) {
    log.warn('GOOGLE_TTS_API_KEY not set: stage 04 will be skipped.');
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
