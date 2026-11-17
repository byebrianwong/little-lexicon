// The search and filters on the "All words" view. Pure and unit tested.
//
// A word shows when it matches the search text (wordSearch.ts, which also
// finds similar and opposite words) and every filter that is on:
// - tiers: any of the chosen tiers (none chosen means every tier);
// - status: saved, or what the word tracker says (features/tracker);
// - part of speech.

import type { WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import { buildSearchIndex, searchWords, type SearchHit, type SearchIndex } from './wordSearch';

export type StatusFilter = 'any' | 'saved' | 'learning' | 'known' | 'untested';

export const STATUS_FILTERS: readonly { id: StatusFilter; label: string }[] = [
  { id: 'any', label: 'Any' },
  { id: 'saved', label: 'Saved' },
  { id: 'learning', label: 'Learning' },
  { id: 'known', label: 'Known' },
  // Matches the tracker's "Not tested yet".
  { id: 'untested', label: 'Not tested' },
];

export const TIERS: readonly number[] = [1, 2, 3, 4, 5];

export interface WordFilters {
  /** Tiers to show. Empty shows every tier. */
  tiers: readonly number[];
  status: StatusFilter;
  /** A part of speech to show, or null for every one. */
  partOfSpeech: string | null;
}

export const NO_FILTERS: WordFilters = { tiers: [], status: 'any', partOfSpeech: null };

/** How many filters are on, for the "Filters" button. */
export function activeFilterCount(filters: WordFilters): number {
  return (
    (filters.tiers.length > 0 ? 1 : 0) +
    (filters.status !== 'any' ? 1 : 0) +
    (filters.partOfSpeech !== null ? 1 : 0)
  );
}

/** Turn one tier on or off. */
export function toggleTier(filters: WordFilters, tier: number): WordFilters {
  const tiers = filters.tiers.includes(tier)
    ? filters.tiers.filter((t) => t !== tier)
    : [...filters.tiers, tier].sort((a, b) => a - b);
  return { ...filters, tiers };
}

/** Every part of speech in the collection, in alphabetical order. */
export function partsOfSpeech(words: readonly WordContent[]): string[] {
  const out = new Set<string>();
  for (const w of words) if (w.partOfSpeech) out.add(w.partOfSpeech);
  return [...out].sort();
}

export interface FilterContext {
  savedIds: ReadonlySet<number>;
  trackers: ReadonlyMap<number, WordTracker>;
}

function matchesStatus(
  word: WordContent,
  status: StatusFilter,
  ctx: FilterContext,
): boolean {
  switch (status) {
    case 'any':
      return true;
    case 'saved':
      return ctx.savedIds.has(word.wordId);
    case 'untested':
      return !ctx.trackers.has(word.wordId);
    default:
      return ctx.trackers.get(word.wordId)?.status === status;
  }
}

/** Whether a word passes every filter that is on. */
function passesFilters(word: WordContent, filters: WordFilters, ctx: FilterContext): boolean {
  return (
    (filters.tiers.length === 0 || filters.tiers.includes(word.difficultyTier)) &&
    (filters.partOfSpeech === null || word.partOfSpeech === filters.partOfSpeech) &&
    matchesStatus(word, filters.status, ctx)
  );
}

/**
 * The search and filters that bring one word into view, for a link to it from
 * another row (a "Same root" word): the search becomes its headword, and the
 * filters stay as they are when the word passes them, else they are cleared.
 */
export function searchForWord(
  word: WordContent,
  filters: WordFilters,
  ctx: FilterContext,
): { query: string; filters: WordFilters } {
  const passes = passesFilters(word, filters, ctx);
  return { query: word.headword, filters: passes ? filters : NO_FILTERS };
}

/**
 * The words that match the search text and the filters, best match first,
 * each with why it matched. With no search text, every word that passes the
 * filters, in the collection's order.
 */
export function findWords(
  index: SearchIndex,
  query: string,
  filters: WordFilters,
  ctx: FilterContext,
): SearchHit[] {
  return searchWords(index, query).filter((hit) => passesFilters(hit.word, filters, ctx));
}

/** findWords for a list of words, without the reasons. */
export function filterWords(
  words: readonly WordContent[],
  query: string,
  filters: WordFilters,
  ctx: FilterContext,
): WordContent[] {
  return findWords(buildSearchIndex(words), query, filters, ctx).map((hit) => hit.word);
}
