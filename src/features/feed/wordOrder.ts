// Which unseen words to offer, and in what order. Pure and unit tested, and
// shared by both backends so demo mode and Supabase order words the same way.
//
// The learner's level is a strong preference, not a limit. Every tier comes
// up, and the closer a tier is to the learner's, the more often (TIER_WEIGHTS).
// For a learner at tier 3, about half of new words are tier 3, a fifth each
// are tiers 2 and 4, and one in twenty each are tiers 1 and 5.
//
// Two orders live here:
//
// - The Discover feed draws words at random, weighted by tier. The draw is
//   seeded, so paging through the feed is stable: the feed asks for more by
//   excluding what it has already shown, and the remaining words keep their
//   places.
// - A session's new words put the user's list first, oldest pick first, then
//   take the rest from each tier in turn by weight, most frequent first within
//   a tier. The list decides which new words come next. It does not limit how
//   many.

import { mulberry32 } from '@/features/games/optionPool';

/** The fields ordering needs, one entry per word in the collection. */
export interface CatalogEntry {
  wordId: number;
  difficultyTier: number;
  frequencyRank: number | null;
}

/**
 * How often a tier comes up, by how far it is from the learner's tier: the
 * learner's own tier, one away, two away, three away, four away. Tiers hold
 * the same number of words, so these are also the shares of new words.
 */
export const TIER_WEIGHTS: readonly number[] = [10, 4, 1, 0.5, 0.25];

/**
 * How strongly to prefer a tier for a learner with this level estimate (1 to
 * 5). A missing estimate means no preference: every tier weighs the same.
 */
export function tierWeight(tier: number, levelEstimate: number | null): number {
  if (levelEstimate == null) return 1;
  const center = Math.min(5, Math.max(1, Math.round(levelEstimate)));
  const distance = Math.min(TIER_WEIGHTS.length - 1, Math.abs(tier - center));
  return TIER_WEIGHTS[distance]!;
}

/**
 * Word ids in a random order where a heavier word tends to come earlier: a
 * word with weight 4 is four times as likely as a word with weight 1 to be
 * the next one. Reproducible from `seed`.
 *
 * Each word's place depends only on the seed, its id and its weight, never on
 * the other words. So dropping words from the result, or adding words to the
 * input, never moves the rest. (This is the Efraimidis-Spirakis method:
 * sort by -ln(u) / weight, with u uniform in (0, 1].)
 */
export function weightedOrder(
  ids: readonly number[],
  weightOf: (id: number) => number,
  seed: number,
): number[] {
  const keyed = ids.map((id) => {
    const u = 1 - mulberry32((seed ^ Math.imul(id, 0x9e3779b1)) >>> 0)();
    return { id, key: -Math.log(u) / weightOf(id) };
  });
  keyed.sort((a, b) => a.key - b.key || a.id - b.id);
  return keyed.map((k) => k.id);
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
 * The next `limit` word ids for the Discover feed, drawn at random and
 * weighted toward the learner's tier. The draw runs over the whole collection
 * before anything is excluded, so excluding a shown word never moves the words
 * after it. That is what makes paging safe.
 */
export function orderFeed(input: FeedOrderInput): number[] {
  const tierOf = new Map(input.catalog.map((e) => [e.wordId, e.difficultyTier]));
  const order = weightedOrder(
    input.catalog.map((e) => e.wordId),
    (id) => tierWeight(tierOf.get(id)!, input.levelEstimate),
    input.seed,
  );
  const out: number[] = [];
  for (const id of order) {
    if (input.exclude.has(id)) continue;
    out.push(id);
    if (out.length >= input.limit) break;
  }
  return out;
}

export interface NewWordOrderInput {
  catalog: readonly CatalogEntry[];
  /** Words with a user_word_state row: studied, or marked known. */
  seen: ReadonlySet<number>;
  /** The user's list, oldest pick first. */
  listed: readonly number[];
  /** Leans the words after the list toward this tier. Null or missing: no lean. */
  levelEstimate?: number | null;
  limit: number;
}

/**
 * The next `limit` new words for a session.
 *
 * Listed words come first, in the order they were added, whatever their tier:
 * the user asked for them. The rest come from each tier in turn, as often as
 * its weight (see takeByWeight), and most frequent first within a tier.
 */
export function pickNewWordIds(input: NewWordOrderInput): number[] {
  const inCatalog = new Set(input.catalog.map((e) => e.wordId));
  const taken = new Set<number>();
  const out: number[] = [];

  for (const id of input.listed) {
    if (out.length >= input.limit) return out;
    if (input.seen.has(id) || taken.has(id) || !inCatalog.has(id)) continue;
    taken.add(id);
    out.push(id);
  }

  const byTier = new Map<number, CatalogEntry[]>();
  for (const e of input.catalog) {
    if (input.seen.has(e.wordId) || taken.has(e.wordId)) continue;
    const tier = byTier.get(e.difficultyTier);
    if (tier) tier.push(e);
    else byTier.set(e.difficultyTier, [e]);
  }

  const level = input.levelEstimate ?? null;
  const queues = [...byTier.entries()]
    .map(([tier, entries]) => ({
      tier,
      weight: tierWeight(tier, level),
      items: entries
        .sort(
          (a, b) =>
            // Unranked words go after ranked ones.
            (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) -
              (b.frequencyRank ?? Number.MAX_SAFE_INTEGER) || a.wordId - b.wordId,
        )
        .map((e) => e.wordId),
    }))
    // On a tie, the heavier tier goes first, then the easier one.
    .sort((a, b) => b.weight - a.weight || a.tier - b.tier);

  return [...out, ...takeByWeight(queues, input.limit - out.length)];
}

/**
 * Take up to `limit` items from the queues in turn, each queue as often as its
 * weight. With weights 10, 4, 4, 1 and 1, every 20 picks hold 10, 4, 4, 1 and
 * 1 items, spread out rather than in runs. A queue that runs out drops out and
 * the others share its turns. Ties go to the earlier queue.
 *
 * This is smooth weighted round robin: each turn, every queue gains its
 * weight in credit, the queue with the most credit gives an item, and it pays
 * back the total weight.
 */
function takeByWeight(
  queues: readonly { weight: number; items: readonly number[] }[],
  limit: number,
): number[] {
  const live = queues
    .filter((q) => q.items.length > 0)
    .map((q) => ({ weight: q.weight, items: q.items, next: 0, credit: 0 }));
  const out: number[] = [];
  while (out.length < limit && live.length > 0) {
    let total = 0;
    for (const q of live) {
      q.credit += q.weight;
      total += q.weight;
    }
    let best = live[0]!;
    for (const q of live) if (q.credit > best.credit) best = q;
    best.credit -= total;
    out.push(best.items[best.next]!);
    best.next += 1;
    if (best.next >= best.items.length) live.splice(live.indexOf(best), 1);
  }
  return out;
}
