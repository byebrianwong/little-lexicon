import type { RelationContent, SenseContent, WordContent } from './types';
import {
  alsoMeansLines,
  EXTRA_LINES,
  hasLine,
  linesToShow,
  OPPOSITE_MAX,
  relationsToShow,
  sameRootWords,
  SIMILAR_MAX,
  toneOf,
  watchOutOf,
  wordExtras,
} from './wordExtras';

function sense(senseId: number, overrides: Partial<SenseContent> = {}): SenseContent {
  return {
    senseId,
    definition: `Dictionary meaning ${senseId}.`,
    plainLanguageDefinition: `Plain meaning ${senseId}.`,
    senseOrder: senseId,
    register: null,
    alsoMeans: false,
    audioUrl: null,
    examples: [],
    distractors: [],
    ...overrides,
  };
}

function word(
  wordId: number,
  headword: string,
  overrides: Partial<WordContent> = {},
): WordContent {
  return {
    wordId,
    headword,
    partOfSpeech: 'adjective',
    ipa: null,
    syllables: null,
    difficultyTier: 3,
    frequencyRank: null,
    etymology: null,
    roots: [],
    watchOut: null,
    pairings: [],
    audioUrl: null,
    hookAudioUrl: null,
    senses: [sense(wordId * 10 + 1)],
    relations: [],
    mnemonics: [],
    ...overrides,
  };
}

const syn = (relatedLemma: string): RelationContent => ({ relatedLemma, relationType: 'synonym' });
const ant = (relatedLemma: string): RelationContent => ({ relatedLemma, relationType: 'antonym' });

describe('relationsToShow', () => {
  const abate = word(1, 'abate', {
    relations: [
      syn('subside'),
      syn('wane'),
      ant('intensify'),
      syn('ebb'),
      syn('diminish'),
      syn('lessen'),
      syn('let up'),
      ant('escalate'),
      ant('worsen'),
    ],
  });

  it('shows the first few synonyms and antonyms in the order the content gives', () => {
    expect(relationsToShow(abate)).toEqual({
      similar: ['subside', 'wane', 'ebb'],
      opposite: ['intensify', 'escalate'],
    });
  });

  it('keeps to the limits', () => {
    const shown = relationsToShow(abate);
    expect(shown.similar).toHaveLength(SIMILAR_MAX);
    expect(shown.opposite).toHaveLength(OPPOSITE_MAX);
    expect(relationsToShow(abate, { similar: 1, opposite: 0 })).toEqual({
      similar: ['subside'],
      opposite: [],
    });
  });

  it('shows fewer when the word has fewer, and none when it has none', () => {
    expect(relationsToShow(word(2, 'aloof', { relations: [syn('distant')] }))).toEqual({
      similar: ['distant'],
      opposite: [],
    });
    expect(relationsToShow(word(3, 'quixotic'))).toEqual({ similar: [], opposite: [] });
  });

  it('skips blanks, repeats in any case, and the word itself', () => {
    const messy = word(4, 'Laconic', {
      relations: [
        syn(' terse '),
        syn('Terse'),
        syn(''),
        syn('laconic'),
        syn('curt'),
        ant('verbose'),
        ant('VERBOSE'),
      ],
    });
    expect(relationsToShow(messy)).toEqual({ similar: ['terse', 'curt'], opposite: ['verbose'] });
  });

  it('ignores hypernyms and hyponyms', () => {
    const w = word(5, 'abate', {
      relations: [{ relatedLemma: 'change', relationType: 'hypernym' }, syn('wane')],
    });
    expect(relationsToShow(w)).toEqual({ similar: ['wane'], opposite: [] });
  });
});

describe('sameRootWords', () => {
  const prolific = word(1, 'prolific', { roots: ['proles', 'facere'] });
  const proliferate = word(2, 'proliferate', { roots: ['proles', 'ferre'] });
  const efficacious = word(3, 'efficacious', { roots: ['facere'] });
  const eloquent = word(4, 'eloquent', { roots: ['loqui'] });
  const plain = word(5, 'abate');
  const proletarian = word(6, 'proletarian', { roots: ['proles', 'facere'] });
  const all = [prolific, proliferate, efficacious, eloquent, plain, proletarian];

  it('finds the other words that share a root, never the word itself', () => {
    expect(sameRootWords(proliferate, all)).toEqual([
      { wordId: 1, headword: 'prolific' },
      { wordId: 6, headword: 'proletarian' },
    ]);
  });

  it('puts words sharing more roots first, then keeps the collection order', () => {
    expect(sameRootWords(prolific, all).map((w) => w.headword)).toEqual([
      'proletarian', // proles and facere
      'proliferate', // proles
      'efficacious', // facere
    ]);
  });

  it('finds nothing for a word with no roots', () => {
    expect(sameRootWords(plain, all)).toEqual([]);
    expect(sameRootWords(word(7, 'odd', { roots: [' '] }), all)).toEqual([]);
  });

  it('finds nothing for a root no other word has', () => {
    expect(sameRootWords(eloquent, all)).toEqual([]);
  });

  it('matches roots without regard to case or stray spaces', () => {
    const loquacious = word(8, 'loquacious', { roots: [' Loqui'] });
    expect(sameRootWords(loquacious, [...all, loquacious])).toEqual([
      { wordId: 4, headword: 'eloquent' },
    ]);
  });

  it('lists a word once even if the collection repeats it, and keeps to the limit', () => {
    expect(sameRootWords(prolific, [...all, proliferate], 2).map((w) => w.headword)).toEqual([
      'proletarian',
      'proliferate',
    ]);
    expect(sameRootWords(prolific, all, 0)).toEqual([]);
  });

  it('is empty against an empty collection', () => {
    expect(sameRootWords(prolific, [])).toEqual([]);
  });
});

