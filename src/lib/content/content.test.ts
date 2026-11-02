import { buildContentIndex, loadContent, WORDS_FILE_FORMAT, type WordsFile } from './index';
import type { Register, WordContent } from '@/lib/types';
import { buildOptionPool, capsForWord } from '@/features/games/optionPool';

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
    roots: [],
    watchOut: null,
    pairings: [],
    audioUrl: null,
    hookAudioUrl: null,
    senses: [
      {
        senseId: wordId * 10,
        definition: `Meaning of ${headword}.`,
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
    expect(words.length).toBeGreaterThanOrEqual(250);
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

  it('lets nearly every word be asked as a sentence with a choice of words', () => {
    // A word qualifies when one of its sentences blanks the headword itself.
    // The rest (only "belied", "gleaned" and the like) get the other modes.
    const pool = buildOptionPool([], words);
    const askable = words.filter((w) => capsForWord(w, pool).hasClozeChoice).length;
    expect(askable / words.length).toBeGreaterThanOrEqual(0.9);
  });

  it('only has relation types the games know', () => {
    const known = new Set(['synonym', 'antonym', 'hypernym', 'hyponym']);
    for (const w of words) {
      for (const r of w.relations) expect(known.has(r.relationType)).toBe(true);
    }
  });

  it('has extras in the shape the screens expect', () => {
    const registers: Register[] = [
      'formal',
      'informal',
      'literary',
      'disapproving',
      'approving',
      'humorous',
      'old-fashioned',
      'technical',
    ];
    for (const w of words) {
      expect(w.roots.length).toBeLessThanOrEqual(3);
      for (const root of w.roots) expect(root).toMatch(/^[a-z]{3,}$/);
      expect(w.pairings.length === 0 || (w.pairings.length >= 2 && w.pairings.length <= 4)).toBe(true);
      expect(w.watchOut === null || w.watchOut.trim().length > 0).toBe(true);
      w.senses.forEach((s, i) => {
        if (s.register !== null) expect(registers).toContain(s.register);
        if (s.alsoMeans) {
          expect(i).toBeGreaterThan(0);
          expect(s.plainLanguageDefinition?.trim()).toBeTruthy();
        }
      });
      expect(w.senses.filter((s) => s.alsoMeans).length).toBeLessThanOrEqual(2);
    }
  });

  it('credits Wiktionary once any word has an origin', async () => {
    const { attribution } = await loadContent();
    const credited = attribution.some((line) => line.includes('Wiktionary'));
    expect(credited).toBe(words.some((w) => w.etymology !== null));
  });

  it('contains no stub text from a pipeline dry run', () => {
    expect(JSON.stringify(words)).not.toContain('(dry-run stub)');
  });
});
