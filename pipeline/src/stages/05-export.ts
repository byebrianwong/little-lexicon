// Stage 05: export the words file the app bundles.
//
// Reads the whole record (not just --limit words), builds
// src/content/words.json (out/words.dry-run.json in dry-run), and refuses to
// write it if any word's id would change compared with the file already there,
// because saved progress points at word ids. Reports the file size, since the
// file ships inside the app.

import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { gzipSync } from 'node:zlib';
import type { RunContext } from '../config.ts';
import { buildWordsFile, checkIdStability, type WordsFile } from '../lib/exportContent.ts';
import { OEWN_ATTRIBUTION } from '../lib/wordnet.ts';

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
}
