// Expand the compact seed corpus into full WordContent view models with stable
// ids. Deterministic so ids are consistent across reloads and tests.

import type {
  DistractorContent,
  ExampleContent,
  RelationContent,
  SenseContent,
  WordContent,
} from '@/lib/types';
import { CORPUS, type SeedWord } from './corpus';

function buildSense(word: SeedWord, wordId: number, senseIndex: number): SenseContent {
  const seed = word.senses[senseIndex]!;
  const senseId = wordId * 100 + (senseIndex + 1);
  const examples: ExampleContent[] = seed.examples.map((ex, i) => ({
    exampleId: senseId * 100 + (i + 1),
    text: ex.text,
    audioUrl: null,
    clozeTarget: ex.cloze,
  }));
  const distractors: DistractorContent[] = seed.distractors.map((d) => ({
    lemma: d,
    kind: 'mc',
    difficulty: word.difficultyTier,
  }));
  return {
    senseId,
    definition: seed.def,
    plainLanguageDefinition: seed.plain,
    senseOrder: senseIndex + 1,
    register: seed.register ?? null,
    examples,
    distractors,
  };
}

function buildWord(word: SeedWord, index: number): WordContent {
  const wordId = index + 1;
  const senses = word.senses.map((_, i) => buildSense(word, wordId, i));
  const relations: RelationContent[] = [
    ...word.synonyms.map<RelationContent>((s) => ({
      relatedLemma: s,
      relationType: 'synonym',
    })),
    ...word.antonyms.map<RelationContent>((a) => ({
      relatedLemma: a,
      relationType: 'antonym',
    })),
  ];
  return {
    wordId,
    headword: word.headword,
    partOfSpeech: word.pos,
    ipa: word.ipa,
    syllables: word.syllables,
    difficultyTier: word.difficultyTier,
    frequencyRank: word.frequencyRank,
    etymology: word.etymology,
    audioUrl: null, // demo uses on-device speech synthesis as a fallback
    senses,
    relations,
    mnemonics: [word.mnemonic],
  };
}

// Built once at module load.
export const DEMO_WORDS: WordContent[] = CORPUS.map(buildWord);

export const DEMO_WORDS_BY_ID: Map<number, WordContent> = new Map(
  DEMO_WORDS.map((w) => [w.wordId, w]),
);

// All distinct definitions, used as a fallback distractor pool for multiple
// choice when a sense is short on its own distractors.
export const ALL_DEFINITIONS: string[] = DEMO_WORDS.flatMap((w) =>
  w.senses.map((s) => s.definition),
);
