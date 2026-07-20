// App-level domain view models. These are the shapes the UI and game modes
// consume, assembled from one or more database rows. Raw row types live in
// database.types.ts and are never passed directly to components.

export type PartOfSpeech = string;

export interface WordContent {
  wordId: number;
  headword: string;
  partOfSpeech: PartOfSpeech | null;
  ipa: string | null;
  syllables: number | null;
  difficultyTier: number;
  frequencyRank: number | null;
  etymology: string | null;
  audioUrl: string | null;
  senses: SenseContent[];
  relations: RelationContent[];
  mnemonics: string[];
}

export interface SenseContent {
  senseId: number;
  definition: string;
  plainLanguageDefinition: string | null;
  senseOrder: number;
  register: string | null;
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

// A single item to present in a session: the word content plus (optional)
// existing SRS state. `isNew` is true when there is no user_word_state yet.
export interface SessionItem {
  content: WordContent;
  state: UserWordState | null;
  isNew: boolean;
}

export interface Profile {
  userId: string;
  displayName: string | null;
  levelEstimate: number | null;
  dailyGoal: number;
  desiredRetention: number;
  interests: string[];
  streakCount: number;
  streakFreezeCount: number;
  xpTotal: number;
  isPro: boolean;
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
