import {
  normalizeAnswer,
  levenshtein,
  typoTolerance,
  isNearMatch,
  makeClozeBlank,
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
