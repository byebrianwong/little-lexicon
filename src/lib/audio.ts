// Audio playback for word and sentence pronunciation (Phase 3.5).
//
// Production plays pre-generated MP3s from Storage via expo-audio. When a clip
// is missing (and always in demo mode), it falls back to on-device speech
// synthesis (expo-speech) so listening mode and reveals still work. Runtime TTS
// for content is only ever this local, free, device synthesizer; paid TTS is
// build-time only (CLAUDE.md guardrail).

import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';

let configured = false;
async function ensureAudioMode(): Promise<void> {
  if (configured) return;
  try {
    await setAudioModeAsync({ playsInSilentMode: true });
    configured = true;
  } catch (e) {
    // Non-fatal; playback can still proceed on most platforms.
    console.warn('audio: could not set audio mode', e);
  }
}

export interface SpeakOptions {
  // If provided, play this MP3; otherwise synthesize `fallbackText`.
  url?: string | null;
  fallbackText: string;
  rate?: number;
}

let currentPlayer: AudioPlayer | null = null;

function releaseCurrent(): void {
  if (currentPlayer) {
    try {
      currentPlayer.remove();
    } catch {
      // ignore
    }
    currentPlayer = null;
  }
}

/** Play a clip URL if present, else speak the fallback text. Fire-and-forget. */
export async function play(opts: SpeakOptions): Promise<void> {
  await ensureAudioMode();
  Speech.stop();
  releaseCurrent();

  if (opts.url) {
    try {
      const player = createAudioPlayer({ uri: opts.url });
      currentPlayer = player;
      player.play();
      return;
    } catch (e) {
      console.warn('audio: clip failed, falling back to speech', e);
    }
  }
  Speech.speak(opts.fallbackText, { rate: opts.rate ?? 0.95 });
}

/** Convenience: speak a single headword. */
export function speakWord(headword: string, url?: string | null): Promise<void> {
  return play({ url, fallbackText: headword, rate: 0.9 });
}

/** Convenience: speak an example sentence. */
export function speakSentence(text: string, url?: string | null): Promise<void> {
  return play({ url, fallbackText: text });
}

export function stopAudio(): void {
  Speech.stop();
  releaseCurrent();
}

/**
 * Whether an audio channel is available for listening mode. Speech synthesis is
 * available on native and web, so this is effectively always true, but the
 * check keeps the door open for platforms without it.
 */
export function audioAvailable(): boolean {
  return true;
}
