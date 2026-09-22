// Stands in for src/lib/audio.ts inside Storybook. Two reasons:
//
// 1. Determinism. Stories that reveal an answer speak the word on mount. In a
//    browser that starts the speech synthesizer on every render, which is noise
//    during a snapshot run and audible when someone opens Storybook.
// 2. Bundling. expo-audio pulls in expo-asset, which this project does not
//    install, and Vite cannot resolve it.
//
// The real module is exercised by the app, not by stories: it has no UI.

export interface SpeakOptions {
  url?: string | null;
  fallbackText: string;
  rate?: number;
}

export async function play(_opts: SpeakOptions): Promise<void> {}

export async function speakWord(_headword: string, _url?: string | null): Promise<void> {}

export async function speakSentence(_text: string, _url?: string | null): Promise<void> {}

export function stopAudio(): void {}

export function audioAvailable(): boolean {
  return true;
}
