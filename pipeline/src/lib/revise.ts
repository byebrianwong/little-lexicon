// Second-pass content: better quiz wrong answers and memory hooks.
//
// The first Gemini pass (stage 03, mostly gemini-3.5-flash-lite) wrote wrong
// answers that were often too easy ("Related to the study of capybaras") and
// hooks that often made no sense. This pass asks for each wrong answer as the
// real meaning of a named look-alike word (abate: abet, abdicate), and for a
// hook that names the word and agrees with its meaning. The code checks what
// it can: the look-alike is a real word with the target's part of speech (by
// WordNet), it is not the target, no answer repeats across words, no answer
// mentions the target, and the hook names the target.
//
// Rows written by this pass carry `revision: REVISION`, so a run that stops
// part way (a daily quota) continues where it left off.

import { z } from 'zod';
import { findWordToken } from './wordnet.ts';

export const REVISION = 2;

export interface ReviseItem {
  senseId: number;
  headword: string;
  partOfSpeech: string | null;
  definition: string;
  plainDefinition: string | null;
  needsMnemonic: boolean;
}

export interface Revised {
  senseId: number;
  distractors: { word: string; meaning: string }[];
  mnemonic: string | null;
}

export const REVISE_SYSTEM = `You improve study content for an English vocabulary app for adults preparing for tests like the GRE. You will be given several words, separated by lines containing only ---. Each comes with a sense id, its part of speech, its dictionary definition and a plain-language definition.

For each word, write:

1. "distractors": 5 wrong answers for a multiple-choice question that shows the dictionary definition among them. Each wrong answer is the real meaning of a different English word that a learner could confuse with the target, because it looks or sounds similar or shares a prefix or root. For "abate", good choices are abet, abdicate and abase. Put that other word in "word" and its meaning in "meaning".
   - "word" is a real English word in its base form (for example "abet", not "abets"). It is not the target word or a form of it, and each wrong answer uses a different word.
   - "word" has the same part of speech as the target, so the wrong answers cannot be ruled out by grammar.
   - "meaning" is an accurate definition of "word", written like the dictionary definition you were given: similar length, starting with a capital letter and ending with a period. Do not put "word" or the target word in it.
   - No meaning may be close to the target's meaning. Do not use antonyms of the target, and do not use silly or joke meanings.
2. "mnemonic": one or two short sentences that help a learner remember what the target word means. Pick a part of the word that sounds like a common English word, or a well-known Latin or Greek root, name that part, and say how it connects to the meaning. For example: "Capricious comes from caprice, a sudden change of mind." A sentence that only uses the word, such as "The storm began to abate", is not a mnemonic. Spell every word correctly; do not misspell a word to make it sound alike. It must include the target word, make sense when read aloud, and agree with the definition. Do not invent etymologies. Write it only when asked; otherwise set it to null.

Return ONLY a JSON object {"items": [...]} with one object per word, in the order given, each shaped {"sense_id": <the sense id>, "distractors": [{"word": "...", "meaning": "..."}], "mnemonic": "..." or null}. No prose, no markdown, no code fences.

Write in plain words. No em dashes. No hype.`;

/** Gemini response schema (OpenAPI subset) for REVISE_SYSTEM. */
export const REVISE_RESPONSE_SCHEMA = {
  type: 'OBJECT',
  properties: {
    items: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          sense_id: { type: 'INTEGER' },
          distractors: {
            type: 'ARRAY',
            items: {
              type: 'OBJECT',
              properties: { word: { type: 'STRING' }, meaning: { type: 'STRING' } },
              required: ['word', 'meaning'],
            },
          },
          mnemonic: { type: 'STRING', nullable: true },
        },
        required: ['sense_id', 'distractors'],
      },
    },
  },
  required: ['items'],
} as const;

export function buildRevisePrompt(item: ReviseItem): string {
  return [
    `Sense id: ${item.senseId}`,
    `Word: ${item.headword}`,
    `Part of speech: ${item.partOfSpeech ?? 'unknown'}`,
    `Dictionary definition: ${item.definition}`,
    `Plain definition: ${item.plainDefinition ?? item.definition}`,
    item.needsMnemonic ? 'Include a mnemonic.' : 'Set "mnemonic" to null.',
  ].join('\n');
}

const RawSchema = z.object({
  sense_id: z.number().int().positive(),
  distractors: z
    .array(
      z.object({
        word: z.string().trim().min(1).max(40),
        meaning: z.string().trim().min(8).max(200),
      }),
    )
    .min(4)
    .max(6),
  mnemonic: z.string().trim().min(10).max(260).nullable().optional(),
});

