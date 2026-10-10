// The three word levels a new learner picks from on first run, and how each
// one maps to the 1 to 5 level estimate the rest of the app uses. Pure and
// unit tested.
//
// A level is stored as `profiles.level_estimate`, the same number the
// placement test produces, so no new column is needed. The estimate is the
// tier the learner's new words center on (see tierWindowForLevel), so:
//
// - Regular is 1: new words come from tiers 1 and 2.
// - Advanced is 3: tiers 2 to 4.
// - Expert is 5: tiers 4 and 5.
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
    samples: ['obsequious', 'recondite', 'perspicacious'],
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
 * Whether the learner still needs to choose a level, so the home screen
 * offers the choice. Before the level picker, a learner could skip the
 * placement test and reach home with no estimate saved.
 */
export function needsLevel(profile: { levelEstimate: number | null }): boolean {
  return profile.levelEstimate === null;
}
