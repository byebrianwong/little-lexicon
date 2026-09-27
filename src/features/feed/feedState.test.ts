import { applyFeedAction, feedStatus, type FeedMarks } from './feedState';

function marks(parts: Partial<Record<keyof FeedMarks, number[]>> = {}): FeedMarks {
  return {
    listed: new Set(parts.listed ?? []),
    pendingKnown: new Set(parts.pendingKnown ?? []),
    known: new Set(parts.known ?? []),
  };
}

describe('feedStatus', () => {
  it('reads known over pending over listed', () => {
    expect(feedStatus(marks(), 1)).toBe('none');
    expect(feedStatus(marks({ listed: [1] }), 1)).toBe('listed');
    expect(feedStatus(marks({ pendingKnown: [1] }), 1)).toBe('pendingKnown');
    expect(feedStatus(marks({ known: [1] }), 1)).toBe('known');
  });
});

describe('applyFeedAction', () => {
  it('adds an untouched word to the list', () => {
    const r = applyFeedAction(marks(), { type: 'learn', wordId: 1 });
    expect(r.effects).toEqual([{ type: 'add', wordId: 1 }]);
  });

  it('does nothing when learning a word that is already listed or known', () => {
    expect(applyFeedAction(marks({ listed: [1] }), { type: 'learn', wordId: 1 }).effects).toEqual(
      [],
    );
    expect(applyFeedAction(marks({ known: [1] }), { type: 'learn', wordId: 1 }).effects).toEqual(
      [],
    );
  });

  it('switching from a pending "I know it" to "Learn this" stores only the add', () => {
    const r = applyFeedAction(marks({ pendingKnown: [1] }), { type: 'learn', wordId: 1 });
    expect(r.pendingKnown.has(1)).toBe(false);
    expect(r.effects).toEqual([{ type: 'add', wordId: 1 }]);
  });

  it('removes a listed word on undo', () => {
    const r = applyFeedAction(marks({ listed: [1] }), { type: 'unlearn', wordId: 1 });
    expect(r.effects).toEqual([{ type: 'remove', wordId: 1 }]);
    expect(applyFeedAction(marks(), { type: 'unlearn', wordId: 1 }).effects).toEqual([]);
  });

  it('"I know it" stores nothing yet', () => {
    const r = applyFeedAction(marks(), { type: 'know', wordId: 1 });
    expect(r.pendingKnown.has(1)).toBe(true);
    expect(r.effects).toEqual([]);
  });

  it('"I know it" on a listed word takes it off the list', () => {
    const r = applyFeedAction(marks({ listed: [1] }), { type: 'know', wordId: 1 });
    expect(r.pendingKnown.has(1)).toBe(true);
    expect(r.effects).toEqual([{ type: 'remove', wordId: 1 }]);
  });

  it('undoing a pending "I know it" forgets it without storing anything', () => {
    const r = applyFeedAction(marks({ pendingKnown: [1] }), { type: 'unknow', wordId: 1 });
    expect(r.pendingKnown.size).toBe(0);
    expect(r.known.size).toBe(0);
    expect(r.effects).toEqual([]);
  });

  it('cannot undo a known word once it is stored', () => {
    const r = applyFeedAction(marks({ known: [1] }), { type: 'unknow', wordId: 1 });
    expect(r.known.has(1)).toBe(true);
    expect(r.effects).toEqual([]);
  });

  it('settling stores every pending word except the one on screen', () => {
    const r = applyFeedAction(marks({ pendingKnown: [1, 2, 3] }), { type: 'settle', keep: 2 });
    expect([...r.pendingKnown]).toEqual([2]);
    expect([...r.known].sort()).toEqual([1, 3]);
    expect(r.effects).toEqual([{ type: 'markKnown', wordIds: [1, 3] }]);
  });

  it('settling with nothing to keep stores everything', () => {
    const r = applyFeedAction(marks({ pendingKnown: [1] }), { type: 'settle', keep: null });
    expect(r.pendingKnown.size).toBe(0);
    expect(r.effects).toEqual([{ type: 'markKnown', wordIds: [1] }]);
  });

  it('settling with nothing pending has no effect', () => {
    const before = marks({ pendingKnown: [2] });
    const r = applyFeedAction(before, { type: 'settle', keep: 2 });
    expect(r.effects).toEqual([]);
    expect(r.pendingKnown).toBe(before.pendingKnown);
  });
});
