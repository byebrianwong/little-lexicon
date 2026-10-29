import { formatDaysAgo, formatNextDue, formatShortDate } from './date';

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

describe('formatShortDate', () => {
  // Local times, so the day is the device's, as in the app.
  const today = new Date(2026, 9, 29, 15, 0);

  it('gives the month and day in this year', () => {
    expect(formatShortDate(new Date(2026, 9, 3, 8, 0), today)).toBe('Oct 3');
    expect(formatShortDate(new Date(2026, 0, 31, 23, 59), today)).toBe('Jan 31');
  });
  it('adds the year for another year', () => {
    expect(formatShortDate(new Date(2025, 11, 30, 12, 0), today)).toBe('Dec 30, 2025');
  });
});

describe('formatDaysAgo', () => {
  const today = new Date(2026, 9, 29, 9, 0);
  const daysBefore = (n: number, hour = 12) => new Date(2026, 9, 29 - n, hour, 0);

  it('counts calendar days, not 24-hour spans', () => {
    expect(formatDaysAgo(daysBefore(0, 1), today)).toBe('today');
    // Late last night is yesterday, though it is under 24 hours ago.
    expect(formatDaysAgo(daysBefore(1, 23), today)).toBe('yesterday');
    expect(formatDaysAgo(daysBefore(12), today)).toBe('12 days ago');
    expect(formatDaysAgo(daysBefore(29), today)).toBe('29 days ago');
  });
  it('gives the date from 30 days back', () => {
    expect(formatDaysAgo(daysBefore(30), today)).toBe('Sep 29');
  });
  it('treats a time later today as today', () => {
    expect(formatDaysAgo(new Date(2026, 9, 29, 20, 0), today)).toBe('today');
  });
});
