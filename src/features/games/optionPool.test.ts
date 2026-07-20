import {
  buildOptionPool,
  buildOptions,
  mulberry32,
  pickDefinitionDistractors,
  pickWordDistractors,
  shuffle,
} from './optionPool';
import type { SessionItem, WordContent, SenseContent } from '@/lib/types';

function word(id: number, headword: string, def: string, distractors: string[]): WordContent {
  const sense: SenseContent = {
    senseId: id * 100,
    definition: def,
    plainLanguageDefinition: def,
    senseOrder: 1,
    register: null,
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
