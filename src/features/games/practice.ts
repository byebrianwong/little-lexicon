// Endless practice.
//
// The scheduled session is bounded by what FSRS says is actually due, which is
// correct for retention but means it runs out. Practice is the opposite: it
// draws from every word you have, forever, in shuffled rounds.
//
// Practice deliberately does NOT write review logs or reschedule cards.
// Repeatedly grading a card you just saw would wreck its FSRS interval and
// inflate retention stats, so practice is play, and the schedule is left alone.

import type { GameModeId, SessionItem, WordContent } from '@/lib/types';
import type { ModeCapabilities } from './ladder';
import { mulberry32 } from './optionPool';

/** Modes practice rotates through, easiest retrieval first. */
export const PRACTICE_MODES: readonly GameModeId[] = [
  'mc_word_to_def',
  'cloze',
  'mc_def_to_word',
  'synonym_match',
  'production',
  'listening',
  'antonym_match',
];

/** Whether a word has the content a mode needs. Mirrors the ladder's rules. */
export function isPlayable(mode: GameModeId, caps: ModeCapabilities): boolean {
  switch (mode) {
    case 'cloze':
      return caps.hasClozeExample;
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

/** Deterministic Fisher-Yates, so a round is reproducible from its seed. */
export function shuffle<T>(items: readonly T[], seed: number): T[] {
  const out = [...items];
  const rng = mulberry32(seed);
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

/**
 * One round of practice: every word once, shuffled. Rounds are concatenated by
 * the caller to make an endless queue.
 */
export function buildPracticeRound(words: readonly WordContent[], round: number): SessionItem[] {
  return shuffle(words, round + 1).map<SessionItem>((content) => ({
    content,
    state: null,
    isNew: false,
  }));
}
