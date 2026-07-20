// Deterministic, offline stub generators. Used whenever the pipeline runs in
// dry-run (or a required API key is missing) so the whole thing runs end to end
// with no network and no spend. Every string is clearly labeled "(dry-run
// stub)" so stub content is never mistaken for real content in the output.

import type { GeneratedSense } from './schema.ts';
import { estimateSyllables } from './difficulty.ts';

const POS_CYCLE = ['adjective', 'noun', 'verb', 'adverb'] as const;

/** Stable small integer hash of a string, for deterministic choices. */
function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function capitalize(s: string): string {
  return s.length ? s[0]!.toUpperCase() + s.slice(1) : s;
}

export interface HydrateStub {
  partOfSpeech: string;
  ipa: string;
  syllables: number;
  definition: string;
  register: string | null;
  synonyms: string[];
  antonyms: string[];
  example: { text: string; clozeTarget: string };
}

/** Offline stand-in for WordNet + Free Dictionary hydration. */
export function stubHydrate(word: string): HydrateStub {
  const h = hash(word);
  const pos = POS_CYCLE[h % POS_CYCLE.length]!;
  const register = h % 3 === 0 ? 'formal' : null;
  return {
    partOfSpeech: pos,
    ipa: `/${word}/`,
    syllables: estimateSyllables(word),
    definition: `(dry-run stub) A ${pos} sense of "${word}"; replace with WordNet or Free Dictionary data in a live run.`,
    register,
    synonyms: [`${word}-synonym-1`, `${word}-synonym-2`],
    antonyms: [`${word}-antonym-1`],
    example: {
      text: `The essayist deployed ${word} with unusual precision.`,
      clozeTarget: word,
    },
  };
}

/**
 * Offline stand-in for Claude batch generation. Returns a GeneratedSense that
 * satisfies the same Zod schema the real path is validated against, so the
 * validate-before-write path is exercised in dry-run too.
 */
export function stubGenerate(
  senseId: number,
  word: string,
  includeMnemonic: boolean,
): GeneratedSense {
  const cap = capitalize(word);
  const examples = [
    `${cap} colored every argument the young scholar advanced that term.`,
    `Critics accused the minister of ${word} whenever the budget was questioned.`,
    `Her ${word} in the archive left the other researchers visibly impressed.`,
    `Few readers expected such ${word} from a debut so slim.`,
  ].map((text) => ({ text, cloze_target: word }));

  const distractors = [
    `${word}-distractor-1`,
    `${word}-distractor-2`,
    `${word}-distractor-3`,
    `${word}-distractor-4`,
    `${word}-distractor-5`,
  ];

  return {
    sense_id: senseId,
    plain_language_definition: `(dry-run stub) In plain words, "${word}" means roughly what its real definition says; replace in a live run.`,
    examples,
    distractors,
    mnemonic: includeMnemonic
      ? `(dry-run stub) To recall "${word}", tie its sound to a vivid mental image.`
      : null,
  };
}

/**
 * Estimate MP3 byte size from character count for dry-run bucket accounting.
 * A rough figure (about 120 bytes/char) standing in for a real synthesized MP3.
 */
export function estimateAudioBytes(chars: number): number {
  return Math.max(2048, Math.round(chars * 120));
}
