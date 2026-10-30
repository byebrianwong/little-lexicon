// Opening the Learning view from another tab. Home and Progress link their
// word counts here, and the Words tab reads the link's params
// (app/(app)/browse.tsx).

import { router } from 'expo-router';
import type { WordsViewId } from '@/features/browse/WordsLayout';
import { isWordStatus, type WordStatus } from './wordProgress';

const VIEWS: readonly WordsViewId[] = ['discover', 'list', 'learning', 'all'];

/** Go to the Words tab, on the Learning view, showing one list. */
export function openWords(status: WordStatus): void {
  router.navigate({ pathname: '/browse', params: { view: 'learning', status } });
}

type Param = string | string[] | undefined;

function first(value: Param): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

/** What a link to the Words tab asks for. Anything unknown is null. */
export function readWordsParams(params: { view?: Param; status?: Param }): {
  view: WordsViewId | null;
  status: WordStatus | null;
} {
  const view = first(params.view);
  const status = first(params.status);
  return {
    view: VIEWS.find((v) => v === view) ?? null,
    status: isWordStatus(status) ? status : null,
  };
}
