import type { ModeCapabilities } from './ladder';
import {
  buildPracticeChunk,
  isPlayable,
  KNOWN_WORD_WEIGHT,
  MISTAKE_WEIGHT,
  parseKnownWordFrequency,
  practiceMode,
  practiceWeight,
  REPEAT_GAP,
  type PracticeChunkInput,
} from './practice';
import type { WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';

const fullCaps: ModeCapabilities = {
  hasClozeExample: true,
  hasClozeChoice: true,
  hasRelations: { synonym: true, antonym: true },
  hasAudio: true,
};

const bareCaps: ModeCapabilities = {
  hasClozeExample: false,
  hasClozeChoice: false,
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
    expect(isPlayable('cloze_choice', bareCaps)).toBe(false);
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

  it('picks the word for a sentence more often than any other mode', () => {
    const counts = new Map<string, number>();
    for (let seed = 0; seed < 90; seed++) {
      const m = practiceMode(fullCaps, seed);
      counts.set(m, (counts.get(m) ?? 0) + 1);
    }
    const choice = counts.get('cloze_choice') ?? 0;
    for (const [mode, n] of counts) {
      if (mode !== 'cloze_choice') expect(choice).toBeGreaterThan(n);
    }
  });

  it('handles a negative seed without crashing', () => {
    expect(isPlayable(practiceMode(fullCaps, -3), fullCaps)).toBe(true);
  });
});

function tracker(wordId: number, overrides: Partial<WordTracker> = {}): WordTracker {
  return {
    wordId,
    status: 'learning',
    cleanDays: 1,
    answeredRecently: 1,
    mistakeRecently: false,
    latestRight: 1,
    latestCount: 1,
    lastAnsweredAt: '2026-10-20T10:00:00.000Z',
    ...overrides,
  };
}

const known = (id: number) => tracker(id, { status: 'known', cleanDays: 5 });
const struggling = (id: number) => tracker(id, { cleanDays: 0, mistakeRecently: true });

describe('parseKnownWordFrequency', () => {
  it('keeps a known setting', () => {
    expect(parseKnownWordFrequency('sometimes')).toBe('sometimes');
    expect(parseKnownWordFrequency('often')).toBe('often');
  });

  it('falls back to rarely for anything else', () => {
    expect(parseKnownWordFrequency('never')).toBe('rarely');
    expect(parseKnownWordFrequency(null)).toBe('rarely');
  });
});

describe('practiceWeight', () => {
  it('gives an untested or learning word the base weight', () => {
    expect(practiceWeight(undefined, 'rarely')).toBe(1);
    expect(practiceWeight(tracker(1), 'rarely')).toBe(1);
  });

  it('lowers a known word by the setting', () => {
    expect(practiceWeight(known(1), 'rarely')).toBe(KNOWN_WORD_WEIGHT.rarely);
    expect(practiceWeight(known(1), 'sometimes')).toBe(KNOWN_WORD_WEIGHT.sometimes);
    expect(practiceWeight(known(1), 'often')).toBe(1);
    expect(KNOWN_WORD_WEIGHT.rarely).toBeLessThan(KNOWN_WORD_WEIGHT.sometimes);
  });

  it('raises a word with a recent mistake', () => {
    expect(practiceWeight(struggling(1), 'rarely')).toBe(MISTAKE_WEIGHT);
  });

  it('treats a word known again after a recent mistake as known', () => {
    const t = tracker(1, { status: 'known', cleanDays: 5, mistakeRecently: true });
    expect(practiceWeight(t, 'rarely')).toBe(KNOWN_WORD_WEIGHT.rarely);
  });
});

