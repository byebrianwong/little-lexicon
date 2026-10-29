// The words the learner has started, in three lists: Learning, Due and Known.
// The Learning view shows the lists, and Home and Progress show their lengths,
// so every count matches the list it opens. Pure and unit tested.
//
// - Learning and Known come from the word tracker (features/tracker). A word
//   is known once it has been answered right on 5 separate days with no
//   mistake since. Every answered word is in exactly one of the two.
// - Due comes from the review schedule: the words a session would review now.
//   A due word is also in Learning or Known, because the two rules differ.
//
// Words that are no longer in the words file (retired by the pipeline) are
// left out, since there is nothing to show for them.

import { formatDaysAgo, formatNextDue, formatShortDate } from '@/lib/date';
import type { WordContent, WordSchedule } from '@/lib/types';
import {
  KNOWN_AFTER_DAYS,
  LATEST_ANSWERS,
  type WordTracker,
} from '@/features/tracker/tracker';

export type WordStatus = 'learning' | 'due' | 'known';

export const WORD_STATUSES: readonly { id: WordStatus; label: string }[] = [
  { id: 'learning', label: 'Learning' },
  { id: 'due', label: 'Due' },
  { id: 'known', label: 'Known' },
];

export function isWordStatus(value: unknown): value is WordStatus {
  return WORD_STATUSES.some((s) => s.id === value);
}

/** One word in a list, with everything its row shows. */
export interface WordProgress {
  content: WordContent;
  /** Undefined only for a due word with no answers on record. */
  tracker: WordTracker | undefined;
  /** Undefined for a word answered only in practice, which never schedules it. */
  schedule: WordSchedule | undefined;
  /** When the word was saved, or null when it is not saved. */
  savedAt: string | null;
}

export type YourWords = Record<WordStatus, WordProgress[]>;
export type WordCounts = Record<WordStatus, number>;

/** The rule a session uses for its due queue. */
export function isDue(schedule: WordSchedule, now: Date = new Date()): boolean {
  return (
    !schedule.isKnown &&
    !schedule.isSuspended &&
    Date.parse(schedule.due) <= now.getTime()
  );
}

export interface GroupInput {
  content: ReadonlyMap<number, WordContent>;
  trackers: ReadonlyMap<number, WordTracker>;
  schedules: readonly WordSchedule[];
  /** When each saved word was saved, by word id. */
  savedAt: ReadonlyMap<number, string>;
}

/** Most recently answered first; ties, and words never answered, by headword. */
function byLastAnswer(a: WordProgress, b: WordProgress): number {
  const at = (w: WordProgress) =>
    w.tracker ? Date.parse(w.tracker.lastAnsweredAt) : -Infinity;
  return at(b) - at(a) || a.content.headword.localeCompare(b.content.headword);
}

/** Every started word, sorted into the three lists, each most recently answered first. */
export function groupWords(input: GroupInput, now: Date = new Date()): YourWords {
  const schedules = new Map(input.schedules.map((s) => [s.wordId, s]));
  const entry = (content: WordContent): WordProgress => ({
    content,
    tracker: input.trackers.get(content.wordId),
    schedule: schedules.get(content.wordId),
    savedAt: input.savedAt.get(content.wordId) ?? null,
  });

  const out: YourWords = { learning: [], due: [], known: [] };
  for (const tracker of input.trackers.values()) {
    const content = input.content.get(tracker.wordId);
    if (content) out[tracker.status].push(entry(content));
  }
  for (const schedule of input.schedules) {
    const content = input.content.get(schedule.wordId);
    if (content && isDue(schedule, now)) out.due.push(entry(content));
  }
  out.learning.sort(byLastAnswer);
  out.due.sort(byLastAnswer);
  out.known.sort(byLastAnswer);
  return out;
}

export function countWords(words: YourWords): WordCounts {
  return {
    learning: words.learning.length,
    due: words.due.length,
    known: words.known.length,
  };
}

/**
 * When the schedule brings the word back, as a phrase that follows "Next
 * review": "due now", "in 3 days", "not scheduled yet".
 */
export function nextReview(
  schedule: WordSchedule | undefined,
  now: Date = new Date(),
): string {
  // Practice never schedules a word. A session does once it introduces it.
  if (!schedule) return 'not scheduled yet';
  if (schedule.isKnown) return 'none, marked as known';
  if (schedule.isSuspended) return 'none, paused';
  if (isDue(schedule, now)) return 'due now';
  return formatNextDue(new Date(schedule.due), now);
}

/** Progress toward known, beside the row's meter: "2 of 5 days", or "Known". */
export function knownProgress(tracker: WordTracker | undefined): string {
  if (tracker?.status === 'known') return 'Known';
  return `${tracker?.cleanDays ?? 0} of ${KNOWN_AFTER_DAYS} days`;
}

/** The same, for a screen reader, which cannot see the meter. */
export function knownProgressLabel(tracker: WordTracker | undefined): string {
  if (tracker?.status === 'known') return 'Known';
  return `Right on ${tracker?.cleanDays ?? 0} of the ${KNOWN_AFTER_DAYS} days needed to know it`;
}

/** The line under a row's meter: "7 of 9 right · next review in 3 days". */
export function summaryLine(word: WordProgress, now: Date = new Date()): string {
  const answers = word.tracker
    ? `${word.tracker.rightAnswers} of ${word.tracker.answers} right`
    : 'Not tested yet';
  const s = word.schedule;
  const review =
    !s || s.isKnown || s.isSuspended
      ? 'no review scheduled'
      : isDue(s, now)
        ? 'due now'
        : `next review ${formatNextDue(new Date(s.due), now)}`;
  return `${answers} · ${review}`;
}

export interface WordFact {
  label: string;
  value: string;
}

function latestAnswers(tracker: WordTracker): string {
  return `${tracker.latestRight} of last ${tracker.latestCount} right`;
}

/** Everything an open row lists about the word, in order. */
export function wordFacts(word: WordProgress, now: Date = new Date()): WordFact[] {
  const t = word.tracker;
  const facts: WordFact[] = [];
  if (t) {
    const pct = Math.round((t.rightAnswers / t.answers) * 100);
    facts.push({
      label: 'Answers',
      value: `${t.rightAnswers} of ${t.answers} right (${pct}%)`,
    });
    // With no more answers than the latest count covers, it would say the same.
    if (t.answers > LATEST_ANSWERS)
      facts.push({ label: 'Latest', value: latestAnswers(t) });
    facts.push({
      label: 'Last tested',
      value: formatDaysAgo(new Date(t.lastAnsweredAt), now),
    });
  } else {
    facts.push({ label: 'Answers', value: 'none yet' });
  }
  facts.push({ label: 'Next review', value: nextReview(word.schedule, now) });
  if (t) {
    facts.push({
      label: 'First tested',
      value: formatShortDate(new Date(t.firstAnsweredAt), now),
    });
  }
  if (word.savedAt)
    facts.push({ label: 'Saved', value: formatShortDate(new Date(word.savedAt), now) });
  return facts;
}
