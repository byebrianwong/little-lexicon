// Expand the story sample corpus into full WordContent view models with stable
// ids. Deterministic so stories render the same on every run.

import type {
  DistractorContent,
  ExampleContent,
  RelationContent,
  SenseContent,
  WordContent,
} from '@/lib/types';
import { CORPUS, type SeedWord } from './sampleCorpus';

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
    audioUrl: null, // the app speaks the word on the device when there is no clip
    senses,
    relations,
    mnemonics: [word.mnemonic],
  };
}

// Built once at module load.
export const SAMPLE_WORDS: WordContent[] = CORPUS.map(buildWord);
