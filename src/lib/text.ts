// Pure text helpers for answer checking. No React, no I/O; unit tested.

/** Lowercase, trim, collapse whitespace, strip surrounding punctuation. */
export function normalizeAnswer(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '');
}

/** Classic Levenshtein edit distance. */
export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;

  let prev = new Array<number>(b.length + 1);
  let curr = new Array<number>(b.length + 1);
  for (let j = 0; j <= b.length; j++) prev[j] = j;

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      curr[j] = Math.min(
        (prev[j] ?? 0) + 1, // deletion
        (curr[j - 1] ?? 0) + 1, // insertion
        (prev[j - 1] ?? 0) + cost, // substitution
      );
    }
    [prev, curr] = [curr, prev];
  }
  return prev[b.length] ?? 0;
}

/**
 * Allowed edits scale with the target length so short words are strict and
 * long words tolerate a typo or two. 0 for <=3 chars, 1 for 4-7, 2 for 8+.
 */
export function typoTolerance(target: string): number {
  const n = target.length;
  if (n <= 3) return 0;
  if (n <= 7) return 1;
  return 2;
}

/**
 * How a typed answer compares to its target.
 * - `exact`: the same word after normalising.
 * - `near`: within the typo tolerance. The modes accept it, and the reveal
 *   points out the slip so the right spelling registers.
 * - `wrong`: anything else, including an empty guess.
 */
export type AnswerGrade = 'exact' | 'near' | 'wrong';

export function gradeAnswer(guess: string, target: string): AnswerGrade {
  const g = normalizeAnswer(guess);
  const t = normalizeAnswer(target);
  if (g === '' || t === '') return 'wrong';
  if (g === t) return 'exact';
  return levenshtein(g, t) <= typoTolerance(t) ? 'near' : 'wrong';
}

/**
 * True when `guess` matches `target` exactly or within the typo tolerance.
 * Used by cloze and production modes. Never accepts an empty guess.
 */
export function isNearMatch(guess: string, target: string): boolean {
  return gradeAnswer(guess, target) !== 'wrong';
}

/**
 * Blank the cloze target inside a sentence, matching the whole word
 * case-insensitively. Falls back to appending a blank if the target is not
 * found (keeps the game playable rather than crashing).
 */
export function makeClozeBlank(sentence: string, target: string, blank = '_____'): string {
  const t = target.trim();
  if (t === '') return sentence;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`\\b${escaped}\\b`, 'i');
  if (re.test(sentence)) return sentence.replace(re, blank);
  // Try a looser match on the stem (handles inflections like -s, -ed, -ing).
  const stem = t.replace(/(ing|ed|es|s)$/i, '');
  if (stem.length >= 3) {
    const stemRe = new RegExp(`\\b${stem}\\w*\\b`, 'i');
    if (stemRe.test(sentence)) return sentence.replace(stemRe, blank);
  }
  return `${sentence} (${blank})`;
}
