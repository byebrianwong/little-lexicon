// Stage 04 (task 1.4): audio generation.
//
// Synthesize an MP3 for every headword and every example sentence and save it
// under out/audio at deterministic paths (words/<id>.mp3, sentences/<id>.mp3).
// The clips are not uploaded and no audio_url is set yet: the app bundles the
// words file, and the audio (hundreds of MB at full size) needs a file host,
// which has not been chosen. Until then the app speaks words on the device.
//
// Live mode prefers a free human headword pronunciation from the Free
// Dictionary API when one is available as MP3, and uses Google Cloud TTS
// otherwise and for all sentence audio. Dry-run records stub objects with
// estimated sizes. A live run without GOOGLE_TTS_API_KEY skips this stage.

import type { RunContext } from '../config.ts';
import type { AudioBody } from '../lib/types.ts';
import { estimateAudioBytes } from '../lib/stubs.ts';

const MB = 1024 * 1024;
const TTS_USD_PER_MILLION_CHARS = 16; // Google Neural2 list price past the free tier

interface FdPhonetic {
  audio?: string;
}
interface FdEntry {
  phonetics?: FdPhonetic[];
}

async function googleTts(ctx: RunContext, text: string): Promise<Uint8Array> {
  const url = `https://texttospeech.googleapis.com/v1/text:synthesize?key=${ctx.env.googleTtsKey!}`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      input: { text },
      voice: { languageCode: ctx.env.googleTtsLanguage, name: ctx.env.googleTtsVoice },
      audioConfig: { audioEncoding: 'MP3' },
    }),
  });
  if (!res.ok) {
    throw new Error(`Google TTS ${res.status}: ${await res.text()}`);
  }
  const json = (await res.json()) as { audioContent?: string };
  if (!json.audioContent) throw new Error('Google TTS returned no audioContent');
  return new Uint8Array(Buffer.from(json.audioContent, 'base64'));
}

/** Try for a free human MP3 pronunciation of the headword (live mode only). */
async function humanHeadwordMp3(ctx: RunContext, word: string): Promise<Uint8Array | null> {
  const url = `https://api.dictionaryapi.dev/api/v2/entries/en/${encodeURIComponent(word)}`;
  const { status, data } = await ctx.http.getJson<FdEntry[]>(url);
  if (status !== 200 || !Array.isArray(data)) return null;
  for (const entry of data) {
    for (const p of entry.phonetics ?? []) {
      if (p.audio && p.audio.endsWith('.mp3')) {
        const res = await fetch(p.audio);
        if (res.ok) return new Uint8Array(await res.arrayBuffer());
      }
    }
  }
  return null;
}

function account(ctx: RunContext, bytes: number): void {
  ctx.metrics.audioBytes += bytes;
  ctx.metrics.audioClips += 1;
}

/** Produce an AudioBody for text: stub in dry-run, real TTS bytes in live mode. */
async function synthesizeTts(ctx: RunContext, text: string): Promise<AudioBody> {
  if (!ctx.useTts) {
    return { kind: 'stub', estimatedBytes: estimateAudioBytes(text.length) };
  }
  const data = await googleTts(ctx, text);
  return { kind: 'bytes', data, contentType: 'audio/mpeg' };
}

async function audioWords(ctx: RunContext): Promise<void> {
  const allWords = await ctx.store.listWords();
  const words = ctx.limit ? allWords.slice(0, ctx.limit) : allWords;

  for (const word of words) {
    const path = `words/${word.id}.mp3`;
    if (await ctx.store.hasAudio(path)) continue; // idempotent: never re-synthesize

    let body: AudioBody | null = null;
    if (ctx.useTts) {
      const human = await humanHeadwordMp3(ctx, word.headword);
      if (human) {
        body = { kind: 'bytes', data: human, contentType: 'audio/mpeg' };
        ctx.metrics.audioReusedHuman += 1;
      }
    }
    if (!body) {
      body = await synthesizeTts(ctx, word.headword);
      ctx.metrics.ttsChars += word.headword.length;
      ctx.metrics.audioWordsSynthed += 1;
    }

    const { bytes } = await ctx.store.saveAudio(path, body);
    account(ctx, bytes);
  }
}

async function audioSentences(ctx: RunContext): Promise<void> {
  const allWords = await ctx.store.listWords();
  const words = ctx.limit ? allWords.slice(0, ctx.limit) : allWords;

  for (const word of words) {
    const senses = await ctx.store.listSensesForWord(word.id);
    for (const sense of senses) {
      const examples = await ctx.store.listExamplesForSense(sense.id);
      for (const ex of examples) {
        const path = `sentences/${ex.id}.mp3`;
        if (await ctx.store.hasAudio(path)) continue; // idempotent
        const body = await synthesizeTts(ctx, ex.text);
        ctx.metrics.ttsChars += ex.text.length;
        ctx.metrics.audioSentencesSynthed += 1;
        const { bytes } = await ctx.store.saveAudio(path, body);
        account(ctx, bytes);
      }
    }
  }
}

export async function audio(ctx: RunContext): Promise<void> {
  ctx.log.stage('04 audio generation');
  if (!ctx.dryRun && !ctx.useTts) {
    ctx.log.warn('Audio: skipped. GOOGLE_TTS_API_KEY is not set in pipeline/.env.');
    return;
  }
  ctx.log.info(
    `Audio so far: ${((await ctx.store.totalAudioBytes()) / MB).toFixed(2)} MB. ` +
      `Provider: ${ctx.useTts ? 'Google Cloud TTS (Neural2)' : 'dry-run stub'}.`,
  );

  await audioWords(ctx);
  await audioSentences(ctx);

  ctx.metrics.ttsCostUsd = (ctx.metrics.ttsChars / 1e6) * TTS_USD_PER_MILLION_CHARS;
  await ctx.store.flush();

  const total = await ctx.store.totalAudioBytes();
  const average = ctx.metrics.audioClips ? ctx.metrics.audioBytes / ctx.metrics.audioClips : 0;
  ctx.log.success(
    `Audio: +${ctx.metrics.audioWordsSynthed} word clips, +${ctx.metrics.audioSentencesSynthed} sentence clips, ` +
      `${ctx.metrics.audioReusedHuman} human reused. ${ctx.metrics.ttsChars} chars, ` +
      `est. TTS cost $${ctx.metrics.ttsCostUsd.toFixed(4)}. ` +
      `This run ${(average / 1024).toFixed(1)} KB per clip; all audio ${(total / MB).toFixed(2)} MB.`,
  );
}
