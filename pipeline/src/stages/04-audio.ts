// Stage 04 (task 1.4): audio generation and upload.
//
// Synthesize an MP3 for every headword and every example sentence, upload to the
// little-lexicon-audio bucket at deterministic paths (words/<id>.mp3, sentences/<id>.mp3),
// and write the public URL back to words.audio_url / example_sentences.audio_url.
// Live mode prefers a free human headword pronunciation from the Free Dictionary
// API when one is available as MP3, and uses Google Cloud TTS otherwise and for
// all sentence audio. Dry-run records deterministic stub objects with estimated
// sizes. Tracks characters synthesized, provider cost estimate, and bucket size,
// and flags if the bucket approaches the ~1 GB shared free-tier limit.

import type { RunContext } from '../config.ts';
import type { AudioBody } from '../lib/types.ts';
import { estimateAudioBytes } from '../lib/stubs.ts';

const GB = 1024 * 1024 * 1024;
const BUCKET_WARN_BYTES = 0.9 * GB; // flag when nearing the shared 1 GB free tier
const TTS_USD_PER_MILLION_CHARS = 16; // Google Neural2 list price past the free tier

interface FdPhonetic {
  audio?: string;
}
interface FdEntry {
  phonetics?: FdPhonetic[];
}

let bucketFlagged = false;

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

function accountBucket(ctx: RunContext, bytes: number): void {
  ctx.metrics.audioBytes += bytes;
  ctx.metrics.bucketBytes += bytes;
  if (!bucketFlagged && ctx.metrics.bucketBytes >= BUCKET_WARN_BYTES) {
    bucketFlagged = true;
    ctx.log.warn(
      `little-lexicon-audio bucket is at ${(ctx.metrics.bucketBytes / GB).toFixed(2)} GB, nearing the ~1 GB ` +
        `shared free-tier limit. Propose a dedicated bucket or external object store before continuing.`,
    );
  }
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
    if (word.audio_url) continue; // idempotent: already has audio
    const path = `words/${word.id}.mp3`;

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

    const { publicUrl, bytes } = await ctx.store.uploadAudio(path, body);
    await ctx.store.setWordAudio(word.id, publicUrl);
    accountBucket(ctx, bytes);
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
        if (ex.audio_url) continue; // idempotent
        const path = `sentences/${ex.id}.mp3`;
        const body = await synthesizeTts(ctx, ex.text);
        ctx.metrics.ttsChars += ex.text.length;
        ctx.metrics.audioSentencesSynthed += 1;
        const { publicUrl, bytes } = await ctx.store.uploadAudio(path, body);
        await ctx.store.setExampleAudio(ex.id, publicUrl);
        accountBucket(ctx, bytes);
      }
    }
  }
}

export async function audio(ctx: RunContext): Promise<void> {
  ctx.log.stage('04 audio generation and upload');
  ctx.metrics.bucketBytes = await ctx.store.totalBucketBytes();
  ctx.log.info(
    `Bucket starts at ${(ctx.metrics.bucketBytes / (1024 * 1024)).toFixed(2)} MB. ` +
      `Provider: ${ctx.useTts ? 'Google Cloud TTS (Neural2)' : 'dry-run stub'}.`,
  );

  await audioWords(ctx);
  await audioSentences(ctx);

  ctx.metrics.ttsCostUsd = (ctx.metrics.ttsChars / 1e6) * TTS_USD_PER_MILLION_CHARS;
  await ctx.store.flush();

  ctx.log.success(
    `Audio: +${ctx.metrics.audioWordsSynthed} word clips, +${ctx.metrics.audioSentencesSynthed} sentence clips, ` +
      `${ctx.metrics.audioReusedHuman} human reused. ${ctx.metrics.ttsChars} chars, ` +
      `est. TTS cost $${ctx.metrics.ttsCostUsd.toFixed(4)}, bucket ${(ctx.metrics.bucketBytes / (1024 * 1024)).toFixed(2)} MB.`,
  );
}
