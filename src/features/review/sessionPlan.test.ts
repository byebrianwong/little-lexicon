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
  it('offers everything available, with no cap on session length', () => {
    const plan = buildSessionPlan({ due: due(20), newWords: fresh(20) });
    expect(plan.items).toHaveLength(40);
    expect(plan.reviewCount).toBe(20);
    expect(plan.newCount).toBe(20);
  });

  it('does not ration new words behind a daily allowance', () => {
    const plan = buildSessionPlan({ due: [], newWords: fresh(50) });
    expect(plan.newCount).toBe(50);
    expect(plan.items).toHaveLength(50);
  });

  it('still introduces new words when a large review backlog exists', () => {
    // The old planner starved new intake once due >= goal. Nothing is starved now.
    const plan = buildSessionPlan({ due: due(100), newWords: fresh(5) });
    expect(plan.reviewCount).toBe(100);
    expect(plan.newCount).toBe(5);
  });

  it('handles an empty queue', () => {
    const plan = buildSessionPlan({ due: [], newWords: [] });
    expect(plan.items).toHaveLength(0);
    expect(plan.reviewCount).toBe(0);
    expect(plan.newCount).toBe(0);
  });

  it('keeps every item exactly once', () => {
    const plan = buildSessionPlan({ due: due(7), newWords: fresh(4) });
    const ids = plan.items.map((i) => i.content.wordId);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
