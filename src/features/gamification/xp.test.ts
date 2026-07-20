import { xpForOutcome, levelForXp, xpForLevel, levelProgress, BASE_XP } from './xp';
import { Rating } from '@/srs/srs';

describe('xpForOutcome', () => {
  it('awards nothing for an incorrect answer', () => {
    expect(
      xpForOutcome({ mode: 'production', rating: Rating.Again, firstAttempt: false, fast: false }),
    ).toBe(0);
  });

  it('rewards production more than multiple choice for the same rating', () => {
    const prod = xpForOutcome({
      mode: 'production',
      rating: Rating.Good,
      firstAttempt: true,
      fast: false,
    });
    const mc = xpForOutcome({
      mode: 'mc_def_to_word',
      rating: Rating.Good,
      firstAttempt: true,
      fast: false,
    });
    expect(prod).toBeGreaterThan(mc);
  });

  it('adds a speed bonus only on a fast Easy', () => {
    const easyFast = xpForOutcome({
      mode: 'cloze',
      rating: Rating.Easy,
      firstAttempt: true,
      fast: true,
    });
    const easySlow = xpForOutcome({
      mode: 'cloze',
      rating: Rating.Easy,
      firstAttempt: true,
      fast: false,
    });
    expect(easyFast).toBe(easySlow + 3);
  });

  it('discounts Hard outcomes', () => {
    const good = xpForOutcome({
      mode: 'cloze',
      rating: Rating.Good,
      firstAttempt: false,
      fast: false,
    });
    const hard = xpForOutcome({
      mode: 'cloze',
      rating: Rating.Hard,
      firstAttempt: false,
      fast: false,
    });
    expect(hard).toBeLessThan(good);
    expect(hard).toBe(Math.round(BASE_XP.cloze * 0.7));
  });
});

describe('levels', () => {
  it('starts at level 1 for zero xp', () => {
    expect(levelForXp(0)).toBe(1);
    expect(levelForXp(-5)).toBe(1);
  });

  it('is monotonic in xp', () => {
    let prev = 0;
    for (let xp = 0; xp <= 5000; xp += 137) {
      const lvl = levelForXp(xp);
      expect(lvl).toBeGreaterThanOrEqual(prev);
      prev = lvl;
    }
  });

  it('xpForLevel is the inverse boundary of levelForXp', () => {
    for (let l = 1; l <= 20; l++) {
      const floor = xpForLevel(l);
      expect(levelForXp(floor)).toBe(l);
    }
  });

  it('levelProgress fraction stays within 0..1', () => {
    for (const xp of [0, 39, 40, 41, 1000, 9999]) {
      const p = levelProgress(xp);
      expect(p.fraction).toBeGreaterThanOrEqual(0);
      expect(p.fraction).toBeLessThanOrEqual(1);
    }
  });
});
