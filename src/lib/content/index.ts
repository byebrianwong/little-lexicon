// The words the app teaches. They ship inside the app as
// src/content/words.json, which the content pipeline (pipeline/) generates;
// edit content there, not in the JSON. Word ids in the file are permanent,
// because saved progress refers to them.
//
// The file is loaded once, on first use, through a dynamic import. On web the
// bundler puts it in its own file, so the first screen does not wait for it.

import type { WordContent } from '@/lib/types';
import { importWordsFile } from './importWordsFile';

export const WORDS_FILE_FORMAT = 1;

export interface WordsFile {
  formatVersion: number;
  /** Credits the app must show for the licensed sources in the file. */
  attribution: string[];
  words: WordContent[];
}

export interface ContentIndex {
  /** Every word, easiest first: by tier, then frequency rank, then id. */
  words: WordContent[];
  byId: Map<number, WordContent>;
  byHeadword: Map<string, WordContent>;
  attribution: string[];
}

function easiestFirst(a: WordContent, b: WordContent): number {
  return (
    a.difficultyTier - b.difficultyTier ||
    (a.frequencyRank ?? Number.MAX_SAFE_INTEGER) - (b.frequencyRank ?? Number.MAX_SAFE_INTEGER) ||
    a.wordId - b.wordId
  );
}

export function buildContentIndex(file: WordsFile): ContentIndex {
  if (file.formatVersion !== WORDS_FILE_FORMAT) {
    throw new Error(
      `words.json has format ${file.formatVersion}; this app reads format ${WORDS_FILE_FORMAT}`,
    );
  }
  const words = [...file.words].sort(easiestFirst);
  return {
    words,
    byId: new Map(words.map((w) => [w.wordId, w])),
    byHeadword: new Map(words.map((w) => [w.headword, w])),
    attribution: file.attribution,
  };
}

let loading: Promise<ContentIndex> | null = null;

export function loadContent(): Promise<ContentIndex> {
  loading ??= importWordsFile()
    // The pipeline writes this file in the WordsFile shape, and the tests in
    // this folder check the committed file's content.
    .then((mod) => buildContentIndex(mod.default as WordsFile))
    .catch((err: unknown) => {
      loading = null; // let the next call retry, for example after a failed download on web
      throw err;
    });
  return loading;
}
