// Endless practice.
//
// The scheduled session is bounded by what FSRS says is actually due, which is
// correct for retention but means it runs out. Practice is the opposite: it
// draws from the whole collection, forever.
//
// Practice deliberately does NOT write review logs or reschedule cards.
// Repeatedly grading a card you just saw would wreck its FSRS interval and
// inflate retention stats, so practice is play, and the schedule is left alone.
// It does log each answer to its own table, for the word tracker
// (features/tracker).
//
// Which word comes next is a weighted draw over the collection:
// - saved words come up more often (about half of picks, see SAVED_SHARE);
// - a word with a mistake in the past week comes up twice as often;
// - a known word comes up less often, by the learner's setting;
// - a word does not come back within REPEAT_GAP picks.

import type { GameModeId, KnownWordFrequency, SessionItem, WordContent } from '@/lib/types';
import type { WordTracker } from '@/features/tracker/tracker';
import type { ModeCapabilities } from './ladder';
import { mulberry32 } from './optionPool';

/**
 * Modes practice rotates through, easiest retrieval first. Picking the word
 * for a sentence's blank is listed twice, so it comes up twice as often as
 * any other mode.
 */
export const PRACTICE_MODES: readonly GameModeId[] = [
  'mc_word_to_def',
  'cloze_choice',
  'cloze',
  'mc_def_to_word',
  'synonym_match',
  'cloze_choice',
  'production',
  'listening',
  'antonym_match',
];

/** Whether a word has the content a mode needs. Mirrors the ladder's rules. */
export function isPlayable(mode: GameModeId, caps: ModeCapabilities): boolean {
  switch (mode) {
    case 'cloze':
      return caps.hasClozeExample;
    case 'cloze_choice':
      return caps.hasClozeChoice;
    case 'listening':
      return caps.hasAudio;
    case 'synonym_match':
      return caps.hasRelations.synonym;
    case 'antonym_match':
      return caps.hasRelations.antonym;
    default:
      return true;
  }
}

/**
 * Pick a practice mode for a word. Rotates by `seed` so the same word is not
 * always drilled the same way, and never returns a mode the word lacks content
 * for. Falls back to multiple choice, which every word can always construct.
 */
export function practiceMode(caps: ModeCapabilities, seed: number): GameModeId {
  const playable = PRACTICE_MODES.filter((m) => isPlayable(m, caps));
  if (playable.length === 0) return 'mc_word_to_def';
  const i = Math.abs(Math.floor(seed)) % playable.length;
  return playable[i]!;
}

export const KNOWN_WORD_FREQUENCIES: readonly KnownWordFrequency[] = [
  'rarely',
  'sometimes',
  'often',
];

export const DEFAULT_KNOWN_WORD_FREQUENCY: KnownWordFrequency = 'rarely';

/** A known word's weight, against 1 for a word still being learned. */
export const KNOWN_WORD_WEIGHT: Record<KnownWordFrequency, number> = {
  rarely: 0.2,
  sometimes: 0.5,
  often: 1,
};

/** The saved setting, or the default for a value this version does not know. */
export function parseKnownWordFrequency(value: unknown): KnownWordFrequency {
  return KNOWN_WORD_FREQUENCIES.find((f) => f === value) ?? DEFAULT_KNOWN_WORD_FREQUENCY;
}

/** The weight of a word with a mistake in the past week that is not known again yet. */
export const MISTAKE_WEIGHT = 2;

/**
 * If every word had the same weight, saved words would fill about this share
 * of picks. Known saved words fill less and saved words with recent mistakes
 * fill more. Once saved words outnumber the rest, they get no extra weight.
 */
export const SAVED_SHARE = 0.5;

/** A word does not come back within this many picks, when the collection is big enough. */
export const REPEAT_GAP = 8;

/** Words picked at a time. The practice screen picks more before it runs out. */
export const PRACTICE_CHUNK = 20;

/** How likely a word is to be picked, before the saved-word boost. */
export function practiceWeight(
  tracker: WordTracker | undefined,
  frequency: KnownWordFrequency,
): number {
  if (!tracker) return 1;
  // Known wins: right on 5 separate days after a mistake is known again.
  if (tracker.status === 'known') return KNOWN_WORD_WEIGHT[frequency];
  if (tracker.mistakeRecently) return MISTAKE_WEIGHT;
  return 1;
}

export interface PracticeChunkInput {
  words: readonly WordContent[];
  savedIds: ReadonlySet<number>;
  trackers: ReadonlyMap<number, WordTracker>;
  frequency: KnownWordFrequency;
  /** Word ids already played this run, oldest first. The latest are not repeated. */
  played: readonly number[];
  count: number;
  seed: number;
}

/**
 * The next `count` practice items. Reproducible from its input, so the screen
 * can pick a chunk at a time and the tests can check the odds.
 */
export function buildPracticeChunk(input: PracticeChunkInput): SessionItem[] {
  const { words, savedIds, trackers, frequency, count } = input;
  if (words.length === 0) return [];

  const rng = mulberry32(input.seed);
  const savedCount = words.filter((w) => savedIds.has(w.wordId)).length;
  const boost = savedCount > 0
    ? Math.max(1, ((words.length - savedCount) / savedCount) * (SAVED_SHARE / (1 - SAVED_SHARE)))
    : 1;
  const weightOf = (w: WordContent) =>
    practiceWeight(trackers.get(w.wordId), frequency) * (savedIds.has(w.wordId) ? boost : 1);

  const gap = Math.min(REPEAT_GAP, words.length - 1);
  const recent = [...input.played];
  const out: SessionItem[] = [];
  for (let i = 0; i < count; i++) {
    const blocked = new Set(gap > 0 ? recent.slice(-gap) : []);
    const candidates = words.filter((w) => !blocked.has(w.wordId));
    const pick = weightedPick(candidates, weightOf, rng);
    recent.push(pick.wordId);
    out.push({ content: pick, state: null, isNew: false });
  }
  return out;
}

function weightedPick<T>(items: readonly T[], weightOf: (item: T) => number, rng: () => number): T {
  const weights = items.map(weightOf);
  const total = weights.reduce((sum, w) => sum + w, 0);
  let r = rng() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i]!;
    if (r < 0) return items[i]!;
  }
  // Rounding can leave a sliver past the last item.
  return items[items.length - 1]!;
}
