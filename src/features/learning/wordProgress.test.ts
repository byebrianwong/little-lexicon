import { buildTrackers, type AnswerRecord } from '@/features/tracker/tracker';
import type { WordContent, WordSchedule } from '@/lib/types';
import {
  countWords,
  groupWords,
  isDue,
  knownProgress,
  nextReview,
  summaryLine,
  wordFacts,
  type GroupInput,
  type WordProgress,
} from './wordProgress';

// Local times, so day boundaries match the device's, as in the app.
const NOW = new Date(2026, 9, 29, 18, 0);

function at(daysAgo: number, hour = 10): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function word(wordId: number, headword: string): WordContent {
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
    senses: [],
    relations: [],
    mnemonics: [],
  };
}

function answer(
  wordId: number,
  correct: boolean,
  daysAgo: number,
  hour = 10,
): AnswerRecord {
  return { wordId, correct, at: at(daysAgo, hour) };
}

function schedule(
  wordId: number,
  due: string,
  extra: Partial<WordSchedule> = {},
): WordSchedule {
  return { wordId, due, isKnown: false, isSuspended: false, ...extra };
}

const CONTENT = new Map(
  [
    word(1, 'abate'),
    word(2, 'banal'),
    word(3, 'candor'),
    word(4, 'dearth'),
    word(5, 'enigma'),
  ].map((w) => [w.wordId, w]),
);

function input(
  history: AnswerRecord[],
  schedules: WordSchedule[] = [],
  saved: [number, string][] = [],
): GroupInput {
  return {
    content: CONTENT,
    trackers: buildTrackers(history, NOW),
    schedules,
    savedAt: new Map(saved),
  };
}

const ids = (list: WordProgress[]) => list.map((w) => w.content.wordId);

describe('groupWords', () => {
  it('puts every answered word in Learning or Known, by the tracker', () => {
    const history = [
      answer(1, true, 0),
      ...[0, 1, 2, 3, 4].map((d) => answer(2, true, d)),
      answer(3, false, 1),
    ];
    const words = groupWords(input(history), NOW);
    expect(ids(words.learning).sort()).toEqual([1, 3]);
    expect(ids(words.known)).toEqual([2]);
  });

  it('takes Due from the schedule, whatever the tracker says', () => {
    const known = [0, 1, 2, 3, 4].map((d) => answer(2, true, d));
    const words = groupWords(
      input(
        [...known, answer(1, true, 3)],
        [
          schedule(1, at(0, 9)), // due this morning
          schedule(2, at(1)), // known by the tracker, still due
          schedule(3, at(-2)), // due in two days
        ],
      ),
      NOW,
    );
    expect(ids(words.due)).toEqual([2, 1]);
    expect(ids(words.known)).toEqual([2]);
  });

  it('never lists a word marked known or paused as due', () => {
    const words = groupWords(
      input(
        [],
        [
          schedule(1, at(3), { isKnown: true }),
          schedule(2, at(3), { isSuspended: true }),
        ],
      ),
      NOW,
    );
    expect(words.due).toEqual([]);
  });

  it('lists a due word with no answers, without a tracker', () => {
    const words = groupWords(input([], [schedule(4, at(1))]), NOW);
    expect(words.due).toHaveLength(1);
    expect(words.due[0]!.tracker).toBeUndefined();
    expect(words.learning).toEqual([]);
  });

  it('leaves out words that are not in the words file', () => {
    const words = groupWords(input([answer(99, true, 0)], [schedule(98, at(1))]), NOW);
    expect(countWords(words)).toEqual({ learning: 0, due: 0, known: 0 });
  });

  it('sorts each list by the latest answer, newest first', () => {
    const history = [
      answer(1, true, 5),
      answer(3, true, 0),
      answer(5, true, 2),
      answer(1, false, 4),
    ];
    expect(ids(groupWords(input(history), NOW).learning)).toEqual([3, 5, 1]);
  });

  it('carries the schedule and the day the word was saved', () => {
    const words = groupWords(
      input([answer(1, true, 0)], [schedule(1, at(-3))], [[1, at(6)]]),
      NOW,
    );
    expect(words.learning[0]).toMatchObject({
      schedule: { wordId: 1 },
      savedAt: at(6),
    });
  });

  it('counts the lists', () => {
    const history = [answer(1, true, 0), answer(3, true, 0)];
    const words = groupWords(input(history, [schedule(1, at(1))]), NOW);
    expect(countWords(words)).toEqual({ learning: 2, due: 1, known: 0 });
  });
});

