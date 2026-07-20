// Game-mode escalation ladder (SPEC section 1).
// Chooses which retrieval task to present based on card maturity and the
// content actually available for the word. Pure and unit tested.

import type { CardState, GameModeId } from '@/lib/types';

export interface ModeMeta {
  id: GameModeId;
  label: string;
  // Higher tier = higher retrieval demand.
  retrievalTier: 1 | 2 | 3 | 4;
}

export const MODE_META: Record<GameModeId, ModeMeta> = {
  mc_def_to_word: { id: 'mc_def_to_word', label: 'Choose the word', retrievalTier: 1 },
  mc_word_to_def: { id: 'mc_word_to_def', label: 'Choose the meaning', retrievalTier: 1 },
  listening: { id: 'listening', label: 'Listen', retrievalTier: 2 },
  cloze: { id: 'cloze', label: 'Fill the blank', retrievalTier: 2 },
  synonym_match: { id: 'synonym_match', label: 'Pick synonyms', retrievalTier: 2 },
  antonym_match: { id: 'antonym_match', label: 'Pick antonyms', retrievalTier: 2 },
  production: { id: 'production', label: 'Type the word', retrievalTier: 3 },
  use_it: { id: 'use_it', label: 'Use it in a sentence', retrievalTier: 4 },
};

// What content the word has, so the ladder never selects an impossible mode.
export interface ModeCapabilities {
  hasClozeExample: boolean;
  hasRelations: { synonym: boolean; antonym: boolean };
  hasAudio: boolean;
}

// Ordered preference per maturity bucket. The first eligible mode (subject to
// content) wins, with a deterministic rotation for variety.
const NEW_LADDER: GameModeId[] = ['mc_def_to_word', 'mc_word_to_def'];
const LEARNING_LADDER: GameModeId[] = ['cloze', 'mc_word_to_def', 'listening'];
const YOUNG_LADDER: GameModeId[] = ['production', 'synonym_match', 'cloze'];
const MATURE_LADDER: GameModeId[] = ['use_it', 'production', 'antonym_match'];
const RELEARN_LADDER: GameModeId[] = ['cloze', 'mc_def_to_word'];

function eligible(mode: GameModeId, caps: ModeCapabilities): boolean {
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
      // mc_* , production, use_it always have a viable construction.
      return true;
  }
}

/** Maturity threshold: reps and stability at which a card is "mature". */
export const MATURE_REPS = 4;
export const MATURE_STABILITY_DAYS = 14;

export interface LadderInput {
  isNew: boolean;
  state: CardState;
  reps: number;
  stability: number;
  caps: ModeCapabilities;
  // Deterministic rotation source (e.g. reps + wordId) for variety.
  variantSeed: number;
}

export function chooseMode(input: LadderInput): GameModeId {
  const ladder = pickLadder(input);
  const options = ladder.filter((m) => eligible(m, input.caps));
  const pool = options.length > 0 ? options : ['mc_word_to_def' as GameModeId];
  const idx = Math.abs(Math.trunc(input.variantSeed)) % pool.length;
  return pool[idx] ?? pool[0]!;
}

function pickLadder(input: LadderInput): GameModeId[] {
  if (input.isNew || input.state === 'new') return NEW_LADDER;
  if (input.state === 'relearning') return RELEARN_LADDER;
  if (input.state === 'learning') return LEARNING_LADDER;
  // review
  const mature = input.reps >= MATURE_REPS && input.stability >= MATURE_STABILITY_DAYS;
  return mature ? MATURE_LADDER : YOUNG_LADDER;
}
