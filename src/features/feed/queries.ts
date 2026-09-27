// Server-state hooks for the word list. The list is ordinary server data, so it
// lives in TanStack Query with optimistic updates: a tap on "Learn this" shows
// at once and rolls back if the write fails.
//
// The feed's own words are not here. See useFeedWords for why.

import { useMutation, useQuery, useQueryClient, type QueryClient } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import type { ListedWord, WordContent } from '@/lib/types';

export function useWordList() {
  return useQuery({ queryKey: qk.wordList, queryFn: () => backend.getWordList() });
}

/** What changes when the list or known words change: the list, and what a session serves. */
function invalidateAfterListChange(qc: QueryClient) {
  void qc.invalidateQueries({ queryKey: qk.wordList });
  void qc.invalidateQueries({ queryKey: qk.sessionPlan });
}

type Snapshot = { previous: ListedWord[] | undefined };

export function useAddToList() {
  const qc = useQueryClient();
  return useMutation<void, Error, WordContent, Snapshot>({
    mutationFn: (content) => backend.addToWordList(content.wordId),
    onMutate: async (content) => {
      await qc.cancelQueries({ queryKey: qk.wordList });
      const previous = qc.getQueryData<ListedWord[]>(qk.wordList);
      qc.setQueryData<ListedWord[]>(qk.wordList, (old = []) =>
        old.some((w) => w.content.wordId === content.wordId)
          ? old
          : [...old, { content, addedAt: new Date().toISOString() }],
      );
      return { previous };
    },
    onError: (error, content, snapshot) => {
      console.warn(`word list: failed to add word ${content.wordId}`, error);
      qc.setQueryData(qk.wordList, snapshot?.previous);
    },
    onSettled: () => invalidateAfterListChange(qc),
  });
}

export function useRemoveFromList() {
  const qc = useQueryClient();
  return useMutation<void, Error, number, Snapshot>({
    mutationFn: (wordId) => backend.removeFromWordList(wordId),
    onMutate: async (wordId) => {
      await qc.cancelQueries({ queryKey: qk.wordList });
      const previous = qc.getQueryData<ListedWord[]>(qk.wordList);
      qc.setQueryData<ListedWord[]>(qk.wordList, (old = []) =>
        old.filter((w) => w.content.wordId !== wordId),
      );
      return { previous };
    },
    onError: (error, wordId, snapshot) => {
      console.warn(`word list: failed to remove word ${wordId}`, error);
      qc.setQueryData(qk.wordList, snapshot?.previous);
    },
    onSettled: () => invalidateAfterListChange(qc),
  });
}

export function useMarkKnown() {
  const qc = useQueryClient();
  return useMutation<void, Error, number[]>({
    mutationFn: (wordIds) => backend.markKnown(wordIds),
    onError: (error, wordIds) => {
      console.warn(`feed: failed to mark words known (${wordIds.join(', ')})`, error);
    },
    onSettled: () => {
      invalidateAfterListChange(qc);
      // Known words count toward progress.
      void qc.invalidateQueries({ queryKey: qk.stats });
    },
  });
}
