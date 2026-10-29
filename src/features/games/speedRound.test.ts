import type { SessionItem, UserWordState, WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import {
  buildSpeedRound,
  gradesOnSchedule,
  MAX_NEW_WORDS,
  type SpeedRoundInput,
} from './speedRound';

/** `perTier` words per tier: ids 1 to perTier at tier 1, and so on. */
function collection(perTier: number): WordContent[] {
  return Array.from({ length: perTier * 5 }, (_, i) => ({
    wordId: i + 1,
    headword: `w${i + 1}`,
    partOfSpeech: 'noun',
    ipa: null,
    syllables: null,
    difficultyTier: Math.floor(i / perTier) + 1,
    frequencyRank: null,
    etymology: null,
    audioUrl: null,
    senses: [],
    relations: [],
    mnemonics: [],
  }));
}

function dueItem(content: WordContent): SessionItem {
  const state: UserWordState = {
    wordId: content.wordId,
    due: '2026-10-01T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 3,
    scheduledDays: 3,
    reps: 2,
    lapses: 0,
    state: 'review',
    lastReview: '2026-09-28T00:00:00.000Z',
    learningSteps: 0,
    isKnown: false,
    isSuspended: false,
  };
  return { content, state, isNew: false };
}

function tracker(wordId: number, status: WordTracker['status']): WordTracker {
  return {
    wordId,
    status,
    cleanDays: status === 'known' ? 5 : 1,
    answeredRecently: 1,
    mistakeRecently: false,
    latestRight: 1,
    latestCount: 1,
    answers: 1,
    rightAnswers: 1,
    firstAnsweredAt: '2026-10-20T00:00:00.000Z',
    lastAnsweredAt: '2026-10-20T00:00:00.000Z',
  };
}

const ids = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => from + i);

function input(overrides: Partial<SpeedRoundInput>): SpeedRoundInput {
  const words = overrides.words ?? collection(20);
  return {
    words,
    due: [],
    unseenIds: new Set(words.map((w) => w.wordId)),
    savedIds: new Set(),
    trackers: new Map(),
    levelEstimate: 3,
    frequency: 'rarely',
    seed: 1,
    count: 20,
    ...overrides,
  };
}

describe('buildSpeedRound', () => {
  // 100 words, 20 per tier. Own words: 5 due (tier 3), 20 saved (tier 2) and
  // 10 being learned (tier 4).
  const words = collection(20);
  const due = ids(41, 45).map((id) => dueItem(words[id - 1]!));
  const savedIds = new Set(ids(21, 40));
  const trackers = new Map(ids(61, 70).map((id) => [id, tracker(id, 'learning')]));
  const unseenIds = new Set(
    words
      .map((w) => w.wordId)
      .filter((id) => !ids(41, 45).includes(id) && !trackers.has(id)),
  );
  const own = new Set([...ids(41, 45), ...savedIds, ...trackers.keys()]);
  const mixed = input({ words, due, savedIds, trackers, unseenIds });

  it('fills about three in four picks with the learner own words', () => {
    let ownCount = 0;
    let total = 0;
    for (let seed = 1; seed <= 30; seed++) {
      const round = buildSpeedRound({ ...mixed, seed });
      ownCount += round.filter((i) => own.has(i.content.wordId)).length;
      total += round.length;
    }
    expect(ownCount / total).toBeGreaterThan(0.65);
    expect(ownCount / total).toBeLessThan(0.85);
  });

  it('always has some words from outside the learner own words', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const round = buildSpeedRound({ ...mixed, seed });
      expect(round.some((i) => !own.has(i.content.wordId))).toBe(true);
    }
  });

  it('leans the other words toward the learner level, with every tier possible', () => {
    // No own words, so every pick is an "other" word. 100 per tier.
    const big = collection(100);
    const tiers: number[] = [];
    for (let seed = 1; seed <= 25; seed++) {
      const round = buildSpeedRound(input({ words: big, seed, count: 40 }));
      tiers.push(...round.map((i) => i.content.difficultyTier));
    }
    const share = (t: number) => tiers.filter((x) => x === t).length / tiers.length;
    // Expected 5%, 20%, 50%, 20%, 5%.
    expect(share(3)).toBeGreaterThan(0.42);
    expect(share(3)).toBeLessThan(0.58);
    expect(share(2) + share(4)).toBeGreaterThan(0.3);
    expect(share(1) + share(5)).toBeGreaterThan(0.04);
    expect(share(1) + share(5)).toBeLessThan(0.16);
  });

  it('keeps the state on due words, so they are graded', () => {
    const round = buildSpeedRound({ ...mixed, count: 100 });
    for (const item of round.filter((i) => ids(41, 45).includes(i.content.wordId))) {
      expect(item.state).not.toBeNull();
      expect(gradesOnSchedule(item)).toBe(true);
    }
  });

  it(`introduces at most ${MAX_NEW_WORDS} unseen words, and logs the rest as practice`, () => {
    const round = buildSpeedRound(input({ count: 40 }));
    expect(round).toHaveLength(40);
    expect(round.filter((i) => i.isNew)).toHaveLength(MAX_NEW_WORDS);
    const rest = round.filter((i) => !i.isNew);
    expect(rest.every((i) => i.state === null && !gradesOnSchedule(i))).toBe(true);
  });

  it('logs words that are not due and already seen as practice', () => {
    const round = buildSpeedRound({ ...mixed, count: 100 });
    for (const item of round) {
      const id = item.content.wordId;
      if (!unseenIds.has(id) && !ids(41, 45).includes(id)) {
        expect(gradesOnSchedule(item)).toBe(false);
      }
    }
  });

  it('brings up known words less often than unseen ones', () => {
    // Half the words are known (seen, not own); the known weight is 0.2.
    const known = new Set(ids(1, 50));
    let knownCount = 0;
    let total = 0;
    for (let seed = 1; seed <= 25; seed++) {
      const round = buildSpeedRound(
        input({
          levelEstimate: null,
          unseenIds: new Set(ids(51, 100)),
          trackers: new Map([...known].map((id) => [id, tracker(id, 'known')])),
          seed,
        }),
      );
      knownCount += round.filter((i) => known.has(i.content.wordId)).length;
      total += round.length;
    }
    expect(knownCount / total).toBeLessThan(0.3);
  });

  it('never repeats a word in a round', () => {
    const round = buildSpeedRound({ ...mixed, count: 100 });
    expect(new Set(round.map((i) => i.content.wordId)).size).toBe(round.length);
    expect(round).toHaveLength(100);
  });

  it('gives the same round for the same seed', () => {
    const a = buildSpeedRound(mixed).map((i) => i.content.wordId);
    expect(buildSpeedRound(mixed).map((i) => i.content.wordId)).toEqual(a);
    expect(
      buildSpeedRound({ ...mixed, seed: 2 }).map((i) => i.content.wordId),
    ).not.toEqual(a);
  });

  it('stops when the collection runs out', () => {
    const three = collection(20).slice(0, 3);
    expect(buildSpeedRound(input({ words: three }))).toHaveLength(3);
    expect(buildSpeedRound(input({ words: [] }))).toEqual([]);
  });
});
