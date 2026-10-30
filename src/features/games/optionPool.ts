// Distractor selection for the recognition/matching modes. Pure and unit
// tested. Modes pull from the word's own distractors first, then from a
// session-wide pool assembled from the other words in the plan.

import type { ExampleContent, SenseContent, SessionItem, WordContent } from '@/lib/types';
import { articleBefore, indefiniteArticle } from '@/lib/text';
import type { ModeCapabilities } from './ladder';

/** A word that can be offered as a wrong answer for a sentence's blank. */
export interface ClozeWord {
  wordId: number;
  headword: string;
  partOfSpeech: WordContent['partOfSpeech'];
  article: 'a' | 'an';
  /** Its synonyms and antonyms, lowercased. */
  related: string[];
  /** One of the words being played, rather than from the wider collection. */
  inSession: boolean;
}

export interface OptionPool {
  words: { wordId: number; headword: string }[];
  definitions: { wordId: number; text: string }[];
  lemmas: string[]; // synonyms/antonyms from other words, for relation distractors
  /**
   * Wrong answers for the sentence-choice cloze: the words being played, then
   * the rest of the collection. A blank needs three words of the answer's part
   * of speech, and a session alone often has too few.
   */
  clozeWords: ClozeWord[];
}

export function buildOptionPool(
  items: SessionItem[],
  collection: readonly WordContent[] = [],
): OptionPool {
  const words: OptionPool['words'] = [];
  const definitions: OptionPool['definitions'] = [];
  const lemmas = new Set<string>();
  const clozeWords: ClozeWord[] = [];
  const inCloze = new Set<number>();
  const addClozeWord = (c: WordContent, inSession: boolean) => {
    if (inCloze.has(c.wordId)) return;
    inCloze.add(c.wordId);
    clozeWords.push({
      wordId: c.wordId,
      headword: c.headword,
      partOfSpeech: c.partOfSpeech,
      article: indefiniteArticle(c.headword, c.ipa),
      related: c.relations.map((r) => r.relatedLemma.toLowerCase()),
      inSession,
    });
  };
  for (const it of items) {
    const c = it.content;
    words.push({ wordId: c.wordId, headword: c.headword });
    for (const s of c.senses) definitions.push({ wordId: c.wordId, text: s.definition });
    for (const r of c.relations) lemmas.add(r.relatedLemma.toLowerCase());
    addClozeWord(c, true);
  }
  for (const c of collection) addClozeWord(c, false);
  return { words, definitions, lemmas: [...lemmas], clozeWords };
}

// Deterministic PRNG so option order is stable per (word, mode) and testable.
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(arr: T[], rng: () => number): T[] {
  const out = [...arr];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j]!, out[i]!];
  }
  return out;
}

function uniqueTake(
  candidates: string[],
  exclude: Set<string>,
  n: number,
  rng: () => number,
): string[] {
  const seen = new Set(exclude);
  const out: string[] = [];
  for (const c of shuffle(candidates, rng)) {
    const key = c.trim().toLowerCase();
    if (key === '' || seen.has(key)) continue;
    seen.add(key);
    out.push(c);
    if (out.length >= n) break;
  }
  return out;
}

/** Wrong headwords for definition-to-word MC. */
export function pickWordDistractors(
  pool: OptionPool,
  currentWordId: number,
  n: number,
  rng: () => number,
): string[] {
  const candidates = pool.words
    .filter((w) => w.wordId !== currentWordId)
    .map((w) => w.headword);
  const exclude = new Set(
    pool.words.filter((w) => w.wordId === currentWordId).map((w) => w.headword.toLowerCase()),
  );
  return uniqueTake(candidates, exclude, n, rng);
}

/** Wrong definitions for word-to-definition MC. Prefers the sense's own. */
export function pickDefinitionDistractors(
  sense: SenseContent,
  pool: OptionPool,
  currentWordId: number,
  n: number,
  rng: () => number,
): string[] {
  const own = sense.distractors.map((d) => d.lemma);
  const exclude = new Set([sense.definition.trim().toLowerCase()]);
  const fromOwn = uniqueTake(own, exclude, n, rng);
  if (fromOwn.length >= n) return fromOwn.slice(0, n);
  const poolDefs = pool.definitions
    .filter((d) => d.wordId !== currentWordId)
    .map((d) => d.text);
  const need = n - fromOwn.length;
  const more = uniqueTake(
    poolDefs,
    new Set([...exclude, ...fromOwn.map((x) => x.toLowerCase())]),
    need,
    rng,
  );
  return [...fromOwn, ...more];
}

/** Plausible wrong lemmas for synonym/antonym matching. */
export function pickRelationDistractors(
  pool: OptionPool,
  exclude: string[],
  n: number,
  rng: () => number,
): string[] {
  const ex = new Set(exclude.map((e) => e.trim().toLowerCase()));
  return uniqueTake([...pool.lemmas, ...pool.words.map((w) => w.headword)], ex, n, rng);
}

