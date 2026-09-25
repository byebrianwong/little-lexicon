import { formatNextDue } from './date';

const now = new Date(Date.UTC(2026, 8, 24, 9, 0, 0));
const after = (ms: number) => new Date(now.getTime() + ms);
const MIN = 60_000;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;

describe('formatNextDue', () => {
  it('handles the learning steps in minutes', () => {
    expect(formatNextDue(after(MIN), now)).toBe('in 1 minute');
    expect(formatNextDue(after(10 * MIN), now)).toBe('in 10 minutes');
  });
  it('uses hours under a day', () => {
    expect(formatNextDue(after(5 * HOUR), now)).toBe('in 5 hours');
    expect(formatNextDue(after(HOUR), now)).toBe('in 1 hour');
  });
  it('says tomorrow for one day', () => {
    expect(formatNextDue(after(DAY), now)).toBe('tomorrow');
  });
  it('counts days, then months, then years', () => {
    expect(formatNextDue(after(3 * DAY), now)).toBe('in 3 days');
    expect(formatNextDue(after(29 * DAY), now)).toBe('in 29 days');
    expect(formatNextDue(after(45 * DAY), now)).toBe('in 2 months');
    expect(formatNextDue(after(200 * DAY), now)).toBe('in 7 months');
    expect(formatNextDue(after(400 * DAY), now)).toBe('in 1 year');
    expect(formatNextDue(after(800 * DAY), now)).toBe('in 2 years');
  });
  it('never goes negative', () => {
    expect(formatNextDue(now, now)).toBe('in a moment');
    expect(formatNextDue(after(-DAY), now)).toBe('in a moment');
  });
});
