// What a word's extra lines show: similar and opposite words, the tone label,
// the "Watch out" note, other meanings, common pairings, the origin and other
// words from the same root. Screens pick which lines to show
// (components/WordExtras); this module decides what goes in each. Pure and
// unit tested.
//
// Each field comes out empty (null or []) when the content has nothing for it,
// so a screen can skip the line rather than show an empty label.

import type { Register, WordContent } from './types';

/** How many synonyms a "Similar" line shows. Three give the sense from a few sides. */
export const SIMILAR_MAX = 3;
/** How many antonyms an "Opposite" line shows. One or two pin down the contrast. */
export const OPPOSITE_MAX = 2;
/** How many words a "Same root" line names. */
export const SAME_ROOT_MAX = 5;
/** The content allows at most 2 senses under "Also means". */
export const ALSO_MEANS_MAX = 2;
/** The content allows at most 4 pairings. */
export const PAIRINGS_MAX = 4;

/** A word in the collection that shares a root with the one shown. */
export interface RootWord {
  wordId: number;
  headword: string;
}

/** One other meaning, for "Also means". */
export interface AlsoMeansLine {
  senseId: number;
  /** The sense's plain definition. */
  text: string;
  tone: Register | null;
}

export interface WordExtras {
  /** The first sense's tone label, shown beside the part of speech. */
  tone: Register | null;
  watchOut: string | null;
  similar: string[];
  opposite: string[];
  alsoMeans: AlsoMeansLine[];
  pairings: string[];
  origin: string | null;
  sameRoot: RootWord[];
}

/** The lines a screen can ask for, in the order they are always shown. */
export const EXTRA_LINES = [
  'alsoMeans',
  'similar',
  'opposite',
  'pairings',
  'origin',
  'sameRoot',
] as const;

export type ExtraLine = (typeof EXTRA_LINES)[number];

function clean(text: string | null | undefined): string | null {
  const t = (text ?? '').trim();
  return t === '' ? null : t;
}

/** Trimmed, without blanks, case-insensitive repeats or anything in `skip`, at most `max`. */
function distinct(items: readonly string[], max: number, skip: readonly string[] = []): string[] {
  const seen = new Set(skip.map((s) => s.trim().toLowerCase()));
  const out: string[] = [];
  for (const item of items) {
    if (out.length >= max) break;
    const t = item.trim();
    const key = t.toLowerCase();
    if (t === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

/** The first sense's tone label, or null for a neutral word. */
export function toneOf(word: Pick<WordContent, 'senses'>): Register | null {
  return word.senses[0]?.register ?? null;
}

/** The "Watch out" note, or null. */
export function watchOutOf(word: Pick<WordContent, 'watchOut'>): string | null {
  return clean(word.watchOut);
}

/**
 * The synonyms and antonyms a word's lines show: the first few of each, in
 * the order the content gives them (the curated order), without repeats or
 * the word itself.
 */
export function relationsToShow(
  word: Pick<WordContent, 'headword' | 'relations'>,
  limits: { similar: number; opposite: number } = { similar: SIMILAR_MAX, opposite: OPPOSITE_MAX },
): { similar: string[]; opposite: string[] } {
  const of = (type: 'synonym' | 'antonym') =>
    word.relations.filter((r) => r.relationType === type).map((r) => r.relatedLemma);
  return {
    similar: distinct(of('synonym'), limits.similar, [word.headword]),
    opposite: distinct(of('antonym'), limits.opposite, [word.headword]),
  };
}

/**
 * The other words in `collection` that share a root with `word`. A word with
 * no roots has none, and the word itself is never listed. Words that share
 * more roots come first, then the collection's own order (easiest first in
 * the app's content index).
 */
export function sameRootWords(
  word: Pick<WordContent, 'wordId' | 'roots'>,
  collection: readonly Pick<WordContent, 'wordId' | 'headword' | 'roots'>[],
  limit: number = SAME_ROOT_MAX,
): RootWord[] {
  const roots = new Set(word.roots.map((r) => r.trim().toLowerCase()).filter((r) => r !== ''));
  if (roots.size === 0 || limit <= 0) return [];
  const found: { word: RootWord; shared: number; index: number }[] = [];
  const seen = new Set<number>([word.wordId]);
  collection.forEach((other, index) => {
    if (seen.has(other.wordId)) return;
    const shared = new Set(
      other.roots.map((r) => r.trim().toLowerCase()).filter((r) => roots.has(r)),
    ).size;
    if (shared === 0) return;
    seen.add(other.wordId);
    found.push({ word: { wordId: other.wordId, headword: other.headword }, shared, index });
  });
  return found
    .sort((a, b) => b.shared - a.shared || a.index - b.index)
    .slice(0, limit)
    .map((f) => f.word);
}

/**
 * The other meanings shown under "Also means": senses after the first that the
 * content marks `alsoMeans` and that have a plain definition, at most two.
 */
export function alsoMeansLines(word: Pick<WordContent, 'senses'>): AlsoMeansLine[] {
  const out: AlsoMeansLine[] = [];
  for (const sense of word.senses.slice(1)) {
    const text = clean(sense.plainLanguageDefinition);
    if (!sense.alsoMeans || !text) continue;
    out.push({ senseId: sense.senseId, text, tone: sense.register ?? null });
    if (out.length >= ALSO_MEANS_MAX) break;
  }
  return out;
}

/** Everything a word's extra lines show. `collection` is searched for shared roots. */
export function wordExtras(
  word: WordContent,
  collection: readonly WordContent[] = [],
): WordExtras {
  return {
    tone: toneOf(word),
    watchOut: watchOutOf(word),
    ...relationsToShow(word),
    alsoMeans: alsoMeansLines(word),
    pairings: distinct(word.pairings, PAIRINGS_MAX),
    origin: clean(word.etymology),
    sameRoot: sameRootWords(word, collection),
  };
}

/** Whether a line has anything to show. */
export function hasLine(extras: WordExtras, line: ExtraLine): boolean {
  switch (line) {
    case 'origin':
      return extras.origin !== null;
    default:
      return extras[line].length > 0;
  }
}

/** The requested lines that have something to show, in display order. */
export function linesToShow(extras: WordExtras, lines: readonly ExtraLine[]): ExtraLine[] {
  return EXTRA_LINES.filter((line) => lines.includes(line) && hasLine(extras, line));
}
