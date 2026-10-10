import { renderHook, waitFor } from '@testing-library/react-native';
import { backend, type FeedRequest } from '@/lib/backend';
import { word } from '@/stories/fixtures';
import type { WordContent } from '@/lib/types';
import { FEED_PAGE, useFeedWords } from './useFeedWords';

/** A full page whose ids say which level asked for it: level 3 gives 3000 up. */
function pageFor(level: number | null): WordContent[] {
  const base = (level ?? 0) * 1000;
  return Array.from({ length: FEED_PAGE }, (_, i) => ({ ...word('laconic'), wordId: base + i }));
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((r) => {
    resolve = r;
  });
  return { promise, resolve };
}

// The hook only needs this one call. The real module would load the demo
// backend and its device storage.
jest.mock('@/lib/backend', () => ({ backend: { getFeedWords: jest.fn() } }));
const getFeedWords = jest.mocked(backend.getFeedWords);

afterEach(() => getFeedWords.mockReset());

function render(level: number | null | undefined) {
  return renderHook(({ level: l }) => useFeedWords(l, 7), { initialProps: { level } });
}

describe('useFeedWords', () => {
  it('loads once when the profile arrives', async () => {
    getFeedWords.mockImplementation(async (req: FeedRequest) => pageFor(req.levelEstimate));
    const hook = render(undefined);
    expect(getFeedWords).not.toHaveBeenCalled();

    hook.rerender({ level: 3 });
    await waitFor(() => expect(hook.result.current.words).toHaveLength(FEED_PAGE));
    expect(getFeedWords).toHaveBeenCalledTimes(1);
  });

  it('starts over in the new order when the level changes', async () => {
    getFeedWords.mockImplementation(async (req: FeedRequest) => pageFor(req.levelEstimate));
    const hook = render(3);
    await waitFor(() => expect(hook.result.current.words[0]?.wordId).toBe(3000));

    hook.rerender({ level: 1 });
    await waitFor(() => expect(hook.result.current.words[0]?.wordId).toBe(1000));
    expect(hook.result.current.words).toHaveLength(FEED_PAGE);
    // The new feed does not exclude the old one's words: it is a new order.
    expect(getFeedWords).toHaveBeenLastCalledWith(
      expect.objectContaining({ levelEstimate: 1, exclude: [] }),
    );
  });

  it('drops a page for the old level that arrives after the change', async () => {
    const late = deferred<WordContent[]>();
    getFeedWords.mockImplementationOnce(() => late.promise);
    getFeedWords.mockImplementation(async (req: FeedRequest) => pageFor(req.levelEstimate));
    const hook = render(3);
    await waitFor(() => expect(getFeedWords).toHaveBeenCalledTimes(1));

    hook.rerender({ level: 5 });
    await waitFor(() => expect(hook.result.current.words[0]?.wordId).toBe(5000));
    late.resolve(pageFor(3));
    await late.promise;

    await waitFor(() => expect(hook.result.current.isLoadingMore).toBe(false));
    expect(hook.result.current.words.every((w) => w.wordId >= 5000)).toBe(true);
    expect(hook.result.current.words).toHaveLength(FEED_PAGE);
  });
});
