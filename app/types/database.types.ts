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
  graphql_public: {
    Tables: {
      [_ in never]: never
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      graphql: {
        Args: {
          extensions?: Json
          operationName?: string
          query?: string
          variables?: Json
        }
        Returns: Json
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
  public: {
    Tables: {
      agent_events: {
        Row: {
          conversation_id: string
          cost_usd: number | null
          created_at: string
          id: string
          latency_ms: number | null
          openrouter_gen_id: string | null
          payload: Json
          step: number
          thread_id: string | null
          type: string
        }
        Insert: {
          conversation_id: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          openrouter_gen_id?: string | null
          payload?: Json
          step: number
          thread_id?: string | null
          type: string
        }
        Update: {
          conversation_id?: string
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          openrouter_gen_id?: string | null
          payload?: Json
          step?: number
          thread_id?: string | null
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_events_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_events_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      agents: {
        Row: {
          avatar_url: string | null
          created_at: string
          default_model: string | null
          deleted_at: string | null
          id: string
          name: string
          owner_id: string
          system_prompt: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_model?: string | null
          deleted_at?: string | null
          id?: string
          name: string
          owner_id: string
          system_prompt?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_model?: string | null
          deleted_at?: string | null
          id?: string
          name?: string
          owner_id?: string
          system_prompt?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      bots: {
        Row: {
          agent_id: string | null
          allow_groups: boolean
          created_at: string
          deleted_at: string | null
          display_name: string | null
          enabled: boolean
          external_id: string
          id: string
          owner_id: string
          platform: string
          updated_at: string
        }
        Insert: {
          agent_id?: string | null
          allow_groups?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          enabled?: boolean
          external_id: string
          id?: string
          owner_id: string
          platform?: string
          updated_at?: string
        }
        Update: {
          agent_id?: string | null
          allow_groups?: boolean
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          enabled?: boolean
          external_id?: string
          id?: string
          owner_id?: string
          platform?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "bots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: true
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "bots_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      conversations: {
        Row: {
          bot_id: string
          created_at: string
          deleted_at: string | null
          display_name: string | null
          external_user_id: string
          external_user_locale: string | null
          id: string
          is_active: boolean
          last_message_at: string | null
          updated_at: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          external_user_id: string
          external_user_locale?: string | null
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          updated_at?: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          external_user_id?: string
          external_user_locale?: string | null
          id?: string
          is_active?: boolean
          last_message_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      encrypted_credentials: {
        Row: {
          alg: string
          bot_id: string | null
          ciphertext: string
          created_at: string
          expires_at: string | null
          id: string
          iv: string
          key_type: string
          last_refreshed_at: string | null
          last_used_at: string | null
          metadata: Json | null
          refresh_ciphertext: string | null
          refresh_iv: string | null
          updated_at: string
          user_id: string
          wrapped_dek: string
          wrapped_dek_iv: string
        }
        Insert: {
          alg?: string
          bot_id?: string | null
          ciphertext: string
          created_at?: string
          expires_at?: string | null
          id?: string
          iv: string
          key_type: string
          last_refreshed_at?: string | null
          last_used_at?: string | null
          metadata?: Json | null
          refresh_ciphertext?: string | null
          refresh_iv?: string | null
          updated_at?: string
          user_id: string
          wrapped_dek: string
          wrapped_dek_iv: string
        }
        Update: {
          alg?: string
          bot_id?: string | null
          ciphertext?: string
          created_at?: string
          expires_at?: string | null
          id?: string
          iv?: string
          key_type?: string
          last_refreshed_at?: string | null
          last_used_at?: string | null
          metadata?: Json | null
          refresh_ciphertext?: string | null
          refresh_iv?: string | null
          updated_at?: string
          user_id?: string
          wrapped_dek?: string
          wrapped_dek_iv?: string
        }
        Relationships: [
          {
            foreignKeyName: "encrypted_credentials_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "encrypted_credentials_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          content: Json
          created_at: string
          id: string
          role: string
          thread_id: string
          updated_at: string
        }
        Insert: {
          content: Json
          created_at?: string
          id?: string
          role: string
          thread_id: string
          updated_at?: string
        }
        Update: {
          content?: Json
          created_at?: string
          id?: string
          role?: string
          thread_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "messages_thread_id_fkey"
            columns: ["thread_id"]
            isOneToOne: false
            referencedRelation: "threads"
            referencedColumns: ["id"]
          },
        ]
      }
      threads: {
        Row: {
          conversation_id: string
          created_at: string
          id: string
          last_message_at: string
          title: string | null
          updated_at: string
        }
        Insert: {
          conversation_id: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Update: {
          conversation_id?: string
          created_at?: string
          id?: string
          last_message_at?: string
          title?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_conversation_id_fkey"
            columns: ["conversation_id"]
            isOneToOne: false
            referencedRelation: "conversations"
            referencedColumns: ["id"]
          },
        ]
      }
      users: {
        Row: {
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          display_name: string | null
          email: string | null
          id: string
          is_admin: boolean
          locale: string
          onboarded_at: string | null
          tier: string
          timezone: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id: string
          is_admin?: boolean
          locale?: string
          onboarded_at?: string | null
          tier?: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          display_name?: string | null
          email?: string | null
          id?: string
          is_admin?: boolean
          locale?: string
          onboarded_at?: string | null
          tier?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      archive_webhook_event: { Args: { msg_id: number }; Returns: boolean }
      delete_agent: {
        Args: { p_agent_id: string; p_owner_id: string }
        Returns: string
      }
      delete_bot: {
        Args: { p_bot_id: string; p_owner_id: string }
        Returns: string
      }
      dequeue_webhook_events: {
        Args: { batch_size?: number; visibility_timeout?: number }
        Returns: {
          msg_id: number
          payload: Json
        }[]
      }
      enqueue_webhook_event: { Args: { payload: Json }; Returns: number }
      insert_agent_if_under_limit: {
        Args: {
          p_avatar_url: string
          p_default_model: string
          p_limit: number
          p_name: string
          p_owner_id: string
          p_system_prompt: string
        }
        Returns: {
          id: string
        }[]
      }
      insert_bot_if_under_limit: {
        Args: {
          p_display_name: string
          p_external_id: string
          p_limit: number
          p_owner_id: string
          p_platform: string
        }
        Returns: {
          display_name: string
          id: string
        }[]
      }
      purge_orphaned_credentials: {
        Args: { older_than?: string }
        Returns: number
      }
    }
    Enums: {
      [_ in never]: never
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  graphql_public: {
    Enums: {},
  },
  public: {
    Enums: {},
  },
} as const
