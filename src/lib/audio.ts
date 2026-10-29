// Audio playback for words, example sentences, definitions and memory hooks
// (Phase 3.5).
//
// Clips are made by the pipeline (stage 04, the Kokoro voice model or a US
// human recording for headwords) and served by the web app's site; each word,
// sentence and definition in the words file has the audioUrl of its clip, and
// each word the hookAudioUrl of its memory hook's clip (src/lib/clipUrl.ts).
// Native apps play the copy in the offline pack when it has one
// (src/lib/audioPack), and otherwise the one on the site. When there is no
// clip, or it cannot load, the device's speech
// synthesizer (expo-speech) speaks the text with the most natural voice it
// has. Runtime TTS for content is only ever this local, free synthesizer; paid
// TTS is build-time only (CLAUDE.md guardrail).

import { AudioPlayer, AudioSource, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import * as Speech from 'expo-speech';
import { AUDIO_HOST } from './audioHost';
import { localClip } from './audioPack';
import { resolveClipUrl } from './clipUrl';
import { pickVoice } from './voice';
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
  /** A clip on the phone or the site; otherwise `fallbackText` is spoken. */
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
        if (mine !== turn || currentPlayer !== player || clipLoaded(player)) return;
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

/**
 * Whether a clip loaded, even if it has already finished. On Android,
 * isLoaded is true only while the player is ready, so it turns false again
 * when a word clip (about a second long) ends, well before the timeout. The
 * device voice then said the word a second time. A known duration stays set
 * after the clip ends, and a clip that never loaded has none (0 or NaN).
 */
export function clipLoaded(player: Pick<AudioPlayer, 'isLoaded' | 'duration'>): boolean {
  return player.isLoaded || player.duration > 0;
}

function speak(opts: SpeakOptions): void {
  Speech.speak(opts.fallbackText, { rate: opts.rate ?? 0.95, voice: voiceId });
}

/** The clip in the offline pack, else the one on the site, else null. */
function clip(url: string | null | undefined): AudioSource | null {
  const local = localClip(url);
  if (local) return local;
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
    source: clip(word.audioUrl),
    fallbackText: word.headword,
    rate: 0.9,
  });
}

/** Speak an example sentence, in the same order of preference as speakWord. */
export async function speakSentence(example: SpeakableExample): Promise<void> {
  return play({
    source: clip(example.audioUrl),
    fallbackText: example.text,
  });
}

export interface SpeakableSense {
  definition: string;
  plainLanguageDefinition: string | null;
  audioUrl?: string | null;
}

/**
 * Read out the definition the app shows (the plain one when the sense has it),
 * in the same order of preference as speakWord.
 */
export async function speakDefinition(sense: SpeakableSense): Promise<void> {
  return play({
    source: clip(sense.audioUrl),
    fallbackText: sense.plainLanguageDefinition ?? sense.definition,
  });
}

export interface SpeakableHook {
  mnemonics: readonly string[];
  hookAudioUrl?: string | null;
}

/**
 * Read out the memory hook the app shows (the first one), in the same order
 * of preference as speakWord. Does nothing for a word without a hook.
 */
export async function speakHook(word: SpeakableHook): Promise<void> {
  const hook = word.mnemonics[0];
  if (!hook) return;
  return play({ source: clip(word.hookAudioUrl), fallbackText: hook });
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
