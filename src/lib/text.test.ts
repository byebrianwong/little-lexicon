import {
  normalizeAnswer,
  levenshtein,
  typoTolerance,
  gradeAnswer,
  isNearMatch,
  makeClozeBlank,
  FREE_LETTERS,
  hintLetters,
  letterSlots,
  letterCount,
} from './text';

describe('normalizeAnswer', () => {
  it('lowercases, trims, and strips surrounding punctuation', () => {
    expect(normalizeAnswer('  Ephemeral! ')).toBe('ephemeral');
    expect(normalizeAnswer('"quixotic"')).toBe('quixotic');
    expect(normalizeAnswer('a   b')).toBe('a b');
  });
});

describe('levenshtein', () => {
  it('is zero for equal strings', () => {
    expect(levenshtein('word', 'word')).toBe(0);
  });
  it('counts single edits', () => {
    expect(levenshtein('word', 'ward')).toBe(1);
    expect(levenshtein('word', 'words')).toBe(1);
    expect(levenshtein('word', 'ord')).toBe(1);
  });
  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3);
    expect(levenshtein('abc', '')).toBe(3);
  });
});

describe('typoTolerance', () => {
  it('is strict for short words and lenient for long words', () => {
    expect(typoTolerance('cat')).toBe(0);
    expect(typoTolerance('lucid')).toBe(1);
    expect(typoTolerance('ephemeral')).toBe(2);
  });
});

describe('gradeAnswer', () => {
  it('grades an exact match, ignoring case and surrounding punctuation', () => {
    expect(gradeAnswer('Ephemeral', 'ephemeral')).toBe('exact');
    expect(gradeAnswer(' "lucid" ', 'lucid')).toBe('exact');
  });
  it('grades a typo within tolerance as near', () => {
    expect(gradeAnswer('ephimeral', 'ephemeral')).toBe('near'); // 1 edit, tol 2
    expect(gradeAnswer('lucyd', 'lucid')).toBe('near'); // 1 edit, tol 1
  });
  it('grades a different word as wrong', () => {
    expect(gradeAnswer('opaque', 'ephemeral')).toBe('wrong');
    expect(gradeAnswer('bat', 'cat')).toBe('wrong'); // short word, tol 0
  });
  it('grades an empty guess as wrong', () => {
    expect(gradeAnswer('', 'cat')).toBe('wrong');
    expect(gradeAnswer('   ', 'cat')).toBe('wrong');
  });
});

describe('isNearMatch', () => {
  it('accepts exact matches', () => {
    expect(isNearMatch('Ephemeral', 'ephemeral')).toBe(true);
  });
  it('accepts near-miss typos within tolerance', () => {
    expect(isNearMatch('ephimeral', 'ephemeral')).toBe(true); // 1 edit, tol 2
    expect(isNearMatch('lucyd', 'lucid')).toBe(true); // 1 edit, tol 1
  });
  it('rejects wrong words beyond tolerance', () => {
    expect(isNearMatch('opaque', 'ephemeral')).toBe(false);
    expect(isNearMatch('bat', 'cat')).toBe(false); // short word, tol 0
  });
  it('rejects empty guesses', () => {
    expect(isNearMatch('', 'cat')).toBe(false);
    expect(isNearMatch('   ', 'cat')).toBe(false);
  });
});

describe('makeClozeBlank', () => {
  it('blanks the target word case-insensitively', () => {
    expect(makeClozeBlank('The Ephemeral bloom faded.', 'ephemeral')).toBe(
      'The _____ bloom faded.',
    );
  });
  it('matches an inflected form via the stem', () => {
    expect(makeClozeBlank('She was equivocating again.', 'equivocate')).toContain('_____');
  });
  it('appends a blank when the target is absent', () => {
    expect(makeClozeBlank('No match here.', 'zzz')).toBe('No match here. (_____)');
  });
});

describe('hintLetters', () => {
  it('shows about a third of the word', () => {
    expect(hintLetters('ephemeral')).toBe(3);
    expect(hintLetters('obfuscate')).toBe(3);
    expect(hintLetters('laconic')).toBe(3);
    expect(hintLetters('abate')).toBe(2);
  });
  it('always shows more than the free first letter', () => {
    expect(hintLetters('vex')).toBe(FREE_LETTERS + 1);
    expect(hintLetters('aver')).toBe(FREE_LETTERS + 1);
  });
  it('never shows the whole word', () => {
    expect(hintLetters('ox')).toBe(1);
  });
});

describe('letterSlots', () => {
  // Shorthand: shown characters as themselves, blanks as "_".
  const outline = (target: string, shown: number) =>
    letterSlots(target, shown)
      .map((s) => s.char ?? '_')
      .join('');

  it('shows the first letters and a blank for each one left', () => {
    expect(outline('ephemeral', 1)).toBe('e________');
    expect(outline('ephemeral', 3)).toBe('eph______');
  });
  it('lowercases a target taken from the start of a sentence', () => {
    expect(outline('Abated', 1)).toBe('a_____');
  });
  it('keeps spaces and hyphens visible and marks them as not letters', () => {
    expect(outline('ad hoc', 1)).toBe('a_ ___');
    expect(outline('well-read', 2)).toBe('we__-____');
    expect(letterSlots('ad hoc', 1)[2]).toEqual({ char: ' ', letter: false });
  });
});

describe('letterCount', () => {
  it('counts letters only', () => {
    expect(letterCount('ephemeral')).toBe(9);
    expect(letterCount('well-read')).toBe(8);
  });
});
