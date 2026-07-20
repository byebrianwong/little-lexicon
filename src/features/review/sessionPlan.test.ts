import { buildSessionPlan, interleave } from './sessionPlan';
import type { SessionItem, WordContent } from '@/lib/types';

function item(id: number, isNew: boolean): SessionItem {
  const content = { wordId: id, headword: `w${id}` } as WordContent;
  return { content, state: isNew ? null : ({} as never), isNew };
}

const due = (n: number) => Array.from({ length: n }, (_, i) => item(1000 + i, false));
const fresh = (n: number) => Array.from({ length: n }, (_, i) => item(2000 + i, true));

describe('interleave', () => {
  it('spreads new words across reviews without dropping any', () => {
    const out = interleave(due(6), fresh(2));
    expect(out).toHaveLength(8);
    expect(out.filter((x) => x.isNew)).toHaveLength(2);
    // New words should not both be at the very start or very end.
    expect(out[0]!.isNew).toBe(false);
  });

  it('handles empty inputs', () => {
    expect(interleave([], fresh(3))).toHaveLength(3);
    expect(interleave(due(3), [])).toHaveLength(3);
  });
});

describe('buildSessionPlan', () => {
  it('caps the total at the daily goal', () => {
    const plan = buildSessionPlan({
      due: due(20),
      newWords: fresh(20),
      dailyGoal: 15,
      newAllowance: 10,
    });
    expect(plan.items).toHaveLength(15);
  });

  it('prioritizes due reviews when overloaded, pausing new intake', () => {
    const plan = buildSessionPlan({
      due: due(20),
      newWords: fresh(20),
      dailyGoal: 15,
      newAllowance: 10,
    });
    expect(plan.reviewCount).toBe(15);
    expect(plan.newCount).toBe(0);
  });

  it('fills remaining slots with new words up to the allowance', () => {
    const plan = buildSessionPlan({
      due: due(3),
      newWords: fresh(20),
      dailyGoal: 15,
      newAllowance: 8,
    });
    expect(plan.reviewCount).toBe(3);
    expect(plan.newCount).toBe(8); // allowance caps it below the 12 open slots
    expect(plan.items).toHaveLength(11);
  });

  it('respects the new allowance as a hard cap', () => {
    const plan = buildSessionPlan({
      due: [],
      newWords: fresh(20),
      dailyGoal: 30,
      newAllowance: 5,
    });
    expect(plan.newCount).toBe(5);
  });
});
