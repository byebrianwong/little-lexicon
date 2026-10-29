import {
  buildClozeChoice,
  buildOptionPool,
  buildOptions,
  capsForWord,
  clozeChoiceExamples,
  CLOZE_CHOICE_DISTRACTORS,
  mulberry32,
  type ClozeChoice,
  pickDefinitionDistractors,
  pickWordDistractors,
  shuffle,
} from './optionPool';
import type { PartOfSpeech, SessionItem, WordContent, SenseContent } from '@/lib/types';

function word(id: number, headword: string, def: string, distractors: string[]): WordContent {
  const sense: SenseContent = {
    senseId: id * 100,
    definition: def,
    plainLanguageDefinition: def,
    senseOrder: 1,
    register: null,
    audioUrl: null,
    examples: [{ exampleId: id * 1000, text: `${headword} used here.`, audioUrl: null, clozeTarget: headword }],
    distractors: distractors.map((d) => ({ lemma: d, kind: 'mc', difficulty: 3 })),
  };
  return {
    wordId: id,
    headword,
    partOfSpeech: 'adjective',
    ipa: null,
    syllables: null,
    difficultyTier: 3,
    frequencyRank: id,
    etymology: null,
    audioUrl: null,
    senses: [sense],
    relations: [{ relatedLemma: `syn${id}`, relationType: 'synonym' }],
    mnemonics: [],
  };
}

const items: SessionItem[] = [
  { content: word(1, 'ephemeral', 'lasting a short time', ['lasting forever', 'very loud']), state: null, isNew: true },
  { content: word(2, 'laconic', 'using few words', ['using many words', 'about lakes']), state: null, isNew: true },
  { content: word(3, 'ubiquitous', 'found everywhere', ['very rare', 'underwater']), state: null, isNew: true },
  { content: word(4, 'pragmatic', 'practical', ['idealistic', 'nervous']), state: null, isNew: true },
];

const pool = buildOptionPool(items);

describe('mulberry32 + shuffle', () => {
  it('is deterministic for the same seed', () => {
    const a = shuffle([1, 2, 3, 4, 5], mulberry32(42));
    const b = shuffle([1, 2, 3, 4, 5], mulberry32(42));
    expect(a).toEqual(b);
  });
});

describe('pickWordDistractors', () => {
  it('returns other headwords, never the current word', () => {
    const d = pickWordDistractors(pool, 1, 3, mulberry32(1));
    expect(d).toHaveLength(3);
    expect(d).not.toContain('ephemeral');
  });
});

describe('pickDefinitionDistractors', () => {
  it("prefers the sense's own distractors", () => {
    const sense = items[0]!.content.senses[0]!;
    const d = pickDefinitionDistractors(sense, pool, 1, 3, mulberry32(1));
    expect(d).toContain('lasting forever');
    expect(d).not.toContain('lasting a short time');
  });

  it('falls back to the pool when a sense lacks enough distractors', () => {
    const thin: SenseContent = { ...items[0]!.content.senses[0]!, distractors: [] };
    const d = pickDefinitionDistractors(thin, pool, 1, 3, mulberry32(2));
    expect(d).toHaveLength(3);
    expect(d).not.toContain('lasting a short time');
  });
});

describe('buildOptions', () => {
  it('includes exactly one correct option', () => {
    const opts = buildOptions('right', ['wrong1', 'wrong2', 'wrong3'], mulberry32(9));
    expect(opts).toHaveLength(4);
    expect(opts.filter((o) => o.correct)).toHaveLength(1);
  });
});

// A word for the sentence-choice tests: one sense, the given sentences, with
// the headword as each blank unless a sentence says otherwise.
function clozeWord(
  id: number,
  headword: string,
  pos: PartOfSpeech,
  ipa: string,
  sentences: (string | { text: string; cloze: string })[] = [`It was ${headword}.`],
  relations: string[] = [],
): WordContent {
  return {
    ...word(id, headword, `meaning of ${headword}`, []),
    partOfSpeech: pos,
    ipa,
    senses: [
      {
        senseId: id * 100,
        definition: `meaning of ${headword}`,
        plainLanguageDefinition: null,
        senseOrder: 1,
        register: null,
        audioUrl: null,
        examples: sentences.map((s, i) => ({
          exampleId: id * 1000 + i,
          text: typeof s === 'string' ? s : s.text,
          audioUrl: null,
          clozeTarget: typeof s === 'string' ? headword : s.cloze,
        })),
        distractors: [],
      },
    ],
    relations: relations.map((r) => ({ relatedLemma: r, relationType: 'synonym' })),
  };
}

const asItems = (words: WordContent[]): SessionItem[] =>
  words.map((content) => ({ content, state: null, isNew: false }));

const optionTexts = (choice: ClozeChoice | null): string[] =>
  (choice?.options ?? []).map((o) => o.text).sort();

const abate = clozeWord(
  10,
  'abate',
  'verb',
  '/əˈbeɪt/',
  ['Her fear began to abate.', { text: 'The storm abated by morning.', cloze: 'abated' }],
  ['subside', 'wane'],
);
const otherVerbs = [
  clozeWord(11, 'condone', 'verb', '/kənˈdoʊn/'),
  clozeWord(12, 'portend', 'verb', '/pɔrˈtɛnd/'),
  clozeWord(13, 'jettison', 'verb', '/ˈdʒɛtəsən/'),
];

