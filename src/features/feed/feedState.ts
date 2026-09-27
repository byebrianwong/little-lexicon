// What the Discover feed's buttons do. Pure and unit tested; the screen runs
// the effects this module returns.
//
// A word in the feed is in one of four states:
//
// - untouched
// - listed: on the user's list. Stored at once, and undone by a soft remove
//   (the row gets removed_at), so it can be undone at any time.
// - pending known: the user tapped "I know it" and the card is still on
//   screen. Nothing is stored yet.
// - known: stored with markKnown.
//
// "I know it" waits because marking a word known writes a user_word_state row,
// and the only way to undo that would be to delete the row. The app never
// hard-deletes user data. So the write happens when the card leaves the screen
// (or the feed closes), and until then Undo just forgets the tap.

export interface FeedMarks {
  /** On the user's list. Comes from the server, updated optimistically. */
  listed: ReadonlySet<number>;
  /** Tapped "I know it", not stored yet. */
  pendingKnown: ReadonlySet<number>;
  /** Stored as known during this visit to the feed. */
  known: ReadonlySet<number>;
}

export type FeedStatus = 'none' | 'listed' | 'pendingKnown' | 'known';

export type FeedEffect =
  | { type: 'add'; wordId: number }
  | { type: 'remove'; wordId: number }
  | { type: 'markKnown'; wordIds: number[] };

export type FeedAction =
  | { type: 'learn'; wordId: number }
  | { type: 'unlearn'; wordId: number }
  | { type: 'know'; wordId: number }
  | { type: 'unknow'; wordId: number }
  /** Store every pending "I know it" except the one still on screen. */
  | { type: 'settle'; keep: number | null };

export interface FeedResult {
  pendingKnown: ReadonlySet<number>;
  known: ReadonlySet<number>;
  effects: FeedEffect[];
}

export function feedStatus(marks: FeedMarks, wordId: number): FeedStatus {
  if (marks.known.has(wordId)) return 'known';
  if (marks.pendingKnown.has(wordId)) return 'pendingKnown';
  if (marks.listed.has(wordId)) return 'listed';
  return 'none';
}

function without(set: ReadonlySet<number>, id: number): Set<number> {
  const out = new Set(set);
  out.delete(id);
  return out;
}

export function applyFeedAction(marks: FeedMarks, action: FeedAction): FeedResult {
  const unchanged: FeedResult = {
    pendingKnown: marks.pendingKnown,
    known: marks.known,
    effects: [],
  };

  switch (action.type) {
    case 'learn': {
      const status = feedStatus(marks, action.wordId);
      if (status === 'listed' || status === 'known') return unchanged;
      // From pending known, the tap changes the user's mind: forget the
      // pending mark (nothing was stored) and add to the list instead.
      return {
        pendingKnown: without(marks.pendingKnown, action.wordId),
        known: marks.known,
        effects: [{ type: 'add', wordId: action.wordId }],
      };
    }
    case 'unlearn': {
      if (feedStatus(marks, action.wordId) !== 'listed') return unchanged;
      return { ...unchanged, effects: [{ type: 'remove', wordId: action.wordId }] };
    }
    case 'know': {
      const status = feedStatus(marks, action.wordId);
      if (status === 'pendingKnown' || status === 'known') return unchanged;
      const pendingKnown = new Set(marks.pendingKnown);
      pendingKnown.add(action.wordId);
      return {
        pendingKnown,
        known: marks.known,
        // A known word does not belong on the list.
        effects: status === 'listed' ? [{ type: 'remove', wordId: action.wordId }] : [],
      };
    }
    case 'unknow': {
      if (!marks.pendingKnown.has(action.wordId)) return unchanged;
      return {
        pendingKnown: without(marks.pendingKnown, action.wordId),
        known: marks.known,
        effects: [],
      };
    }
    case 'settle': {
      const toStore = [...marks.pendingKnown].filter((id) => id !== action.keep);
      if (toStore.length === 0) return unchanged;
      const known = new Set(marks.known);
      for (const id of toStore) known.add(id);
      const pendingKnown =
        action.keep !== null && marks.pendingKnown.has(action.keep)
          ? new Set([action.keep])
          : new Set<number>();
      return {
        pendingKnown,
        known,
        effects: [{ type: 'markKnown', wordIds: toStore }],
      };
    }
  }
}
