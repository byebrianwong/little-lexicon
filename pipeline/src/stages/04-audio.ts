// Stage 04 (task 1.4): audio generation.
//
// Make an MP3 for every headword, example sentence and definition of the
// words still taught, and save it under public/audio at deterministic paths
// (words/<id>.mp3, sentences/<id>.mp3, definitions/<sense id>.mp3). The web
// export copies public/audio to the site, and stage 05 gives each word,
// sentence and definition the URL of its clip.
//
// Headwords use a US human recording from the Free Dictionary API when there
// is one, and text to speech otherwise. Sentences and definitions always use
// text to speech. A definition clip reads the definition the app shows: the
// plain one when the sense has it.
// The voice is Kokoro (an open model, run on this computer by
// tools/kokoro-tts.py), and the word's IPA pins how it says the headword, so
// the clip matches the pronunciation the app shows.
//
// Each clip records a key made from its text, IPA and voice. A clip is made
// again when its key changes (a rewritten sentence or definition, a fixed IPA,
// a new voice), and clips for removed words, sentences or senses are deleted. Dry-run records stub
// objects with estimated sizes. A live run without the Kokoro env skips this
// stage.

import { spawn } from 'node:child_process';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { RunContext } from '../config.ts';
import type { WordRow } from '../lib/types.ts';
import { estimateAudioBytes } from '../lib/stubs.ts';
import {
  definitionClipKey,
  humanClipKey,
  ipaToKokoro,
  kokoroText,
  pickUsRecording,
  sentenceClipKey,
  spokenDefinition,
  TTS_KBPS,
  ttsVoiceLabel,
  wordClipKey,
  type FdEntry,
} from '../lib/audio.ts';

const MB = 1024 * 1024;

/** One clip for Kokoro to make. */
interface TtsJob {
  /** Where the clip goes under public/audio. */
  path: string;
  kind: 'word' | 'sentence' | 'definition';
  /** The plain text, as the app shows it. */
  text: string;
  /** The text with the headword's pronunciation pinned, as Kokoro reads it. */
  kokoroText: string;
  key: string;
}

interface HumanClip {
  data: Uint8Array;
  sourceUrl: string | null;
  license: string | null;
}

/**
 * A US human MP3 of the headword (live mode only), or null when the Free
 * Dictionary has none. Throws when the service itself fails.
 */
async function humanHeadwordMp3(ctx: RunContext, word: string): Promise<HumanClip | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const { status, data } = await ctx.http.getJson<FdEntry[]>(url);
  if (status >= 500) throw new Error(`HTTP ${status}`);
  if (status !== 200) return null;
  const recording = pickUsRecording(data);
  if (!recording) return null;
  const res = await fetch(recording.url);
  if (!res.ok) {
    ctx.log.warn(`Audio: could not download ${recording.url} (${res.status}); using TTS for "${word}".`);
    return null;
  }
  return {
    data: new Uint8Array(await res.arrayBuffer()),
    sourceUrl: recording.sourceUrl ?? recording.url,
    license: recording.license,
  };
}

function account(ctx: RunContext, bytes: number): void {
  ctx.metrics.audioBytes += bytes;
  ctx.metrics.audioClips += 1;
}

/** True when the clip at `path` exists and was made from the same inputs. */
async function isCurrent(ctx: RunContext, path: string, key: string): Promise<boolean> {
  const existing = await ctx.store.getAudio(path);
  if (!existing) return false;
  // A stub never stands in for a real clip once live TTS is available.
  if (existing.source === 'stub' && ctx.useTts) return false;
  return existing.key === key;
}

type Pin = { headword: string; phonemes: string } | null;

/** Each word's IPA in Kokoro's letters, to pin how the voice says it. */
function pinsFor(ctx: RunContext, words: WordRow[]): Map<number, Pin> {
  const pins = new Map<number, Pin>();
  for (const word of words) {
    const phonemes = ipaToKokoro(word.ipa);
    if (!phonemes && ctx.useTts) {
      ctx.log.warn(`Audio: IPA ${word.ipa ?? '(none)'} of "${word.headword}" has no Kokoro spelling; the voice guesses.`);
    }
    pins.set(word.id, phonemes ? { headword: word.headword, phonemes } : null);
  }
  return pins;
}

