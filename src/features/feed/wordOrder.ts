// Which unseen words to offer, and in what order. Pure and unit tested, and
// shared by both backends so demo mode and Supabase order words the same way.
//
// Two orders live here:
//
// - The Discover feed shows words near the user's level in a shuffled order.
//   The shuffle is seeded, so paging through the feed is stable: the feed asks
//   for more by excluding what it has already shown, and the remaining words
//   keep their places.
// - A session's new words put the user's list first, oldest pick first, then
//   fall back to the automatic order (easiest tier, then most frequent). The
//   list decides which new words come next. It does not limit how many.

import { mulberry32, shuffle } from '@/features/games/optionPool';

/** The fields ordering needs, one entry per word in the collection. */
export interface CatalogEntry {
  wordId: number;
  difficultyTier: number;
  frequencyRank: number | null;
}

/**
 * Map a placement level estimate (1 to 5) to the tiers to prefer. A missing
 * estimate means no preference.
 */
export function tierWindowForLevel(
  levelEstimate: number | null,
): { minTier: number; maxTier: number } {
  if (levelEstimate == null) return { minTier: 1, maxTier: 5 };
  const center = Math.min(5, Math.max(1, levelEstimate));
  return { minTier: Math.max(1, center - 1), maxTier: Math.min(5, center + 1) };
}

/** How far a tier sits outside the window. Zero inside it. */
function distanceFromWindow(tier: number, window: { minTier: number; maxTier: number }): number {
  if (tier < window.minTier) return window.minTier - tier;
  if (tier > window.maxTier) return tier - window.maxTier;
  return 0;
}

export interface FeedOrderInput {
  catalog: readonly CatalogEntry[];
  /** Seen, known and listed words, plus anything the feed already showed. */
  exclude: ReadonlySet<number>;
  levelEstimate: number | null;
  seed: number;
  limit: number;
}

/**
 * The next `limit` word ids for the Discover feed.
 *
 * Words inside the user's tier window come first, then words one tier outside
 * it, and so on. Each group is shuffled by `seed`. The shuffle runs over the
 * whole group before anything is excluded, so excluding a shown word never
 * moves the words after it. That is what makes paging safe.
 */
export function orderFeed(input: FeedOrderInput): number[] {
  const window = tierWindowForLevel(input.levelEstimate);
  // Sort by id first so the shuffle's input does not depend on the order the
  // backend returned the catalog in.
  const byId = [...input.catalog].sort((a, b) => a.wordId - b.wordId);

  const groups = new Map<number, number[]>();
  for (const entry of byId) {
    const d = distanceFromWindow(entry.difficultyTier, window);
    const group = groups.get(d);
    if (group) group.push(entry.wordId);
    else groups.set(d, [entry.wordId]);
  }

  const out: number[] = [];
  const distances = [...groups.keys()].sort((a, b) => a - b);
  for (const d of distances) {
    // Each group gets its own stream so adding words to one tier does not
    // reshuffle the others.
    const ids = shuffle(groups.get(d)!, mulberry32(input.seed + d * 7919));
    for (const id of ids) {
      if (input.exclude.has(id)) continue;
      out.push(id);
      if (out.length >= input.limit) return out;
    }
  }
  return out;
}

export interface NewWordOrderInput {
  catalog: readonly CatalogEntry[];
  /** Words with a user_word_state row: studied, or marked known. */
  seen: ReadonlySet<number>;
  /** The user's list, oldest pick first. */
  listed: readonly number[];
  minTier?: number;
  maxTier?: number;
  limit: number;
}

/**
 * The next `limit` new words for a session.
 *
 * Listed words come first, in the order they were added, whatever their tier:
 * the user asked for them. The rest follow in the automatic order, easiest
 * tier first and then most frequent, within the tier range.
 */
export function pickNewWordIds(input: NewWordOrderInput): number[] {
  const minTier = input.minTier ?? 1;
  const maxTier = input.maxTier ?? 5;
  const inCatalog = new Set(input.catalog.map((e) => e.wordId));
  const taken = new Set<number>();
  const out: number[] = [];

  for (const id of input.listed) {
    if (out.length >= input.limit) return out;
    if (input.seen.has(id) || taken.has(id) || !inCatalog.has(id)) continue;
    taken.add(id);
    out.push(id);
  }

  const automatic = input.catalog
    .filter(
      (e) =>
        !input.seen.has(e.wordId) &&
        !taken.has(e.wordId) &&
        e.difficultyTier >= minTier &&
        e.difficultyTier <= maxTier,
    )
    .sort(
      (a, b) =>
        a.difficultyTier - b.difficultyTier ||
        // Unranked words go after ranked ones, as in the Supabase query.
        (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) -
          (b.frequencyRank ?? Number.MAX_SAFE_INTEGER) ||
        a.wordId - b.wordId,
    );
  for (const e of automatic) {
    if (out.length >= input.limit) break;
    out.push(e.wordId);
  }
  return out;
}
