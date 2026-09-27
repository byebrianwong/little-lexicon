// The Words tab: Discover (a feed of unseen words), Your list (the words
// picked there) and All words (the whole collection).
//
// This screen owns the feed's state and runs every write. What each button
// does is decided in features/feed/feedState.ts; this file applies the result
// and keeps "I know it" pending until the word leaves the screen, as that
// module explains.

import { useQuery } from '@tanstack/react-query';
import { useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppState, View } from 'react-native';
import { BrowseView } from '@/features/browse/BrowseView';
import { WordsLayout, type WordsViewId } from '@/features/browse/WordsLayout';
import { FeedView } from '@/features/feed/FeedView';
import { WordListView } from '@/features/feed/WordListView';
import {
  applyFeedAction,
  feedStatus,
  type FeedAction,
  type FeedMarks,
  type FeedStatus,
} from '@/features/feed/feedState';
import {
  useAddToList,
  useMarkKnown,
  useRemoveFromList,
  useWordList,
} from '@/features/feed/queries';
import { useFeedWords } from '@/features/feed/useFeedWords';
import { useProfile } from '@/features/review/queries';
import { useSettingsStore } from '@/features/settings/settingsStore';
import { backend } from '@/lib/backend';
import { pushOnce } from '@/lib/navigation';
import type { WordContent } from '@/lib/types';

const EMPTY: ReadonlySet<number> = new Set();

function plus(set: ReadonlySet<number>, id: number): ReadonlySet<number> {
  return new Set(set).add(id);
}

function minus(set: ReadonlySet<number>, ids: readonly number[]): ReadonlySet<number> {
  const out = new Set(set);
  for (const id of ids) out.delete(id);
  return out;
}

