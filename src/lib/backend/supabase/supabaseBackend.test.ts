// The Supabase backend reads word content from the words file and only
// per-user rows from Supabase. The Supabase client is replaced by a small fake
// that applies the filters, orders and ranges the backend uses, over rows set
// per test. No network is involved.

import { loadContent } from '@/lib/content';
import { SupabaseBackend } from './supabaseBackend';

type Row = Record<string, unknown>;
type Result = { data: Row[]; error: null };

const mockTables: Record<string, Row[]> = {};
/** Every table the backend asked for, in order. */
const mockTouched: string[] = [];
const mockInvoke = jest.fn();

class MockQuery implements PromiseLike<Result> {
  private filters: ((r: Row) => boolean)[] = [];
  private orders: { column: string; ascending: boolean }[] = [];
  private window: { from: number; to: number } | null = null;
  private max: number | null = null;

  constructor(private rows: Row[]) {}

  select(): this {
    return this;
  }
  eq(column: string, value: unknown): this {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  is(column: string, value: null): this {
    this.filters.push((r) => r[column] === value);
    return this;
  }
  lte(column: string, value: string): this {
    // Only used on ISO timestamps, which sort as strings.
    this.filters.push((r) => String(r[column]) <= value);
    return this;
  }
  order(column: string, opts?: { ascending?: boolean }): this {
    this.orders.push({ column, ascending: opts?.ascending ?? true });
    return this;
  }
  range(from: number, to: number): this {
    this.window = { from, to };
    return this;
  }
  limit(n: number): this {
    this.max = n;
    return this;
  }

  private run(): Result {
    let out = this.rows.filter((r) => this.filters.every((f) => f(r)));
    out = [...out].sort((a, b) => {
      for (const { column, ascending } of this.orders) {
        const x = String(a[column]).padStart(30, '0');
        const y = String(b[column]).padStart(30, '0');
        if (x !== y) return (x < y ? -1 : 1) * (ascending ? 1 : -1);
      }
      return 0;
    });
    if (this.window) out = out.slice(this.window.from, this.window.to + 1);
    if (this.max !== null) out = out.slice(0, this.max);
    return { data: out, error: null };
  }

  then<A = Result, B = never>(
    onFulfilled?: ((value: Result) => A | PromiseLike<A>) | null,
    onRejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
  ): PromiseLike<A | B> {
    return Promise.resolve(this.run()).then(onFulfilled, onRejected);
  }
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: (table: string) => {
      mockTouched.push(table);
      return new MockQuery(mockTables[table] ?? []);
    },
    functions: { invoke: (...args: unknown[]) => mockInvoke(...args) },
  },
}));

const PAST = '2025-01-01T00:00:00.000Z';
const FUTURE = '2999-01-01T00:00:00.000Z';
/** Not in the words file, as for a word the pipeline stopped exporting. */
const RETIRED = 9999;

function stateRow(wordId: number, due: string, extra: Partial<Row> = {}): Row {
  return {
    word_id: wordId,
    due,
    stability: 3,
    difficulty: 5,
    elapsed_days: 1,
    scheduled_days: 3,
    reps: 2,
    lapses: 0,
    state: 'review',
    last_review: PAST,
    learning_steps: 0,
    is_known: false,
    is_suspended: false,
    ...extra,
  };
}

function listRow(wordId: number, addedAt: string, removedAt: string | null = null): Row {
  return { word_id: wordId, added_at: addedAt, removed_at: removedAt };
}

beforeEach(() => {
  for (const key of Object.keys(mockTables)) delete mockTables[key];
  mockTouched.length = 0;
  mockInvoke.mockReset();
});

describe('SupabaseBackend word content', () => {
  it('serves words from the words file', async () => {
    const { words, byId } = await loadContent();
    const backend = new SupabaseBackend();

    expect(await backend.getAllWords()).toEqual(words);
    expect(await backend.getAllWords(3)).toEqual(words.slice(0, 3));
    expect(await backend.getWordContent(99)).toBe(byId.get(99));
    expect(await backend.getWordContent(RETIRED)).toBeNull();
  });

  it('gives placement words from every tier', async () => {
    const placement = await new SupabaseBackend().getPlacementWords();
    expect(new Set(placement.map((w) => w.difficultyTier))).toEqual(new Set([1, 2, 3, 4, 5]));
  });

  it('never queries the Postgres content tables', async () => {
    mockTables.user_word_state = [stateRow(5, PAST)];
    mockTables.word_list = [listRow(3, PAST)];
    const backend = new SupabaseBackend();

    await backend.getWordContent(1);
    await backend.getAllWords();
    await backend.getPlacementWords();
    await backend.getDueQueue(10);
    await backend.getNewWords(5);
    await backend.getFeedWords({ limit: 5, exclude: [], levelEstimate: 2, seed: 1 });
    await backend.getWordList();

    expect(new Set(mockTouched)).toEqual(new Set(['user_word_state', 'word_list']));
  });
});

