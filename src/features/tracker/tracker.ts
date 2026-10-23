// The tracker on each word: how often it came up lately and how the learner
// has done with it. It is built from every answer in every mode. Sessions and
// speed rounds log answers to review_logs; endless practice logs them to
// practice_logs.
//
// It decides how often endless practice shows a word (features/games/
// practice.ts) and writes the line under each saved word. Sessions are
// scheduled by FSRS and do not read it.

import { startOfDay, toDayString } from '@/lib/date';

/** One answer to a word, in any mode. */
export interface AnswerRecord {
  wordId: number;
  correct: boolean;
  /** ISO time of the answer. */
  at: string;
}

/** Separate days with a right answer, and no mistake since, for a word to count as known. */
export const KNOWN_AFTER_DAYS = 5;
/** What "lately" means: answers and mistakes in this many days count as recent. */
export const RECENT_DAYS = 7;
/** How many of the latest answers the "right" count covers. */
export const LATEST_ANSWERS = 5;

const DAY_MS = 86_400_000;

export type TrackerStatus = 'learning' | 'known';

export interface WordTracker {
  wordId: number;
  status: TrackerStatus;
  /** Separate days (local time) with a right answer since the last mistake. */
  cleanDays: number;
  /** Answers in the last RECENT_DAYS days. */
  answeredRecently: number;
  /** A mistake in the last RECENT_DAYS days. */
  mistakeRecently: boolean;
  /** Of the latest answers (at most LATEST_ANSWERS), how many were right. */
  latestRight: number;
  /** How many answers `latestRight` covers. */
  latestCount: number;
  lastAnsweredAt: string;
}

/**
 * One tracker per word that has at least one answer. A word with no answers
 * has no tracker. A mistake starts the clean days again from zero, so a word
 * that was known goes back to learning.
 */
export function buildTrackers(
  history: readonly AnswerRecord[],
  now: Date = new Date(),
): Map<number, WordTracker> {
  const byWord = new Map<number, AnswerRecord[]>();
  for (const answer of history) {
    const list = byWord.get(answer.wordId);
    if (list) list.push(answer);
    else byWord.set(answer.wordId, [answer]);
  }

  const recentFrom = now.getTime() - RECENT_DAYS * DAY_MS;
  const out = new Map<number, WordTracker>();
  for (const [wordId, answers] of byWord) {
    answers.sort((a, b) => Date.parse(a.at) - Date.parse(b.at));

    let lastMistake = -1;
    for (let i = answers.length - 1; i >= 0; i--) {
      if (!answers[i]!.correct) {
        lastMistake = i;
        break;
      }
    }
    // Every answer after the last mistake is a right one.
    const cleanDays = new Set(
      answers.slice(lastMistake + 1).map((a) => toDayString(new Date(a.at))),
    ).size;
    const latest = answers.slice(-LATEST_ANSWERS);

    out.set(wordId, {
      wordId,
      status: cleanDays >= KNOWN_AFTER_DAYS ? 'known' : 'learning',
      cleanDays,
      answeredRecently: answers.filter((a) => Date.parse(a.at) >= recentFrom).length,
      mistakeRecently: lastMistake >= 0 && Date.parse(answers[lastMistake]!.at) >= recentFrom,
      latestRight: latest.filter((a) => a.correct).length,
      latestCount: latest.length,
      lastAnsweredAt: answers[answers.length - 1]!.at,
    });
  }
  return out;
}

/**
 * The tracker as one short line, for the saved list. For example
 * "Learning (2 of 5 days) · 3 of last 5 right · tested 4 times in the past week".
 */
export function describeTracker(tracker: WordTracker | undefined, now: Date = new Date()): string {
  if (!tracker) return 'Not tested yet';

  const status =
    tracker.status === 'known' ? 'Known' : `Learning (${tracker.cleanDays} of ${KNOWN_AFTER_DAYS} days)`;

  const right =
    tracker.latestCount === 1
      ? tracker.latestRight === 1
        ? 'right last time'
        : 'wrong last time'
      : `${tracker.latestRight} of last ${tracker.latestCount} right`;

  let when: string;
  if (tracker.answeredRecently > 0) {
    const n = tracker.answeredRecently;
    when = `tested ${n} ${n === 1 ? 'time' : 'times'} in the past week`;
  } else {
    const days = Math.round(
      (startOfDay(now).getTime() - startOfDay(new Date(tracker.lastAnsweredAt)).getTime()) / DAY_MS,
    );
    when = `last tested ${days} days ago`;
  }

  return `${status} · ${right} · ${when}`;
}