describe('isDue', () => {
  it('is due at the due time, not before', () => {
    expect(isDue(schedule(1, NOW.toISOString()), NOW)).toBe(true);
    expect(isDue(schedule(1, new Date(NOW.getTime() + 60_000).toISOString()), NOW)).toBe(
      false,
    );
  });
});

describe('nextReview', () => {
  it('says when the schedule brings the word back', () => {
    expect(nextReview(schedule(1, at(1)), NOW)).toBe('due now');
    expect(nextReview(schedule(1, at(-3, 18)), NOW)).toBe('in 3 days');
    expect(nextReview(schedule(1, at(-1, 18)), NOW)).toBe('tomorrow');
  });

  it('says why there is none', () => {
    expect(nextReview(undefined, NOW)).toBe('not scheduled yet');
    expect(nextReview(schedule(1, at(1), { isKnown: true }), NOW)).toBe(
      'none, marked as known',
    );
    expect(nextReview(schedule(1, at(1), { isSuspended: true }), NOW)).toBe(
      'none, paused',
    );
  });
});

describe('a row', () => {
  function row(
    history: AnswerRecord[],
    sched?: WordSchedule,
    savedAt: string | null = null,
  ) {
    return {
      content: CONTENT.get(1)!,
      tracker: buildTrackers(history, NOW).get(1),
      schedule: sched,
      savedAt,
    };
  }

  it('shows progress toward known', () => {
    const history = [answer(1, false, 4), answer(1, true, 2), answer(1, true, 0)];
    expect(knownProgress(row(history).tracker)).toBe('2 of 5 days');
    const known = [0, 1, 2, 3, 4].map((d) => answer(1, true, d));
    expect(knownProgress(row(known).tracker)).toBe('Known');
    expect(knownProgress(undefined)).toBe('0 of 5 days');
  });

  it('sums up the answers and the next review', () => {
    const history = [answer(1, false, 4), answer(1, true, 2), answer(1, true, 0)];
    expect(summaryLine(row(history, schedule(1, at(-3, 18))), NOW)).toBe(
      '2 of 3 right · next review in 3 days',
    );
    expect(summaryLine(row(history, schedule(1, at(1))), NOW)).toBe(
      '2 of 3 right · due now',
    );
    expect(summaryLine(row(history), NOW)).toBe('2 of 3 right · no review scheduled');
    expect(summaryLine(row(history, schedule(1, at(1), { isKnown: true })), NOW)).toBe(
      '2 of 3 right · no review scheduled',
    );
  });

  it('lists every fact about the word', () => {
    const history = [
      answer(1, true, 40),
      answer(1, false, 9),
      ...[5, 4, 3, 2, 1].map((d) => answer(1, true, d)),
    ];
    expect(wordFacts(row(history, schedule(1, at(-3, 18)), at(41)), NOW)).toEqual([
      { label: 'Answers', value: '6 of 7 right (86%)' },
      { label: 'Latest', value: '5 of last 5 right' },
      { label: 'Last tested', value: 'yesterday' },
      { label: 'Next review', value: 'in 3 days' },
      { label: 'First tested', value: 'Sep 19' },
      { label: 'Saved', value: 'Sep 18' },
    ]);
  });

  it('leaves out the latest answers when they are all the answers, and an unsaved word', () => {
    const facts = wordFacts(row([answer(1, true, 0)]), NOW);
    expect(facts.map((f) => f.label)).toEqual([
      'Answers',
      'Last tested',
      'Next review',
      'First tested',
    ]);
    expect(facts[0]!.value).toBe('1 of 1 right (100%)');
  });

  it('says a due word with no answers has none yet', () => {
    expect(wordFacts(row([], schedule(1, at(1))), NOW)).toEqual([
      { label: 'Answers', value: 'none yet' },
      { label: 'Next review', value: 'due now' },
    ]);
  });
});
