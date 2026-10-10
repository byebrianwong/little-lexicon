// The Discover feed's words, loaded a page at a time.
//
// These live in component state, not the query cache. Several screens call
// invalidateQueries() with no filter when they come into focus, and the Words
// tab stays mounted in the background. A cached feed would refetch then, and
// words the user just added (now excluded by the backend) would vanish from
// under them. A feed only ever grows, so it is held like the session's queue:
// the screen keeps what it has and asks the backend for the next page.

import { useCallback, useEffect, useRef, useState } from 'react';
import { backend } from '@/lib/backend';
import type { WordContent } from '@/lib/types';

/** Words per request. The next page loads well before the user reaches the end. */
export const FEED_PAGE = 20;

export interface FeedWords {
  words: WordContent[];
  /** The first page has not arrived. */
  isLoading: boolean;
  isLoadingMore: boolean;
  /** The last request failed. Words already loaded stay. */
  failed: boolean;
  /** A page came back short, so every unseen word has been shown. */
  exhausted: boolean;
  loadMore: () => void;
}

/**
 * `levelEstimate` is undefined until the profile loads; nothing is fetched
 * before then, because the level decides the order. When the level changes
 * (in Settings), the feed starts over in the new level's order.
 */
export function useFeedWords(levelEstimate: number | null | undefined, seed: number): FeedWords {
  const [words, setWords] = useState<WordContent[]>([]);
  const [started, setStarted] = useState(false);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const [exhausted, setExhausted] = useState(false);
  // Refs as well as state: loadMore can fire twice before a render lands.
  const wordsRef = useRef<WordContent[]>([]);
  const busyRef = useRef(false);
  const exhaustedRef = useRef(false);
  // Bumped when the level changes. A page requested before that is dropped
  // when it arrives, so old-level words never land in the new feed.
  const generation = useRef(0);
  const feedLevel = useRef(levelEstimate);

  const load = useCallback(async () => {
    if (levelEstimate === undefined || busyRef.current || exhaustedRef.current) return;
    const gen = generation.current;
    busyRef.current = true;
    setBusy(true);
    setStarted(true);
    try {
      const page = await backend.getFeedWords({
        limit: FEED_PAGE,
        exclude: wordsRef.current.map((w) => w.wordId),
        levelEstimate,
        seed,
      });
      if (gen !== generation.current) return;
      wordsRef.current = [...wordsRef.current, ...page];
      setWords(wordsRef.current);
      setFailed(false);
      if (page.length < FEED_PAGE) {
        exhaustedRef.current = true;
        setExhausted(true);
      }
    } catch (e) {
      if (gen !== generation.current) return;
      console.warn('feed: failed to load words', e);
      setFailed(true);
    } finally {
      if (gen === generation.current) {
        busyRef.current = false;
        setBusy(false);
      }
    }
  }, [levelEstimate, seed]);

  // The profile arriving is not a change of level. Any later change is.
  useEffect(() => {
    const previous = feedLevel.current;
    feedLevel.current = levelEstimate;
    if (previous === undefined || previous === levelEstimate) return;
    generation.current += 1;
    wordsRef.current = [];
    busyRef.current = false;
    exhaustedRef.current = false;
    setWords([]);
    setBusy(false);
    setFailed(false);
    setExhausted(false);
    setStarted(false);
  }, [levelEstimate]);

  useEffect(() => {
    if (!started) void load();
  }, [started, load]);

  return {
    words,
    isLoading: !started || (busy && words.length === 0),
    isLoadingMore: busy && words.length > 0,
    failed,
    exhausted,
    loadMore: () => void load(),
  };
}
