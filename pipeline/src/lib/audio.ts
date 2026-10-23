// Pure helpers for stage 04 (audio) and the clip module that stage 05 writes.
//
// The app bundles every clip. Stage 04 saves MP3s under assets/audio, and
// stage 05 writes src/content/audioClips.ts, which `require`s each file so
// Metro packs it into the app. Nothing here touches the network or the disk.

import { createHash } from 'node:crypto';

export const DEFAULT_TTS_VOICE = 'af_heart';
/** MP3 bit rate of TTS clips. Mono speech at 24 kHz stays clear at 32 kbps. */
export const TTS_KBPS = 32;

/**
 * What a TTS clip records as its voice: model, voice and bit rate. It is part
 * of the clip's key, so changing any of them remakes every TTS clip.
 */
export function ttsVoiceLabel(voice: string): string {
  return `kokoro-82m/${voice}/${TTS_KBPS}k`;
}

// IPA spellings Kokoro writes differently. Longer sequences come first, so a
// diphthong is replaced before its parts are.
const IPA_TO_KOKORO: [string, string][] = [
  ['eɪ', 'A'],
  ['aɪ', 'I'],
  ['aʊ', 'W'],
  ['ɔɪ', 'Y'],
  ['oʊ', 'O'],
  ['dʒ', 'ʤ'],
  ['tʃ', 'ʧ'],
  ['ɚ', 'əɹ'],
  ['ɝ', 'ɜɹ'],
  ['r', 'ɹ'],
  ['g', 'ɡ'],
  ['e', 'A'],
  ['o', 'O'],
  ['a', 'ɑ'],
];
/** Kokoro's US English vowels; A, I, O, W and Y stand for diphthongs. */
const KOKORO_VOWELS = new Set('AIOWYaiuæɑɔəɛɜɪʊʌᵻᵊɐ');
/** Every letter Kokoro reads in US English, with the two stress marks. */
const KOKORO_US = new Set([...KOKORO_VOWELS, ...'bdfhjklmnpstvwzɡŋɹʃʒðθʤʧɾʔ', 'ˈ', 'ˌ']);

/**
 * The words file's General American IPA ("/əˈbeɪt/") in the phoneme letters
 * Kokoro reads ("əbˈAt"), or null when there is no IPA or it uses a symbol
 * Kokoro has no letter for (the voice then says the word its own way).
 *
 * Diphthongs become single letters. IPA puts a stress mark at the start of
 * its syllable; Kokoro's own dictionary puts it just before the vowel, so the
 * mark moves there. IPA leaves one-syllable words unmarked, but without a mark
 * the voice says the word unstressed inside a sentence, so they get one.
 */
export function ipaToKokoro(ipa: string | null): string | null {
  if (!ipa) return null;
  let p = ipa.trim().replace(/^\/+|\/+$/g, '').trim();
  for (const [from, to] of IPA_TO_KOKORO) p = p.split(from).join(to);
  let out = '';
  let stress = '';
  for (const ch of p) {
    if (ch === 'ˈ' || ch === 'ˌ') {
      stress = ch;
    } else {
      if (stress && KOKORO_VOWELS.has(ch)) {
        out += stress;
        stress = '';
      }
      out += ch;
    }
  }
  if (!out.includes('ˈ')) {
    const first = [...out].findIndex((ch) => KOKORO_VOWELS.has(ch));
    if (first >= 0) {
      const chars = [...out];
      chars.splice(first, 0, 'ˈ');
      out = chars.join('');
    }
  }
  if (out.length === 0 || [...out].some((ch) => !KOKORO_US.has(ch))) return null;
  return out;
}

/**
 * Text for Kokoro with the headword's pronunciation pinned, in Kokoro's
 * markup: "Her fear began to [abate](/əbˈAt/)." The headword is matched as a
 * whole word, as written or with a capital first letter. Inflected forms
 * ("abated") are left to the voice's own dictionary.
 */