describe('clozeChoiceExamples', () => {
  it('keeps only sentences whose blank is the headword itself', () => {
    const texts = clozeChoiceExamples(abate).map((e) => e.text);
    expect(texts).toEqual(['Her fear began to abate.']);
  });
});

describe('buildClozeChoice', () => {
  it('offers the word and three wrong words of the same part of speech', () => {
    const adjective = clozeWord(20, 'sanguine', 'adjective', '/ˈsæŋɡwɪn/');
    const pool = buildOptionPool(asItems([abate, ...otherVerbs, adjective]));
    const choice = buildClozeChoice(abate, pool, mulberry32(1))!;
    expect(choice.example.text).toBe('Her fear began to abate.');
    expect(choice.options).toHaveLength(CLOZE_CHOICE_DISTRACTORS + 1);
    expect(choice.options.filter((o) => o.correct).map((o) => o.text)).toEqual(['abate']);
    expect(optionTexts(choice)).toEqual(['abate', 'condone', 'jettison', 'portend']);
  });

  it('leaves out synonyms, words that list the answer, and words sharing a synonym', () => {
    const near = [
      clozeWord(21, 'subside', 'verb', '/səbˈsaɪd/'), // abate lists it
      clozeWord(22, 'lessen', 'verb', '/ˈlɛsən/', undefined, ['abate']), // it lists abate
      clozeWord(23, 'dwindle', 'verb', '/ˈdwɪndəl/', undefined, ['wane']), // shares "wane"
    ];
    const pool = buildOptionPool(asItems([abate, ...near, ...otherVerbs]));
    for (let seed = 0; seed < 20; seed++) {
      const texts = optionTexts(buildClozeChoice(abate, pool, mulberry32(seed)));
      expect(texts).toEqual(['abate', 'condone', 'jettison', 'portend']);
    }
  });

  it('matches "an" before the blank', () => {
    const aberrant = clozeWord(30, 'aberrant', 'adjective', '/æˈbɛrənt/', [
      'The scan showed an aberrant heartbeat.',
    ]);
    const adjectives = [
      clozeWord(31, 'opaque', 'adjective', '/oʊˈpeɪk/'),
      clozeWord(32, 'untoward', 'adjective', '/ənˈtɔrd/'),
      clozeWord(33, 'ebullient', 'adjective', '/ɪˈbʊljənt/'),
      clozeWord(34, 'sanguine', 'adjective', '/ˈsæŋɡwɪn/'),
      clozeWord(35, 'ubiquitous', 'adjective', '/juˈbɪkwɪtəs/'),
    ];
    const pool = buildOptionPool(asItems([aberrant, ...adjectives]));
    const texts = optionTexts(buildClozeChoice(aberrant, pool, mulberry32(4)));
    expect(texts).toEqual(['aberrant', 'ebullient', 'opaque', 'untoward']);
  });

  it('prefers the words being played, then fills from the collection', () => {
    const collection = [
      clozeWord(40, 'beguile', 'verb', '/bɪˈɡaɪl/'),
      clozeWord(41, 'espouse', 'verb', '/ɪˈspaʊz/'),
      clozeWord(42, 'impinge', 'verb', '/ɪmˈpɪndʒ/'),
    ];
    const session = asItems([abate, otherVerbs[0]!]);
    const pool = buildOptionPool(session, [...otherVerbs, ...collection]);
    for (let seed = 0; seed < 20; seed++) {
      const texts = optionTexts(buildClozeChoice(abate, pool, mulberry32(seed)));
      expect(texts).toContain('condone');
      expect(texts).toHaveLength(4);
    }
  });

  it('is null when no sentence has enough wrong words', () => {
    const pool = buildOptionPool(asItems([abate, otherVerbs[0]!, otherVerbs[1]!]));
    expect(buildClozeChoice(abate, pool, mulberry32(1))).toBeNull();
  });

  it('is deterministic for a given seed', () => {
    const pool = buildOptionPool(asItems([abate, ...otherVerbs]));
    expect(buildClozeChoice(abate, pool, mulberry32(3))).toEqual(
      buildClozeChoice(abate, pool, mulberry32(3)),
    );
  });
});

describe('buildOptionPool with a collection', () => {
  it('adds each collection word to the cloze words once, after the session words', () => {
    const pool = buildOptionPool(asItems([abate]), [abate, ...otherVerbs]);
    expect(pool.clozeWords.map((w) => [w.headword, w.inSession])).toEqual([
      ['abate', true],
      ['condone', false],
      ['portend', false],
      ['jettison', false],
    ]);
    // The other modes still draw only from the words being played.
    expect(pool.words.map((w) => w.headword)).toEqual(['abate']);
  });
});

describe('capsForWord', () => {
  it('reports a sentence choice only when one can be built', () => {
    const full = buildOptionPool(asItems([abate, ...otherVerbs]));
    const thin = buildOptionPool(asItems([abate]));
    expect(capsForWord(abate, full).hasClozeChoice).toBe(true);
    expect(capsForWord(abate, thin).hasClozeChoice).toBe(false);
    expect(capsForWord(abate, thin).hasClozeExample).toBe(true);
  });
});