async function audioWords(
  ctx: RunContext,
  words: WordRow[],
  pins: Map<number, Pin>,
  wanted: Set<string>,
  jobs: TtsJob[],
): Promise<void> {
  const voice = ttsVoiceLabel(ctx.env.ttsVoice);
  // Lookups that failed, with the first error, reported once after the loop.
  let lookupErrors = 0;
  let firstError = '';
  for (const word of words) {
    const path = `words/${word.id}.mp3`;
    wanted.add(path);
    // A human recording depends on the headword only; a TTS clip also on the
    // IPA and the voice. Either key keeps a clip that still matches.
    const humanKey = humanClipKey(word);
    const ttsKey = wordClipKey(word, voice);
    if ((await isCurrent(ctx, path, humanKey)) || (await isCurrent(ctx, path, ttsKey))) continue;

    if (ctx.useTts) {
      let human: HumanClip | null = null;
      try {
        human = await humanHeadwordMp3(ctx, word.headword);
      } catch (err) {
        lookupErrors += 1;
        firstError ||= `"${word.headword}": ${(err as Error).message}`;
      }
      if (human) {
        const { bytes } = await ctx.store.saveAudio(
          path,
          { kind: 'bytes', data: human.data, contentType: 'audio/mpeg' },
          { key: humanKey, source: 'human', sourceUrl: human.sourceUrl, license: human.license },
        );
        ctx.metrics.audioReusedHuman += 1;
        account(ctx, bytes);
        continue;
      }
    }
    jobs.push({
      path,
      kind: 'word',
      text: word.headword,
      kokoroText: kokoroText(word.headword, pins.get(word.id) ?? null),
      key: ttsKey,
    });
  }
  if (lookupErrors > 0) {
    ctx.log.warn(
      `Audio: the Free Dictionary lookup failed for ${lookupErrors} headwords (first, ${firstError}); ` +
        'they use TTS. A later run keeps those TTS clips while they match, so delete a clip to try again.',
    );
  }
}

async function audioSentences(
  ctx: RunContext,
  words: WordRow[],
  pins: Map<number, Pin>,
  wanted: Set<string>,
  jobs: TtsJob[],
): Promise<void> {
  const voice = ttsVoiceLabel(ctx.env.ttsVoice);
  for (const word of words) {
    const pin = pins.get(word.id) ?? null;
    const senses = await ctx.store.listSensesForWord(word.id);
    for (const sense of senses) {
      const examples = await ctx.store.listExamplesForSense(sense.id);
      for (const ex of examples) {
        const path = `sentences/${ex.id}.mp3`;
        wanted.add(path);
        const key = sentenceClipKey(ex.text, word, voice);
        if (await isCurrent(ctx, path, key)) continue;
        jobs.push({ path, kind: 'sentence', text: ex.text, kokoroText: kokoroText(ex.text, pin), key });
      }
    }
  }
}

async function audioDefinitions(
  ctx: RunContext,
  words: WordRow[],
  pins: Map<number, Pin>,
  wanted: Set<string>,
  jobs: TtsJob[],
): Promise<void> {
  const voice = ttsVoiceLabel(ctx.env.ttsVoice);
  for (const word of words) {
    const pin = pins.get(word.id) ?? null;
    for (const sense of await ctx.store.listSensesForWord(word.id)) {
      const path = `definitions/${sense.id}.mp3`;
      wanted.add(path);
      const text = spokenDefinition(sense.plain_language_definition, sense.definition);
      const key = definitionClipKey(text, word, voice);
      if (await isCurrent(ctx, path, key)) continue;
      jobs.push({ path, kind: 'definition', text, kokoroText: kokoroText(text, pin), key });
    }
  }
}

/** Run tools/kokoro-tts.py on a jobs file; it writes one MP3 per job. */
function runKokoro(ctx: RunContext, jobsFile: string): Promise<void> {
  const script = join(ctx.paths.root, 'tools', 'kokoro-tts.py');
  const args = [script, '--voice', ctx.env.ttsVoice, '--kbps', String(TTS_KBPS), jobsFile];
  return new Promise((resolve, reject) => {
    const child = spawn(ctx.env.kokoroPython, args, { stdio: ['ignore', 'inherit', 'inherit'] });
    child.on('error', (err) => reject(new Error(`Could not start ${ctx.env.kokoroPython}: ${err.message}`)));
    child.on('exit', (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`kokoro-tts.py stopped (${signal ?? `exit code ${code}`}). Clips made so far are kept; run again to continue.`));
    });
  });
}

