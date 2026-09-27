// Datamuse lookups (https://www.datamuse.com/api/). One request per word
// returns both the word's frequency and its parts of speech, most common first.
// Stage 01 uses the frequency for the difficulty tier; stage 02 uses the parts
// of speech to choose which WordNet senses to keep. Both call the same URL, so
// the second call is a cache hit.

import type { CachedFetcher } from './fetch.ts';
import { posNameFromDatamuse } from './wordnet.ts';

interface DatamuseHit {
  word: string;
  tags?: string[];
}

export interface DatamuseInfo {
  /** Occurrences per million words, or null when Datamuse has no figure. */
  frequency: number | null;
  /** Part-of-speech names ("noun", "verb", ...), most common first. */
  partsOfSpeech: string[];
}

export function parseDatamuseTags(tags: string[]): DatamuseInfo {
  let frequency: number | null = null;
  const partsOfSpeech: string[] = [];
  for (const tag of tags) {
    if (tag.startsWith('f:')) {
      const f = Number.parseFloat(tag.slice(2));
      if (Number.isFinite(f)) frequency = f;
      continue;
    }
    const name = posNameFromDatamuse(tag);
    if (name && !partsOfSpeech.includes(name)) partsOfSpeech.push(name);
  }
  return { frequency, partsOfSpeech };
}

export async function datamuseLookup(http: CachedFetcher, word: string): Promise<DatamuseInfo> {
  const url = `https://api.datamuse.com/words?sp=${encodeURIComponent(word)}&md=fp&max=1`;
  const { status, data } = await http.getJson<DatamuseHit[]>(url);
  if (status !== 200) {
    throw new Error(`Datamuse returned HTTP ${status} for "${word}"`);
  }
  const hit = data?.[0];
  if (!hit || hit.word.toLowerCase() !== word.toLowerCase()) {
    return { frequency: null, partsOfSpeech: [] };
  }
  return parseDatamuseTags(hit.tags ?? []);
}
