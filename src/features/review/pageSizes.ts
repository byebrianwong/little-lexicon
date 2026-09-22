// How much of the queue to fetch at a time.
//
// These are page sizes, not caps. The session refills as it is played (see
// continuation.ts), so what a user can get through in one sitting is the whole
// collection, not one page of it. They exist only so a large collection does
// not load in full before the first word appears.
//
// They replace the old free/Pro limits, which did cap what a user could study.
// Nothing rations play any more.

/** Due cards to pull when opening a session. */
export const OPENING_DUE_PAGE = 500;

/** Unseen words to pull when opening a session. Refills continue past it. */
export const OPENING_NEW_WORD_PAGE = 500;
