// Audio playback for word and sentence pronunciation (Phase 3.5).
//
// Clips are made by the pipeline (stage 04, the Kokoro voice model or a US
// human recording for headwords) and served by the web app's site; each word
// and sentence in the words file has the audioUrl of its clip (src/lib/
// clipUrl.ts). When there is no clip, or it cannot load, the device's speech
// synthesizer (expo-speech) speaks the text with the most natural voice it
// has. Runtime TTS for content is only ever this local, free synthesizer; paid
// TTS is build-time only (CLAUDE.md guardrail).

import { AudioPlayer, AudioSource, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { Platform } from 'react-native';
import { DEFAULT_AUDIO_HOST, resolveClipUrl } from './clipUrl';
import { pickVoice } from './voice';

// Web plays clips from its own site; native apps from the production site.
const AUDIO_HOST =
  Platform.OS === 'web' ? '' : (process.env.EXPO_PUBLIC_AUDIO_HOST ?? DEFAULT_AUDIO_HOST);
// A clip that has not loaded by then (offline, or not on the site yet) is
// given up, and the text is spoken instead. expo-audio reports no load errors.
const LOAD_TIMEOUT_MS = 4000;

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

// The device voice is chosen in the background and never awaited: on web,
// expo-speech waits for the browser's voiceschanged event, which never comes
// in a browser with no voices. Until the list arrives, speech uses the default.
let voiceId: string | undefined;
let voiceLookup: Promise<void> | null = null;
function chooseDeviceVoice(): void {
  voiceLookup ??= Speech.getAvailableVoicesAsync().then(
    (voices) => {
      voiceId = pickVoice(voices);
    },
    (e: unknown) => {
      console.warn('audio: could not list device voices, using the default', e);
    },
  );
}

export interface SpeakOptions {
  /** A bundled clip or hosted file to play; otherwise `fallbackText` is spoken. */
  source?: AudioSource | null;
  fallbackText: string;
  rate?: number;
}

let currentPlayer: AudioPlayer | null = null;
// Each call takes a turn number, so a slow call cannot start after a newer one.
let turn = 0;

function releaseCurrent(): void {
  if (currentPlayer) {
    try {
      currentPlayer.remove();
    } catch (e) {
      console.warn('audio: could not release the previous player', e);
    }
    currentPlayer = null;
  }
}

/** Play a clip if there is one, else speak the fallback text. Fire-and-forget. */
export async function play(opts: SpeakOptions): Promise<void> {
  const mine = ++turn;
  chooseDeviceVoice();
  Speech.stop();
  releaseCurrent();
  await ensureAudioMode();
  if (mine !== turn) return;

  if (opts.source) {
    try {
      const player = createAudioPlayer(opts.source);
      currentPlayer = player;
      player.play();
      setTimeout(() => {
        if (mine !== turn || currentPlayer !== player || player.isLoaded) return;
        console.warn('audio: clip did not load, falling back to speech', opts.source);
        releaseCurrent();
        speak(opts);
      }, LOAD_TIMEOUT_MS);
      return;
    } catch (e) {
      console.warn('audio: clip failed, falling back to speech', e);
    }
  }
  speak(opts);
}

function speak(opts: SpeakOptions): void {
  Speech.speak(opts.fallbackText, { rate: opts.rate ?? 0.95, voice: voiceId });
}

function hosted(url: string | null | undefined): AudioSource | null {
  const uri = resolveClipUrl(url, AUDIO_HOST);
  return uri ? { uri } : null;
}

export interface SpeakableWord {
  wordId: number;
  headword: string;
  audioUrl?: string | null;
}

export interface SpeakableExample {
  exampleId: number;
  text: string;
  audioUrl?: string | null;
}

/** Speak a headword: its clip, else device speech. */
export async function speakWord(word: SpeakableWord): Promise<void> {
  return play({
    source: hosted(word.audioUrl),
    fallbackText: word.headword,
    rate: 0.9,
  });
}

/** Speak an example sentence, in the same order of preference as speakWord. */
export async function speakSentence(example: SpeakableExample): Promise<void> {
  return play({
    source: hosted(example.audioUrl),
    fallbackText: example.text,
  });
}

export function stopAudio(): void {
  turn += 1;
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
