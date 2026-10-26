import {
  orderFeed,
  pickNewWordIds,
  tierWeight,
  weightedOrder,
  type CatalogEntry,
} from './wordOrder';

function entry(
  wordId: number,
  difficultyTier: number,
  frequencyRank: number | null = wordId,
) {
  return { wordId, difficultyTier, frequencyRank } satisfies CatalogEntry;
}

/** `perTier` words per tier: ids 1 to perTier at tier 1, and so on. */
function catalogOf(perTier: number): CatalogEntry[] {
  return Array.from({ length: perTier * 5 }, (_, i) =>
    entry(i + 1, Math.floor(i / perTier) + 1),
  );
}

// Ten words per tier, ids 1-10 at tier 1, 11-20 at tier 2, and so on.
const CATALOG = catalogOf(10);

const tierOf = (id: number) => Math.floor((id - 1) / 10) + 1;

/** The share of each tier 1 to 5 in a list of tiers. */
function shares(tiers: readonly number[]): number[] {
  return [1, 2, 3, 4, 5].map((t) => tiers.filter((x) => x === t).length / tiers.length);
}

describe('tierWeight', () => {
  it('weighs every tier the same when there is no estimate', () => {
    expect([1, 2, 3, 4, 5].map((t) => tierWeight(t, null))).toEqual([1, 1, 1, 1, 1]);
  });

  it('prefers the learner tier, then the tiers next to it', () => {
    expect([1, 2, 3, 4, 5].map((t) => tierWeight(t, 3))).toEqual([1, 4, 10, 4, 1]);
    expect([1, 2, 3, 4, 5].map((t) => tierWeight(t, 1))).toEqual([10, 4, 1, 0.5, 0.25]);
  });

  it('clamps an estimate outside 1 to 5', () => {
    expect(tierWeight(5, 9)).toBe(10);
    expect(tierWeight(1, 0)).toBe(10);
  });
});

describe('weightedOrder', () => {
  it('tends to put heavier words first', () => {
    const ids = Array.from({ length: 200 }, (_, i) => i + 1);
    // Even ids weigh 9, odd ids 1: even ids should fill about 90% of the front.
    const front = weightedOrder(ids, (id) => (id % 2 === 0 ? 9 : 1), 3).slice(0, 50);
    const even = front.filter((id) => id % 2 === 0).length;
    expect(even).toBeGreaterThanOrEqual(38);
    expect(even).toBeLessThan(50);
  });

  it('does not move the other words when one is left out', () => {
    const ids = Array.from({ length: 30 }, (_, i) => i + 1);
    const weight = (id: number) => (id % 3) + 1;
    const all = weightedOrder(ids, weight, 11);
    const without = weightedOrder(
      ids.filter((id) => id !== all[4]),
      weight,
      11,
    );
    expect(without).toEqual(all.filter((id) => id !== all[4]));
  });
});

describe('orderFeed', () => {
  const base = {
    catalog: CATALOG,
    exclude: new Set<number>(),
    levelEstimate: 3,
    seed: 7,
  };

  it('leans hard toward the learner tier, with every tier in the mix', () => {
    // 100 words per tier, the first 40 of the feed for 25 seeds: 1,000 picks.
    const catalog = catalogOf(100);
    const tiers: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const ids = orderFeed({ ...base, catalog, seed, limit: 40 });
      tiers.push(...ids.map((id) => Math.floor((id - 1) / 100) + 1));
    }
    const [t1, t2, t3, t4, t5] = shares(tiers);
    // Expected 5%, 20%, 50%, 20%, 5%.
    expect(t3).toBeGreaterThan(0.42);
    expect(t3).toBeLessThan(0.58);
    for (const near of [t2!, t4!]) {
      expect(near).toBeGreaterThan(0.14);
      expect(near).toBeLessThan(0.27);
    }
    for (const far of [t1!, t5!]) {
      expect(far).toBeGreaterThan(0.02);
      expect(far).toBeLessThan(0.09);
    }
  });

  it('spreads words evenly over the tiers when there is no level estimate', () => {
    const catalog = catalogOf(100);
    const tiers: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const ids = orderFeed({ ...base, catalog, levelEstimate: null, seed, limit: 40 });
      tiers.push(...ids.map((id) => Math.floor((id - 1) / 100) + 1));
    }
    for (const share of shares(tiers)) {
      expect(share).toBeGreaterThan(0.15);
      expect(share).toBeLessThan(0.25);
    }
  });

  it('gives the same order for the same seed, and a different one for another', () => {
    const a = orderFeed({ ...base, limit: 20 });
    expect(orderFeed({ ...base, limit: 20 })).toEqual(a);
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

  it('returns nothing once every word is excluded', () => {
    const exclude = new Set(CATALOG.map((e) => e.wordId));
    expect(orderFeed({ ...base, exclude, limit: 10 })).toEqual([]);
  });
});

