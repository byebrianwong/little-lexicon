// App-level domain view models. These are the shapes the UI and game modes
// consume, assembled from one or more database rows. Raw row types live in
// database.types.ts and are never passed directly to components.

export type PartOfSpeech = string;

/**
 * A sense's tone label. Null (on SenseContent.register) means the word is
 * neutral, which most are.
 */
export type Register =
  | 'formal'
  | 'informal'
  | 'literary'
  | 'disapproving'
  | 'approving'
  | 'humorous'
  | 'old-fashioned'
  | 'technical';

export interface WordContent {
  wordId: number;
  headword: string;
  partOfSpeech: PartOfSpeech | null;
  ipa: string | null;
  syllables: number | null;
  difficultyTier: number;
  frequencyRank: number | null;
  /** Where the word comes from, in one or two sentences, for an "Origin" line. */
  etymology: string | null;
  /**
   * Root forms, lowercase ASCII ("proles"). Words that share one are related
   * (prolific and proliferate), and each root is named in `etymology`.
   */
  roots: string[];
  /** A "Watch out" note on a common misreading or misuse, or null. */
  watchOut: string | null;
  /** 2 to 4 common pairings of the first sense ("tensions abate"), or none. */
  pairings: string[];
  audioUrl: string | null;
  /** Clip that reads the memory hook the app shows (`mnemonics[0]`). */
  hookAudioUrl: string | null;
  senses: SenseContent[];
  relations: RelationContent[];
  mnemonics: string[];
}

export interface SenseContent {
  senseId: number;
  definition: string;
  plainLanguageDefinition: string | null;
  senseOrder: number;
  register: Register | null;
  /**
   * Show this sense under "Also means". Only a sense after the first, and only
   * one with a plain definition, has it.
   */
  alsoMeans: boolean;
  /** Clip that reads the definition the app shows (the plain one when there is one). */
  audioUrl: string | null;
  examples: ExampleContent[];
  distractors: DistractorContent[];
}

export interface ExampleContent {
  exampleId: number;
  text: string;
  audioUrl: string | null;
  clozeTarget: string | null;
}

export interface DistractorContent {
  lemma: string;
  kind: string;
  difficulty: number;
}

export interface RelationContent {
  relatedLemma: string;
  relationType: 'synonym' | 'antonym' | 'hypernym' | 'hyponym';
}

// The SRS-facing state for a (user, word) as the app cares about it.
export type CardState = 'new' | 'learning' | 'review' | 'relearning';

export interface UserWordState {
  wordId: number;
  due: string; // ISO
  stability: number;
  difficulty: number;
  elapsedDays: number;
  scheduledDays: number;
  reps: number;
  lapses: number;
  state: CardState;
  lastReview: string | null;
  learningSteps: number;
  isKnown: boolean;
  isSuspended: boolean;
}

// When the review schedule brings a word back, for the Learning view. One per
// word with a user_word_state row: a word introduced in a session or speed
// round, or marked known.
export interface WordSchedule {
  wordId: number;
  due: string; // ISO
  /** Marked known ("I know it" in Discover, or the old placement test). Never due. */
  isKnown: boolean;
  isSuspended: boolean;
}

// A single item to present in a session: the word content plus (optional)
// existing SRS state. `isNew` is true when there is no user_word_state yet.
export interface SessionItem {
  content: WordContent;
  state: UserWordState | null;
  isNew: boolean;
  /**
   * How many times the learner has met the word before, which picks the
   * example sentence to show (lib/examples). Left out, it is the review count
   * in `state`. Practice sets it, because its items carry no SRS state.
   */
  visit?: number;
}

// A word the user saved, from any screen that shows a word. It stays saved
// until the user removes it. Sessions introduce saved words they have not
// shown yet before any other new word, and practice shows saved words more
// often.
export interface ListedWord {
  content: WordContent;
  addedAt: string; // ISO
}

/**
 * How often endless practice shows a word the user knows (see
 * features/tracker), against a word they are still learning.
 */
export type KnownWordFrequency = 'rarely' | 'sometimes' | 'often';

export interface Profile {
  userId: string;
  displayName: string | null;
  levelEstimate: number | null;
  dailyGoal: number;
  desiredRetention: number;
  knownWordFrequency: KnownWordFrequency;
  interests: string[];
  streakCount: number;
  streakFreezeCount: number;
  xpTotal: number;
  onboardedAt: string | null;
  reminderHour: number | null;
  lastGoalMetDay: string | null;
}

// Game mode identifiers. Kept as a union so the escalation ladder and the
// XP table can key off them exhaustively.
export type GameModeId =
  | 'mc_def_to_word'
  | 'mc_word_to_def'
  | 'cloze'
  | 'cloze_choice'
  | 'production'
  | 'synonym_match'
  | 'antonym_match'
  | 'listening'
  | 'use_it';

export interface DailyStats {
  day: string; // YYYY-MM-DD
  reviewsDone: number;
  newLearned: number;
  xp: number;
  goalMet: boolean;
}