/** Make every queued clip: stubs in dry-run, Kokoro MP3s in live mode. */
async function synthesize(ctx: RunContext, jobs: TtsJob[]): Promise<void> {
  const record = (job: TtsJob, bytes: number) => {
    ctx.metrics.ttsChars += job.text.length;
    if (job.kind === 'word') ctx.metrics.audioWordsSynthed += 1;
    else if (job.kind === 'sentence') ctx.metrics.audioSentencesSynthed += 1;
    else ctx.metrics.audioDefinitionsSynthed += 1;
    account(ctx, bytes);
  };
  if (!ctx.useTts) {
    for (const job of jobs) {
      const { bytes } = await ctx.store.saveAudio(
        job.path,
        { kind: 'stub', estimatedBytes: estimateAudioBytes(job.text.length) },
        { key: job.key, source: 'stub' },
      );
      record(job, bytes);
    }
    return;
  }
  if (jobs.length === 0) return;

  // Kokoro writes each clip to the cache under its key, so a run that stops
  // partway reuses what it made. The clips move into the store afterwards.
  const dir = join(ctx.paths.cacheDir, 'tts');
  await mkdir(dir, { recursive: true });
  const cached = (job: TtsJob) => join(dir, `${job.key}.mp3`);
  const jobsFile = join(dir, 'jobs.json');
  await writeFile(
    jobsFile,
    JSON.stringify(jobs.map((job) => ({ text: job.kokoroText, out: cached(job) }))),
    'utf8',
  );
  ctx.log.info(`Audio: Kokoro is making ${jobs.length} clips with voice ${ctx.env.ttsVoice}.`);
  await runKokoro(ctx, jobsFile);

  const voice = ttsVoiceLabel(ctx.env.ttsVoice);
  for (const job of jobs) {
    const data = new Uint8Array(await readFile(cached(job)));
    const { bytes } = await ctx.store.saveAudio(
      job.path,
      { kind: 'bytes', data, contentType: 'audio/mpeg' },
      { key: job.key, source: 'tts', voice },
    );
    record(job, bytes);
  }
  await ctx.store.flush();
  await rm(dir, { recursive: true, force: true });
}

/** Delete clips whose word, sentence or sense is gone or retired. */
async function pruneAudio(ctx: RunContext, wanted: Set<string>): Promise<number> {
  let removed = 0;
  for (const clip of await ctx.store.listAudio()) {
    if (wanted.has(clip.path)) continue;
    await ctx.store.removeAudio(clip.path);
    removed += 1;
  }
  return removed;
}

export async function audio(ctx: RunContext): Promise<void> {
  ctx.log.stage('04 audio generation');
  if (!ctx.dryRun && !ctx.useTts) {
    ctx.log.warn(`Audio: skipped. No Kokoro env at ${ctx.env.kokoroPython} (README > Audio).`);
    return;
  }
  ctx.log.info(
    `Audio so far: ${((await ctx.store.totalAudioBytes()) / MB).toFixed(2)} MB. ` +
      `Voice: ${ctx.useTts ? ttsVoiceLabel(ctx.env.ttsVoice) : 'dry-run stub'}.`,
  );

  const taught = (await ctx.store.listWords()).filter((w) => !w.retired);
  const words = ctx.limit ? taught.slice(0, ctx.limit) : taught;
  const wanted = new Set<string>();
  const jobs: TtsJob[] = [];

  const pins = pinsFor(ctx, words);
  await audioWords(ctx, words, pins, wanted, jobs);
  await audioSentences(ctx, words, pins, wanted, jobs);
  await audioDefinitions(ctx, words, pins, wanted, jobs);
  await synthesize(ctx, jobs);
  // With --limit only some words were visited, so nothing else can be judged unused.
  const pruned = ctx.limit ? 0 : await pruneAudio(ctx, wanted);
  await ctx.store.flush();

  const total = await ctx.store.totalAudioBytes();
  const average = ctx.metrics.audioClips ? ctx.metrics.audioBytes / ctx.metrics.audioClips : 0;
  ctx.log.success(
    `Audio: +${ctx.metrics.audioWordsSynthed} word clips, +${ctx.metrics.audioSentencesSynthed} sentence clips, ` +
      `+${ctx.metrics.audioDefinitionsSynthed} definition clips, ` +
      `${ctx.metrics.audioReusedHuman} human recordings, ${pruned} removed, ${ctx.metrics.ttsChars} chars. ` +
      `This run ${(average / 1024).toFixed(1)} KB per clip; all audio ${(total / MB).toFixed(2)} MB.`,
  );
}
