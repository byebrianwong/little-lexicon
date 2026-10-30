// Days for the "Upcoming reviews" forecast on the Progress screen. Both
// backends use these, so a day is the same thing in demo and Supabase mode: a
// calendar day in the device's local time, like everywhere else in the app
// (src/lib/date.ts).

import { addDays, startOfDay, toDayString } from '@/lib/date';
import type { ForecastDay } from '@/lib/backend/types';

export interface ForecastWindowDay {
  /** YYYY-MM-DD, local time. */
  day: string;
  /** The local midnight that ends this day. A due date at this instant is the next day's. */
  end: Date;
}

/**
 * The next `days` local days, today first, each with the local midnight that
 * ends it. The device computes the ends, so a day that is 23 or 25 hours long
 * (a daylight saving change) still ends at the right instant.
 */
export function forecastWindow(
  days: number,
  now: Date = new Date(),
): ForecastWindowDay[] {
  const out: ForecastWindowDay[] = [];
  for (let i = 0; i < days; i++) {
    out.push({ day: toDayString(addDays(now, i)), end: startOfDay(addDays(now, i + 1)) });
  }
  return out;
}

/**
 * Counts due dates (epoch ms) into the next `days` local days. A word due
 * before today ends counts in today's bar, overdue words included, so today's
 * bar is never lower than the Due count on the same screen. Due dates after
 * the last day are left out.
 */
export function bucketDueDates(
  dueTimes: number[],
  days: number,
  now: Date = new Date(),
): ForecastDay[] {
  const window = forecastWindow(days, now);
  const buckets = dueTimes.map((t) => window.findIndex((d) => t < d.end.getTime()));
  return window.map((d, i) => ({
    day: d.day,
    dueCount: buckets.filter((b) => b === i).length,
  }));
}
