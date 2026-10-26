// What the offline audio pack should hold, and what to change to get there.
// Pure logic, kept apart from the file and network calls in ./index.ts.
//
// Each clip is stored on the phone under the hash in its audioUrl:
// "audio/words/1.mp3?v=f6a11b644f7b" is kept as f6a11b644f7b.mp3. A remade
// clip has a new hash, so a changed clip is simply a new file to fetch, and
// the old file is deleted once nothing uses it.

import type { WordContent } from '@/lib/types';

/** The hash an audioUrl carries, or null when it has none. */
export function clipHash(audioUrl: string | null | undefined): string | null {
  if (!audioUrl) return null;
  return /[?&]v=([0-9a-f]{6,64})(?:&|$)/.exec(audioUrl)?.[1] ?? null;
}

/** Every clip the words use, as hash to audioUrl. */
export function wantedClips(words: WordContent[]): Map<string, string> {
  const wanted = new Map<string, string>();
  const add = (audioUrl: string | null | undefined) => {
    const hash = clipHash(audioUrl);
    if (hash && audioUrl) wanted.set(hash, audioUrl);
  };
  for (const word of words) {
    add(word.audioUrl);
    for (const sense of word.senses) for (const example of sense.examples) add(example.audioUrl);
  }
  return wanted;
}

export interface SyncPlan {
  /** Clips the words use that are not on the phone. */
  download: { hash: string; audioUrl: string }[];
  /** Hashes of clips on the phone that no word uses any more. */
  remove: string[];
}

export function planSync(wanted: Map<string, string>, present: Iterable<string>): SyncPlan {
  const have = new Set(present);
  return {
    download: [...wanted].filter(([hash]) => !have.has(hash)).map(([hash, audioUrl]) => ({ hash, audioUrl })),
    remove: [...have].filter((hash) => !wanted.has(hash)),
  };
}

/**
 * True when the bytes start like an MP3: an ID3 tag or an MPEG audio frame.
 * A Wi-Fi login page can answer any address with HTML and status 200, and
 * keeping that under a clip's hash would break the clip until the hash
 * changes.
 */
export function looksLikeMp3(bytes: Uint8Array): boolean {
  const [a = 0, b = 0, c = 0] = bytes;
  const id3 = a === 0x49 && b === 0x44 && c === 0x33;
  const frame = a === 0xff && (b & 0xe0) === 0xe0;
  return id3 || frame;
}

/** Run `task` on every item, with at most `limit` running at once. */
export async function forEachLimited<T>(
  items: readonly T[],
  limit: number,
  task: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const item = items[next++] as T;
      await task(item);
    }
  };
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
}
