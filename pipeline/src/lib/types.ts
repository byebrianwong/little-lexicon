// Row shapes and inputs for the pipeline's record (data/content-db.json). They
// keep the column names of the original Postgres content tables
// (supabase/migrations/0001_init_little_lexicon_schema.sql) so the record reads
// the same as the schema. The app no longer reads those tables; the export
// stage turns these rows into src/content/words.json.

/** little_lexicon.content_source enum. */
export type ContentSource =
  | 'wordnet'
  | 'wiktionary'
  | 'free_dictionary'
  | 'datamuse'
  | 'claude'
  | 'gemini'
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
  /**
   * Where the word comes from, in one or two plain sentences, shown as an
   * "Origin" line. Written on extras worksheets (lib/extras.ts).
   */
  etymology: string | null;
  audio_url: string | null;
  /**
   * Why the word is no longer taught. A retired word keeps its row and id but
   * is left out of the export, the difficulty tiers and content review.
   */
  retired?: string;
  // The fields below are written on extras worksheets (lib/extras.ts). They
  // are absent on words no extras worksheet has covered yet.
  /**
   * Root forms that link words in the list sharing a root (prolific and
   * proliferate share Latin proles). Lowercase ASCII, 0 to 3, each named in
   * `etymology`.
   */
  roots?: string[];
  /** A "Watch out" note for a word people often misread or misuse, or null. */
  watch_out?: string | null;
  /** 2 to 4 common collocations of the first sense ("tensions abate"), or none. */
  pairings?: string[];
}

export interface SenseRow {
  id: number;
  word_id: number;
  definition: string;
  plain_language_definition: string | null;
  sense_order: number;
  /** A tone label from REGISTERS in lib/extras.ts, or null for a neutral word. */
  register: string | null;
  /**
   * On a sense after the first: show it under "Also means". Such a sense
   * always has a plain_language_definition. Set on extras worksheets.
   */
  also_means?: boolean;
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
  /** 2 when written by the second pass (lib/revise.ts); absent before it. */
  revision?: number;
}

export interface DistractorRow {
  id: number;
  sense_id: number;
  distractor_lemma: string;
  kind: string;
  difficulty: number;
  source: ContentSource;
  /** 2 when written by the second pass (lib/revise.ts); absent before it. */
  revision?: number;
  /** The look-alike word whose meaning this wrong answer is (second pass). */
  lookalike?: string;
}

/**
 * Which rubric a review used: the main one (lib/curate.ts: definition,
 * examples, wrong answers and the rest) or the extras one (lib/extras.ts:
 * origin, roots, tone, watch-out note, pairings, other meanings).
 */
export type ReviewRubric = 'main' | 'extras';

/**
 * One curation review of a word. The newest review at the current version of
 * its rubric is the word's standing verdict on that rubric. The two rubrics
 * never count for each other.
 */
export interface ReviewRow {
  id: number;
  word_id: number;
  /** Absent on main reviews, which were all written before extras existed. */
  rubric?: ReviewRubric;
  /** The version of this review's own rubric. */
  rubric_version: number;
  /** YYYY-MM-DD. */
  reviewed_at: string;
  scores: Record<string, number>;
  verdict: 'pass' | 'fixed' | 'flagged';
  /** Content fields this review changed. */
  changed: string[];
  notes: string;
  /** Scores from a second reviewer that did not write the content. */
  checker_scores?: Record<string, number>;
  checker_notes?: string;
}

export interface AudioObject {
  path: string;
  bytes: number;
  /** What the clip was made from (see clipKey); a mismatch means make it again. */
  key?: string;
  source?: 'tts' | 'human' | 'stub';
  /** TTS voice name, for TTS clips. */
  voice?: string;
  /** Where a human recording came from, and its license, for attribution. */
  sourceUrl?: string | null;
  license?: string | null;
}

/** What Store.saveAudio records next to the bytes. */
export type AudioMeta = Omit<AudioObject, 'path' | 'bytes'>;

// Insert inputs (id is assigned by the store).
export type NewWord = Omit<WordRow, 'id'>;
export type NewSense = Omit<SenseRow, 'id'>;
export type NewExample = Omit<ExampleRow, 'id'>;
export type NewRelation = Omit<RelationRow, 'id'>;
export type NewMnemonic = Omit<MnemonicRow, 'id'>;
export type NewDistractor = Omit<DistractorRow, 'id'>;
export type NewReview = Omit<ReviewRow, 'id'>;

/** Body passed to Store.saveAudio. Real bytes in live mode, an estimate in dry-run. */
export type AudioBody =
  | { kind: 'bytes'; data: Uint8Array; contentType: string }
  | { kind: 'stub'; estimatedBytes: number };

export interface AudioSaveResult {
  bytes: number;
}
