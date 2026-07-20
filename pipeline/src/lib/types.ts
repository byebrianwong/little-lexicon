// Shared row shapes and inputs. These mirror the columns defined in
// supabase/migrations/0001_init_little_lexicon_schema.sql. The pipeline only ever writes
// the content tables (words, senses, example_sentences, word_relations,
// mnemonics, distractors); per-user tables are out of scope here.

/** little_lexicon.content_source enum. */
export type ContentSource =
  | 'wordnet'
  | 'wiktionary'
  | 'free_dictionary'
  | 'datamuse'
  | 'claude'
  | 'user'
  | 'manual';

/** little_lexicon.relation_type enum. */
export type RelationType = 'synonym' | 'antonym' | 'hypernym' | 'hyponym';

export interface WordRow {
  id: number;
  headword: string;
  part_of_speech: string | null;
  ipa: string | null;
  syllables: number | null;
  frequency_rank: number | null;
  difficulty_tier: number;
  etymology: string | null;
  audio_url: string | null;
}

export interface SenseRow {
  id: number;
  word_id: number;
  definition: string;
  plain_language_definition: string | null;
  sense_order: number;
  register: string | null;
}

export interface ExampleRow {
  id: number;
  sense_id: number;
  text: string;
  audio_url: string | null;
  cloze_target: string | null;
  source: ContentSource;
  is_generated: boolean;
}

export interface RelationRow {
  id: number;
  word_id: number;
  related_lemma: string;
  relation_type: RelationType;
  source: ContentSource;
}

export interface MnemonicRow {
  id: number;
  word_id: number;
  text: string;
  source: ContentSource;
  user_id: string | null;
}

export interface DistractorRow {
  id: number;
  sense_id: number;
  distractor_lemma: string;
  kind: string;
  difficulty: number;
  source: ContentSource;
}

export interface AudioObject {
  path: string;
  bytes: number;
  url: string;
}

// Insert inputs (id is assigned by the store).
export type NewWord = Omit<WordRow, 'id'>;
export type NewSense = Omit<SenseRow, 'id'>;
export type NewExample = Omit<ExampleRow, 'id'>;
export type NewRelation = Omit<RelationRow, 'id'>;
export type NewMnemonic = Omit<MnemonicRow, 'id'>;
export type NewDistractor = Omit<DistractorRow, 'id'>;

/** Body passed to Store.uploadAudio. Real bytes in live mode, an estimate in dry-run. */
export type AudioBody =
  | { kind: 'bytes'; data: Uint8Array; contentType: string }
  | { kind: 'stub'; estimatedBytes: number };

export interface AudioUploadResult {
  publicUrl: string;
  bytes: number;
}
