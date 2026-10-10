import { tierWindowForLevel } from '@/features/feed/wordOrder';
import { loadContent } from '@/lib/content';
import { WORD_LEVELS, levelForEstimate, needsLevel } from './levels';

describe('WORD_LEVELS', () => {
  it('runs from easiest to hardest', () => {
    const estimates = WORD_LEVELS.map((l) => l.levelEstimate);
    expect(estimates).toEqual([...estimates].sort((a, b) => a - b));
    expect(new Set(estimates).size).toBe(WORD_LEVELS.length);
  });

  it('saves estimates the rest of the app accepts', () => {
    for (const level of WORD_LEVELS) {
      expect(level.levelEstimate).toBeGreaterThanOrEqual(1);
      expect(level.levelEstimate).toBeLessThanOrEqual(5);
    }
  });

  // The samples are typed by hand. If the pipeline re-tiers the words, a
  // sample can end up outside its level and mislead the learner.
  it('shows sample words that are in the words file, inside their level', async () => {
    const content = await loadContent();
    for (const level of WORD_LEVELS) {
      const window = tierWindowForLevel(level.levelEstimate);
      for (const sample of level.samples) {
        const word = content.byHeadword.get(sample);
        expect(word).toBeDefined();
        expect(word!.difficultyTier).toBeGreaterThanOrEqual(window.minTier);
        expect(word!.difficultyTier).toBeLessThanOrEqual(window.maxTier);
      }
    }
  });
});

describe('levelForEstimate', () => {
  it('returns the level each option saves', () => {
    for (const level of WORD_LEVELS) {
      expect(levelForEstimate(level.levelEstimate)?.id).toBe(level.id);
    }
  });

  it('maps every placement estimate to a level', () => {
    expect([1, 2, 3, 4, 5].map((e) => levelForEstimate(e)?.id)).toEqual([
      'regular',
      'regular',
      'advanced',
      'expert',
      'expert',
    ]);
  });

  it('is null when no level is saved', () => {
    expect(levelForEstimate(null)).toBeNull();
  });
});

describe('needsLevel', () => {
  it('is true when no level was saved', () => {
    expect(needsLevel({ levelEstimate: null })).toBe(true);
  });
  it('is false once any level is saved', () => {
    expect(needsLevel({ levelEstimate: 1 })).toBe(false);
    expect(needsLevel({ levelEstimate: 5 })).toBe(false);
  });
});
