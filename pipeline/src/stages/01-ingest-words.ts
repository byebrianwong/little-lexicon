// Stage 01 (task 1.1): ingest and curate the word list.
//
// Load the seed list, dedupe, lowercase-normalize, drop proper-noun candidates
// and multi-word entries, assign a difficulty_tier (1..5), and insert into
// little_lexicon.words. Live mode reads frequency from Datamuse (md=f); dry-run uses a
// deterministic heuristic. Idempotent: existing headwords are skipped.

import { readFile } from 'node:fs/promises';
import type { RunContext } from '../config.ts';
import {
  estimateSyllables,
  heuristicTier,
  rankFromFrequency,
  tierFromFrequency,
} from '../lib/difficulty.ts';

interface CleanSeed {
  words: string[];
  dropped: number;
  droppedExamples: string[];
}

/**
 * Parse and clean the seed file.
 * - Skip comments (#) and blank lines.
 * - Drop multi-word entries (contain whitespace).
 * - Drop non-alphabetic tokens (keep simple single lemmas).
 * - Drop proper-noun candidates: a Title/UPPER-case token whose lowercase form
 *   does not also appear as a lowercase entry elsewhere in the list.
 * - Lowercase-normalize and dedupe.
 */
export async function loadSeedWords(seedFile: string): Promise<CleanSeed> {
  const text = await readFile(seedFile, 'utf8');
  const rawTokens: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    rawTokens.push(trimmed);
  }

  // Set of tokens that appear in the file already lowercase: the "confirmed
  // common word" set used to tell a duplicate case-variant from a proper noun.
  const lowercaseOriginals = new Set(
    rawTokens.filter((t) => t === t.toLowerCase()).map((t) => t),
  );

  const seen = new Set<string>();
  const words: string[] = [];
  const droppedExamples: string[] = [];
  let dropped = 0;

  for (const raw of rawTokens) {
    if (/\s/.test(raw)) {
      dropped += 1;
      if (droppedExamples.length < 8) droppedExamples.push(`${raw} (multi-word)`);
      continue;
    }
    const lower = raw.toLowerCase();
    if (!/^[a-z]+$/.test(lower)) {
      dropped += 1;
      if (droppedExamples.length < 8) droppedExamples.push(`${raw} (non-alphabetic)`);
      continue;
    }
    const startsUpper = raw[0] !== raw[0]!.toLowerCase();
    if (startsUpper && !lowercaseOriginals.has(lower)) {
      dropped += 1;
      if (droppedExamples.length < 8) droppedExamples.push(`${raw} (proper-noun candidate)`);
      continue;
    }
    if (seen.has(lower)) continue; // duplicate / case-variant
    seen.add(lower);
    words.push(lower);
  }

  return { words, dropped, droppedExamples };
}

interface WordMeta {
  tier: number;
  rank: number | null;
  syllables: number;
}

interface DatamuseHit {
  word: string;
  tags?: string[];
}

async function resolveWordMeta(ctx: RunContext, word: string): Promise<WordMeta> {
  const syllables = estimateSyllables(word);
  if (ctx.dryRun) {
    return { tier: heuristicTier(word), rank: null, syllables };
  }
  // Live: ask Datamuse for frequency (occurrences per million).
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=f&max=1`;
  try {
    const { data } = await ctx.http.getJson<DatamuseHit[]>(url);
    const hit = data?.[0];
    const freqTag = hit?.tags?.find((t) => t.startsWith('f:'));
    if (freqTag) {
      const freq = Number.parseFloat(freqTag.slice(2));
      if (Number.isFinite(freq)) {
        return { tier: tierFromFrequency(freq), rank: rankFromFrequency(freq), syllables };
      }
    }
  } catch (err) {
    ctx.log.warn(`Datamuse lookup failed for "${word}": ${(err as Error).message}`);
  }
  return { tier: heuristicTier(word), rank: null, syllables };
}

export async function ingestWords(ctx: RunContext): Promise<void> {
  ctx.log.stage('01 ingest words');
  const { words, dropped, droppedExamples } = await loadSeedWords(ctx.paths.seedFile);
  ctx.metrics.wordsDropped += dropped;

  const limited = ctx.limit ? words.slice(0, ctx.limit) : words;
  ctx.log.info(
    `Seed: ${words.length} clean headwords, ${dropped} dropped` +
      (droppedExamples.length ? ` (e.g. ${droppedExamples.join(', ')})` : '') +
      `. Processing ${limited.length}.`,
  );

  for (const headword of limited) {
    const existing = await ctx.store.getWordByHeadword(headword);
    if (existing) {
      ctx.metrics.wordsSkipped += 1;
      continue;
    }
    const meta = await resolveWordMeta(ctx, headword);
    await ctx.store.insertWord({
      headword,
      part_of_speech: null,
      ipa: null,
      syllables: meta.syllables,
      frequency_rank: meta.rank,
      difficulty_tier: meta.tier,
      etymology: null,
      audio_url: null,
    });
    ctx.metrics.wordsInserted += 1;
  }

  await ctx.store.flush();
  ctx.log.success(
    `Words: +${ctx.metrics.wordsInserted} inserted, ${ctx.metrics.wordsSkipped} already present.`,
  );
}