/** Assemble labeled options (correct + distractors), shuffled. */
export interface Option {
  text: string;
  correct: boolean;
}

export function buildOptions(
  correct: string,
  distractors: string[],
  rng: () => number,
): Option[] {
  const opts: Option[] = [
    { text: correct, correct: true },
    ...distractors.map((d) => ({ text: d, correct: false })),
  ];
  return shuffle(opts, rng);
}

/**
 * Sentences that can be offered with a choice of words: the blank holds the
 * headword itself. In "the storm abated" every wrong option would be a base
 * form beside the one past tense, so inflected blanks are left to the typed
 * cloze.
 */
export function clozeChoiceExamples(content: WordContent): ExampleContent[] {
  const headword = content.headword.trim().toLowerCase();
  return content.senses
    .flatMap((s) => s.examples)
    .filter((e) => (e.clozeTarget ?? '').trim().toLowerCase() === headword);
}

/**
 * Words that can stand in the blank as wrong answers. Each has the answer's
 * part of speech and takes the same "a" or "an" when one comes before the
 * blank, so grammar gives nothing away. A word linked to the answer as a
 * synonym or antonym, in either direction or through a shared one, is left
 * out: it could make sense in the sentence too.
 */
function clozeCandidates(
  content: WordContent,
  article: 'a' | 'an' | null,
  pool: OptionPool,
): ClozeWord[] {
  const headword = content.headword.toLowerCase();
  const related = new Set(content.relations.map((r) => r.relatedLemma.toLowerCase()));
  return pool.clozeWords.filter(
    (w) =>
      w.wordId !== content.wordId &&
      w.partOfSpeech === content.partOfSpeech &&
      (article === null || w.article === article) &&
      !related.has(w.headword.toLowerCase()) &&
      !w.related.some((l) => l === headword || related.has(l)),
  );
}

export const CLOZE_CHOICE_DISTRACTORS = 3;

export interface ClozeChoice {
  example: ExampleContent;
  options: Option[];
}

/**
 * A sentence with the word blanked and four words to fill it, or null when no
 * sentence has enough wrong answers. Wrong answers come from the words being
 * played first, which the learner has at least seen, so the right answer does
 * not stand out as the only familiar one.
 *
 * `shown` is the sentence this visit shows on the other screens (lib/examples).
 * It is tried last: the new-word card shows it just before the first question,
 * so blanking it would give the answer away.
 */
export function buildClozeChoice(
  content: WordContent,
  pool: OptionPool,
  rng: () => number,
  shown: Pick<ExampleContent, 'exampleId'> | null = null,
): ClozeChoice | null {
  const exclude = new Set([content.headword.toLowerCase()]);
  const shuffled = shuffle(clozeChoiceExamples(content), rng);
  const order = shown
    ? [
        ...shuffled.filter((e) => e.exampleId !== shown.exampleId),
        ...shuffled.filter((e) => e.exampleId === shown.exampleId),
      ]
    : shuffled;
  for (const example of order) {
    const candidates = clozeCandidates(
      content,
      articleBefore(example.text, example.clozeTarget ?? content.headword),
      pool,
    );
    const fromSession = uniqueTake(
      candidates.filter((w) => w.inSession).map((w) => w.headword),
      exclude,
      CLOZE_CHOICE_DISTRACTORS,
      rng,
    );
    const need = CLOZE_CHOICE_DISTRACTORS - fromSession.length;
    const fromCollection =
      need > 0
        ? uniqueTake(
            candidates.filter((w) => !w.inSession).map((w) => w.headword),
            new Set([...exclude, ...fromSession.map((h) => h.toLowerCase())]),
            need,
            rng,
          )
        : [];
    const distractors = [...fromSession, ...fromCollection];
    if (distractors.length < CLOZE_CHOICE_DISTRACTORS) continue;
    return { example, options: buildOptions(content.headword, distractors, rng) };
  }
  return null;
}

// A helper the ladder uses to know what content a word supports.
export function capsForWord(content: WordContent, pool: OptionPool): ModeCapabilities {
  const hasClozeExample = content.senses.some((s) =>
    s.examples.some((e) => (e.clozeTarget ?? '').trim() !== ''),
  );
  const hasRelations = {
    synonym: content.relations.some((r) => r.relationType === 'synonym'),
    antonym: content.relations.some((r) => r.relationType === 'antonym'),
  };
  // Whether a choice can be built does not depend on the seed: every sentence
  // is tried.
  const hasClozeChoice = buildClozeChoice(content, pool, mulberry32(0)) !== null;
  return { hasClozeExample, hasClozeChoice, hasRelations, hasAudio: true };
}
