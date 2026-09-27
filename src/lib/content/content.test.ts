import { buildContentIndex, loadContent, WORDS_FILE_FORMAT, type WordsFile } from './index';
import type { WordContent } from '@/lib/types';

function makeWord(wordId: number, headword: string, tier: number, rank: number | null): WordContent {
  return {
    wordId,
    headword,
    partOfSpeech: 'adjective',
    ipa: null,
    syllables: 3,
    difficultyTier: tier,
    frequencyRank: rank,
    etymology: null,
    audioUrl: null,
    senses: [
      {
        senseId: wordId * 10,
        definition: `Meaning of ${headword}.`,
        plainLanguageDefinition: null,
        senseOrder: 1,
        register: null,
        examples: [],
        distractors: [],
      },
    ],
    relations: [],
    mnemonics: [],
  };
}

describe('buildContentIndex', () => {
  const file: WordsFile = {
    formatVersion: WORDS_FILE_FORMAT,
    attribution: ['credit'],
    words: [
      makeWord(1, 'rare', 5, 900),
      makeWord(2, 'common', 1, 10),
      makeWord(3, 'unranked', 1, null),
      makeWord(4, 'mid', 3, 400),
    ],
  };

  it('orders words easiest first, unranked last within a tier', () => {
    const index = buildContentIndex(file);
    expect(index.words.map((w) => w.headword)).toEqual(['common', 'unranked', 'mid', 'rare']);
  });

  it('looks words up by id and headword', () => {
    const index = buildContentIndex(file);
    expect(index.byId.get(4)?.headword).toBe('mid');
    expect(index.byHeadword.get('rare')?.wordId).toBe(1);
    expect(index.attribution).toEqual(['credit']);
  });

  it('rejects a file in a format it does not know', () => {
    expect(() => buildContentIndex({ ...file, formatVersion: 99 })).toThrow(/format 99/);
  });
});

// Checks on the committed words file itself. The pipeline writes it; these
// make sure what ships is something every screen can use.
describe('the committed words file', () => {
  let words: WordContent[];
  beforeAll(async () => {
    words = (await loadContent()).words;
  });

  it('has hundreds of words', () => {
    expect(words.length).toBeGreaterThanOrEqual(300);
  });

  it('has unique ids and headwords', () => {
    expect(new Set(words.map((w) => w.wordId)).size).toBe(words.length);
    expect(new Set(words.map((w) => w.headword)).size).toBe(words.length);
  });

  it('gives every word a definition, a tier from 1 to 5 and a part of speech', () => {
    for (const w of words) {
      expect(w.senses.length).toBeGreaterThan(0);
      expect(w.senses[0]!.definition.trim()).not.toBe('');
      expect(w.difficultyTier).toBeGreaterThanOrEqual(1);
      expect(w.difficultyTier).toBeLessThanOrEqual(5);
      expect(w.partOfSpeech).toBeTruthy();
    }
  });

  it('puts words in every tier, so placement and the new-word window have choices', () => {
    for (let tier = 1; tier <= 5; tier++) {
      expect(words.filter((w) => w.difficultyTier === tier).length).toBeGreaterThanOrEqual(20);
    }
  });

  it('only has cloze targets that appear in their sentence', () => {
    for (const w of words) {
      for (const s of w.senses) {
        for (const e of s.examples) {
          if (e.clozeTarget === null) continue;
          expect(e.text.toLowerCase()).toContain(e.clozeTarget.toLowerCase());
        }
      }
    }
  });

  it('only has relation types the games know', () => {
    const known = new Set(['synonym', 'antonym', 'hypernym', 'hyponym']);
    for (const w of words) {
      for (const r of w.relations) expect(known.has(r.relationType)).toBe(true);
    }
  });

  it('contains no stub text from a pipeline dry run', () => {
    expect(JSON.stringify(words)).not.toContain('(dry-run stub)');
  });
});
