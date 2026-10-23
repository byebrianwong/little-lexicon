// The answer history behind the word tracker, as server state. Sessions and
// speed rounds refresh every query when they finish; practice refreshes this
// one when it closes, and keeps its own answers in the meantime.

import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { backend } from '@/lib/backend';
import { qk } from '@/lib/queryClient';
import { buildTrackers, type WordTracker } from './tracker';

export function useAnswerHistory() {
  return useQuery({ queryKey: qk.answerHistory, queryFn: () => backend.getAnswerHistory() });
}

/** A tracker per answered word. Empty while the history loads. */
export function useWordTrackers(): ReadonlyMap<number, WordTracker> {
  const history = useAnswerHistory();
  return useMemo(() => buildTrackers(history.data ?? []), [history.data]);
}
