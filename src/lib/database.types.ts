export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5"
  }
  little_lexicon: {
    Tables: {
      achievements: {
        Row: {
          code: string
          unlocked_at: string
          user_id: string
        }
        Insert: {
          code: string
          unlocked_at?: string
          user_id: string
        }
        Update: {
          code?: string
          unlocked_at?: string
          user_id?: string
        }
        Relationships: []
      }
      ai_usage: {
        Row: {
          count: number
          day: string
          kind: string
          user_id: string
        }
        Insert: {
          count?: number
          day?: string
          kind: string
          user_id: string
        }
        Update: {
          count?: number
          day?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      daily_stats: {
        Row: {
          day: string
          goal_met: boolean
          new_learned: number
          reviews_done: number
          user_id: string
          xp: number
        }
        Insert: {
          day: string
          goal_met?: boolean
          new_learned?: number
          reviews_done?: number
          user_id: string
          xp?: number
        }
        Update: {
          day?: string
          goal_met?: boolean
          new_learned?: number
          reviews_done?: number
          user_id?: string
          xp?: number
        }
        Relationships: []
      }
      distractors: {
        Row: {
          difficulty: number
          distractor_lemma: string
          id: number
          kind: string
          sense_id: number
          source: Database["little_lexicon"]["Enums"]["content_source"]
        }
        Insert: {
          difficulty?: number
          distractor_lemma: string
          id?: never
          kind?: string
          sense_id: number
          source?: Database["little_lexicon"]["Enums"]["content_source"]
        }
        Update: {
          difficulty?: number
          distractor_lemma?: string
          id?: never
          kind?: string
          sense_id?: number
          source?: Database["little_lexicon"]["Enums"]["content_source"]
        }
        Relationships: [
          {
            foreignKeyName: "distractors_sense_id_fkey"
            columns: ["sense_id"]
            isOneToOne: false
            referencedRelation: "senses"
            referencedColumns: ["id"]
          },
        ]
      }
      example_sentences: {
        Row: {
          audio_url: string | null
          cloze_target: string | null
          created_at: string
          id: number
          is_generated: boolean
          sense_id: number
          source: Database["little_lexicon"]["Enums"]["content_source"]
          text: string
        }
        Insert: {
          audio_url?: string | null
          cloze_target?: string | null
          created_at?: string
          id?: never
          is_generated?: boolean
          sense_id: number
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          text: string
        }
        Update: {
          audio_url?: string | null
          cloze_target?: string | null
          created_at?: string
          id?: never
          is_generated?: boolean
          sense_id?: number
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          text?: string
        }
        Relationships: [
          {
            foreignKeyName: "example_sentences_sense_id_fkey"
            columns: ["sense_id"]
            isOneToOne: false
            referencedRelation: "senses"
            referencedColumns: ["id"]
          },
        ]
      }
      game_sessions: {
        Row: {
          accuracy: number | null
          ended_at: string | null
          id: number
          new_words: number
          started_at: string
          user_id: string
          words_reviewed: number
          xp_earned: number
        }
        Insert: {
          accuracy?: number | null
          ended_at?: string | null
          id?: never
          new_words?: number
          started_at?: string
          user_id: string
          words_reviewed?: number
          xp_earned?: number
        }
        Update: {
          accuracy?: number | null
          ended_at?: string | null
          id?: never
          new_words?: number
          started_at?: string
          user_id?: string
          words_reviewed?: number
          xp_earned?: number
        }
        Relationships: []
      }
      mnemonics: {
        Row: {
          created_at: string
          id: number
          source: Database["little_lexicon"]["Enums"]["content_source"]
          text: string
          user_id: string | null
          word_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          text: string
          user_id?: string | null
          word_id: number
        }
        Update: {
          created_at?: string
          id?: never
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          text?: string
          user_id?: string | null
          word_id?: number
        }
        Relationships: []
      }
      practice_logs: {
        Row: {
          answered_at: string
          correct: boolean
          game_mode: string
          id: number
          user_id: string
          word_id: number
        }
        Insert: {
          answered_at?: string
          correct: boolean
          game_mode: string
          id?: never
          user_id: string
          word_id: number
        }
        Update: {
          answered_at?: string
          correct?: boolean
          game_mode?: string
          id?: never
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          created_at: string
          daily_goal: number
          desired_retention: number
          display_name: string | null
          fsrs_weights: Json | null
          interests: string[]
          known_word_frequency: string
          last_goal_met_day: string | null
          level_estimate: number | null
          onboarded_at: string | null
          reminder_hour: number | null
          sound_enabled: boolean
          streak_count: number
          streak_freeze_count: number
          updated_at: string
          user_id: string
          xp_total: number
        }
        Insert: {
          created_at?: string
          daily_goal?: number
          desired_retention?: number
          display_name?: string | null
          fsrs_weights?: Json | null
          interests?: string[]
          known_word_frequency?: string
          last_goal_met_day?: string | null
          level_estimate?: number | null
          onboarded_at?: string | null
          reminder_hour?: number | null
          sound_enabled?: boolean
          streak_count?: number
          streak_freeze_count?: number
          updated_at?: string
          user_id: string
          xp_total?: number
        }
        Update: {
          created_at?: string
          daily_goal?: number
          desired_retention?: number
          display_name?: string | null
          fsrs_weights?: Json | null
          interests?: string[]
          known_word_frequency?: string
          last_goal_met_day?: string | null
          level_estimate?: number | null
          onboarded_at?: string | null
          reminder_hour?: number | null
          sound_enabled?: boolean
          streak_count?: number
          streak_freeze_count?: number
          updated_at?: string
          user_id?: string
          xp_total?: number
        }
        Relationships: []
      }
      review_logs: {
        Row: {
          game_mode: string | null
          id: number
          rating: number
          response_ms: number | null
          retrievability: number | null
          reviewed_at: string
          scheduled_days: number | null
          state_before: Database["little_lexicon"]["Enums"]["card_state"] | null
          user_id: string
          word_id: number
        }
        Insert: {
          game_mode?: string | null
          id?: never
          rating: number
          response_ms?: number | null
          retrievability?: number | null
          reviewed_at?: string
          scheduled_days?: number | null
          state_before?:
            | Database["little_lexicon"]["Enums"]["card_state"]
            | null
          user_id: string
          word_id: number
        }
        Update: {
          game_mode?: string | null
          id?: never
          rating?: number
          response_ms?: number | null
          retrievability?: number | null
          reviewed_at?: string
          scheduled_days?: number | null
          state_before?:
            | Database["little_lexicon"]["Enums"]["card_state"]
            | null
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      senses: {
        Row: {
          created_at: string
          definition: string
          id: number
          plain_language_definition: string | null
          register: string | null
          sense_order: number
          word_id: number
        }
        Insert: {
          created_at?: string
          definition: string
          id?: never
          plain_language_definition?: string | null
          register?: string | null
          sense_order?: number
          word_id: number
        }
        Update: {
          created_at?: string
          definition?: string
          id?: never
          plain_language_definition?: string | null
          register?: string | null
          sense_order?: number
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "senses_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      user_word_state: {
        Row: {
          difficulty: number
          due: string
          elapsed_days: number
          first_seen_at: string
          id: number
          is_known: boolean
          is_suspended: boolean
          lapses: number
          last_review: string | null
          learning_steps: number
          reps: number
          scheduled_days: number
          stability: number
          state: Database["little_lexicon"]["Enums"]["card_state"]
          updated_at: string
          user_id: string
          word_id: number
        }
        Insert: {
          difficulty?: number
          due?: string
          elapsed_days?: number
          first_seen_at?: string
          id?: never
          is_known?: boolean
          is_suspended?: boolean
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: Database["little_lexicon"]["Enums"]["card_state"]
          updated_at?: string
          user_id: string
          word_id: number
        }
        Update: {
          difficulty?: number
          due?: string
          elapsed_days?: number
          first_seen_at?: string
          id?: never
          is_known?: boolean
          is_suspended?: boolean
          lapses?: number
          last_review?: string | null
          learning_steps?: number
          reps?: number
          scheduled_days?: number
          stability?: number
          state?: Database["little_lexicon"]["Enums"]["card_state"]
          updated_at?: string
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      word_list: {
        Row: {
          added_at: string
          removed_at: string | null
          user_id: string
          word_id: number
        }
        Insert: {
          added_at?: string
          removed_at?: string | null
          user_id: string
          word_id: number
        }
        Update: {
          added_at?: string
          removed_at?: string | null
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      word_relations: {
        Row: {
          id: number
          related_lemma: string
          relation_type: Database["little_lexicon"]["Enums"]["relation_type"]
          source: Database["little_lexicon"]["Enums"]["content_source"]
          word_id: number
        }
        Insert: {
          id?: never
          related_lemma: string
          relation_type: Database["little_lexicon"]["Enums"]["relation_type"]
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          word_id: number
        }
        Update: {
          id?: never
          related_lemma?: string
          relation_type?: Database["little_lexicon"]["Enums"]["relation_type"]
          source?: Database["little_lexicon"]["Enums"]["content_source"]
          word_id?: number
        }
        Relationships: [
          {
            foreignKeyName: "word_relations_word_id_fkey"
            columns: ["word_id"]
            isOneToOne: false
            referencedRelation: "words"
            referencedColumns: ["id"]
          },
        ]
      }
      word_reports: {
        Row: {
          created_at: string
          id: number
          note: string | null
          reason: string
          resolution_note: string | null
          resolved_at: string | null
          screen: string
          user_id: string
          word_id: number
        }
        Insert: {
          created_at?: string
          id?: never
          note?: string | null
          reason: string
          resolution_note?: string | null
          resolved_at?: string | null
          screen: string
          user_id: string
          word_id: number
        }
        Update: {
          created_at?: string
          id?: never
          note?: string | null
          reason?: string
          resolution_note?: string | null
          resolved_at?: string | null
          screen?: string
          user_id?: string
          word_id?: number
        }
        Relationships: []
      }
      words: {
        Row: {
          audio_url: string | null
          created_at: string
          difficulty_tier: number
          etymology: string | null
          frequency_rank: number | null
          headword: string
          id: number
          ipa: string | null
          part_of_speech: string | null
          syllables: number | null
        }
        Insert: {
          audio_url?: string | null
          created_at?: string
          difficulty_tier?: number
          etymology?: string | null
          frequency_rank?: number | null
          headword: string
          id?: never
          ipa?: string | null
          part_of_speech?: string | null
          syllables?: number | null
        }
        Update: {
          audio_url?: string | null
          created_at?: string
          difficulty_tier?: number
          etymology?: string | null
          frequency_rank?: number | null
          headword?: string
          id?: never
          ipa?: string | null
          part_of_speech?: string | null
          syllables?: number | null
        }
        Relationships: []
      }
    }
    Views: {
      weekly_leaderboard: {
        Row: {
          cohort: number | null
          display_name: string | null
          rank_in_cohort: number | null
          user_id: string | null
          weekly_xp: number | null
        }
        Relationships: []
      }
    }
    Functions: {
      bump_ai_usage: { Args: { p_kind: string }; Returns: number }
      delete_my_data: { Args: never; Returns: undefined }
      due_forecast: {
        Args: { p_days: number }
        Returns: {
          day: string
          due_count: number
        }[]
      }
      retention_rate: { Args: { p_since: string }; Returns: number }
      submit_review: {
        Args: {
          p_difficulty: number
          p_due: string
          p_elapsed_days: number
          p_game_mode: string
          p_is_new: boolean
          p_lapses: number
          p_last_review: string
          p_learning_steps: number
          p_rating: number
          p_reps: number
          p_response_ms: number
          p_retrievability: number
          p_scheduled_days: number
          p_stability: number
          p_state: Database["little_lexicon"]["Enums"]["card_state"]
          p_state_before: Database["little_lexicon"]["Enums"]["card_state"]
          p_word_id: number
          p_xp: number
        }
        Returns: Json
      }
    }
    Enums: {
      card_state: "new" | "learning" | "review" | "relearning"
      content_source:
        | "wordnet"
        | "wiktionary"
        | "free_dictionary"
        | "datamuse"
        | "claude"
        | "user"
        | "manual"
      relation_type: "synonym" | "antonym" | "hypernym" | "hyponym"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  little_lexicon: {
    Enums: {
      card_state: ["new", "learning", "review", "relearning"],
      content_source: [
        "wordnet",
        "wiktionary",
        "free_dictionary",
        "datamuse",
        "claude",
        "user",
        "manual",
      ],
      relation_type: ["synonym", "antonym", "hypernym", "hyponym"],
    },
  },
} as const