describe('buildPracticeChunk', () => {
  const words = Array.from({ length: 100 }, (_, i) => word(i + 1));

  function input(overrides: Partial<PracticeChunkInput> = {}): PracticeChunkInput {
    return {
      words,
      savedIds: new Set(),
      trackers: new Map(),
      frequency: 'rarely',
      played: [],
      count: 20,
      seed: 1,
      ...overrides,
    };
  }

  /** How many picks, over many seeds, went to words matching `pick`. */
  function share(overrides: Partial<PracticeChunkInput>, pick: (id: number) => boolean): number {
    let hits = 0;
    let total = 0;
    for (let seed = 1; seed <= 200; seed++) {
      for (const item of buildPracticeChunk(input({ ...overrides, seed }))) {
        total++;
        if (pick(item.content.wordId)) hits++;
      }
    }
    return hits / total;
  }

  it('marks items as non-new and unscheduled, so practice cannot touch FSRS', () => {
    const chunk = buildPracticeChunk(input());
    expect(chunk).toHaveLength(20);
    expect(chunk.every((i) => !i.isNew && i.state === null)).toBe(true);
  });

  it('is reproducible from its seed', () => {
    const ids = (seed: number) => buildPracticeChunk(input({ seed })).map((i) => i.content.wordId);
    expect(ids(5)).toEqual(ids(5));
    expect(ids(5)).not.toEqual(ids(6));
  });

  it('returns nothing for an empty collection', () => {
    expect(buildPracticeChunk(input({ words: [] }))).toEqual([]);
  });

  it('does not repeat a word within the gap, counting words played before', () => {
    const chunk = buildPracticeChunk(input({ played: [1, 2, 3], count: 60 }));
    const ids = [1, 2, 3, ...chunk.map((i) => i.content.wordId)];
    for (let i = 0; i < ids.length; i++) {
      expect(ids.slice(Math.max(0, i - REPEAT_GAP), i)).not.toContain(ids[i]);
    }
  });

  it('never shows the same word twice in a row in a tiny collection', () => {
    const chunk = buildPracticeChunk(input({ words: [word(1), word(2)], count: 10 }));
    const ids = chunk.map((i) => i.content.wordId);
    for (let i = 1; i < ids.length; i++) expect(ids[i]).not.toBe(ids[i - 1]);
  });

  it('still plays a collection of one word', () => {
    const chunk = buildPracticeChunk(input({ words: [word(1)], count: 3 }));
    expect(chunk.map((i) => i.content.wordId)).toEqual([1, 1, 1]);
  });

  it('gives saved words about half of the picks', () => {
    const savedIds = new Set([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    const s = share({ savedIds }, (id) => savedIds.has(id));
    expect(s).toBeGreaterThan(0.42);
    expect(s).toBeLessThan(0.58);
  });

  it('gives saved words no extra weight once they outnumber the rest', () => {
    const savedIds = new Set(words.slice(0, 80).map((w) => w.wordId));
    const s = share({ savedIds }, (id) => savedIds.has(id));
    expect(s).toBeGreaterThan(0.74);
    expect(s).toBeLessThan(0.86);
  });

  it('shows known words less often, by the setting', () => {
    const knownIds = new Set(words.slice(0, 50).map((w) => w.wordId));
    const trackers = new Map([...knownIds].map((id) => [id, known(id)]));
    const rarely = share({ trackers, frequency: 'rarely' }, (id) => knownIds.has(id));
    const sometimes = share({ trackers, frequency: 'sometimes' }, (id) => knownIds.has(id));
    const often = share({ trackers, frequency: 'often' }, (id) => knownIds.has(id));
    // Half the words are known: weights 0.2, 0.5 and 1 against 1 for the rest.
    expect(rarely).toBeLessThan(0.25);
    expect(sometimes).toBeGreaterThan(rarely);
    expect(sometimes).toBeLessThan(often);
    expect(often).toBeGreaterThan(0.42);
  });

  it('keeps words with recent mistakes active', () => {
    const missed = new Set(words.slice(0, 50).map((w) => w.wordId));
    const trackers = new Map([...missed].map((id) => [id, struggling(id)]));
    expect(share({ trackers }, (id) => missed.has(id))).toBeGreaterThan(0.6);
  });

  it('shows known saved words less often than saved words still being learned', () => {
    // Twenty saved words, so the repeat gap does not cap any of them.
    const knownIds = new Set(words.slice(0, 10).map((w) => w.wordId));
    const learningIds = new Set(words.slice(10, 20).map((w) => w.wordId));
    const savedIds = new Set([...knownIds, ...learningIds]);
    const trackers = new Map([...knownIds].map((id) => [id, known(id)]));
    const knownShare = share({ savedIds, trackers }, (id) => knownIds.has(id));
    const learningShare = share({ savedIds, trackers }, (id) => learningIds.has(id));
    expect(knownShare).toBeLessThan(learningShare / 3);
  });
});