export function kokoroText(text: string, pin: { headword: string; phonemes: string } | null): string {
  if (!pin) return text;
  const { headword, phonemes } = pin;
  const forms = [headword, headword.charAt(0).toUpperCase() + headword.slice(1)]
    .map((f) => f.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
    .join('|');
  const pattern = new RegExp(`(^|[^\\p{L}])(${forms})(?=$|[^\\p{L}])`, 'gu');
  return text.replace(pattern, (_m, before: string, word: string) => `${before}[${word}](/${phonemes}/)`);
}

/**
 * What a clip was made from. A clip whose key no longer matches (the sentence
 * was rewritten, the IPA fixed, or the voice changed) is made again.
 */
export function clipKey(parts: Record<string, string | null>): string {
  return createHash('sha256').update(JSON.stringify(parts)).digest('hex').slice(0, 16);
}

interface KeyWord {
  headword: string;
  ipa: string | null;
}

/** Key of a human recording of the headword: it depends on the headword only. */
export function humanClipKey(word: KeyWord): string {
  return clipKey({ kind: 'human', headword: word.headword });
}

/** Key of a TTS clip of the headword. `voice` is a ttsVoiceLabel. */
export function wordClipKey(word: KeyWord, voice: string): string {
  return clipKey({ kind: 'word', text: word.headword, ipa: word.ipa, voice });
}

/** Key of a TTS clip of an example sentence. `voice` is a ttsVoiceLabel. */
export function sentenceClipKey(text: string, word: KeyWord, voice: string): string {
  return clipKey({ kind: 'sentence', text, headword: word.headword, ipa: word.ipa, voice });
}

/**
 * True when a saved clip was made from the content it is filed under now.
 * `sentence` is the example's text, or null for the headword clip. A clip goes
 * out of date when its sentence is rewritten in place or its word's IPA is
 * fixed, until stage 04 runs again. The clip's own voice is used, so changing
 * KOKORO_VOICE alone does not make a clip count as out of date here.
 */
export function clipMatches(
  clip: { key?: string; source?: string; voice?: string },
  word: KeyWord,
  sentence: string | null,
): boolean {
  if (clip.source === 'human') return sentence === null && clip.key === humanClipKey(word);
  if (clip.source !== 'tts' || !clip.voice) return false;
  const expected =
    sentence === null ? wordClipKey(word, clip.voice) : sentenceClipKey(sentence, word, clip.voice);
  return clip.key === expected;
}

export interface FdPhonetic {
  audio?: string;
  sourceUrl?: string;
  license?: { name?: string; url?: string };
}
export interface FdEntry {
  phonetics?: FdPhonetic[];
}

export interface HumanRecording {
  url: string;
  sourceUrl: string | null;
  license: string | null;
}

/**
 * A US recording of the headword from a Free Dictionary API answer, or null.
 * Only US clips are taken: the app shows General American IPA, and a UK or
 * Australian recording would disagree with it (the API names files
 * "<word>-us.mp3", "<word>-uk.mp3" and so on).
 */
export function pickUsRecording(entries: FdEntry[] | null): HumanRecording | null {
  if (!Array.isArray(entries)) return null;
  for (const entry of entries) {
    for (const p of entry.phonetics ?? []) {
      if (p.audio && /-us\.mp3$/i.test(p.audio)) {
        return {
          url: p.audio,
          sourceUrl: p.sourceUrl ?? null,
          license: p.license?.name ?? null,
        };
      }
    }
  }
  return null;
}

export const HUMAN_AUDIO_ATTRIBUTION =
  'Some word recordings from Wikimedia Commons via Wiktionary (https://commons.wikimedia.org/), ' +
  'licensed CC BY-SA. Each file\'s source is listed in pipeline/data/content-db.json.';

export interface ClipEntry {
  id: number;
  /** Path of the MP3 relative to the clip module's folder, e.g. ../../assets/audio/words/1.mp3. */
  requirePath: string;
}

/** Source of src/content/audioClips.ts. */
export function buildClipModule(words: ClipEntry[], sentences: ClipEntry[]): string {
  const map = (entries: ClipEntry[]) =>
    [...entries]
      .sort((a, b) => a.id - b.id)
      .map((e) => `  ${e.id}: require('${e.requirePath}'),\n`)
      .join('');
  return (
    '// Generated by the pipeline export (pipeline/src/stages/05-export.ts). Do not edit.\n' +
    '//\n' +
    '// Bundled pronunciation clips: word id to its headword clip, and example id to\n' +
    '// its sentence clip. Each require makes Metro pack the MP3 into the app.\n' +
    '\n' +
    "import type { AudioSource } from 'expo-audio';\n" +
    '\n' +
    `export const wordClips: Record<number, AudioSource> = {\n${map(words)}};\n` +
    '\n' +
    `export const sentenceClips: Record<number, AudioSource> = {\n${map(sentences)}};\n`
  );
}
