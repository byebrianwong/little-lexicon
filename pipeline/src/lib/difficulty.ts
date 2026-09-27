// Difficulty tiering (1 easy .. 5 hard) and a cheap syllable estimate.
//
// Live mode gets word frequency from Datamuse (occurrences per million). GRE
// words are all rare by everyday standards, so fixed frequency cut-offs put
// almost every word in tiers 4 and 5. After ingest, tiersByFrequencyRank
// re-tiers the list relative to itself: the most common fifth is tier 1, the
// rarest fifth tier 5. Placement and the new-word window (level +/- 1) need
// words in every tier. Dry-run has no network, so it uses a deterministic
// heuristic from length and syllable count.

/** Map Datamuse frequency (occurrences per million words) to a 1..5 tier. */
export function tierFromFrequency(freqPerMillion: number): number {
  if (freqPerMillion >= 50) return 1;
  if (freqPerMillion >= 10) return 2;
  if (freqPerMillion >= 2) return 3;
  if (freqPerMillion >= 0.4) return 4;
  return 5;
}

/**
 * Convert a Datamuse frequency to a coarse frequency_rank (lower = more common),
 * so the column carries a usable ordering even without a full ngram table.
 */
export function rankFromFrequency(freqPerMillion: number): number {
  if (freqPerMillion <= 0) return 250000;
  // rank roughly inversely proportional to frequency.
  return Math.max(1, Math.round(1_000_000 / (freqPerMillion + 0.001) / 4));
}

/**
 * Tier each word by its frequency rank within the list: five equal groups,
 * most common first. Ties keep id order so the result is deterministic. Words
 * with no rank are left out of the map (they keep their current tier).
 */
export function tiersByFrequencyRank(
  words: { id: number; frequency_rank: number | null }[],
): Map<number, number> {
  const ranked = words
    .filter((w): w is { id: number; frequency_rank: number } => w.frequency_rank !== null)
    .sort((a, b) => a.frequency_rank - b.frequency_rank || a.id - b.id);
  const tiers = new Map<number, number>();
  ranked.forEach((w, i) => {
    tiers.set(w.id, Math.floor((i * 5) / ranked.length) + 1);
  });
  return tiers;
}

/** Estimate syllables by counting vowel groups. Good enough for tiering/metadata. */
export function estimateSyllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 1;
  const groups = w.match(/[aeiouy]+/g);
  let count = groups ? groups.length : 1;
  // Silent trailing 'e' rarely forms its own syllable.
  if (w.endsWith('e') && count > 1) count -= 1;
  return Math.max(1, count);
}

/**
 * Deterministic offline tier used in dry-run and as a fallback when Datamuse
 * returns no frequency. Longer, more syllabic words are treated as harder.
 */
export function heuristicTier(word: string): number {
  const len = word.replace(/[^a-z]/gi, '').length;
  const syl = estimateSyllables(word);
  let tier = 2;
  if (len >= 7) tier += 1;
  if (len >= 11) tier += 1;
  if (syl >= 4) tier += 1;
  return Math.min(5, Math.max(1, tier));
}
