import { bucketDueDates, forecastWindow } from './forecast';

// Local times, so the tests hold in any time zone.
const NOW = new Date(2026, 0, 19, 15, 30);

function at(day: number, hour: number): number {
  return new Date(2026, 0, day, hour).getTime();
}

describe('forecastWindow', () => {
  it('lists the local days from today, each ending at the next local midnight', () => {
    const window = forecastWindow(3, NOW);
    expect(window.map((d) => d.day)).toEqual(['2026-01-19', '2026-01-20', '2026-01-21']);
    expect(window.map((d) => d.end.getTime())).toEqual([
      new Date(2026, 0, 20).getTime(),
      new Date(2026, 0, 21).getTime(),
      new Date(2026, 0, 22).getTime(),
    ]);
  });

  it('is empty for zero days', () => {
    expect(forecastWindow(0, NOW)).toEqual([]);
  });
});

describe('bucketDueDates', () => {
  it('counts overdue words in today, so today is at least the Due count', () => {
    const dues = [
      at(10, 9), // nine days overdue
      at(18, 23), // due yesterday
      at(19, 8), // due earlier today
      at(19, 22), // due later today: not in Due yet, but in today's bar
    ];
    const due = dues.filter((t) => t <= NOW.getTime()).length;
    const [today] = bucketDueDates(dues, 14, NOW);
    expect(due).toBe(3);
    expect(today).toEqual({ day: '2026-01-19', dueCount: 4 });
  });

  it('puts a word due at local midnight in the day that midnight starts', () => {
    const counts = bucketDueDates([at(20, 0), at(20, 23), at(21, 0)], 3, NOW);
    expect(counts.map((c) => c.dueCount)).toEqual([0, 2, 1]);
  });

  it('leaves out words due after the last day', () => {
    const counts = bucketDueDates([at(21, 23), at(22, 0), at(30, 9)], 3, NOW);
    expect(counts.map((c) => c.dueCount)).toEqual([0, 0, 1]);
  });

  it('returns one entry per day, with zero for empty days', () => {
    expect(bucketDueDates([], 2, NOW)).toEqual([
      { day: '2026-01-19', dueCount: 0 },
      { day: '2026-01-20', dueCount: 0 },
    ]);
  });
});