describe('alsoMeansLines', () => {
  it('shows later senses marked alsoMeans, with their plain definition and tone', () => {
    const insular = word(1, 'insular', {
      senses: [
        sense(11),
        sense(12, { alsoMeans: true, plainLanguageDefinition: 'Relating to islands.' }),
        sense(13),
        sense(14, {
          alsoMeans: true,
          register: 'technical',
          plainLanguageDefinition: ' Relating to a part of the brain. ',
        }),
      ],
    });
    expect(alsoMeansLines(insular)).toEqual([
      { senseId: 12, text: 'Relating to islands.', tone: null },
      { senseId: 14, text: 'Relating to a part of the brain.', tone: 'technical' },
    ]);
  });

  it('never shows the first sense, which the screen already shows', () => {
    const w = word(2, 'odd', { senses: [sense(21, { alsoMeans: true })] });
    expect(alsoMeansLines(w)).toEqual([]);
  });

  it('skips a marked sense with no plain definition', () => {
    const w = word(3, 'odd', {
      senses: [
        sense(31),
        sense(32, { alsoMeans: true, plainLanguageDefinition: null }),
        sense(33, { alsoMeans: true, plainLanguageDefinition: '  ' }),
      ],
    });
    expect(alsoMeansLines(w)).toEqual([]);
  });

  it('shows at most two', () => {
    const w = word(4, 'odd', {
      senses: [sense(41), ...[42, 43, 44].map((id) => sense(id, { alsoMeans: true }))],
    });
    expect(alsoMeansLines(w).map((l) => l.senseId)).toEqual([42, 43]);
  });

  it('is empty for a word with one sense or none', () => {
    expect(alsoMeansLines(word(5, 'abate'))).toEqual([]);
    expect(alsoMeansLines(word(6, 'odd', { senses: [] }))).toEqual([]);
  });
});

describe('toneOf and watchOutOf', () => {
  it('reads the first sense tone, or null', () => {
    const sycophant = word(1, 'sycophant', {
      senses: [sense(11, { register: 'disapproving' }), sense(12, { register: 'formal' })],
    });
    expect(toneOf(sycophant)).toBe('disapproving');
    expect(toneOf(word(2, 'abate'))).toBeNull();
    expect(toneOf(word(3, 'odd', { senses: [] }))).toBeNull();
  });

  it('trims the note, and treats a blank one as none', () => {
    expect(watchOutOf({ watchOut: ' It does not mean energize. ' })).toBe(
      'It does not mean energize.',
    );
    expect(watchOutOf({ watchOut: '' })).toBeNull();
    expect(watchOutOf({ watchOut: null })).toBeNull();
  });
});

describe('wordExtras', () => {
  const eloquent = word(1, 'eloquent', { roots: ['loqui'] });
  const loquacious = word(2, 'loquacious', {
    etymology: 'From Latin loquax, talkative, from loqui, to speak.',
    roots: ['loqui'],
    watchOut: 'It means talking a lot, not talking well.',
    pairings: ['loquacious guide', ' ', 'became loquacious', 'loquacious guide'],
    senses: [
      sense(21, { register: 'formal' }),
      sense(22, {
        alsoMeans: true,
        register: 'literary',
        plainLanguageDefinition: 'Of birds or water: chattering.',
      }),
    ],
    relations: [syn('talkative'), syn('garrulous'), ant('taciturn')],
  });

  it('gathers every line for a word that has them all', () => {
    expect(wordExtras(loquacious, [eloquent, loquacious])).toEqual({
      tone: 'formal',
      watchOut: 'It means talking a lot, not talking well.',
      similar: ['talkative', 'garrulous'],
      opposite: ['taciturn'],
      alsoMeans: [{ senseId: 22, text: 'Of birds or water: chattering.', tone: 'literary' }],
      pairings: ['loquacious guide', 'became loquacious'],
      origin: 'From Latin loquax, talkative, from loqui, to speak.',
      sameRoot: [{ wordId: 1, headword: 'eloquent' }],
    });
  });

  it('is empty throughout for a word with no extras', () => {
    const extras = wordExtras(word(3, 'abate', { etymology: '  ' }), [eloquent]);
    expect(extras).toEqual({
      tone: null,
      watchOut: null,
      similar: [],
      opposite: [],
      alsoMeans: [],
      pairings: [],
      origin: null,
      sameRoot: [],
    });
    expect(EXTRA_LINES.some((line) => hasLine(extras, line))).toBe(false);
  });

  it('has no same-root words without a collection to search', () => {
    expect(wordExtras(loquacious).sameRoot).toEqual([]);
  });
});

describe('linesToShow', () => {
  const extras = wordExtras(
    word(1, 'abate', {
      etymology: 'From Old French abatre, to beat down.',
      relations: [syn('wane')],
      pairings: ['fever abates', 'the storm abated'],
    }),
  );

  it('keeps the asked-for lines that have content, in display order', () => {
    expect(linesToShow(extras, ['origin', 'opposite', 'similar', 'pairings'])).toEqual([
      'similar',
      'pairings',
      'origin',
    ]);
  });

  it('is empty when none of the asked-for lines has content', () => {
    expect(linesToShow(extras, ['alsoMeans', 'sameRoot', 'opposite'])).toEqual([]);
    expect(linesToShow(extras, [])).toEqual([]);
  });
});
