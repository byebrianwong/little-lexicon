import {
  buildTrackers,
  describeTracker,
  KNOWN_AFTER_DAYS,
  type AnswerRecord,
} from './tracker';

// Local times, so day boundaries match the device's, as in the app.
const NOW = new Date(2026, 9, 20, 18, 0);

function at(daysAgo: number, hour = 10): string {
  const d = new Date(NOW);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(hour, 0, 0, 0);
  return d.toISOString();
}

function answer(wordId: number, correct: boolean, daysAgo: number, hour = 10): AnswerRecord {
  return { wordId, correct, at: at(daysAgo, hour) };
}

/** Right answers on `days` separate days, the most recent `from` days ago. */
function cleanRun(wordId: number, days: number, from = 0): AnswerRecord[] {
  return Array.from({ length: days }, (_, i) => answer(wordId, true, from + i));
}

describe('buildTrackers', () => {
  it('has no tracker for a word with no answers', () => {
    expect(buildTrackers([answer(1, true, 0)], NOW).has(2)).toBe(false);
  });

  it('counts a word as known after right answers on 5 separate days', () => {
    const t = buildTrackers(cleanRun(1, KNOWN_AFTER_DAYS), NOW).get(1)!;
    expect(t.cleanDays).toBe(5);
    expect(t.status).toBe('known');
  });

  it('does not need the days to be in a row', () => {
    const history = [0, 3, 9, 20, 40].map((d) => answer(1, true, d));
    expect(buildTrackers(history, NOW).get(1)!.status).toBe('known');
  });

  it('counts several right answers on one day as one day', () => {
    const history = [8, 12, 16].map((h) => answer(1, true, 0, h));
    const t = buildTrackers([...history, ...cleanRun(1, 3, 1)], NOW).get(1)!;
    expect(t.cleanDays).toBe(4);
    expect(t.status).toBe('learning');
  });

  it('starts the clean days again after a mistake', () => {
    const history = [...cleanRun(1, 6, 3), answer(1, false, 2), ...cleanRun(1, 2, 0)];
    const t = buildTrackers(history, NOW).get(1)!;
    expect(t.cleanDays).toBe(2);
    expect(t.status).toBe('learning');
    expect(t.mistakeRecently).toBe(true);
  });

  it('counts a right answer later on the day of a mistake', () => {
    const history = [answer(1, false, 0, 9), answer(1, true, 0, 11)];
    expect(buildTrackers(history, NOW).get(1)!.cleanDays).toBe(1);
  });

  it('sorts answers by time, whatever order they arrive in', () => {
    const history = [answer(1, true, 0), answer(1, false, 5), ...cleanRun(1, 4, 1)];
    expect(buildTrackers(history.reverse(), NOW).get(1)!.cleanDays).toBe(5);
  });

  it('counts answers and mistakes from the past week only', () => {
    const history = [answer(1, false, 10), answer(1, true, 8), answer(1, true, 2), answer(1, true, 0)];
    const t = buildTrackers(history, NOW).get(1)!;
    expect(t.answeredRecently).toBe(2);
    expect(t.mistakeRecently).toBe(false);
  });

  it('covers the latest 5 answers in the right count', () => {
    const history = [
      answer(1, false, 6),
      answer(1, false, 5),
      answer(1, true, 4),
      answer(1, false, 3),
      answer(1, true, 2),
      answer(1, true, 1),
    ];
    const t = buildTrackers(history, NOW).get(1)!;
    expect(t.latestCount).toBe(5);
    expect(t.latestRight).toBe(3);
    expect(t.lastAnsweredAt).toBe(at(1));
  });

  it('counts every answer, the right ones, and the first and last times', () => {
    const history = [answer(1, true, 9), answer(1, false, 4), answer(1, true, 2), answer(1, true, 0)];
    const t = buildTrackers(history.reverse(), NOW).get(1)!;
    expect(t.answers).toBe(4);
    expect(t.rightAnswers).toBe(3);
    expect(t.firstAnsweredAt).toBe(at(9));
    expect(t.lastAnsweredAt).toBe(at(0));
  });

  it('keeps words apart', () => {
    const trackers = buildTrackers([answer(1, false, 0), ...cleanRun(2, 5)], NOW);
    expect(trackers.get(1)!.status).toBe('learning');
    expect(trackers.get(2)!.status).toBe('known');
  });
});

describe('describeTracker', () => {
  it('says when a word has never been tested', () => {
    expect(describeTracker(undefined, NOW)).toBe('Not tested yet');
  });

  it('shows progress toward known, the latest answers and the past week', () => {
    const history = [answer(1, false, 3), ...cleanRun(1, 2, 0), answer(1, true, 0, 12)];
    expect(describeTracker(buildTrackers(history, NOW).get(1), NOW)).toBe(
      'Learning (2 of 5 days) · 3 of last 4 right · tested 4 times in the past week',
    );
  });

  it('describes a known word', () => {
    expect(describeTracker(buildTrackers(cleanRun(1, 5), NOW).get(1), NOW)).toBe(
      'Known · 5 of last 5 right · tested 5 times in the past week',
    );
  });

  it('describes a single answer in words', () => {
    expect(describeTracker(buildTrackers([answer(1, false, 0)], NOW).get(1), NOW)).toBe(
      'Learning (0 of 5 days) · wrong last time · tested 1 time in the past week',
    );
  });

  it('says how long ago a word was last tested when it was not tested this week', () => {
    expect(describeTracker(buildTrackers([answer(1, true, 12)], NOW).get(1), NOW)).toBe(
      'Learning (1 of 5 days) · right last time · last tested 12 days ago',
    );
  });
});
