import { buildRefill, shouldRefill, REFILL_LOOKAHEAD } from './continuation';
import type { SessionItem, WordContent } from '@/lib/types';

function item(id: number, isNew: boolean): SessionItem {
  const content = { wordId: id, headword: `w${id}` } as WordContent;
  return { content, state: isNew ? null : ({} as never), isNew };
}

const due = (ids: number[]) => ids.map((id) => item(id, false));
const fresh = (ids: number[]) => ids.map((id) => item(id, true));

describe('shouldRefill', () => {
  it('holds off while there is plenty of queue left', () => {
    expect(shouldRefill(0, 40)).toBe(false);
    expect(shouldRefill(30, 40)).toBe(false);
  });

  it('fires once the remaining items reach the lookahead', () => {
    expect(shouldRefill(40 - REFILL_LOOKAHEAD, 40)).toBe(true);
    expect(shouldRefill(39, 40)).toBe(true);
  });

  it('fires at and past the end of the queue', () => {
    expect(shouldRefill(40, 40)).toBe(true);
    expect(shouldRefill(41, 40)).toBe(true);
  });

  it('honours a caller-supplied lookahead', () => {
    expect(shouldRefill(50, 100, 10)).toBe(false);
    expect(shouldRefill(95, 100, 10)).toBe(true);
  });
});

describe('buildRefill', () => {
  it('returns fresh material when nothing overlaps the queue', () => {
    const chunk = buildRefill({
      queue: due([1, 2, 3]),
      due: due([4, 5]),
      newWords: fresh([6]),
    });
    expect(chunk.map((i) => i.content.wordId).sort()).toEqual([4, 5, 6]);
  });

  it('drops words already in the queue, so nothing is graded twice', () => {
    // A refill re-runs the same queries, so the queue's own words come back.
    const chunk = buildRefill({
      queue: due([1, 2, 3]),
      due: due([2, 3, 4]),
      newWords: fresh([1, 9]),
    });
    expect(chunk.map((i) => i.content.wordId).sort()).toEqual([4, 9]);
  });

  it('matches against answered items too, not just the unanswered tail', () => {
    // Items stay in the queue after being answered. Word 1 was answered first;
    // it must not come back later in the same session.
    const chunk = buildRefill({
      queue: due([1, 2]),
      due: due([1]),
      newWords: [],
    });
    expect(chunk).toHaveLength(0);
  });

  it('drops duplicates that appear in both incoming pages', () => {
    const chunk = buildRefill({
      queue: [],
      due: due([7]),
      newWords: fresh([7, 8]),
    });
    expect(chunk.map((i) => i.content.wordId).sort()).toEqual([7, 8]);
  });

  it('interleaves new words among the due cards instead of appending a block', () => {
    const chunk = buildRefill({
      queue: [],
      due: due([1, 2, 3, 4, 5, 6]),
      newWords: fresh([100, 101]),
    });
    expect(chunk).toHaveLength(8);
    // Both new words land inside the run, not bunched at one end.
    const positions = chunk
      .map((i, idx) => (i.isNew ? idx : -1))
      .filter((idx) => idx >= 0);
    expect(positions).toHaveLength(2);
    expect(positions[0]).toBeGreaterThan(0);
    expect(positions[1]).toBeLessThan(chunk.length - 1);
  });

  it('returns nothing when the refill is entirely already-seen material', () => {
    // This empty result is what tells the screen the schedule has run dry.
    const chunk = buildRefill({
      queue: due([1, 2, 3]),
      due: due([1, 2, 3]),
      newWords: [],
    });
    expect(chunk).toEqual([]);
  });

  it('returns nothing when both pages come back empty', () => {
    expect(buildRefill({ queue: due([1]), due: [], newWords: [] })).toEqual([]);
  });

  it('never returns a word twice within one chunk', () => {
    const chunk = buildRefill({
      queue: [],
      due: due([1, 1, 2]),
      newWords: fresh([2, 3, 3]),
    });
    const ids = chunk.map((i) => i.content.wordId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('does not mutate the queue it was given', () => {
    const queue = due([1, 2]);
    buildRefill({ queue, due: due([3]), newWords: fresh([4]) });
    expect(queue.map((i) => i.content.wordId)).toEqual([1, 2]);
  });
});
