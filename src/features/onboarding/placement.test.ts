import { nextTier, knownWordIds, estimateLevel, type PlacementResponse } from './placement';

describe('nextTier', () => {
  it('goes harder on know, easier on dont_know, holds on unsure', () => {
    expect(nextTier(3, 'know')).toBe(4);
    expect(nextTier(3, 'dont_know')).toBe(2);
    expect(nextTier(3, 'unsure')).toBe(3);
  });
  it('clamps to 1..5', () => {
    expect(nextTier(5, 'know')).toBe(5);
    expect(nextTier(1, 'dont_know')).toBe(1);
  });
});

describe('knownWordIds', () => {
  it('collects only the known words', () => {
    const r: PlacementResponse[] = [
      { wordId: 1, tier: 2, answer: 'know' },
      { wordId: 2, tier: 3, answer: 'unsure' },
      { wordId: 3, tier: 4, answer: 'dont_know' },
      { wordId: 4, tier: 2, answer: 'know' },
    ];
    expect(knownWordIds(r)).toEqual([1, 4]);
  });
});

describe('estimateLevel', () => {
  it('defaults to 2 when nothing is known', () => {
    expect(estimateLevel([{ wordId: 1, tier: 3, answer: 'dont_know' }])).toBe(2);
  });

  it('nudges above the hardest known tier when nothing below was missed', () => {
    const r: PlacementResponse[] = [
      { wordId: 1, tier: 2, answer: 'know' },
      { wordId: 2, tier: 3, answer: 'know' },
    ];
    expect(estimateLevel(r)).toBe(4);
  });

  it('holds at the hardest known tier when the user also missed at/below it', () => {
    const r: PlacementResponse[] = [
      { wordId: 1, tier: 3, answer: 'know' },
      { wordId: 2, tier: 2, answer: 'dont_know' },
    ];
    expect(estimateLevel(r)).toBe(3);
  });
});
