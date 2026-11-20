import type { RelationContent, WordContent } from '@/lib/types';
import {
  buildSearchIndex,
  editDistance,
  matchNote,
  normalize,
  searchWords,
  stem,
  wordNamed,
  type SearchMatch,
} from './wordSearch';

function word(
  wordId: number,
  headword: string,
  {
    definition = `the meaning of ${headword}`,
    plain = null,
    similar = [],
    opposite = [],
    roots = [],
  }: {
    definition?: string;
    plain?: string | null;
    similar?: string[];
    opposite?: string[];
    roots?: string[];
  } = {},
): WordContent {
  const relations: RelationContent[] = [
    ...similar.map((l) => ({ relatedLemma: l, relationType: 'synonym' as const })),
    ...opposite.map((l) => ({ relatedLemma: l, relationType: 'antonym' as const })),
  ];
  return {
    wordId,
    headword,
    partOfSpeech: null,
    ipa: null,
    syllables: null,
    difficultyTier: 1,
    frequencyRank: null,
    etymology: null,
    roots,
    watchOut: null,
    pairings: [],
    audioUrl: null,
    hookAudioUrl: null,
    senses: [
      {
        senseId: wordId,
        definition,
        plainLanguageDefinition: plain,
        senseOrder: 1,
        register: null,
        alsoMeans: false,
        audioUrl: null,
        examples: [],
        distractors: [],
      },
    ],
    relations,
    mnemonics: [],
  };
}

const WORDS = [
  word(1, 'abate', {
    definition: 'Ease off from a fierce or troubling level.',
    plain: 'To calm down after being at its worst.',
    similar: ['subside', 'diminish', 'lessen', 'let up'],
    opposite: ['intensify', 'escalate'],
  }),
  word(2, 'mitigate', {
    definition: 'Make something bad less severe.',
    similar: ['alleviate', 'lessen'],
    opposite: ['aggravate', 'exacerbate'],
  }),
  word(3, 'alleviate', { definition: 'Make suffering easier to bear.', similar: ['ease'] }),
  word(4, 'exacerbate', { definition: 'Make a bad thing worse.', similar: ['aggravate'] }),
  word(5, 'loquacious', {
    definition: 'Tending to talk a great deal.',
    similar: ['talkative', 'chatty'],
    opposite: ['laconic', 'taciturn'],
    roots: ['loqui'],
  }),
  word(6, 'laconic', {
    definition: 'Using very few words.',
    similar: ['terse'],
    opposite: ['verbose'],
  }),
  word(7, 'eloquent', { definition: 'Fluent and persuasive in speech.', roots: ['loqui'] }),
  word(8, 'obsequious', { definition: 'Too eager to please or obey.', similar: ['servile'] }),
  word(9, 'naïve', { definition: 'Lacking experience of life.', similar: ['credulous'] }),
  word(10, 'yes-man', { definition: 'A person who always agrees with a superior.' }),
];

const INDEX = buildSearchIndex(WORDS);

function results(query: string): [string, SearchMatch][] {
  return searchWords(INDEX, query).map((h) => [h.word.headword, h.match]);
}

function headwords(query: string): string[] {
  return searchWords(INDEX, query).map((h) => h.word.headword);
}

describe('normalize', () => {
  it('lowercases, drops accents and apostrophes, and turns punctuation into single spaces', () => {
    expect(normalize('  Naïve ')).toBe('naive');
    expect(normalize('yes-man')).toBe('yes man');
    expect(normalize("one's   own, too")).toBe('ones own too');
  });
});

describe('stem', () => {
  it('gives forms of a word the same stem', () => {
    for (const form of ['abate', 'abates', 'abated', 'abating']) expect(stem(form)).toBe('abat');
    expect(stem('pacified')).toBe(stem('pacify'));
    expect(stem('pacifies')).toBe(stem('pacify'));
    expect(stem('eloquently')).toBe(stem('eloquent'));
    expect(stem('calmness')).toBe(stem('calm'));
    expect(stem('diminishes')).toBe(stem('diminish'));
  });

  it('leaves words that only look like plurals alone', () => {
    expect(stem('callous')).toBe('callous');
    expect(stem('glass')).toBe('glass');
    expect(stem('analysis')).toBe('analysis');
  });

  it('never cuts a word below three letters', () => {
    expect(stem('need')).toBe('need');
    expect(stem('being')).toBe('being');
  });
});

describe('editDistance', () => {
  it('counts adds, drops, changes and swaps of neighbours', () => {
    expect(editDistance('abate', 'abate', 2)).toBe(0);
    expect(editDistance('abate', 'abates', 2)).toBe(1);
    expect(editDistance('abate', 'abte', 2)).toBe(1);
    expect(editDistance('abate', 'abase', 2)).toBe(1);
    expect(editDistance('abate', 'abtae', 2)).toBe(1);
  });

  it('stops at max + 1', () => {
    expect(editDistance('abate', 'mitigate', 2)).toBe(3);
    expect(editDistance('abate', 'xyzzy', 1)).toBe(2);
  });
});

