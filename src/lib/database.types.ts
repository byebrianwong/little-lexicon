// Supabase-generated TypeScript types for the `little_lexicon` schema.
//
// This file is normally produced by:
//   supabase gen types typescript --local --schema little_lexicon > src/lib/database.types.ts
//
// It is committed here as a faithful representation of migration 0001..0005 so
// the app typechecks before a live database exists. REGENERATE it (npm run
// gen:types) once the schema is applied to the shared `games-apps` project, and
// do not hand-edit it thereafter.

export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export interface Database {
  little_lexicon: {
    Tables: {
      words: {
        Row: {
          id: number;
          headword: string;
          part_of_speech: string | null;
          ipa: string | null;
          syllables: number | null;
          frequency_rank: number | null;
          difficulty_tier: number;
          etymology: string | null;
          audio_url: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          headword: string;
          part_of_speech?: string | null;
          ipa?: string | null;
          syllables?: number | null;
          frequency_rank?: number | null;
          difficulty_tier?: number;
          etymology?: string | null;
          audio_url?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['words']['Insert']>;
        Relationships: [];
      };
      senses: {
        Row: {
          id: number;
          word_id: number;
          definition: string;
          plain_language_definition: string | null;
          sense_order: number;
          register: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          word_id: number;
          definition: string;
          plain_language_definition?: string | null;
          sense_order?: number;
          register?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['senses']['Insert']>;
        Relationships: [];
      };
      example_sentences: {
        Row: {
          id: number;
          sense_id: number;
          text: string;
          audio_url: string | null;
          cloze_target: string | null;
          source: Database['little_lexicon']['Enums']['content_source'];
          is_generated: boolean;
          created_at: string;
        };
        Insert: {
          id?: number;
          sense_id: number;
          text: string;
          audio_url?: string | null;
          cloze_target?: string | null;
          source?: Database['little_lexicon']['Enums']['content_source'];
          is_generated?: boolean;
          created_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['example_sentences']['Insert']>;
        Relationships: [];
      };
      word_relations: {
        Row: {
          id: number;
          word_id: number;
          related_lemma: string;
          relation_type: Database['little_lexicon']['Enums']['relation_type'];
          source: Database['little_lexicon']['Enums']['content_source'];
        };
        Insert: {
          id?: number;
          word_id: number;
          related_lemma: string;
          relation_type: Database['little_lexicon']['Enums']['relation_type'];
          source?: Database['little_lexicon']['Enums']['content_source'];
        };
        Update: Partial<Database['little_lexicon']['Tables']['word_relations']['Insert']>;
        Relationships: [];
      };
      mnemonics: {
        Row: {
          id: number;
          word_id: number;
          text: string;
          source: Database['little_lexicon']['Enums']['content_source'];
          user_id: string | null;
          created_at: string;
        };
        Insert: {
          id?: number;
          word_id: number;
          text: string;
          source?: Database['little_lexicon']['Enums']['content_source'];
          user_id?: string | null;
          created_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['mnemonics']['Insert']>;
        Relationships: [];
      };
      distractors: {
        Row: {
          id: number;
          sense_id: number;
          distractor_lemma: string;
          kind: string;
          difficulty: number;
          source: Database['little_lexicon']['Enums']['content_source'];
        };
        Insert: {
          id?: number;
          sense_id: number;
          distractor_lemma: string;
          kind?: string;
          difficulty?: number;
          source?: Database['little_lexicon']['Enums']['content_source'];
        };
        Update: Partial<Database['little_lexicon']['Tables']['distractors']['Insert']>;
        Relationships: [];
      };
      profiles: {
        Row: {
          user_id: string;
          display_name: string | null;
          level_estimate: number | null;
          daily_goal: number;
          desired_retention: number;
          interests: string[];
          streak_count: number;
          streak_freeze_count: number;
          xp_total: number;
          fsrs_weights: Json | null;
          is_pro: boolean;
          onboarded_at: string | null;
          reminder_hour: number | null;
          sound_enabled: boolean;
          last_goal_met_day: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          user_id: string;
          display_name?: string | null;
          level_estimate?: number | null;
          daily_goal?: number;
          desired_retention?: number;
          interests?: string[];
          streak_count?: number;
          streak_freeze_count?: number;
          xp_total?: number;
          fsrs_weights?: Json | null;
          is_pro?: boolean;
          onboarded_at?: string | null;
          reminder_hour?: number | null;
          sound_enabled?: boolean;
          last_goal_met_day?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['profiles']['Insert']>;
        Relationships: [];
      };
      user_word_state: {
        Row: {
          id: number;
          user_id: string;
          word_id: number;
          due: string;
          stability: number;
          difficulty: number;
          elapsed_days: number;
          scheduled_days: number;
          reps: number;
          lapses: number;
          state: Database['little_lexicon']['Enums']['card_state'];
          last_review: string | null;
          learning_steps: number;
          first_seen_at: string;
          is_known: boolean;
          is_suspended: boolean;
          updated_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          word_id: number;
          due?: string;
          stability?: number;
          difficulty?: number;
          elapsed_days?: number;
          scheduled_days?: number;
          reps?: number;
          lapses?: number;
          state?: Database['little_lexicon']['Enums']['card_state'];
          last_review?: string | null;
          learning_steps?: number;
          first_seen_at?: string;
          is_known?: boolean;
          is_suspended?: boolean;
          updated_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['user_word_state']['Insert']>;
        Relationships: [];
      };
      review_logs: {
        Row: {
          id: number;
          user_id: string;
          word_id: number;
          rating: number;
          state_before: Database['little_lexicon']['Enums']['card_state'] | null;
          game_mode: string | null;
          response_ms: number | null;
          scheduled_days: number | null;
          retrievability: number | null;
          reviewed_at: string;
        };
        Insert: {
          id?: number;
          user_id: string;
          word_id: number;
          rating: number;
          state_before?: Database['little_lexicon']['Enums']['card_state'] | null;
          game_mode?: string | null;
          response_ms?: number | null;
          scheduled_days?: number | null;
          retrievability?: number | null;
          reviewed_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['review_logs']['Insert']>;
        Relationships: [];
      };
      game_sessions: {
        Row: {
          id: number;
          user_id: string;
          started_at: string;
          ended_at: string | null;
          words_reviewed: number;
          new_words: number;
          xp_earned: number;
          accuracy: number | null;
        };
        Insert: {
          id?: number;
          user_id: string;
          started_at?: string;
          ended_at?: string | null;
          words_reviewed?: number;
          new_words?: number;
          xp_earned?: number;
          accuracy?: number | null;
        };
        Update: Partial<Database['little_lexicon']['Tables']['game_sessions']['Insert']>;
        Relationships: [];
      };
      daily_stats: {
        Row: {
          user_id: string;
          day: string;
          reviews_done: number;
          new_learned: number;
          xp: number;
          goal_met: boolean;
        };
        Insert: {
          user_id: string;
          day: string;
          reviews_done?: number;
          new_learned?: number;
          xp?: number;
          goal_met?: boolean;
        };
        Update: Partial<Database['little_lexicon']['Tables']['daily_stats']['Insert']>;
        Relationships: [];
      };
      achievements: {
        Row: {
          user_id: string;
          code: string;
          unlocked_at: string;
        };
        Insert: {
          user_id: string;
          code: string;
          unlocked_at?: string;
        };
        Update: Partial<Database['little_lexicon']['Tables']['achievements']['Insert']>;
        Relationships: [];
      };
    };
    Views: {
      weekly_leaderboard: {
        Row: {
          user_id: string;
          display_name: string | null;
          cohort: number;
          weekly_xp: number;
          rank_in_cohort: number;
        };
        Relationships: [];
      };
    };
    Functions: {
      submit_review: {
        Args: {
          p_word_id: number;
          p_due: string;
          p_stability: number;
          p_difficulty: number;
          p_elapsed_days: number;
          p_scheduled_days: number;
          p_reps: number;
          p_lapses: number;
          p_state: Database['little_lexicon']['Enums']['card_state'];
          p_last_review: string | null;
          p_learning_steps: number;
          p_rating: number;
          p_state_before: Database['little_lexicon']['Enums']['card_state'] | null;
          p_game_mode: string | null;
          p_response_ms: number | null;
          p_retrievability: number | null;
          p_xp: number;
          p_is_new: boolean;
        };
        Returns: Json;
      };
      due_forecast: {
        Args: { p_days: number };
        Returns: { day: string; due_count: number }[];
      };
      retention_rate: {
        Args: { p_since: string };
        Returns: number;
      };
    };
    Enums: {
      card_state: 'new' | 'learning' | 'review' | 'relearning';
      relation_type: 'synonym' | 'antonym' | 'hypernym' | 'hyponym';
      content_source:
        | 'wordnet'
        | 'wiktionary'
        | 'free_dictionary'
        | 'datamuse'
        | 'claude'
        | 'user'
        | 'manual';
    };
    CompositeTypes: Record<never, never>;
  };
}
