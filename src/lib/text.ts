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

/**
 * The indefinite article written right before the first whole-word `target`
 * in `sentence` ("an" in "an aberrant heartbeat"), or null when there is none.
 * A choice of words for a blank must all take that article, or the article
 * gives the answer away.
 */
export function articleBefore(sentence: string, target: string): 'a' | 'an' | null {
  const t = target.trim();
  if (t === '') return null;
  const escaped = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`\\b${escaped}\\b`, 'i').exec(sentence);
  if (!match) return null;
  const before = /\b(an?)\s+$/i.exec(sentence.slice(0, match.index));
  return before ? (before[1]!.toLowerCase() as 'a' | 'an') : null;
}

// IPA symbols that start with a vowel sound. "j" and "w" are consonants, so
// "a eulogy" (/ˈjulədʒi/) and "a one" come out right.
const IPA_VOWEL = /^[aeiouæɑɒɐəɚɛɜɝɪɔʊʌɨʉyøœɘɵɤ]/;

/**
 * "a" or "an" for a word, decided by its first sound. Uses the IPA when there
 * is one, which gets "an hour" and "a unique" right, and the first letter
 * otherwise.
 */
export function indefiniteArticle(word: string, ipa: string | null = null): 'a' | 'an' {
  const sound = (ipa ?? '').replace(/^[\s/[ˈˌ']+/, '');
  if (sound !== '') return IPA_VOWEL.test(sound) ? 'an' : 'a';
  return /^[aeiou]/i.test(word.trim()) ? 'an' : 'a';
}

/**
 * Letters the typed modes show before any hint: the first one. It is part of
 * the question, so it costs nothing; recalling a word from its meaning alone
 * proved too hard.
 */
export const FREE_LETTERS = 1;

/**
 * Letters shown once the hint is used: about a third of the word, at least one
 * more than the free first letter, and never the whole word.
 */
export function hintLetters(target: string): number {
  const n = [...target.trim()].length;
  const third = Math.max(FREE_LETTERS + 1, Math.ceil(n / 3));
  return Math.max(FREE_LETTERS, Math.min(third, n - 1));
}

/** One place in a word's outline. */
export interface LetterSlot {
  /** The character to show, or null for a blank the user has to recall. */
  char: string | null;
  /** True for a letter (shown or blank); false for a space or a hyphen. */
  letter: boolean;
}

/**
 * The outline of a word: its first `shown` letters, then a blank for each
 * letter left. Anything that is not a letter (a space, a hyphen) is shown as
 * it is, so a two-word answer reads as two words.
 */
export function letterSlots(target: string, shown: number): LetterSlot[] {
  return [...target.trim().toLowerCase()].map((c, i) => {
    const letter = /\p{L}/u.test(c);
    return { char: i < shown || !letter ? c : null, letter };
  });
}

/** How many letters a word has, for the outline's spoken label. */
export function letterCount(target: string): number {
  return [...target].filter((c) => /\p{L}/u.test(c)).length;
}