describe('SupabaseBackend due queue', () => {
  beforeEach(() => {
    mockTables.user_word_state = [
      stateRow(RETIRED, '2020-01-01T00:00:00.000Z'), // due first, but not in the file
      stateRow(5, '2025-01-02T00:00:00.000Z'),
      stateRow(6, PAST),
      stateRow(8, FUTURE),
      stateRow(12, PAST, { is_known: true }),
      stateRow(13, PAST, { is_suspended: true }),
    ];
  });

  it('returns due words in due order, with their state and file content', async () => {
    const { byId } = await loadContent();
    const due = await new SupabaseBackend().getDueQueue(10);

    expect(due.map((i) => i.content.wordId)).toEqual([6, 5]);
    expect(due[0]!.content).toBe(byId.get(6));
    expect(due[0]!.isNew).toBe(false);
    expect(due[0]!.state).toMatchObject({ wordId: 6, due: PAST, reps: 2, state: 'review' });
  });

  it('does not let a word missing from the file take a place in the queue', async () => {
    const due = await new SupabaseBackend().getDueQueue(1);

    expect(due.map((i) => i.content.wordId)).toEqual([6]);
    // The first page held only the missing word, so it read one more.
    expect(mockTouched).toEqual(['user_word_state', 'user_word_state']);
  });

  it('returns nothing for a limit of zero', async () => {
    expect(await new SupabaseBackend().getDueQueue(0)).toEqual([]);
  });
});

describe('SupabaseBackend new words, feed and list', () => {
  beforeEach(() => {
    // Seen: 2 and 4 (tier 2) and the retired word.
    mockTables.user_word_state = [stateRow(2, PAST), stateRow(4, FUTURE), stateRow(RETIRED, PAST)];
    mockTables.word_list = [
      listRow(3, '2026-01-01T00:00:00.000Z'), // tier 5
      listRow(7, '2026-01-02T00:00:00.000Z'), // tier 1
      listRow(RETIRED, '2026-01-03T00:00:00.000Z'),
      listRow(11, '2026-01-04T00:00:00.000Z', '2026-01-05T00:00:00.000Z'), // removed
      listRow(2, '2026-01-06T00:00:00.000Z'), // already seen
    ];
  });

  it('puts listed words first, then unseen words from the tier range, easiest first', async () => {
    const { words } = await loadContent();
    const fresh = await new SupabaseBackend().getNewWords(5, { minTier: 2, maxTier: 2 });

    const unseenTier2 = words
      .filter((w) => w.difficultyTier === 2 && w.wordId !== 2 && w.wordId !== 4)
      .slice(0, 3)
      .map((w) => w.wordId);
    expect(fresh.map((i) => i.content.wordId)).toEqual([3, 7, ...unseenTier2]);
    expect(fresh.every((i) => i.isNew && i.state === null)).toBe(true);
  });

  it('keeps seen, listed and already shown words out of the feed', async () => {
    const feed = await new SupabaseBackend().getFeedWords({
      limit: 20,
      exclude: [10, 12],
      levelEstimate: 2,
      seed: 7,
    });

    expect(feed).toHaveLength(20);
    const ids = feed.map((w) => w.wordId);
    for (const id of [2, 4, 3, 7, 10, 12]) expect(ids).not.toContain(id);
    // Level 2 prefers tiers 1 to 3, and those hold far more than 20 words.
    expect(feed.every((w) => w.difficultyTier <= 3)).toBe(true);
  });

  it('lists active picks that no session has shown, oldest first', async () => {
    const list = await new SupabaseBackend().getWordList();
    expect(list.map((w) => [w.content.wordId, w.addedAt])).toEqual([
      [3, '2026-01-01T00:00:00.000Z'],
      [7, '2026-01-02T00:00:00.000Z'],
    ]);
  });
});

describe('SupabaseBackend personalization', () => {
  it('sends the headword and definition to the Edge Function', async () => {
    mockInvoke.mockResolvedValue({ data: { kind: 'mnemonic', text: 'A hook.' }, error: null });
    const input = {
      wordId: 1,
      headword: 'abate',
      definition: 'Make less active or intense.',
      kind: 'mnemonic' as const,
      interests: ['jazz'],
    };

    const { text } = await new SupabaseBackend().generatePersonalized(input);

    expect(text).toBe('A hook.');
    expect(mockInvoke).toHaveBeenCalledWith('little-lexicon-generate-personalized', {
      body: input,
    });
  });
});
