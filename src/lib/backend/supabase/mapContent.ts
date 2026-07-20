// Maps a PostgREST embedded `words` row into the app's WordContent view model.

import type {
  DistractorContent,
  ExampleContent,
  RelationContent,
  SenseContent,
  WordContent,
} from '@/lib/types';

// The shape returned by the nested select in supabaseBackend.getWordContentBatch.
export interface RawWordRow {
  id: number;
  headword: string;
  part_of_speech: string | null;
  ipa: string | null;
  syllables: number | null;
  difficulty_tier: number;
  frequency_rank: number | null;
  etymology: string | null;
  audio_url: string | null;
  senses: {
    id: number;
    definition: string;
    plain_language_definition: string | null;
    sense_order: number;
    register: string | null;
    example_sentences: {
      id: number;
      text: string;
      audio_url: string | null;
      cloze_target: string | null;
    }[];
    distractors: { distractor_lemma: string; kind: string; difficulty: number }[];
  }[];
  word_relations: { related_lemma: string; relation_type: string }[];
  mnemonics: { text: string }[];
}

export function mapWordRow(row: RawWordRow): WordContent {
  const senses: SenseContent[] = [...row.senses]
    .sort((a, b) => a.sense_order - b.sense_order)
    .map((s) => {
      const examples: ExampleContent[] = s.example_sentences.map((e) => ({
        exampleId: e.id,
        text: e.text,
        audioUrl: e.audio_url,
        clozeTarget: e.cloze_target,
      }));
      const distractors: DistractorContent[] = s.distractors.map((d) => ({
        lemma: d.distractor_lemma,
        kind: d.kind,
        difficulty: d.difficulty,
      }));
      return {
        senseId: s.id,
        definition: s.definition,
        plainLanguageDefinition: s.plain_language_definition,
        senseOrder: s.sense_order,
        register: s.register,
        examples,
        distractors,
      };
    });

  const relations: RelationContent[] = row.word_relations
    .filter((r) =>
      ['synonym', 'antonym', 'hypernym', 'hyponym'].includes(r.relation_type),
    )
    .map((r) => ({
      relatedLemma: r.related_lemma,
      relationType: r.relation_type as RelationContent['relationType'],
    }));

  return {
    wordId: row.id,
    headword: row.headword,
    partOfSpeech: row.part_of_speech,
    ipa: row.ipa,
    syllables: row.syllables,
    difficultyTier: row.difficulty_tier,
    frequencyRank: row.frequency_rank,
    etymology: row.etymology,
    audioUrl: row.audio_url,
    senses,
    relations,
    mnemonics: row.mnemonics.map((m) => m.text),
  };
}

export const WORD_SELECT = `
  id, headword, part_of_speech, ipa, syllables, difficulty_tier, frequency_rank, etymology, audio_url,
  senses (
    id, definition, plain_language_definition, sense_order, register,
    example_sentences ( id, text, audio_url, cloze_target ),
    distractors ( distractor_lemma, kind, difficulty )
  ),
  word_relations ( related_lemma, relation_type ),
  mnemonics ( text )
`;
