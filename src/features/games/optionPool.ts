// Distractor selection for the recognition/matching modes. Pure and unit
// tested. Modes pull from the word's own distractors first, then from a
// session-wide pool assembled from the other words in the plan.

import type { SenseContent, SessionItem, WordContent } from '@/lib/types';

export interface OptionPool {
  words: { wordId: number; headword: string }[];
  definitions: { wordId: number; text: string }[];
  lemmas: string[]; // synonyms/antonyms from other words, for relation distractors
}

export function buildOptionPool(items: SessionItem[]): OptionPool {
  const words: OptionPool['words'] = [];
  const definitions: OptionPool['definitions'] = [];
  const lemmas = new Set<string>();
  for (const it of items) {
    const c = it.content;
    words.push({ wordId: c.wordId, headword: c.headword });
    for (const s of c.senses) definitions.push({ wordId: c.wordId, text: s.definition });
    for (const r of c.relations) lemmas.add(r.relatedLemma.toLowerCase());
  }
  return { words, definitions, lemmas: [...lemmas] };
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

// A helper the ladder uses to know what content a word supports.
export function capsForWord(content: WordContent): {
  hasClozeExample: boolean;
  hasRelations: { synonym: boolean; antonym: boolean };
  hasAudio: boolean;
} {
  const hasClozeExample = content.senses.some((s) =>
    s.examples.some((e) => (e.clozeTarget ?? '').trim() !== ''),
  );
  const hasRelations = {
    synonym: content.relations.some((r) => r.relationType === 'synonym'),
    antonym: content.relations.some((r) => r.relationType === 'antonym'),
  };
  return { hasClozeExample, hasRelations, hasAudio: true };
}
