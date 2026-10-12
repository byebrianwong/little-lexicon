// Stands in for src/lib/audio.ts inside Storybook. Two reasons:
//
// 1. Determinism. Stories that reveal an answer speak the word on mount. In a
//    browser that starts the speech synthesizer on every render, which is noise
//    during a snapshot run and audible when someone opens Storybook.
// 2. Bundling. expo-audio pulls in expo-asset, which this project does not
//    install, and Vite cannot resolve it.
//
// The real module is exercised by the app, not by stories: it has no UI.

import type { SpeakableExample, SpeakableWord, SpeakOptions } from '../../src/lib/audio';

export type { SpeakableExample, SpeakableWord, SpeakOptions };

export async function play(_opts: SpeakOptions): Promise<void> {}

export async function speakWord(_word: SpeakableWord): Promise<void> {}

export async function speakSentence(_example: SpeakableExample): Promise<void> {}

export function stopAudio(): void {}

export function audioAvailable(): boolean {
  return true;
}
