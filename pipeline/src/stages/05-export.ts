// Stage 05: export the words file the app bundles.
//
// Reads the whole record (not just --limit words), builds
// src/content/words.json (out/words.dry-run.json in dry-run), and refuses to
// write it if any word's id would change compared with the file already there,
// because saved progress points at word ids. Reports the file size, since the
// file ships inside the app.
//
// Also gives each exported word and sentence the audioUrl of its clip from
// stage 04 (public/audio, which the web export copies to the site).

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { RunContext } from '../config.ts';
import { buildWordsFile, checkIdStability, type WordsFile } from '../lib/exportContent.ts';
import { OEWN_ATTRIBUTION } from '../lib/wordnet.ts';
import { clipMatches, clipUrl, HUMAN_AUDIO_ATTRIBUTION } from '../lib/audio.ts';

interface ClipUrls {
  words: number;
  sentences: number;
  bytes: number;
  human: boolean;
  /** Clips left out because their text or IPA changed after they were made. */
  stale: number;
}

/**
 * Give each exported word and sentence the audioUrl of its clip. Only clips
 * whose file is on disk and that were made from the current text and IPA get
 * one, so the app never plays a clip that says something else. A word or
 * sentence without one is spoken with the device's voice until stage 04 runs
 * again.
 */
async function attachClipUrls(ctx: RunContext, file: WordsFile): Promise<ClipUrls> {
  const clips = new Map((await ctx.store.listAudio()).map((c) => [c.path, c]));
  const counts: ClipUrls = { words: 0, sentences: 0, bytes: 0, human: false, stale: 0 };
  const urlFor = async (
    path: string,
    word: { headword: string; ipa: string | null },
    sentence: string | null,
  ): Promise<string | null> => {
    const clip = clips.get(path);
    const abs = ctx.store.audioFile(path);
    if (!clip || clip.source === 'stub' || !existsSync(abs)) return null;
    if (!clipMatches(clip, word, sentence)) {
      counts.stale += 1;
      return null;
    }
    counts.bytes += clip.bytes;
    if (clip.source === 'human') counts.human = true;
    return clipUrl(path, new Uint8Array(await readFile(abs)));
  };
  for (const w of file.words) {
    const url = await urlFor(`words/${w.wordId}.mp3`, w, null);
    if (url) counts.words += 1;
    w.audioUrl = url ?? w.audioUrl;
    for (const s of w.senses) {
      for (const ex of s.examples) {
        const sentenceUrl = await urlFor(`sentences/${ex.exampleId}.mp3`, w, ex.text);
        if (sentenceUrl) counts.sentences += 1;
        ex.audioUrl = sentenceUrl ?? ex.audioUrl;
      }
    }
  }
  return counts;
}

async function readPrevious(path: string): Promise<WordsFile | null> {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(await readFile(path, 'utf8')) as WordsFile;
  } catch (err) {
    throw new Error(`Could not parse the existing ${path}: ${(err as Error).message}`);
  }
}

export async function exportWords(ctx: RunContext): Promise<void> {
  ctx.log.stage('05 export words file');
  const rows = await ctx.store.snapshot();
  const { file, heldBack } = buildWordsFile(rows, [OEWN_ATTRIBUTION]);
  const clips = await attachClipUrls(ctx, file);
  if (clips.human) file.attribution.push(HUMAN_AUDIO_ATTRIBUTION);

  const previous = await readPrevious(ctx.paths.exportFile);
  if (previous) {
    const { problems, removed } = checkIdStability(previous.words, file.words);
    if (problems.length > 0) {
      throw new Error(
        `Export stopped: word ids would change, which would attach saved progress to the ` +
          `wrong words. ${problems.slice(0, 10).join('; ')}` +
          (problems.length > 10 ? `; and ${problems.length - 10} more` : ''),
      );
    }
    if (removed.length > 0) {
      ctx.log.warn(
        `${removed.length} words are no longer exported (their ids stay retired): ` +
          removed.slice(0, 10).join(', '),
      );
    }
  }
  if (heldBack.length > 0) {
    ctx.log.warn(
      `${heldBack.length} words held back: ` +
        heldBack.slice(0, 10).map((h) => `${h.headword} (${h.reason})`).join(', '),
    );
  }

  const json = JSON.stringify(file, null, 2) + '\n';
  await mkdir(dirname(ctx.paths.exportFile), { recursive: true });
  await writeFile(ctx.paths.exportFile, json, 'utf8');

  const m = ctx.metrics;
  m.wordsExported = file.words.length;
  m.wordsHeldBack = heldBack.length;
  m.exportBytes = Buffer.byteLength(json);
  m.exportGzipBytes = gzipSync(JSON.stringify(file), { level: 9 }).length;
  const perWord = file.words.length ? m.exportBytes / file.words.length : 0;
  ctx.log.success(
    `Export: ${file.words.length} words to ${ctx.paths.exportFile}. ` +
      `${(m.exportBytes / 1024).toFixed(0)} KB as written, ` +
      `${(m.exportGzipBytes / 1024).toFixed(0)} KB compressed, ` +
      `${(perWord / 1024).toFixed(2)} KB per word.`,
  );
  ctx.log.success(
    `Export: clips for ${clips.words} of ${file.words.length} words and ` +
      `${clips.sentences} sentences, ${(clips.bytes / (1024 * 1024)).toFixed(2)} MB in ${ctx.paths.audioDir}.`,
  );
  if (clips.stale > 0) {
    ctx.log.warn(
      `Export: left out ${clips.stale} clips whose text or IPA changed after they were made. ` +
        'Run `npx tsx src/run.ts --only=audio`, then `--only=export`, to remake them.',
    );
  }
}
