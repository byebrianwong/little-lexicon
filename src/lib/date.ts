// Small date helpers. Days are handled as YYYY-MM-DD in the device's local
// time so "today" matches what the user sees.

export function toDayString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

export function todayString(now: Date = new Date()): string {
  return toDayString(now);
}

export function addDays(d: Date, days: number): Date {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

export function startOfDay(d: Date = new Date()): Date {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

/**
 * When a review is due, relative to now: "in 10 minutes", "tomorrow",
 * "in 3 days", "in 2 months". Rounds to the nearest unit. FSRS schedules in
 * whole minutes and whole days, so nothing finer is needed.
 */
export function formatNextDue(due: Date, now: Date = new Date()): string {
  const ms = due.getTime() - now.getTime();
  const minute = 60_000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (ms < minute) return 'in a moment';
  if (ms < hour) return inUnits(Math.round(ms / minute), 'minute');
  if (ms < day) return inUnits(Math.round(ms / hour), 'hour');
  const days = Math.round(ms / day);
  if (days === 1) return 'tomorrow';
  if (days < 30) return `in ${days} days`;
  if (days < 365) return inUnits(Math.round(days / 30), 'month');
  return inUnits(Math.round(days / 365), 'year');
}

function inUnits(n: number, unit: string): string {
  return `in ${n} ${unit}${n === 1 ? '' : 's'}`;
}
