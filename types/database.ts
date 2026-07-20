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
  public: {
    Tables: {
      app_settings: {
        Row: {
          daily_post_limit: number
          default_marza: number
          eur_factor: number
          id: number
          pdv_factor: number
          random_pct_max: number
          random_pct_min: number
          refresh_enabled: boolean
          refresh_w_inquiry: number
          refresh_w_category: number
          refresh_w_value: number
          refresh_w_staleness: number
          refresh_inquiry_window_days: number
          refresh_inquiry_halflife_days: number
          refresh_staleness_cap_days: number
          refresh_unmapped_penalty: number
        }
        Insert: {
          daily_post_limit?: number
          default_marza?: number
          eur_factor?: number
          id?: number
          pdv_factor?: number
          random_pct_max?: number
          random_pct_min?: number
          refresh_enabled?: boolean
          refresh_w_inquiry?: number
          refresh_w_category?: number
          refresh_w_value?: number
          refresh_w_staleness?: number
          refresh_inquiry_window_days?: number
          refresh_inquiry_halflife_days?: number
          refresh_staleness_cap_days?: number
          refresh_unmapped_penalty?: number
        }
        Update: {
          daily_post_limit?: number
          default_marza?: number
          eur_factor?: number
          id?: number
          pdv_factor?: number
          random_pct_max?: number
          random_pct_min?: number
          refresh_enabled?: boolean
          refresh_w_inquiry?: number
          refresh_w_category?: number
          refresh_w_value?: number
          refresh_w_staleness?: number
          refresh_inquiry_window_days?: number
          refresh_inquiry_halflife_days?: number
          refresh_staleness_cap_days?: number
          refresh_unmapped_penalty?: number
        }
        Relationships: []
      }
      conversations: {
        Row: {
          id: string
          profile_id: string
          olx_conversation_id: number
          buyer_id: number | null
          buyer_username: string | null
          olx_listing_id: number | null
          listing_title: string | null
          olx_category_id: number | null
          last_message_type: string | null
          last_message_at: string | null
          inquiry_at: string | null
          unread_count: number
          is_system: boolean
          synced_at: string
          created_at: string
        }
        Insert: {
          id?: string
          profile_id: string
          olx_conversation_id: number
          buyer_id?: number | null
          buyer_username?: string | null
          olx_listing_id?: number | null
          listing_title?: string | null
          olx_category_id?: number | null
          last_message_type?: string | null
          last_message_at?: string | null
          inquiry_at?: string | null
          unread_count?: number
          is_system?: boolean
          synced_at?: string
          created_at?: string
        }
        Update: {
          id?: string
          profile_id?: string
          olx_conversation_id?: number
          buyer_id?: number | null
          buyer_username?: string | null
          olx_listing_id?: number | null
          listing_title?: string | null
          olx_category_id?: number | null
          last_message_type?: string | null
          last_message_at?: string | null
          inquiry_at?: string | null
          unread_count?: number
          is_system?: boolean
          synced_at?: string
          created_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "conversations_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_mappings: {
        Row: {
          category_id: string
          created_at: string
          fallback_value: string | null
          id: string
          olx_attribute_id: number
          required: boolean
          spec_key: string
        }
        Insert: {
          category_id: string
          created_at?: string
          fallback_value?: string | null
          id?: string
          olx_attribute_id: number
          required?: boolean
          spec_key: string
        }
        Update: {
          category_id?: string
          created_at?: string
          fallback_value?: string | null
          id?: string
          olx_attribute_id?: number
          required?: boolean
          spec_key?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_mappings_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      attribute_value_mappings: {
        Row: {
          attribute_mapping_id: string
          created_at: string
          feed_value: string
          id: string
          olx_value: string
        }
        Insert: {
          attribute_mapping_id: string
          created_at?: string
          feed_value: string
          id?: string
          olx_value: string
        }
        Update: {
          attribute_mapping_id?: string
          created_at?: string
          feed_value?: string
          id?: string
          olx_value?: string
        }
        Relationships: [
          {
            foreignKeyName: "attribute_value_mappings_attribute_mapping_id_fkey"
            columns: ["attribute_mapping_id"]
            isOneToOne: false
            referencedRelation: "attribute_mappings"
            referencedColumns: ["id"]
          },
        ]
      }
      categories: {
        Row: {
          created_at: string
          id: string
          import_flag: boolean
          internal_name: string
          internal_slug: string
          is_postable: boolean
          marza_bih: number
          marza_huf: number
          olx_category_id: number | null
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          import_flag?: boolean
          internal_name: string
          internal_slug: string
          is_postable?: boolean
          marza_bih?: number
          marza_huf?: number
          olx_category_id?: number | null
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          import_flag?: boolean
          internal_name?: string
          internal_slug?: string
          is_postable?: boolean
          marza_bih?: number
          marza_huf?: number
          olx_category_id?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      ipon_feed_map: {
        Row: {
          created_at: string
          feed_uuid: string
          id: string
          ipon_id: string
        }
        Insert: {
          created_at?: string
          feed_uuid: string
          id?: string
          ipon_id: string
        }
        Update: {
          created_at?: string
          feed_uuid?: string
          id?: string
          ipon_id?: string
        }
        Relationships: []
      }
      job_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          job_run_id: string
          level: string
          message: string
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          job_run_id: string
          level?: string
          message: string
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          job_run_id?: string
          level?: string
          message?: string
        }
        Relationships: [
          {
            foreignKeyName: "job_logs_job_run_id_fkey"
            columns: ["job_run_id"]
            isOneToOne: false
            referencedRelation: "job_runs"
            referencedColumns: ["id"]
          },
        ]
      }
      job_runs: {
        Row: {
          cancel_requested: boolean
          finished_at: string | null
          github_run_id: number | null
          id: string
          items_failed: number
          items_processed: number
          items_succeeded: number
          job: Database["public"]["Enums"]["job_type"]
          profile_id: string | null
          started_at: string
          status: Database["public"]["Enums"]["job_status"]
          summary: string | null
        }
        Insert: {
          cancel_requested?: boolean
          finished_at?: string | null
          github_run_id?: number | null
          id?: string
          items_failed?: number
          items_processed?: number
          items_succeeded?: number
          job: Database["public"]["Enums"]["job_type"]
          profile_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string | null
        }
        Update: {
          cancel_requested?: boolean
          finished_at?: string | null
          github_run_id?: number | null
          id?: string
          items_failed?: number
          items_processed?: number
          items_succeeded?: number
          job?: Database["public"]["Enums"]["job_type"]
          profile_id?: string | null
          started_at?: string
          status?: Database["public"]["Enums"]["job_status"]
          summary?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "job_runs_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      listings: {
        Row: {
          created_at: string
          error: string | null
          feed_uuid: string | null
          id: string
          last_price_sync_at: string | null
          last_published_at: string | null
          last_refreshed_at: string | null
          last_score_at: string | null
          manual_price: number | null
          olx_listing_id: number | null
          posted_price: number | null
          price_origin: Database["public"]["Enums"]["offer_origin"] | null
          product_id: string | null
          profile_id: string
          refresh_available: boolean
          refresh_score: number | null
          status: Database["public"]["Enums"]["listing_status"]
          updated_at: string
          was_import: boolean
        }
        Insert: {
          created_at?: string
          error?: string | null
          feed_uuid?: string | null
          id?: string
          last_price_sync_at?: string | null
          last_published_at?: string | null
          last_refreshed_at?: string | null
          last_score_at?: string | null
          manual_price?: number | null
          olx_listing_id?: number | null
          posted_price?: number | null
          price_origin?: Database["public"]["Enums"]["offer_origin"] | null
          product_id?: string | null
          profile_id: string
          refresh_available?: boolean
          refresh_score?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          was_import?: boolean
        }
        Update: {
          created_at?: string
          error?: string | null
          feed_uuid?: string | null
          id?: string
          last_price_sync_at?: string | null
          last_published_at?: string | null
          last_refreshed_at?: string | null
          last_score_at?: string | null
          manual_price?: number | null
          olx_listing_id?: number | null
          posted_price?: number | null
          price_origin?: Database["public"]["Enums"]["offer_origin"] | null
          product_id?: string | null
          profile_id?: string
          refresh_available?: boolean
          refresh_score?: number | null
          status?: Database["public"]["Enums"]["listing_status"]
          updated_at?: string
          was_import?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "listings_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      messages: {
        Row: {
          body: string | null
          conversation_id: string | null
          created_at: string
          direction: string
          id: string
          is_read: boolean
          olx_listing_id: number | null
          profile_id: string
          sender_email: string | null
          sender_name: string | null
          sender_phone: string | null
        }
        Insert: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean
          olx_listing_id?: number | null
          profile_id: string
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Update: {
          body?: string | null
          conversation_id?: string | null
          created_at?: string
          direction?: string
          id?: string
          is_read?: boolean
          olx_listing_id?: number | null
          profile_id?: string
          sender_email?: string | null
          sender_name?: string | null
          sender_phone?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "messages_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      product_offers: {
        Row: {
          acquisition_currency: string
          acquisition_price: number
          created_at: string
          id: string
          origin: Database["public"]["Enums"]["offer_origin"]
          product_id: string
          supplier_code: string | null
        }
        Insert: {
          acquisition_currency: string
          acquisition_price: number
          created_at?: string
          id?: string
          origin: Database["public"]["Enums"]["offer_origin"]
          product_id: string
          supplier_code?: string | null
        }
        Update: {
          acquisition_currency?: string
          acquisition_price?: number
          created_at?: string
          id?: string
          origin?: Database["public"]["Enums"]["offer_origin"]
          product_id?: string
          supplier_code?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "product_offers_product_id_fkey"
            columns: ["product_id"]
            isOneToOne: false
            referencedRelation: "products"
            referencedColumns: ["id"]
          },
        ]
      }
      products: {
        Row: {
          blacklisted: boolean
          category_id: string | null
          category_slug: string | null
          created_at: string
          feed_uuid: string
          id: string
          import_override: Database["public"]["Enums"]["import_override"]
          in_feed: boolean
          last_seen_at: string
          main_image_url: string | null
          shop_price: number | null
          specs: Json
          title: string
          updated_at: string
        }
        Insert: {
          blacklisted?: boolean
          category_id?: string | null
          category_slug?: string | null
          created_at?: string
          feed_uuid: string
          id?: string
          import_override?: Database["public"]["Enums"]["import_override"]
          in_feed?: boolean
          last_seen_at?: string
          main_image_url?: string | null
          shop_price?: number | null
          specs?: Json
          title: string
          updated_at?: string
        }
        Update: {
          blacklisted?: boolean
          category_id?: string | null
          category_slug?: string | null
          created_at?: string
          feed_uuid?: string
          id?: string
          import_override?: Database["public"]["Enums"]["import_override"]
          in_feed?: boolean
          last_seen_at?: string
          main_image_url?: string | null
          shop_price?: number | null
          specs?: Json
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "products_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_category_priority: {
        Row: {
          category_id: string
          enabled: boolean
          id: string
          priority: number
          profile_id: string
        }
        Insert: {
          category_id: string
          enabled?: boolean
          id?: string
          priority?: number
          profile_id: string
        }
        Update: {
          category_id?: string
          enabled?: boolean
          id?: string
          priority?: number
          profile_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_category_priority_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "profile_category_priority_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profile_members: {
        Row: {
          created_at: string
          id: string
          profile_id: string | null
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          profile_id?: string | null
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "profile_members_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          auth_method: Database["public"]["Enums"]["olx_auth_method"]
          created_at: string
          daily_post_limit: number
          description_template: string | null
          device_name: string | null
          id: string
          kurs: number
          kurs_uvoz: number
          name: string
          olx_bearer_token: string | null
          olx_client_id: string | null
          olx_client_token_enc: string | null
          olx_login_email: string | null
          olx_password_enc: string | null
          olx_token_expires_at: string | null
          olx_username: string | null
          price_refresh_days: number
          proxy_url: string | null
          refresh_free_count: number | null
          refresh_free_limit: number | null
          refresh_limits_synced_at: string | null
          refresh_overrides: Json | null
          schedule_cron: string | null
          status: Database["public"]["Enums"]["profile_status"]
          suspended_until: string | null
          updated_at: string
          user_agent: string | null
        }
        Insert: {
          auth_method?: Database["public"]["Enums"]["olx_auth_method"]
          created_at?: string
          daily_post_limit?: number
          description_template?: string | null
          device_name?: string | null
          id?: string
          kurs?: number
          kurs_uvoz?: number
          name: string
          olx_bearer_token?: string | null
          olx_client_id?: string | null
          olx_client_token_enc?: string | null
          olx_login_email?: string | null
          olx_password_enc?: string | null
          olx_token_expires_at?: string | null
          olx_username?: string | null
          price_refresh_days?: number
          proxy_url?: string | null
          refresh_free_count?: number | null
          refresh_free_limit?: number | null
          refresh_limits_synced_at?: string | null
          refresh_overrides?: Json | null
          schedule_cron?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspended_until?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Update: {
          auth_method?: Database["public"]["Enums"]["olx_auth_method"]
          created_at?: string
          daily_post_limit?: number
          description_template?: string | null
          device_name?: string | null
          id?: string
          kurs?: number
          kurs_uvoz?: number
          name?: string
          olx_bearer_token?: string | null
          olx_client_id?: string | null
          olx_client_token_enc?: string | null
          olx_login_email?: string | null
          olx_password_enc?: string | null
          olx_token_expires_at?: string | null
          olx_username?: string | null
          price_refresh_days?: number
          proxy_url?: string | null
          refresh_free_count?: number | null
          refresh_free_limit?: number | null
          refresh_limits_synced_at?: string | null
          refresh_overrides?: Json | null
          schedule_cron?: string | null
          status?: Database["public"]["Enums"]["profile_status"]
          suspended_until?: string | null
          updated_at?: string
          user_agent?: string | null
        }
        Relationships: []
      }
      refresh_events: {
        Row: {
          id: string
          profile_id: string
          listing_id: string | null
          olx_listing_id: number
          refreshed_at: string
          score_at_time: number | null
          was_manual: boolean
          was_paid: boolean
        }
        Insert: {
          id?: string
          profile_id: string
          listing_id?: string | null
          olx_listing_id: number
          refreshed_at?: string
          score_at_time?: number | null
          was_manual?: boolean
          was_paid?: boolean
        }
        Update: {
          id?: string
          profile_id?: string
          listing_id?: string | null
          olx_listing_id?: number
          refreshed_at?: string
          score_at_time?: number | null
          was_manual?: boolean
          was_paid?: boolean
        }
        Relationships: [
          {
            foreignKeyName: "refresh_events_listing_id_fkey"
            columns: ["listing_id"]
            isOneToOne: false
            referencedRelation: "listings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "refresh_events_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      unmapped_listings: {
        Row: {
          created_at: string
          id: string
          image_url: string | null
          olx_category_id: number | null
          olx_listing_id: number
          price: number | null
          profile_id: string
          synced_at: string
          title: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          image_url?: string | null
          olx_category_id?: number | null
          olx_listing_id: number
          price?: number | null
          profile_id: string
          synced_at?: string
          title: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          image_url?: string | null
          olx_category_id?: number | null
          olx_listing_id?: number
          price?: number | null
          profile_id?: string
          synced_at?: string
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "unmapped_listings_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      has_profile_access: { Args: { p_profile_id: string }; Returns: boolean }
      is_admin: { Args: never; Returns: boolean }
    }
    Enums: {
      app_role: "admin" | "worker"
      import_override: "inherit" | "on" | "off"
      job_status: "running" | "success" | "partial" | "failed" | "cancelled"
      job_type:
        | "sync_feed"
        | "post_listings"
        | "refresh_prices"
        | "sync_stock"
        | "delete_unmapped"
        | "sync_conversations"
        | "refresh_listings"
      listing_status:
        | "draft"
        | "active"
        | "hidden"
        | "finished"
        | "failed"
        | "pending"
      offer_origin: "HUF" | "BIH"
      olx_auth_method: "login" | "client_token"
      profile_status: "active" | "paused" | "suspended"
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
  public: {
    Enums: {
      app_role: ["admin", "worker"],
      import_override: ["inherit", "on", "off"],
      job_status: ["running", "success", "partial", "failed", "cancelled"],
      job_type: [
        "sync_feed",
        "post_listings",
        "refresh_prices",
        "sync_stock",
        "delete_unmapped",
        "sync_conversations",
        "refresh_listings",
      ],
      listing_status: [
        "draft",
        "active",
        "hidden",
        "finished",
        "failed",
        "pending",
      ],
      offer_origin: ["HUF", "BIH"],
      olx_auth_method: ["login", "client_token"],
      profile_status: ["active", "paused", "suspended"],
    },
  },
} as const
