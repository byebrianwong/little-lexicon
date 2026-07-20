import { chooseMode, MODE_META, type ModeCapabilities, type LadderInput } from './ladder';

const fullCaps: ModeCapabilities = {
  hasClozeExample: true,
  hasRelations: { synonym: true, antonym: true },
  hasAudio: true,
};

const noCaps: ModeCapabilities = {
  hasClozeExample: false,
  hasRelations: { synonym: false, antonym: false },
  hasAudio: false,
};

function input(partial: Partial<LadderInput>): LadderInput {
  return {
    isNew: false,
    state: 'review',
    reps: 0,
    stability: 0,
    caps: fullCaps,
    variantSeed: 0,
    ...partial,
  };
}

describe('chooseMode', () => {
  it('uses recognition for brand-new cards', () => {
    const mode = chooseMode(input({ isNew: true, state: 'new', variantSeed: 0 }));
    expect(mode.startsWith('mc_')).toBe(true);
  });

  it('uses cloze for learning cards when a cloze example exists', () => {
    expect(chooseMode(input({ state: 'learning', variantSeed: 0 }))).toBe('cloze');
  });

  it('escalates young review cards to production', () => {
    expect(chooseMode(input({ state: 'review', reps: 2, stability: 3, variantSeed: 0 }))).toBe(
      'production',
    );
  });

  it('escalates mature cards to use-it', () => {
    const mode = chooseMode(input({ state: 'review', reps: 6, stability: 40, variantSeed: 0 }));
    expect(mode).toBe('use_it');
    expect(MODE_META[mode].retrievalTier).toBe(4);
  });

  it('never selects a mode whose content is missing', () => {
    // learning card, but no cloze example and no audio -> must fall back to MC.
    const mode = chooseMode(input({ state: 'learning', caps: noCaps, variantSeed: 0 }));
    expect(mode).toBe('mc_word_to_def');
  });

  it('is deterministic for the same input', () => {
    const a = chooseMode(input({ state: 'review', reps: 2, stability: 3, variantSeed: 7 }));
    const b = chooseMode(input({ state: 'review', reps: 2, stability: 3, variantSeed: 7 }));
    expect(a).toBe(b);
  });
});
