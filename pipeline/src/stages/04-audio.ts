// Stage 04 (task 1.4): audio generation.
//
// Make an MP3 for every headword and every example sentence of the words still
// taught, and save it under assets/audio at deterministic paths
// (words/<id>.mp3, sentences/<id>.mp3). The app bundles these files: stage 05
// writes src/content/audioClips.ts, which requires each one.
//
// Headwords use a US human recording from the Free Dictionary API when there
// is one, and Google Cloud TTS otherwise. Sentences always use TTS. The
// default voice is Chirp 3 HD, and the word's IPA is passed as a custom
// pronunciation so the voice says the word the way the app writes it.
//
// Each clip records a key made from its text, IPA and voice. A clip is made
// again when its key changes (a rewritten sentence, a fixed IPA, a new voice),
// and clips for removed words or sentences are deleted. Dry-run records stub
// objects with estimated sizes. A live run without GOOGLE_TTS_API_KEY skips
// this stage.

import type { RunContext } from '../config.ts';
import type { AudioBody, AudioMeta, WordRow } from '../lib/types.ts';
import { estimateAudioBytes } from '../lib/stubs.ts';
import {
  buildTtsRequest,
  clipKey,
  ipaForTts,
  pickUsRecording,
  type FdEntry,
} from '../lib/audio.ts';

const MB = 1024 * 1024;
const TTS_USD_PER_MILLION_CHARS = 30; // Google Chirp 3 HD list price past the 1M free characters

async function googleTts(ctx: RunContext, body: Record<string, unknown>): Promise<Uint8Array> {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ctx.env.googleTtsKey!}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    throw new Error(`Google TTS ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error('Google TTS returned no audioContent');
  return new Uint8Array(Buffer.from(json.audioContent, 'base64'));
}

interface HumanClip {
  data: Uint8Array;
  sourceUrl: string | null;
  license: string | null;
}

/** A US human MP3 of the headword (live mode only), or null. */
async function humanHeadwordMp3(ctx: RunContext, word: string): Promise<HumanClip | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const { status, data } = await ctx.http.getJson<FdEntry[]>(url);
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

/** TTS for one text: stub in dry-run, real bytes in live mode. */
async function synthesizeTts(
  ctx: RunContext,
  text: string,
  word: WordRow,
): Promise<AudioBody> {
  if (!ctx.useTts) {
    return { kind: 'stub', estimatedBytes: estimateAudioBytes(text.length) };
  }
  const ipa = ipaForTts(word.ipa);
  const body = buildTtsRequest({
    text,
    voice: ctx.env.googleTtsVoice,
    language: ctx.env.googleTtsLanguage,
    pin: ipa ? { headword: word.headword, ipa } : null,
  });
  const data = await googleTts(ctx, body);
  return { kind: 'bytes', data, contentType: 'audio/mpeg' };
}

function ttsMeta(ctx: RunContext, key: string): AudioMeta {
  return ctx.useTts ? { key, source: 'tts', voice: ctx.env.googleTtsVoice } : { key, source: 'stub' };
}

/** True when the clip at `path` exists and was made from the same inputs. */
async function isCurrent(ctx: RunContext, path: string, key: string): Promise<boolean> {
  const existing = await ctx.store.getAudio(path);
  if (!existing) return false;
  // A stub never stands in for a real clip once live TTS is available.
  if (existing.source === 'stub' && ctx.useTts) return false;
  return existing.key === key;
}

async function audioWords(ctx: RunContext, words: WordRow[], wanted: Set<string>): Promise<void> {
  for (const word of words) {
    const path = `words/${word.id}.mp3`;
    wanted.add(path);
    // A human recording depends on the headword only; a TTS clip also on the
    // IPA and the voice. Either key keeps a clip that still matches.
    const humanKey = clipKey({ kind: 'human', headword: word.headword });
    const ttsKey = clipKey({
      kind: 'word',
      text: word.headword,
      ipa: word.ipa,
      voice: ctx.env.googleTtsVoice,
    });
    if ((await isCurrent(ctx, path, humanKey)) || (await isCurrent(ctx, path, ttsKey))) continue;

    if (ctx.useTts) {
      let human: HumanClip | null = null;
      try {
        human = await humanHeadwordMp3(ctx, word.headword);
      } catch (err) {
        ctx.log.warn(`Audio: Free Dictionary lookup failed for "${word.headword}" (${(err as Error).message}); using TTS.`);
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
    const body = await synthesizeTts(ctx, word.headword, word);
    ctx.metrics.ttsChars += word.headword.length;
    ctx.metrics.audioWordsSynthed += 1;
    const { bytes } = await ctx.store.saveAudio(path, body, ttsMeta(ctx, ttsKey));
    account(ctx, bytes);
  }
}

async function audioSentences(ctx: RunContext, words: WordRow[], wanted: Set<string>): Promise<void> {
  for (const word of words) {
    const senses = await ctx.store.listSensesForWord(word.id);
    for (const sense of senses) {
      const examples = await ctx.store.listExamplesForSense(sense.id);
      for (const ex of examples) {
        const path = `sentences/${ex.id}.mp3`;
        wanted.add(path);
        const key = clipKey({
          kind: 'sentence',
          text: ex.text,
          headword: word.headword,
          ipa: word.ipa,
          voice: ctx.env.googleTtsVoice,
        });
        if (await isCurrent(ctx, path, key)) continue;
        const body = await synthesizeTts(ctx, ex.text, word);
        ctx.metrics.ttsChars += ex.text.length;
        ctx.metrics.audioSentencesSynthed += 1;
        const { bytes } = await ctx.store.saveAudio(path, body, ttsMeta(ctx, key));
        account(ctx, bytes);
      }
    }
  }
}

/** Delete clips whose word or sentence is gone or retired. */
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
    ctx.log.warn('Audio: skipped. GOOGLE_TTS_API_KEY is not set in pipeline/.env.');
    return;
  }
  ctx.log.info(
    `Audio so far: ${((await ctx.store.totalAudioBytes()) / MB).toFixed(2)} MB. ` +
      `Provider: ${ctx.useTts ? `Google Cloud TTS (${ctx.env.googleTtsVoice})` : 'dry-run stub'}.`,
  );

  const taught = (await ctx.store.listWords()).filter((w) => !w.retired);
  const words = ctx.limit ? taught.slice(0, ctx.limit) : taught;
  const wanted = new Set<string>();

  await audioWords(ctx, words, wanted);
  await audioSentences(ctx, words, wanted);
  // With --limit only some words were visited, so nothing else can be judged unused.
  const pruned = ctx.limit ? 0 : await pruneAudio(ctx, wanted);

  ctx.metrics.ttsCostUsd = (ctx.metrics.ttsChars / 1e6) * TTS_USD_PER_MILLION_CHARS;
  await ctx.store.flush();

  const total = await ctx.store.totalAudioBytes();
  const average = ctx.metrics.audioClips ? ctx.metrics.audioBytes / ctx.metrics.audioClips : 0;
  ctx.log.success(
    `Audio: +${ctx.metrics.audioWordsSynthed} word clips, +${ctx.metrics.audioSentencesSynthed} sentence clips, ` +
      `${ctx.metrics.audioReusedHuman} human recordings, ${pruned} removed. ${ctx.metrics.ttsChars} chars, ` +
      `est. TTS cost $${ctx.metrics.ttsCostUsd.toFixed(4)} before the free tier. ` +
      `This run ${(average / 1024).toFixed(1)} KB per clip; all audio ${(total / MB).toFixed(2)} MB.`,
  );
}
