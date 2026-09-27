import { orderFeed, pickNewWordIds, tierWindowForLevel, type CatalogEntry } from './wordOrder';

function entry(wordId: number, difficultyTier: number, frequencyRank: number | null = wordId) {
  return { wordId, difficultyTier, frequencyRank } satisfies CatalogEntry;
}

// Ten words per tier, ids 1-10 at tier 1, 11-20 at tier 2, and so on.
const CATALOG: CatalogEntry[] = Array.from({ length: 50 }, (_, i) =>
  entry(i + 1, Math.floor(i / 10) + 1),
);

const tierOf = (id: number) => CATALOG.find((e) => e.wordId === id)!.difficultyTier;

describe('tierWindowForLevel', () => {
  it('prefers every tier when there is no estimate', () => {
    expect(tierWindowForLevel(null)).toEqual({ minTier: 1, maxTier: 5 });
  });

  it('takes one tier either side of the estimate, clamped to 1..5', () => {
    expect(tierWindowForLevel(3)).toEqual({ minTier: 2, maxTier: 4 });
    expect(tierWindowForLevel(1)).toEqual({ minTier: 1, maxTier: 2 });
    expect(tierWindowForLevel(9)).toEqual({ minTier: 4, maxTier: 5 });
  });
});

describe('orderFeed', () => {
  const base = { catalog: CATALOG, exclude: new Set<number>(), levelEstimate: 1, seed: 7 };

  it('puts words inside the tier window first, then the nearest tiers', () => {
    const ids = orderFeed({ ...base, limit: 50 });
    const tiers = ids.map(tierOf);
    // Level 1: tiers 1-2 are the window, then 3, 4, 5.
    expect(tiers.slice(0, 20).every((t) => t <= 2)).toBe(true);
    expect(tiers.slice(20, 30).every((t) => t === 3)).toBe(true);
    expect(tiers.slice(30, 40).every((t) => t === 4)).toBe(true);
    expect(tiers.slice(40).every((t) => t === 5)).toBe(true);
  });

  it('shuffles within a group, and the same seed gives the same order', () => {
    const a = orderFeed({ ...base, limit: 20 });
    const b = orderFeed({ ...base, limit: 20 });
    expect(a).toEqual(b);
    expect(a).not.toEqual([...a].sort((x, y) => x - y));
    expect(orderFeed({ ...base, seed: 8, limit: 20 })).not.toEqual(a);
  });

  it('never returns an excluded word', () => {
    const exclude = new Set([1, 2, 3, 11, 12]);
    const ids = orderFeed({ ...base, exclude, limit: 50 });
    expect(ids).toHaveLength(45);
    expect(ids.some((id) => exclude.has(id))).toBe(false);
  });

  it('pages without moving the words that follow', () => {
    // The feed asks for page two by excluding page one. The result must be
    // exactly what came after page one in a single long request.
    const all = orderFeed({ ...base, limit: 50 });
    const first = orderFeed({ ...base, limit: 15 });
    const second = orderFeed({ ...base, exclude: new Set(first), limit: 15 });
    expect([...first, ...second]).toEqual(all.slice(0, 30));
  });

  it('does not depend on the order the catalog arrives in', () => {
    const reversed = [...CATALOG].reverse();
    expect(orderFeed({ ...base, catalog: reversed, limit: 50 })).toEqual(
      orderFeed({ ...base, limit: 50 }),
    );
  });

  it('mixes every tier together when there is no level estimate', () => {
    const ids = orderFeed({ ...base, levelEstimate: null, limit: 10 });
    expect(new Set(ids.map(tierOf)).size).toBeGreaterThan(1);
  });

  it('returns nothing once every word is excluded', () => {
    const exclude = new Set(CATALOG.map((e) => e.wordId));
    expect(orderFeed({ ...base, exclude, limit: 10 })).toEqual([]);
  });
});

describe('pickNewWordIds', () => {
  const base = { catalog: CATALOG, seen: new Set<number>(), listed: [], limit: 5 };

  it('without a list, takes the easiest, most frequent words first', () => {
    const catalog = [entry(3, 2, 1), entry(1, 1, 50), entry(2, 1, 10), entry(4, 1, null)];
    expect(pickNewWordIds({ ...base, catalog })).toEqual([2, 1, 4, 3]);
  });

  it('puts listed words first, oldest first, whatever their tier', () => {
    const ids = pickNewWordIds({ ...base, listed: [45, 31] });
    expect(ids).toEqual([45, 31, 1, 2, 3]);
  });

  it('skips listed words a session already started', () => {
    const ids = pickNewWordIds({ ...base, listed: [45, 31], seen: new Set([45]) });
    expect(ids).toEqual([31, 1, 2, 3, 4]);
  });

  it('keeps listed words ahead of the tier range, and the rest inside it', () => {
    const ids = pickNewWordIds({ ...base, listed: [45], minTier: 2, maxTier: 2 });
    expect(ids).toEqual([45, 11, 12, 13, 14]);
  });

  it('does not repeat a word that is both listed and next in line', () => {
    const ids = pickNewWordIds({ ...base, listed: [2, 2] });
    expect(ids).toEqual([2, 1, 3, 4, 5]);
  });

  it('ignores listed ids that are not in the collection', () => {
    expect(pickNewWordIds({ ...base, listed: [999] })).toEqual([1, 2, 3, 4, 5]);
  });

  it('stops at the limit even inside the list', () => {
    expect(pickNewWordIds({ ...base, listed: [40, 41, 42], limit: 2 })).toEqual([40, 41]);
  });
});