export default function Words() {
  const soundEnabled = useSettingsStore((s) => s.soundEnabled);
  const profile = useProfile();
  const [view, setView] = useState<WordsViewId>('discover');

  // A new order each time the app starts, so words scrolled past come back
  // in a different place rather than always first.
  const [seed] = useState(() => Math.floor(Math.random() * 2 ** 31));
  const feed = useFeedWords(profile.data ? profile.data.levelEstimate : undefined, seed);
  const list = useWordList();
  const allWords = useQuery({
    queryKey: ['allWords'],
    queryFn: () => backend.getAllWords(),
    enabled: view === 'all',
  });

  // The mutate functions are stable across renders; the hook results are not.
  // Depending on the results would rebuild `settle` every render and fire the
  // focus effect's cleanup, storing marks the user can still undo.
  const { mutate: addWord } = useAddToList();
  const { mutate: removeWord } = useRemoveFromList();
  const { mutate: storeKnown } = useMarkKnown();

  const [pendingKnown, setPendingKnown] = useState(EMPTY);
  const [known, setKnown] = useState(EMPTY);
  // Words added during this visit. Once a session shows a word it drops off
  // the server's list, but its card here should still say it was added.
  const [addedHere, setAddedHere] = useState(EMPTY);
  const [notice, setNotice] = useState<string | null>(null);

  const listed = useMemo(() => {
    const ids = new Set(addedHere);
    for (const w of list.data ?? []) ids.add(w.content.wordId);
    return ids as ReadonlySet<number>;
  }, [list.data, addedHere]);

  // Actions can arrive faster than renders (a tap and a scroll together), and
  // settling runs on blur and unmount, so the latest marks are kept in a ref
  // and updated as each action is applied.
  const marksRef = useRef<FeedMarks>({ listed, pendingKnown, known });
  marksRef.current = { ...marksRef.current, listed };

  const run = useCallback(
    (action: FeedAction, word?: WordContent) => {
      const result = applyFeedAction(marksRef.current, action);
      marksRef.current = {
        ...marksRef.current,
        pendingKnown: result.pendingKnown,
        known: result.known,
      };
      setPendingKnown(result.pendingKnown);
      setKnown(result.known);
      if (action.type !== 'settle') setNotice(null);

      for (const effect of result.effects) {
        if (effect.type === 'add' && word) {
          const id = effect.wordId;
          marksRef.current = { ...marksRef.current, listed: plus(marksRef.current.listed, id) };
          setAddedHere((s) => plus(s, id));
          addWord(word, {
            onError: () => {
              setAddedHere((s) => minus(s, [id]));
              setNotice(`Could not add “${word.headword}” to your list. Try again.`);
            },
          });
        } else if (effect.type === 'remove') {
          const id = effect.wordId;
          marksRef.current = { ...marksRef.current, listed: minus(marksRef.current.listed, [id]) };
          setAddedHere((s) => minus(s, [id]));
          removeWord(id, {
            onError: () => setNotice('Could not take that word off your list. Try again.'),
          });
        } else if (effect.type === 'markKnown') {
          const ids = effect.wordIds;
          storeKnown(ids, {
            onError: () => {
              // Nothing was stored, so the words are simply untouched again.
              marksRef.current = { ...marksRef.current, known: minus(marksRef.current.known, ids) };
              setKnown((s) => minus(s, ids));
              setNotice('Could not save the words you know. They will come round again.');
            },
          });
        }
      }
    },
    [addWord, removeWord, storeKnown],
  );

  const settle = useCallback((keep: number | null) => run({ type: 'settle', keep }), [run]);
  const settleRef = useRef(settle);
  settleRef.current = settle;

  // Store pending "I know it" marks when the user leaves: another tab, a
  // session, or the app going to the background. Both effects read settle
  // through a ref so they run once, not on every render.
  useFocusEffect(useCallback(() => () => settleRef.current(null), []));
  useEffect(() => {
    const sub = AppState.addEventListener('change', (state) => {
      if (state !== 'active') settleRef.current(null);
    });
    return () => sub.remove();
  }, []);

  const statuses = useMemo(() => {
    const out: Record<number, FeedStatus> = {};
    const marks: FeedMarks = { listed, pendingKnown, known };
    for (const w of feed.words) {
      const s = feedStatus(marks, w.wordId);
      if (s !== 'none') out[w.wordId] = s;
    }
    return out;
  }, [feed.words, listed, pendingKnown, known]);

  function changeView(next: WordsViewId) {
    if (next !== 'discover') settle(null);
    setView(next);
  }

  function startSession() {
    settle(null);
    pushOnce('/session');
  }

  return (
    <WordsLayout view={view} onChangeView={changeView} listCount={list.data?.length}>
      {/* The feed stays mounted when hidden so its place is kept. */}
      <View style={{ flex: 1, display: view === 'discover' ? 'flex' : 'none' }}>
        <FeedView
          words={feed.words}
          isLoading={feed.isLoading}
          isLoadingMore={feed.isLoadingMore}
          failed={feed.failed}
          exhausted={feed.exhausted}
          onLoadMore={feed.loadMore}
          statuses={statuses}
          onLearn={(w) => run({ type: 'learn', wordId: w.wordId }, w)}
          onUnlearn={(w) => run({ type: 'unlearn', wordId: w.wordId })}
          onKnow={(w) => run({ type: 'know', wordId: w.wordId })}
          onUnknow={(w) => run({ type: 'unknow', wordId: w.wordId })}
          onVisibleWord={settle}
          notice={notice}
          listCount={list.data?.length ?? 0}
          onOpenList={() => changeView('list')}
          onStartSession={startSession}
          soundEnabled={soundEnabled}
        />
      </View>
      {view === 'list' ? (
        <WordListView
          entries={list.data}
          isLoading={list.isLoading}
          onRemove={(wordId) => run({ type: 'unlearn', wordId })}
          onStartSession={startSession}
          onDiscover={() => changeView('discover')}
        />
      ) : null}
      {view === 'all' ? (
        <BrowseView
          words={allWords.data}
          isLoading={allWords.isLoading}
          soundEnabled={soundEnabled}
        />
      ) : null}
    </WordsLayout>
  );
}
