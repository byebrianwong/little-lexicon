// Feature availability.
//
// There is no free/Pro split in the app any more: every game mode is available
// to everyone, new words are not rationed per day, and practice is unbounded.
// The Pro flag still exists on the profile and is still set server-side by the
// RevenueCat webhook, but nothing in the client gates on it.
//
// What remains here is one number: how many unseen words to FETCH when building
// a session. That is a query bound so a large collection does not load in full,
// not a cap on how much a user may learn. When the queue empties, the session
// simply builds a new one.

/** How many unseen words to pull when assembling a session queue. */
export const NEW_WORD_FETCH_LIMIT = 500;

/** How many due cards to pull when assembling a session queue. */
export const DUE_FETCH_LIMIT = 500;
