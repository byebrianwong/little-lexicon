// Web has no offline audio pack: the browser plays clips from the site and
// caches them itself. See index.ts for the native pack.

export function localClip(_audioUrl: string | null | undefined): { uri: string } | null {
  return null;
}

export function syncAudioPack(): Promise<void> {
  return Promise.resolve();
}