describe('pickNewWordIds', () => {
  const base = { catalog: CATALOG, seen: new Set<number>(), listed: [], limit: 5 };

  it('takes the most frequent word first within a tier', () => {
    const catalog = [entry(3, 2, 1), entry(1, 1, 50), entry(2, 1, 10), entry(4, 1, null)];
    // No level: the tiers take turns. Tier 1 goes in frequency order, unranked last.
    expect(pickNewWordIds({ ...base, catalog })).toEqual([2, 3, 1, 4]);
  });

  it('mixes tiers by weight: 10, 4, 4, 1 and 1 in every 20 for tier 3', () => {
    const ids = pickNewWordIds({
      ...base,
      catalog: catalogOf(30),
      levelEstimate: 3,
      limit: 20,
    });
    const tiers = ids.map((id) => Math.floor((id - 1) / 30) + 1);
    expect(tiers[0]).toBe(3);
    expect(shares(tiers).map((s) => s * 20)).toEqual([1, 4, 10, 4, 1]);
  });

  it('spreads the far tiers out instead of saving them for the end', () => {
    const ids = pickNewWordIds({
      ...base,
      catalog: catalogOf(30),
      levelEstimate: 3,
      limit: 40,
    });
    const tiers = ids.map((id) => Math.floor((id - 1) / 30) + 1);
    // Each half of the first 40 has a tier 1 and a tier 5 word.
    for (const half of [tiers.slice(0, 20), tiers.slice(20)]) {
      expect(half).toContain(1);
      expect(half).toContain(5);
    }
  });

  it('shares the turns of a tier that has run out', () => {
    const tier3 = new Set(
      CATALOG.filter((e) => e.difficultyTier === 3).map((e) => e.wordId),
    );
    const ids = pickNewWordIds({ ...base, seen: tier3, levelEstimate: 3, limit: 10 });
    const tiers = ids.map(tierOf);
    expect(tiers).not.toContain(3);
    expect(tiers.filter((t) => t === 2 || t === 4).length).toBeGreaterThanOrEqual(8);
  });

  it('puts listed words first, oldest first, whatever their tier', () => {
    const ids = pickNewWordIds({ ...base, listed: [45, 31] });
    expect(ids).toEqual([45, 31, 1, 11, 21]);
  });

  it('keeps listed words ahead of the lean toward the learner tier', () => {
    const ids = pickNewWordIds({ ...base, listed: [45], levelEstimate: 2 });
    expect(ids[0]).toBe(45);
    expect(tierOf(ids[1]!)).toBe(2);
  });

  it('skips listed words a session already started', () => {
    const ids = pickNewWordIds({ ...base, listed: [45, 31], seen: new Set([45]) });
    expect(ids).toEqual([31, 1, 11, 21, 32]);
  });

  it('does not repeat a word that is both listed and next in line', () => {
    const ids = pickNewWordIds({ ...base, listed: [1, 1] });
    expect(ids).toEqual([1, 2, 11, 21, 31]);
  });

  it('ignores listed ids that are not in the collection', () => {
    expect(pickNewWordIds({ ...base, listed: [999] })).toEqual([1, 11, 21, 31, 41]);
  });

  it('stops at the limit even inside the list', () => {
    expect(pickNewWordIds({ ...base, listed: [40, 41, 42], limit: 2 })).toEqual([40, 41]);
  });
});
