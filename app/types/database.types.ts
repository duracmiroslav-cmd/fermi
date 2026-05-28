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
      agent_capabilities: {
        Row: {
          agent_id: string
          capability_id: string
          config: Json
          created_at: string
          disabled_at: string | null
          updated_at: string
        }
        Insert: {
          agent_id: string
          capability_id: string
          config?: Json
          created_at?: string
          disabled_at?: string | null
          updated_at?: string
        }
        Update: {
          agent_id?: string
          capability_id?: string
          config?: Json
          created_at?: string
          disabled_at?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_capabilities_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_capabilities_capability_id_fkey"
            columns: ["capability_id"]
            isOneToOne: false
            referencedRelation: "capabilities"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_run_steps: {
        Row: {
          cached_tokens: number | null
          completion_tokens: number | null
          cost_usd: number | null
          created_at: string
          id: string
          latency_ms: number | null
          model: string | null
          openrouter_gen_id: string | null
          payload: Json
          prompt_tokens: number | null
          run_id: string
          step: number
          type: string
        }
        Insert: {
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          openrouter_gen_id?: string | null
          payload?: Json
          prompt_tokens?: number | null
          run_id: string
          step: number
          type: string
        }
        Update: {
          cached_tokens?: number | null
          completion_tokens?: number | null
          cost_usd?: number | null
          created_at?: string
          id?: string
          latency_ms?: number | null
          model?: string | null
          openrouter_gen_id?: string | null
          payload?: Json
          prompt_tokens?: number | null
          run_id?: string
          step?: number
          type?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_run_steps_run_id_fkey"
            columns: ["run_id"]
            isOneToOne: false
            referencedRelation: "agent_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      agent_runs: {
        Row: {
          agent_id: string
          bot_id: string
          created_at: string
          error_code: string | null
          finished_at: string | null
          id: string
          owner_id: string
          status: string
          thread_id: string
          total_cost_usd: number
          updated_at: string
        }
        Insert: {
          agent_id: string
          bot_id: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          owner_id: string
          status?: string
          thread_id: string
          total_cost_usd?: number
          updated_at?: string
        }
        Update: {
          agent_id?: string
          bot_id?: string
          created_at?: string
          error_code?: string | null
          finished_at?: string | null
          id?: string
          owner_id?: string
          status?: string
          thread_id?: string
          total_cost_usd?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "agent_runs_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
            referencedRelation: "agents"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "agent_runs_thread_id_fkey"
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
          default_text_model: string | null
          default_vision_model: string | null
          deleted_at: string | null
          id: string
          is_default: boolean
          model_provider_id: string
          name: string
          owner_id: string
          system_prompt: string | null
          updated_at: string
          voice_reply_mode: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          default_text_model?: string | null
          default_vision_model?: string | null
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          model_provider_id: string
          name: string
          owner_id: string
          system_prompt?: string | null
          updated_at?: string
          voice_reply_mode?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          default_text_model?: string | null
          default_vision_model?: string | null
          deleted_at?: string | null
          id?: string
          is_default?: boolean
          model_provider_id?: string
          name?: string
          owner_id?: string
          system_prompt?: string | null
          updated_at?: string
          voice_reply_mode?: string
        }
        Relationships: [
          {
            foreignKeyName: "agents_model_provider_id_fkey"
            columns: ["model_provider_id"]
            isOneToOne: false
            referencedRelation: "model_providers"
            referencedColumns: ["id"]
          },
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
          agent_id: string
          avatar_url: string | null
          created_at: string
          deleted_at: string | null
          disabled_at: string | null
          display_name: string | null
          external_id: string
          first_replied_at: string | null
          handle: string | null
          id: string
          owner_id: string
          platform: string
          updated_at: string
          webhook_verified_at: string | null
        }
        Insert: {
          agent_id: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          disabled_at?: string | null
          display_name?: string | null
          external_id: string
          first_replied_at?: string | null
          handle?: string | null
          id?: string
          owner_id: string
          platform?: string
          updated_at?: string
          webhook_verified_at?: string | null
        }
        Update: {
          agent_id?: string
          avatar_url?: string | null
          created_at?: string
          deleted_at?: string | null
          disabled_at?: string | null
          display_name?: string | null
          external_id?: string
          first_replied_at?: string | null
          handle?: string | null
          id?: string
          owner_id?: string
          platform?: string
          updated_at?: string
          webhook_verified_at?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "bots_agent_id_fkey"
            columns: ["agent_id"]
            isOneToOne: false
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
      capabilities: {
        Row: {
          config: Json
          created_at: string
          deleted_at: string | null
          description: string | null
          display_name: string
          id: string
          owner_id: string | null
          slug: string
          updated_at: string
        }
        Insert: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name: string
          id?: string
          owner_id?: string | null
          slug: string
          updated_at?: string
        }
        Update: {
          config?: Json
          created_at?: string
          deleted_at?: string | null
          description?: string | null
          display_name?: string
          id?: string
          owner_id?: string | null
          slug?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "capabilities_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "users"
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
      idempotency_keys: {
        Row: {
          key: string
          scope: string
          seen_at: string
        }
        Insert: {
          key: string
          scope: string
          seen_at?: string
        }
        Update: {
          key?: string
          scope?: string
          seen_at?: string
        }
        Relationships: []
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
      model_providers: {
        Row: {
          connect_type: string
          created_at: string
          credential_key_type: string
          display_name: string
          id: string
          routing_type: string
          slug: string
          status: string
          updated_at: string
        }
        Insert: {
          connect_type: string
          created_at?: string
          credential_key_type: string
          display_name: string
          id?: string
          routing_type: string
          slug: string
          status?: string
          updated_at?: string
        }
        Update: {
          connect_type?: string
          created_at?: string
          credential_key_type?: string
          display_name?: string
          id?: string
          routing_type?: string
          slug?: string
          status?: string
          updated_at?: string
        }
        Relationships: []
      }
      rate_limit_buckets: {
        Row: {
          count: number
          expires_at: string
          key: string
        }
        Insert: {
          count?: number
          expires_at: string
          key: string
        }
        Update: {
          count?: number
          expires_at?: string
          key?: string
        }
        Relationships: []
      }
      threads: {
        Row: {
          bot_id: string
          created_at: string
          deleted_at: string | null
          external_user_id: string
          id: string
          last_message_at: string
          updated_at: string
        }
        Insert: {
          bot_id: string
          created_at?: string
          deleted_at?: string | null
          external_user_id: string
          id?: string
          last_message_at?: string
          updated_at?: string
        }
        Update: {
          bot_id?: string
          created_at?: string
          deleted_at?: string | null
          external_user_id?: string
          id?: string
          last_message_at?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "threads_bot_id_fkey"
            columns: ["bot_id"]
            isOneToOne: false
            referencedRelation: "bots"
            referencedColumns: ["id"]
          },
        ]
      }
      usage_counters: {
        Row: {
          count: number
          key: string
          updated_at: string
        }
        Insert: {
          count?: number
          key: string
          updated_at?: string
        }
        Update: {
          count?: number
          key?: string
          updated_at?: string
        }
        Relationships: []
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
      attach_capability: {
        Args: {
          p_agent_id: string
          p_capability_id: string
          p_owner_id: string
        }
        Returns: undefined
      }
      consume_usage_quota: { Args: { quota_key: string }; Returns: number }
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
      detach_capability: {
        Args: {
          p_agent_id: string
          p_capability_id: string
          p_owner_id: string
        }
        Returns: undefined
      }
      enqueue_webhook_event: { Args: { payload: Json }; Returns: number }
      get_bots_last_replied: {
        Args: { p_owner_id: string }
        Returns: {
          bot_id: string
          last_replied_at: string
        }[]
      }
      incr_rate_limit_bucket: {
        Args: { bucket_key: string; ttl_sec: number }
        Returns: number
      }
      insert_agent_if_under_limit: {
        Args: {
          p_avatar_url: string
          p_default_text_model: string
          p_default_vision_model: string
          p_limit: number
          p_model_provider_id: string
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
          p_agent_id: string
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
      purge_expired_rate_limit_buckets: { Args: never; Returns: number }
      purge_idempotency_keys: {
        Args: { older_than?: string; p_scope?: string }
        Returns: number
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
