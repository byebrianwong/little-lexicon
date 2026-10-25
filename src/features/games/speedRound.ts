// Which words a speed round asks about. Pure and unit tested.
//
// A round leans on the learner's own words: words due for review, saved words
// and words the tracker says are being learned. About one word in four
// (OTHER_SHARE) comes from the rest of the collection, weighted toward the
// learner's level the same way new words are (features/feed/wordOrder).
//
// Only some answers count toward the review schedule:
// - a word due for review is graded, as in a session;
// - a word never seen is introduced, as in a session, up to MAX_NEW_WORDS a
//   round;
// - any other word is logged like a practice answer. The tracker sees it, but
//   the schedule does not move and it earns no XP. Grading a word that is not
//   due would pull its next review forward (see practice.ts).
//
// The screen tells these apart by the item: a due word carries its state, a
// new word has isNew set, and any other word has neither.

import type { KnownWordFrequency, SessionItem, WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import { tierWeight, weightedOrder } from '@/features/feed/wordOrder';
import { mulberry32 } from './optionPool';
import { KNOWN_WORD_WEIGHT, practiceWeight } from './practice';

/** Words to line up for one round. More than anyone answers in a minute. */
export const SPEED_ROUND_SIZE = 80;

/** About this share of a round comes from outside the learner's own words. */
export const OTHER_SHARE = 0.25;

/** A due word comes up this many times as often as the learner's other words. */
export const DUE_WEIGHT = 2;

/** At most this many unseen words are introduced in one round. */
export const MAX_NEW_WORDS = 15;

export interface SpeedRoundInput {
  /** The whole collection. */
  words: readonly WordContent[];
  /** Words due for review, with their state. */
  due: readonly SessionItem[];
  /** Words with no review state yet. */
  unseenIds: ReadonlySet<number>;
  savedIds: ReadonlySet<number>;
  trackers: ReadonlyMap<number, WordTracker>;
  levelEstimate: number | null;
  frequency: KnownWordFrequency;
  seed: number;
  count: number;
}

/** Whether a word belongs to the learner: due, saved, or being learned. */
function isOwnWord(
  wordId: number,
  input: Pick<SpeedRoundInput, 'savedIds' | 'trackers'>,
  dueIds: ReadonlySet<number>,
): boolean {
  return (
    dueIds.has(wordId) ||
    input.savedIds.has(wordId) ||
    input.trackers.get(wordId)?.status === 'learning'
  );
}

/** The words for one round, in order. Reproducible from its input. */
export function buildSpeedRound(input: SpeedRoundInput): SessionItem[] {
  const dueById = new Map(input.due.map((i) => [i.content.wordId, i]));
  const dueIds = new Set(dueById.keys());
  const byId = new Map(input.words.map((w) => [w.wordId, w]));

  const own: number[] = [];
  const other: number[] = [];
  for (const w of input.words) {
    (isOwnWord(w.wordId, input, dueIds) ? own : other).push(w.wordId);
  }

  const ownOrder = weightedOrder(
    own,
    (id) =>
      practiceWeight(input.trackers.get(id), input.frequency) *
      (dueIds.has(id) ? DUE_WEIGHT : 1),
    input.seed,
  );
  // A word outside the learner's own that is not unseen was marked known or
  // learned already, so it comes up as often as the known-word setting says.
  const otherOrder = weightedOrder(
    other,
    (id) =>
      tierWeight(byId.get(id)!.difficultyTier, input.levelEstimate) *
      (input.unseenIds.has(id) ? 1 : KNOWN_WORD_WEIGHT[input.frequency]),
    input.seed + 1,
  );

  const rng = mulberry32(input.seed + 2);
  const out: SessionItem[] = [];
  let o = 0;
  let x = 0;
  let introduced = 0;
  while (out.length < input.count && (o < ownOrder.length || x < otherOrder.length)) {
    const fromOther =
      o >= ownOrder.length ? true : x >= otherOrder.length ? false : rng() < OTHER_SHARE;
    const id = fromOther ? otherOrder[x++]! : ownOrder[o++]!;

    const due = dueById.get(id);
    if (due) {
      out.push(due);
    } else if (input.unseenIds.has(id) && introduced < MAX_NEW_WORDS) {
      introduced += 1;
      out.push({ content: byId.get(id)!, state: null, isNew: true });
    } else {
      out.push({ content: byId.get(id)!, state: null, isNew: false });
    }
  }
  return out;
}

/** Whether an answer to this item goes to the review schedule, or is logged as practice. */
export function gradesOnSchedule(item: SessionItem): boolean {
  return item.state !== null || item.isNew;
}
