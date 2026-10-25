// The three word levels a new learner picks from on first run, and how each
// one maps to the 1 to 5 level estimate the rest of the app uses. Pure and
// unit tested.
//
// A level is stored as `profiles.level_estimate`, the same number the
// placement test produces, so no new column is needed. The estimate is the
// tier the learner's new words lean toward (see tierWeight). Every tier still
// comes up, less often the further it is:
//
// - Regular is 1: mostly tier 1, often tier 2, now and then the rest.
// - Advanced is 3: mostly tier 3, often tiers 2 and 4, now and then 1 and 5.
// - Expert is 5: mostly tier 5, often tier 4, now and then the rest.
//
// Tiers split the word list into five equal groups by how common each word
// is (pipeline/src/stages/01-ingest-words.ts). Every tier is test-prep
// vocabulary, so Regular is not basic English.

export type WordLevel = 'regular' | 'advanced' | 'expert';

export interface WordLevelOption {
  id: WordLevel;
  label: string;
  /** Saved as the profile's level estimate. */
  levelEstimate: number;
  /** Words from this level's tiers, shown so the learner can judge. */
  samples: readonly string[];
}

export const WORD_LEVELS: readonly WordLevelOption[] = [
  {
    id: 'regular',
    label: 'Regular',
    levelEstimate: 1,
    samples: ['ambiguous', 'pragmatic', 'meticulous'],
  },
  {
    id: 'advanced',
    label: 'Advanced',
    levelEstimate: 3,
    samples: ['audacious', 'erudite', 'placate'],
  },
  {
    id: 'expert',
    label: 'Expert',
    levelEstimate: 5,
    samples: ['obsequious', 'quotidian', 'perspicacious'],
  },
];

/**
 * The level that matches a saved estimate, or null when there is none. The
 * placement test can save any of 1 to 5, so 2 reads as Regular and 4 as
 * Expert.
 */
export function levelForEstimate(levelEstimate: number | null): WordLevelOption | null {
  if (levelEstimate == null) return null;
  const id: WordLevel =
    levelEstimate <= 2 ? 'regular' : levelEstimate >= 4 ? 'expert' : 'advanced';
  return WORD_LEVELS.find((l) => l.id === id) ?? null;
}

/**
 * How often each tier comes up for a saved estimate, in a sentence, such as
 * "Mostly tier 3, often tiers 2 and 4, and now and then tiers 1 and 5." It
 * follows the weights in tierWeight: the learner's tier, the tiers next to
 * it, then the rest.
 */
export function describeTierMix(levelEstimate: number): string {
  const center = Math.min(5, Math.max(1, Math.round(levelEstimate)));
  const tiers = [1, 2, 3, 4, 5];
  const near = tiers.filter((t) => Math.abs(t - center) === 1);
  const far = tiers.filter((t) => Math.abs(t - center) > 1);
  return `Mostly tier ${center}, often ${tierList(near)}, and now and then ${tierList(far)}.`;
}

/** "tier 2", "tiers 2 and 4" or "tiers 3 to 5". Expects tiers in order. */
function tierList(tiers: readonly number[]): string {
  if (tiers.length === 1) return `tier ${tiers[0]}`;
  const first = tiers[0]!;
  const last = tiers[tiers.length - 1]!;
  if (tiers.length > 2 && last - first === tiers.length - 1) return `tiers ${first} to ${last}`;
  return `tiers ${tiers.slice(0, -1).join(', ')} and ${last}`;
}

/**
 * Whether the learner still needs to choose a level, so the home screen
 * offers the choice. Before the level picker, a learner could skip the
 * placement test and reach home with no estimate saved.
 */
export function needsLevel(profile: { levelEstimate: number | null }): boolean {
  return profile.levelEstimate === null;
}
