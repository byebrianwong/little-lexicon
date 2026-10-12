// The one place the bundled clip list is imported. A dynamic import lets the
// web build keep the list (one entry per clip) out of the first download.
// Jest cannot run a dynamic import without Metro, so jest.setup.ts swaps this
// module for one with no clips.

export function importAudioClips(): Promise<typeof import('@/content/audioClips')> {
  return import('@/content/audioClips');
}
