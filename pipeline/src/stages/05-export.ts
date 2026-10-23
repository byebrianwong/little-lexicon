// Stage 05: export the words file the app bundles.
//
// Reads the whole record (not just --limit words), builds
// src/content/words.json (out/words.dry-run.json in dry-run), and refuses to
// write it if any word's id would change compared with the file already there,
// because saved progress points at word ids. Reports the file size, since the
// file ships inside the app.
//
// Also writes src/content/audioClips.ts, which requires every clip from stage
// 04 that belongs to an exported word or sentence, so the app bundles them.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, relative, sep } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { RunContext } from '../config.ts';
import { buildWordsFile, checkIdStability, type WordsFile } from '../lib/exportContent.ts';
import { OEWN_ATTRIBUTION } from '../lib/wordnet.ts';
import { buildClipModule, clipMatches, HUMAN_AUDIO_ATTRIBUTION, type ClipEntry } from '../lib/audio.ts';

interface ClipModule {
  source: string;
  words: number;
  sentences: number;
  bytes: number;
  human: boolean;
  /** Clips left out because their text or IPA changed after they were made. */
  stale: number;
}

/**
 * The clip module for the exported words: only clips whose file is on disk
 * and that were made from the current text and IPA, so the app never plays a
 * clip that says something else. A word or sentence without one falls back to
 * the device's speech until stage 04 runs again.
 */
async function clipModule(ctx: RunContext, file: WordsFile): Promise<ClipModule> {
  const clips = new Map((await ctx.store.listAudio()).map((c) => [c.path, c]));
  const moduleDir = dirname(ctx.paths.clipModuleFile);
  let bytes = 0;
  let human = false;
  let stale = 0;
  const entry = (
    id: number,
    path: string,
    word: { headword: string; ipa: string | null },
    sentence: string | null,
  ): ClipEntry | null => {
    const clip = clips.get(path);
    const abs = ctx.store.audioFile(path);
    if (!clip || clip.source === 'stub' || !existsSync(abs)) return null;
    if (!clipMatches(clip, word, sentence)) {
      stale += 1;
      return null;
    }
    bytes += clip.bytes;
    if (clip.source === 'human') human = true;
    const rel = relative(moduleDir, abs).split(sep).join('/');
    return { id, requirePath: rel.startsWith('.') ? rel : `./${rel}` };
  };
  const words: ClipEntry[] = [];
  const sentences: ClipEntry[] = [];
  for (const w of file.words) {
    const clip = entry(w.wordId, `words/${w.wordId}.mp3`, w, null);
    if (clip) words.push(clip);
    for (const s of w.senses) {
      for (const ex of s.examples) {
        const sentence = entry(ex.exampleId, `sentences/${ex.exampleId}.mp3`, w, ex.text);
        if (sentence) sentences.push(sentence);
      }
    }
  }
  return {
    source: buildClipModule(words, sentences),
    words: words.length,
    sentences: sentences.length,
    bytes,
    human,
    stale,
  };
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
  const clips = await clipModule(ctx, file);
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
  await mkdir(dirname(ctx.paths.clipModuleFile), { recursive: true });
  await writeFile(ctx.paths.clipModuleFile, clips.source, 'utf8');

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
    `Export: bundled audio for ${clips.words} of ${file.words.length} words and ` +
      `${clips.sentences} sentences, ${(clips.bytes / (1024 * 1024)).toFixed(2)} MB, ` +
      `listed in ${ctx.paths.clipModuleFile}.`,
  );
  if (clips.stale > 0) {
    ctx.log.warn(
      `Export: left out ${clips.stale} clips whose text or IPA changed after they were made. ` +
        'Run `npx tsx src/run.ts --only=audio`, then `--only=export`, to remake them.',
    );
  }
}
