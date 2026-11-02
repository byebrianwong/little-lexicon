// Which of a word's example sentences a screen shows. Every word has three to
// five, each with its own clip. A word shows the first one when the learner
// first meets it and the next one each time it comes back, so the learner sees
// it used in several contexts. Pure and unit tested.
//
// Screens show the first sense's definition, so the sentence comes from the
// first sense too.

import type { ExampleContent, SessionItem, WordContent } from './types';

/**
 * The example for a visit: the first one on visit 0, then the next one on each
 * visit after that, starting again after the last. Null when there are none.
 */
export function pickExample<T>(examples: readonly T[], visit: number): T | null {
  const count = examples.length;
  if (count === 0) return null;
  const v = Number.isFinite(visit) ? Math.max(0, Math.floor(visit)) : 0;
  return examples[v % count] ?? null;
}

/** The sentence a word shows on a visit. */
export function exampleForVisit(
  content: WordContent,
  visit: number,
): ExampleContent | null {
  return pickExample(content.senses[0]?.examples ?? [], visit);
}

/**
 * How many times the learner has met the word before this question.
 *
 * In a session it is the review count in the word's SRS state: ts-fsrs adds
 * one to `reps` on every review, whatever the rating, and a new word has no
 * state. The item holds the state from before this answer, so the question and
 * its reveal show the same sentence, and the next visit shows the next one.
 * Practice items carry no SRS state, so practice sets `visit` itself.
 */
export function visitOf(item: Pick<SessionItem, 'state' | 'visit'>): number {
  return item.visit ?? item.state?.reps ?? 0;
}

/** The sentence a question and its reveal show for this item. */
export function exampleFor(
  item: Pick<SessionItem, 'content' | 'state' | 'visit'>,
): ExampleContent | null {
  return exampleForVisit(item.content, visitOf(item));
}

/**
 * The sentences a fill-the-blank question may use, without `shown`, the one
 * this visit shows everywhere else. A new word's card shows that sentence just
 * before the first question, so blanking it would give the answer away. It is
 * kept when nothing else is left.
 */
export function avoidShown<T extends Pick<ExampleContent, 'exampleId'>>(
  candidates: readonly T[],
  shown: Pick<ExampleContent, 'exampleId'> | null,
): T[] {
  if (!shown) return [...candidates];
  const rest = candidates.filter((e) => e.exampleId !== shown.exampleId);
  return rest.length > 0 ? rest : [...candidates];
}