describe('searchWords', () => {
  it('returns every word in order for an empty search', () => {
    expect(headwords('   ')).toEqual(WORDS.map((w) => w.headword));
  });

  it('puts the headword first, then the words near it', () => {
    expect(results('mitigate')).toEqual([
      ['mitigate', { kind: 'headword' }],
      // mitigate lists both as synonym and antonym, and they are in the collection.
      ['alleviate', { kind: 'similar', word: 'mitigate' }],
      ['exacerbate', { kind: 'opposite', word: 'mitigate' }],
      // abate also lists "lessen".
      ['abate', { kind: 'similar', word: 'lessen' }],
    ]);
  });

  it('finds a word from another form of it', () => {
    expect(results('abated')[0]).toEqual(['abate', { kind: 'headword' }]);
    expect(headwords('Abating')[0]).toBe('abate');
  });

  it('matches headwords that start with or contain the search', () => {
    expect(headwords('lo')).toEqual(['loquacious', 'eloquent']);
    expect(headwords('a')).toEqual(['abate', 'alleviate']);
  });

  it('finds the words that list the search as a synonym, closest first', () => {
    expect(results('lessen')).toEqual([
      ['mitigate', { kind: 'similar', word: 'lessen' }],
      ['abate', { kind: 'similar', word: 'lessen' }],
    ]);
    expect(results('let up')).toEqual([['abate', { kind: 'similar', word: 'let up' }]]);
  });

  it('finds the words that list the search as an antonym', () => {
    expect(results('escalate')).toEqual([['abate', { kind: 'opposite', word: 'escalate' }]]);
  });

  it('matches a synonym or antonym given in another form', () => {
    expect(results('escalating')).toEqual([['abate', { kind: 'opposite', word: 'escalate' }]]);
  });

  it('lists the antonyms and synonyms of a word in the collection, both ways', () => {
    // loquacious lists laconic as an antonym; laconic lists neither back.
    expect(results('laconic')).toEqual([
      ['laconic', { kind: 'headword' }],
      ['loquacious', { kind: 'opposite', word: 'laconic' }],
    ]);
  });

  it('finds words from the same root as a word in the collection', () => {
    expect(results('eloquent')).toEqual([
      ['eloquent', { kind: 'headword' }],
      ['loquacious', { kind: 'sameRoot', word: 'eloquent' }],
    ]);
  });

  it('finds a word from a typo', () => {
    expect(results('obsequios')).toEqual([['obsequious', { kind: 'spelling' }]]);
    expect(results('mitgate')[0]).toEqual(['mitigate', { kind: 'spelling' }]);
  });

  it('does not guess at spelling for searches under four letters', () => {
    expect(headwords('aba')).toEqual(['abate']);
  });

  it('finds a word whose definition uses the search, in any form', () => {
    expect(results('calm')).toEqual([['abate', { kind: 'meaning', word: 'calm' }]]);
    expect(results('talks')).toContainEqual(['loquacious', { kind: 'meaning', word: 'talk' }]);
    expect(results('please or obey')).toEqual([
      ['obsequious', { kind: 'meaning', word: 'please or obey' }],
    ]);
  });

  it('matches the start of synonyms, antonyms and definition words while typing', () => {
    expect(results('dimin')).toEqual([['abate', { kind: 'similar', word: 'diminish' }]]);
    expect(results('suffer')).toEqual([['alleviate', { kind: 'meaning', word: 'suffering' }]]);
  });

  it('puts a synonym ahead of a definition that only mentions the word', () => {
    expect(headwords('talkative')).toEqual(['loquacious']);
    expect(results('ease')).toEqual([
      ['alleviate', { kind: 'similar', word: 'ease' }],
      ['abate', { kind: 'meaning', word: 'ease' }],
    ]);
  });

  it('skips common words when searching definitions', () => {
    expect(headwords('the')).toEqual([]);
    expect(headwords('with')).toEqual([]);
  });

  it('lists each word once, under its best match', () => {
    const hits = headwords('ab');
    expect(new Set(hits).size).toBe(hits.length);
    // "aggravate" is both mitigate's antonym and exacerbate's synonym.
    expect(results('aggravate')).toEqual([
      ['exacerbate', { kind: 'similar', word: 'aggravate' }],
      ['mitigate', { kind: 'opposite', word: 'aggravate' }],
    ]);
  });

  it('ignores accents and punctuation', () => {
    expect(headwords('naive')).toEqual(['naïve']);
    expect(headwords('yes man')).toEqual(['yes-man']);
  });
});

describe('wordNamed', () => {
  it('finds a word in the collection by its spelling', () => {
    expect(wordNamed(INDEX, ' Laconic ')?.wordId).toBe(6);
    expect(wordNamed(INDEX, 'lessen')).toBeUndefined();
  });
});

describe('matchNote', () => {
  it('says why a word matched, except for its own headword', () => {
    expect(matchNote({ kind: 'headword' })).toBeNull();
    expect(matchNote({ kind: 'spelling' })).toEqual({ label: 'Close spelling', word: null });
    expect(matchNote({ kind: 'similar', word: 'lessen' })).toEqual({
      label: 'Similar to',
      word: 'lessen',
    });
    expect(matchNote({ kind: 'opposite', word: 'escalate' })?.label).toBe('Opposite of');
    expect(matchNote({ kind: 'sameRoot', word: 'eloquent' })?.label).toBe('Same root as');
    expect(matchNote({ kind: 'meaning', word: 'calm' })?.label).toBe('Meaning mentions');
  });
});
