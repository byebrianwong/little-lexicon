// Server state behind the Learning view and the word counts on Home and
// Progress. Every piece is read once and grouped on the device by the tested
// code in wordProgress.ts.

import { useCallback, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import { useWordList } from '@/features/feed/queries';
import { useAnswerHistory } from '@/features/tracker/queries';
import { buildTrackers } from '@/features/tracker/tracker';
import { countWords, groupWords, type WordCounts, type YourWords } from './wordProgress';

export function useWordSchedules() {
  return useQuery({
    queryKey: qk.wordSchedules,
    queryFn: () => backend.getWordSchedules(),
  });
}

/** Every word in the collection, easiest first. */
export function useAllWords(enabled = true) {
  return useQuery({
    queryKey: qk.allWords,
    queryFn: () => backend.getAllWords(),
    enabled,
  });
}

export interface YourWordsResult {
  /** Undefined until the answers, the schedule and the words have loaded. */
  words: YourWords | undefined;
  counts: WordCounts | undefined;
  /** One of those reads failed. `retry` reads them again. */
  failed: boolean;
  retry: () => void;
}

export function useYourWords(): YourWordsResult {
  const history = useAnswerHistory();
  const schedules = useWordSchedules();
  const allWords = useAllWords();
  // Only for the day each word was saved. Words load without it.
  const list = useWordList();

  const words = useMemo(() => {
    if (!history.data || !schedules.data || !allWords.data) return undefined;
    return groupWords({
      content: new Map(allWords.data.map((w) => [w.wordId, w])),
      trackers: buildTrackers(history.data),
      schedules: schedules.data,
      savedAt: new Map((list.data ?? []).map((w) => [w.content.wordId, w.addedAt])),
    });
  }, [history.data, schedules.data, allWords.data, list.data]);

  const counts = useMemo(() => (words ? countWords(words) : undefined), [words]);

  const { refetch: refetchHistory } = history;
  const { refetch: refetchSchedules } = schedules;
  const { refetch: refetchWords } = allWords;
  const retry = useCallback(() => {
    void refetchHistory();
    void refetchSchedules();
    void refetchWords();
  }, [refetchHistory, refetchSchedules, refetchWords]);

  return {
    words,
    counts,
    failed: history.isError || schedules.isError || allWords.isError,
    retry,
  };
}
