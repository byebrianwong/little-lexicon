import type { WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import {
  activeFilterCount,
  filterWords,
  NO_FILTERS,
  partsOfSpeech,
  searchForWord,
  toggleTier,
  type FilterContext,
} from './wordFilters';

function word(
  wordId: number,
  headword: string,
  difficultyTier: number,
  partOfSpeech: string | null,
  definition = `the meaning of ${headword}`,
): WordContent {
  return {
    wordId,
    headword,
    partOfSpeech,
    ipa: null,
    syllables: null,
    difficultyTier,
    frequencyRank: null,
    etymology: null,
    roots: [],
    watchOut: null,
    pairings: [],
    audioUrl: null,
    hookAudioUrl: null,
    senses: [
      {
        senseId: wordId,
        definition,
        plainLanguageDefinition: null,
        senseOrder: 1,
        register: null,
        alsoMeans: false,
        audioUrl: null,
        examples: [],
        distractors: [],
      },
    ],
    relations: [],
    mnemonics: [],
  };
}

function tracker(wordId: number, status: WordTracker['status']): WordTracker {
  return {
    wordId,
    status,
    cleanDays: 0,
    answeredRecently: 1,
    mistakeRecently: false,
    latestRight: 1,
    latestCount: 1,
    lastAnsweredAt: '2026-10-20T00:00:00.000Z',
  };
}

const WORDS = [
  word(1, 'ambiguous', 1, 'adjective'),
  word(2, 'placate', 3, 'verb', 'to make someone less angry'),
  word(3, 'erudite', 3, 'adjective'),
  word(4, 'plethora', 4, 'noun'),
  word(5, 'quotidian', 5, 'adjective'),
];

const CTX: FilterContext = {
  savedIds: new Set([2, 5]),
  trackers: new Map([
    [2, tracker(2, 'learning')],
    [3, tracker(3, 'known')],
  ]),
};

const ids = (words: WordContent[]) => words.map((w) => w.wordId);

describe('filterWords', () => {
  it('shows every word with no search and no filters', () => {
    expect(ids(filterWords(WORDS, '', NO_FILTERS, CTX))).toEqual([1, 2, 3, 4, 5]);
  });

  it('searches headwords and definitions, ignoring case and spaces', () => {
    expect(ids(filterWords(WORDS, '  PLA ', NO_FILTERS, CTX))).toEqual([2]);
    expect(ids(filterWords(WORDS, 'angry', NO_FILTERS, CTX))).toEqual([2]);
  });

  it('shows any of the chosen tiers', () => {
    expect(ids(filterWords(WORDS, '', { ...NO_FILTERS, tiers: [3, 5] }, CTX))).toEqual([
      2, 3, 5,
    ]);
  });

  it('filters by status', () => {
    const by = (status: (typeof NO_FILTERS)['status']) =>
      ids(filterWords(WORDS, '', { ...NO_FILTERS, status }, CTX));
    expect(by('saved')).toEqual([2, 5]);
    expect(by('learning')).toEqual([2]);
    expect(by('known')).toEqual([3]);
    expect(by('untested')).toEqual([1, 4, 5]);
  });

  it('filters by part of speech', () => {
    expect(
      ids(filterWords(WORDS, '', { ...NO_FILTERS, partOfSpeech: 'adjective' }, CTX)),
    ).toEqual([1, 3, 5]);
  });

  it('needs every filter that is on to match', () => {
    const filters = {
      tiers: [3, 4, 5],
      status: 'saved' as const,
      partOfSpeech: 'adjective',
    };
    expect(ids(filterWords(WORDS, '', filters, CTX))).toEqual([5]);
    expect(ids(filterWords(WORDS, 'erudite', filters, CTX))).toEqual([]);
  });
});

describe('searchForWord', () => {
  const erudite = WORDS[2]!;

  it('searches for the headword, which lists that word', () => {
    const next = searchForWord(erudite, NO_FILTERS, CTX);
    expect(next.query).toBe('erudite');
    expect(ids(filterWords(WORDS, next.query, next.filters, CTX))).toEqual([3]);
  });

  it('keeps the filters when the word passes them', () => {
    const filters = { tiers: [3], status: 'known' as const, partOfSpeech: 'adjective' };
    expect(searchForWord(erudite, filters, CTX)).toEqual({ query: 'erudite', filters });
  });

  it('clears the filters when one would hide the word', () => {
    for (const filters of [
      { ...NO_FILTERS, tiers: [1, 2] },
      { ...NO_FILTERS, status: 'saved' as const },
      { ...NO_FILTERS, partOfSpeech: 'verb' },
    ]) {
      const next = searchForWord(erudite, filters, CTX);
      expect(next.filters).toEqual(NO_FILTERS);
      expect(ids(filterWords(WORDS, next.query, next.filters, CTX))).toEqual([3]);
    }
  });
});

describe('toggleTier', () => {
  it('turns a tier on and off, keeping the tiers in order', () => {
    const on = toggleTier(toggleTier(NO_FILTERS, 4), 2);
    expect(on.tiers).toEqual([2, 4]);
    expect(toggleTier(on, 4).tiers).toEqual([2]);
  });
});

describe('activeFilterCount', () => {
  it('counts each kind of filter that is on once', () => {
    expect(activeFilterCount(NO_FILTERS)).toBe(0);
    expect(
      activeFilterCount({ tiers: [1, 2], status: 'known', partOfSpeech: null }),
    ).toBe(2);
    expect(activeFilterCount({ tiers: [5], status: 'saved', partOfSpeech: 'noun' })).toBe(
      3,
    );
  });
});

describe('partsOfSpeech', () => {
  it('lists each part of speech once, in order, skipping words without one', () => {
    expect(partsOfSpeech([...WORDS, word(6, 'x', 1, null)])).toEqual([
      'adjective',
      'noun',
      'verb',
    ]);
  });
});
