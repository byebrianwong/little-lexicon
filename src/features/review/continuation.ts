// Keeping a scheduled session going.
//
// A session used to be a fixed queue: build it once, answer every item, get
// sent to the summary. Even after the daily caps were removed that still made
// the app feel like a once-a-day thing, because the only way to carry on was to
// back out and start again. This module holds the pure part of the fix: when to
// fetch more material, and how to splice it onto a queue that is already being
// played. The fetching itself lives in the session screen.
//
// One rule shapes all of it. A scheduled session writes FSRS reviews, so it may
// only serve material that is genuinely schedulable: cards that are due, and
// words the user has never seen. Grading a word again minutes after answering
// it would wreck its interval and inflate retention, which is the same reason
// practice never writes to the schedule (see features/games/practice.ts). So
// when schedulable material runs out this module does not invent more. The
// screen hands off to practice instead, which is endless and leaves the
// schedule alone.

import type { SessionItem } from '@/lib/types';
import { interleave } from './sessionPlan';

/** Fetch more once this many unanswered items are left in the queue. */
export const REFILL_LOOKAHEAD = 5;

/**
 * How many due cards and how many new words to pull per refill.
 *
 * This is a page size, not a cap. Refills repeat for as long as the user keeps
 * answering, so the reachable total is the whole collection. It is kept small
 * so a refill lands well before the user reaches the end of the queue.
 */
export const REFILL_PAGE = 40;

/** Whether the play head is close enough to the end to warrant fetching more. */
export function shouldRefill(
  index: number,
  queueLength: number,
  lookahead: number = REFILL_LOOKAHEAD,
): boolean {
  return queueLength - index <= lookahead;
}

export interface RefillInput {
  /** The queue as it stands, including items already answered this session. */
  queue: readonly SessionItem[];
  due: readonly SessionItem[];
  newWords: readonly SessionItem[];
}

/**
 * The next chunk to append to a running session.
 *
 * A refill re-runs the same queries that built the session, so it returns words
 * that are already in the queue. Those have to be dropped. Answered items stay
 * in the queue, so matching against the whole queue (not just the unanswered
 * tail) is what stops a word being served, and therefore graded, twice in one
 * session. New words are interleaved among the due cards the same way the
 * opening plan does it, so a refill does not arrive as a solid block of unseen
 * words.
 *
 * Returns an empty array when the refill produced nothing, which is the signal
 * that schedulable material has run out.
 */
export function buildRefill(input: RefillInput): SessionItem[] {
  const have = new Set(input.queue.map((i) => i.content.wordId));
  // Mutating `have` as we go also drops duplicates within the incoming pages,
  // which overlap whenever a due card is also returned as a new word.
  const take = (items: readonly SessionItem[]): SessionItem[] => {
    const out: SessionItem[] = [];
    for (const item of items) {
      if (have.has(item.content.wordId)) continue;
      have.add(item.content.wordId);
      out.push(item);
    }
    return out;
  };
  const due = take(input.due);
  const fresh = take(input.newWords);
  return interleave(due, fresh);
}