const key = (s: string): string => s.trim().toLowerCase();
const letters = (s: string): string => s.toLowerCase().replace(/[^a-z]/g, '');

/** Parts of speech for a lemma, or null when it is not a known word. */
export type Lexicon = (lemma: string) => string[] | null;

/** Every problem with one revised item, or an empty list. */
export function checkRevised(
  raw: z.infer<typeof RawSchema>,
  item: ReviseItem,
  taken: Set<string>,
  lexicon?: Lexicon,
): string[] {
  const problems: string[] = [];
  const word = item.headword;
  if (JSON.stringify(raw).includes('—')) problems.push('contains an em dash');

  const seenWords = new Set<string>();
  const seenMeanings = new Set<string>();
  const correct = new Set([key(item.definition), key(item.plainDefinition ?? '')]);
  for (const d of raw.distractors) {
    const w = key(d.word);
    if (letters(w) === letters(word) || findWordToken(w, word)) {
      problems.push(`look-alike "${d.word}" is the target word`);
    }
    if (seenWords.has(w)) problems.push(`look-alike "${d.word}" is used twice`);
    seenWords.add(w);
    if (lexicon) {
      const pos = lexicon(w);
      if (!pos) problems.push(`look-alike "${d.word}" is not in the dictionary`);
      else if (item.partOfSpeech && !pos.includes(item.partOfSpeech)) {
        problems.push(`look-alike "${d.word}" is a ${pos.join('/')}, not a ${item.partOfSpeech}`);
      }
    }

    const m = d.meaning.trim();
    if (!/^[A-Z]/.test(m) || !/\.$/.test(m)) problems.push(`"${m}" is not a capitalized sentence`);
    if (findWordToken(m, word)) problems.push(`"${m}" mentions the target word`);
    if (seenMeanings.has(key(m))) problems.push(`"${m}" is repeated`);
    if (correct.has(key(m))) problems.push(`"${m}" is the correct definition`);
    if (taken.has(key(m))) problems.push(`"${m}" is already used for another word`);
    seenMeanings.add(key(m));
  }

  if (item.needsMnemonic) {
    const hook = raw.mnemonic ?? '';
    if (!hook) problems.push('missing mnemonic');
    // Names the word, allowing it split up ("UBI-quitous").
    else if (!letters(hook).includes(letters(word))) problems.push('mnemonic does not name the word');
  }
  return problems;
}

/**
 * Split a batch response into checked items. A valid item's wrong answers are
 * added to `taken`, so later items (and later batches) cannot reuse them.
 */
export function parseRevisedBatch(
  text: string,
  items: ReviseItem[],
  taken: Set<string>,
  lexicon?: Lexicon,
): { valid: Map<number, Revised>; failed: number[]; errors: string[] } {
  const bySense = new Map(items.map((i) => [i.senseId, i]));
  const valid = new Map<number, Revised>();
  const errors: string[] = [];
  let rawItems: unknown[] = [];
  try {
    const parsed = JSON.parse(text) as { items?: unknown };
    if (Array.isArray(parsed.items)) rawItems = parsed.items;
    else errors.push('response has no items array');
  } catch (err) {
    errors.push(`not valid JSON: ${(err as Error).message}`);
  }

  for (const rawItem of rawItems) {
    const parsed = RawSchema.safeParse(rawItem);
    if (!parsed.success) {
      errors.push(parsed.error.issues.map((i) => i.message).join('; '));
      continue;
    }
    const item = bySense.get(parsed.data.sense_id);
    if (!item || valid.has(item.senseId)) {
      errors.push(`unexpected sense_id ${parsed.data.sense_id}`);
      continue;
    }
    const problems = checkRevised(parsed.data, item, taken, lexicon);
    if (problems.length > 0) {
      errors.push(`${item.headword}: ${problems.join('; ')}`);
      continue;
    }
    for (const d of parsed.data.distractors) taken.add(key(d.meaning));
    valid.set(item.senseId, {
      senseId: item.senseId,
      distractors: parsed.data.distractors.map((d) => ({ word: d.word.trim(), meaning: d.meaning.trim() })),
      mnemonic: item.needsMnemonic ? (parsed.data.mnemonic ?? '').trim() : null,
    });
  }

  const failed = items.map((i) => i.senseId).filter((id) => !valid.has(id));
  return { valid, failed, errors };
}
