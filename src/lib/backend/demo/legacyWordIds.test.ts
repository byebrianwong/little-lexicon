import { LEGACY_HEADWORDS, legacyIdMap, remapWordIds } from './legacyWordIds';
import { loadContent } from '@/lib/content';

describe('legacyIdMap', () => {
  it('maps old positions to new ids by headword and skips missing words', () => {
    const ids: Record<string, number> = { ephemeral: 99, laconic: 163 };
    const map = legacyIdMap((h) => ids[h]);
    expect([...map.entries()]).toEqual([
      [1, 99],
      [3, 163],
    ]);
  });

  it('finds every legacy word in the committed words file', async () => {
    const { byHeadword } = await loadContent();
    const map = legacyIdMap((h) => byHeadword.get(h)?.wordId);
    expect(map.size).toBe(LEGACY_HEADWORDS.length);
  });
});

describe('remapWordIds', () => {
  const idMap = new Map([
    [1, 99],
    [3, 163],
  ]);

  it('moves states and logs to the new ids', () => {
    const states = {
      1: { word_id: 1, reps: 4 },
      3: { word_id: 3, reps: 1 },
    };
    const logs = [
      { word_id: 3, rating: 3 },
      { word_id: 1, rating: 1 },
    ];
    const out = remapWordIds(states, logs, idMap);
    expect(out.states).toEqual({
      99: { word_id: 99, reps: 4 },
      163: { word_id: 163, reps: 1 },
    });
    expect(out.logs).toEqual([
      { word_id: 163, rating: 3 },
      { word_id: 99, rating: 1 },
    ]);
    expect(out.unmapped).toEqual({ states: [], logs: [] });
  });

  it('keeps rows it cannot map instead of dropping them', () => {
    const out = remapWordIds({ 5: { word_id: 5 } }, [{ word_id: 5 }], idMap);
    expect(out.states).toEqual({});
    expect(out.unmapped).toEqual({ states: [{ word_id: 5 }], logs: [{ word_id: 5 }] });
  });
});
