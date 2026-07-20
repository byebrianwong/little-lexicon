// Difficulty tiering (1 easy .. 5 hard) and a cheap syllable estimate.
//
// Live mode gets word frequency from Datamuse (md=f, occurrences per million)
// and maps it to a tier: common words are easier. Dry-run has no network, so it
// uses a deterministic heuristic from length and syllable count. GRE seed words
// skew rare, so tiers cluster in the 3..5 range either way.

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
