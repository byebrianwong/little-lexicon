import {
  avoidShown,
  exampleFor,
  exampleForVisit,
  pickExample,
  visitOf,
} from './examples';
import type { ExampleContent, SessionItem, UserWordState, WordContent } from './types';
import { makeScheduler, newCard, Rating, review } from '@/srs/srs';

function example(id: number): ExampleContent {
  return {
    exampleId: id,
    text: `Sentence ${id}.`,
    audioUrl: `audio/sentences/${id}.mp3`,
    clozeTarget: null,
  };
}

function word(examples: ExampleContent[], second: ExampleContent[] = []): WordContent {
  const sense = (senseId: number, list: ExampleContent[]) => ({
    senseId,
    definition: 'meaning',
    plainLanguageDefinition: null,
    senseOrder: senseId,
    register: null,
    alsoMeans: false,
    audioUrl: null,
    examples: list,
    distractors: [],
  });
  return {
    wordId: 1,
    headword: 'abate',
    partOfSpeech: 'verb',
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
    senses:
      second.length > 0 ? [sense(1, examples), sense(2, second)] : [sense(1, examples)],
    relations: [],
    mnemonics: [],
  };
}

function state(reps: number): UserWordState {
  return {
    wordId: 1,
    due: '2026-10-01T00:00:00.000Z',
    stability: 3,
    difficulty: 5,
    elapsedDays: 0,
    scheduledDays: 3,
    reps,
    lapses: 0,
    state: 'review',
    lastReview: null,
    learningSteps: 0,
    isKnown: false,
    isSuspended: false,
  };
}

const four = [example(10), example(11), example(12), example(13)];

describe('pickExample', () => {
  it('shows the first sentence on the first meeting', () => {
    expect(pickExample(four, 0)).toBe(four[0]);
  });

  it('shows the next sentence on each visit and starts again after the last', () => {
    const shown = [0, 1, 2, 3, 4, 5, 9].map((v) => pickExample(four, v)?.exampleId);
    expect(shown).toEqual([10, 11, 12, 13, 10, 11, 11]);
  });

  it('never shows the same sentence twice in a row when there is more than one', () => {
    for (const n of [2, 3, 4, 5]) {
      const list = four.concat(example(14)).slice(0, n);
      for (let v = 0; v < 20; v++) {
        expect(pickExample(list, v + 1)).not.toBe(pickExample(list, v));
      }
    }
  });

  it('is null when there are no sentences', () => {
    expect(pickExample([], 0)).toBeNull();
    expect(pickExample([], 3)).toBeNull();
  });

  it('reads a negative, fractional or missing count as the first visit', () => {
    expect(pickExample(four, -1)).toBe(four[0]);
    expect(pickExample(four, 1.7)).toBe(four[1]);
    expect(pickExample(four, Number.NaN)).toBe(four[0]);
  });
});

describe('exampleForVisit', () => {
  it('picks from the first sense, whose definition the screens show', () => {
    const w = word(four, [example(20), example(21)]);
    expect(exampleForVisit(w, 1)?.exampleId).toBe(11);
  });

  it('is null for a word with no senses or no sentences', () => {
    expect(exampleForVisit({ ...word(four), senses: [] }, 0)).toBeNull();
    expect(exampleForVisit(word([]), 2)).toBeNull();
  });
});

describe('visitOf', () => {
  const content = word(four);

  it('is 0 for a new word', () => {
    expect(visitOf({ state: null })).toBe(0);
    expect(exampleFor({ content, state: null })?.exampleId).toBe(10);
  });

  it('is the review count in the SRS state', () => {
    expect(visitOf({ state: state(3) })).toBe(3);
    expect(exampleFor({ content, state: state(3) })?.exampleId).toBe(13);
  });

  it('prefers a visit the screen set, as practice does', () => {
    expect(visitOf({ state: state(3), visit: 6 })).toBe(6);
    expect(visitOf({ state: null, visit: 0 })).toBe(0);
  });

  it('moves to the next sentence after each review, whatever the rating', () => {
    const scheduler = makeScheduler(0.9);
    let card = newCard(new Date('2026-10-01T00:00:00Z'));
    const seen: (number | undefined)[] = [];
    const ratings = [
      Rating.Good,
      Rating.Again,
      Rating.Hard,
      Rating.Easy,
      Rating.Good,
    ] as const;
    ratings.forEach((rating, i) => {
      const item: SessionItem = {
        content,
        state: i === 0 ? null : state(card.reps),
        isNew: i === 0,
      };
      seen.push(exampleFor(item)?.exampleId);
      card = review(
        scheduler,
        card,
        rating,
        new Date(Date.UTC(2026, 9, 1 + i * 10)),
      ).card;
    });
    expect(seen).toEqual([10, 11, 12, 13, 10]);
  });
});

describe('avoidShown', () => {
  it('leaves out the sentence shown elsewhere on this visit', () => {
    expect(avoidShown(four, four[1]!).map((e) => e.exampleId)).toEqual([10, 12, 13]);
  });

  it('keeps it when it is the only one', () => {
    expect(avoidShown([four[0]!], four[0]!)).toEqual([four[0]]);
  });

  it('keeps every sentence when nothing is shown or the shown one is not a candidate', () => {
    expect(avoidShown(four, null)).toEqual(four);
    expect(avoidShown(four, example(99))).toEqual(four);
  });
});
