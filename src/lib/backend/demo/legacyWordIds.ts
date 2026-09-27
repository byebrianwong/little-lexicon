// Demo progress saved before the words file used the 12 hand-written words,
// numbered 1 to 12 in this order. Those numbers now belong to other words, so
// saved progress is moved to each headword's id in the words file once, on
// first load. Pure and unit tested.

export const LEGACY_HEADWORDS = [
  'ephemeral',
  'quixotic',
  'laconic',
  'obfuscate',
  'sycophant',
  'pragmatic',
  'ubiquitous',
  'capricious',
  'pernicious',
  'gregarious',
  'insidious',
  'eloquent',
] as const;

/** Old id -> new id, for the legacy headwords the words file still has. */
export function legacyIdMap(idForHeadword: (headword: string) => number | undefined): Map<number, number> {
  const map = new Map<number, number>();
  LEGACY_HEADWORDS.forEach((headword, i) => {
    const id = idForHeadword(headword);
    if (id !== undefined) map.set(i + 1, id);
  });
  return map;
}

export interface Remapped<S, L> {
  states: Record<number, S>;
  logs: L[];
  /** Rows whose word is no longer in the words file. Kept, never deleted. */
  unmapped: { states: S[]; logs: L[] };
}

export function remapWordIds<S extends { word_id: number }, L extends { word_id: number }>(
  states: Record<number, S>,
  logs: L[],
  idMap: Map<number, number>,
): Remapped<S, L> {
  const out: Remapped<S, L> = { states: {}, logs: [], unmapped: { states: [], logs: [] } };
  for (const row of Object.values(states)) {
    const id = idMap.get(row.word_id);
    if (id === undefined) out.unmapped.states.push(row);
    else out.states[id] = { ...row, word_id: id };
  }
  for (const row of logs) {
    const id = idMap.get(row.word_id);
    if (id === undefined) out.unmapped.logs.push(row);
    else out.logs.push({ ...row, word_id: id });
  }
  return out;
}
