// Runtime configuration: parse CLI flags, load pipeline/.env, decide dry-run vs
// live, and assemble the RunContext handed to every stage.
//
// Live (the default) reads real sources and writes the committed pipeline
// record, data/content-db.json, then exports src/content/words.json for the
// app. Paid stages run only when their key is set, and the audio stage only
// when the Kokoro env exists; otherwise they are skipped, never filled with
// stub text.
//
// Dry-run (--dry-run) uses the bundled seed list and stub generators, writes
// out/dry-run.json and out/words.dry-run.json, and never touches the network or
// the committed files.

import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Logger } from './lib/logger.ts';
import { CachedFetcher } from './lib/fetch.ts';
import { JsonFileStore, type Store } from './lib/store.ts';
import { GEMINI_DEFAULT_MODELS } from './lib/gemini.ts';
import { DEFAULT_TTS_VOICE } from './lib/audio.ts';

export const STAGES = ['words', 'senses', 'generate', 'audio', 'export'] as const;
/** Stages that run only when named with --only. */
export const EXTRA_STAGES = ['revise'] as const;
export type StageName = (typeof STAGES)[number] | (typeof EXTRA_STAGES)[number];

export interface Flags {
  only: StageName | null;
  dryRun: boolean;
  limit: number | null;
  verbose: boolean;
}

export interface Env {
  anthropicKey: string | undefined;
  geminiKey: string | undefined;
  /** Gemini models to try in order for each request. */
  geminiModels: string[];
  /** True when GEMINI_MODEL chose the models, rather than the default list. */
  geminiModelsSet: boolean;
  /** Python of the Kokoro env that stage 04 runs (README > Audio). */
  kokoroPython: string;
  /** Kokoro voice for TTS clips, such as af_heart. */
  ttsVoice: string;
}

export interface Paths {
  root: string;
  seedFile: string;
  cacheDir: string;
  /** The pipeline's record of every row and id (committed in live mode). */
  dbFile: string;
  /** The words file the app bundles (src/content/words.json in live mode). */
  exportFile: string;
  /**
   * Where clips are written: public/audio in live mode. The web export copies
   * it to the site, and the app plays clips from there.
   */
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
  llmInputTokens = 0;
  llmOutputTokens = 0;
  llmCostUsd = 0;
  ttsChars = 0;
  audioWordsSynthed = 0;
  audioSentencesSynthed = 0;
  audioDefinitionsSynthed = 0;
  audioHooksSynthed = 0;
  audioReusedHuman = 0;
  audioBytes = 0;
  audioClips = 0;
  sensesRevised = 0;
  wordsExported = 0;
  wordsHeldBack = 0;
  exportBytes = 0;
  exportGzipBytes = 0;
}

export interface RunContext {
  flags: Flags;
  env: Env;
  dryRun: boolean;
  /** Which model writes stage 03 content: Claude if its key is set, else Gemini. */
  llm: 'claude' | 'gemini' | null;
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
      const known: readonly string[] = [...STAGES, ...EXTRA_STAGES];
      if (known.includes(value)) {
        flags.only = value as StageName;
      } else {
        throw new Error(`--only must be one of ${known.join('|')}, got "${value}"`);
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
    geminiKey: process.env.GEMINI_API_KEY,
    geminiModels: process.env.GEMINI_MODEL
      ? process.env.GEMINI_MODEL.split(',').map((m) => m.trim()).filter(Boolean)
      : GEMINI_DEFAULT_MODELS,
    geminiModelsSet: Boolean(process.env.GEMINI_MODEL),
    kokoroPython:
      process.env.KOKORO_PYTHON ?? join(homedir(), '.cache', 'little-lexicon-tts', '.venv', 'bin', 'python'),
    ttsVoice: process.env.KOKORO_VOICE ?? DEFAULT_TTS_VOICE,
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
    audioDir: dryRun ? join(out, 'audio') : join(PIPELINE_ROOT, '..', 'public', 'audio'),
  };

  if (dryRun) {
    log.info('Mode: DRY-RUN. Offline stubs; writing to out/.');
  } else {
    log.info('Mode: LIVE. Writing data/content-db.json, src/content/words.json and public/audio.');
  }

  const store: Store = new JsonFileStore(paths.dbFile, paths.audioDir, dryRun, log);

  const llm: RunContext['llm'] = dryRun
    ? null
    : env.anthropicKey
      ? 'claude'
      : env.geminiKey
        ? 'gemini'
        : null;
  const useTts = !dryRun && existsSync(env.kokoroPython);

  if (llm === 'claude') {
    log.info('Stage 03 writes with Claude (ANTHROPIC_API_KEY).');
  } else if (llm === 'gemini') {
    log.info(`Stage 03 writes with Gemini: ${env.geminiModels.join(', then ')} (GEMINI_API_KEY).`);
  } else if (!dryRun) {
    log.warn('Neither ANTHROPIC_API_KEY nor GEMINI_API_KEY is set: stage 03 will be skipped.');
  }
  if (!dryRun && !useTts) {
    log.warn(`No Kokoro env at ${env.kokoroPython}: stage 04 will be skipped. See README > Audio.`);
  }

  const http = new CachedFetcher({ cacheDir: paths.cacheDir, logger: log });

  return {
    flags,
    env,
    dryRun,
    llm,
    useTts,
    limit: flags.limit,
    paths,
    store,
    http,
    log,
    metrics: new Metrics(),
  };
}
