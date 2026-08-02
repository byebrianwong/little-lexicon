import type { ModeCapabilities } from './ladder';
import { buildPracticeRound, isPlayable, practiceMode, shuffle } from './practice';
import type { WordContent } from '@/lib/types';

const fullCaps: ModeCapabilities = {
  hasClozeExample: true,
  hasRelations: { synonym: true, antonym: true },
  hasAudio: true,
};

const bareCaps: ModeCapabilities = {
  hasClozeExample: false,
  hasRelations: { synonym: false, antonym: false },
  hasAudio: false,
};

function word(id: number): WordContent {
  return {
    wordId: id,
    headword: `w${id}`,
    partOfSpeech: 'noun',
    ipa: null,
    syllables: null,
    difficultyTier: 3,
    frequencyRank: null,
    etymology: null,
    audioUrl: null,
    senses: [],
    relations: [],
    mnemonics: [],
  };
}

describe('isPlayable', () => {
  it('blocks modes whose content is missing', () => {
    expect(isPlayable('cloze', bareCaps)).toBe(false);
    expect(isPlayable('listening', bareCaps)).toBe(false);
    expect(isPlayable('synonym_match', bareCaps)).toBe(false);
    expect(isPlayable('antonym_match', bareCaps)).toBe(false);
  });

  it('always allows modes that can be built from any word', () => {
    expect(isPlayable('mc_word_to_def', bareCaps)).toBe(true);
    expect(isPlayable('mc_def_to_word', bareCaps)).toBe(true);
    expect(isPlayable('production', bareCaps)).toBe(true);
  });
});

describe('practiceMode', () => {
  it('never returns a mode the word lacks content for', () => {
    for (let seed = 0; seed < 50; seed++) {
      expect(isPlayable(practiceMode(bareCaps, seed), bareCaps)).toBe(true);
    }
  });

  it('varies the mode as the seed advances', () => {
    const seen = new Set(Array.from({ length: 20 }, (_, i) => practiceMode(fullCaps, i)));
    expect(seen.size).toBeGreaterThan(1);
  });

  it('is deterministic for a given seed', () => {
    expect(practiceMode(fullCaps, 7)).toBe(practiceMode(fullCaps, 7));
  });

  it('handles a negative seed without crashing', () => {
    expect(isPlayable(practiceMode(fullCaps, -3), fullCaps)).toBe(true);
  });
});

describe('shuffle', () => {
  it('keeps every element exactly once', () => {
    const out = shuffle([1, 2, 3, 4, 5], 42);
    expect([...out].sort()).toEqual([1, 2, 3, 4, 5]);
  });

  it('is deterministic for a given seed', () => {
    expect(shuffle([1, 2, 3, 4, 5], 9)).toEqual(shuffle([1, 2, 3, 4, 5], 9));
  });

  it('does not mutate the input', () => {
    const input = [1, 2, 3];
    shuffle(input, 1);
    expect(input).toEqual([1, 2, 3]);
  });
});

describe('buildPracticeRound', () => {
  it('includes every word once per round', () => {
    const round = buildPracticeRound([word(1), word(2), word(3)], 0);
    expect(round).toHaveLength(3);
    expect(new Set(round.map((i) => i.content.wordId)).size).toBe(3);
  });

  it('marks items as non-new and unscheduled, so practice cannot touch FSRS', () => {
    const round = buildPracticeRound([word(1)], 0);
    expect(round[0]!.isNew).toBe(false);
    expect(round[0]!.state).toBeNull();
  });

  it('orders successive rounds differently', () => {
    const words = Array.from({ length: 8 }, (_, i) => word(i + 1));
    const a = buildPracticeRound(words, 0).map((i) => i.content.wordId);
    const b = buildPracticeRound(words, 1).map((i) => i.content.wordId);
    expect(a).not.toEqual(b);
  });

  it('returns an empty round for an empty collection', () => {
    expect(buildPracticeRound([], 0)).toEqual([]);
  });
});
