export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  public: {
    Tables: {
      admin_fcm_tokens: {
        Row: {
          created_at: string
          token: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          token: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          token?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor: string | null
          created_at: string
          entity: string
          entity_id: string | null
          id: number
          payload: Json | null
          tournament_id: string
        }
        Insert: {
          action: string
          actor?: string | null
          created_at?: string
          entity: string
          entity_id?: string | null
          id?: never
          payload?: Json | null
          tournament_id: string
        }
        Update: {
          action?: string
          actor?: string | null
          created_at?: string
          entity?: string
          entity_id?: string | null
          id?: never
          payload?: Json | null
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "audit_log_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      board_arbiters: {
        Row: {
          assigned_by: string | null
          board_number: number
          created_at: string
          id: string
          pairing_group_id: string
          tournament_id: string
          user_id: string
        }
        Insert: {
          assigned_by?: string | null
          board_number: number
          created_at?: string
          id?: string
          pairing_group_id: string
          tournament_id: string
          user_id: string
        }
        Update: {
          assigned_by?: string | null
          board_number?: number
          created_at?: string
          id?: string
          pairing_group_id?: string
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "board_arbiters_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "board_arbiters_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_messages: {
        Row: {
          content: string
          created_at: string
          id: string
          is_human: boolean
          role: string
          session_id: string
          sources: Json | null
        }
        Insert: {
          content: string
          created_at?: string
          id?: string
          is_human?: boolean
          role: string
          session_id: string
          sources?: Json | null
        }
        Update: {
          content?: string
          created_at?: string
          id?: string
          is_human?: boolean
          role?: string
          session_id?: string
          sources?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_messages_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      chat_sessions: {
        Row: {
          contact_phone: string | null
          created_at: string
          escalated_at: string | null
          id: string
          last_message_at: string
          status: Database["public"]["Enums"]["chat_session_status"]
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          contact_phone?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["chat_session_status"]
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_message_at?: string
          status?: Database["public"]["Enums"]["chat_session_status"]
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "chat_sessions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      error_logs: {
        Row: {
          context: Json | null
          created_at: string
          id: string
          message: string
          method: string | null
          route: string | null
          source: string
          stack: string | null
          status_code: number | null
          user_id: string | null
        }
        Insert: {
          context?: Json | null
          created_at?: string
          id?: string
          message: string
          method?: string | null
          route?: string | null
          source: string
          stack?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Update: {
          context?: Json | null
          created_at?: string
          id?: string
          message?: string
          method?: string | null
          route?: string | null
          source?: string
          stack?: string | null
          status_code?: number | null
          user_id?: string | null
        }
        Relationships: []
      }
      kb_chunks: {
        Row: {
          audience: string
          chunk_index: number
          content: string
          content_hash: string
          created_at: string
          doc_slug: string
          doc_title: string
          embedding: string | null
          id: string
        }
        Insert: {
          audience?: string
          chunk_index: number
          content: string
          content_hash: string
          created_at?: string
          doc_slug: string
          doc_title: string
          embedding?: string | null
          id?: string
        }
        Update: {
          audience?: string
          chunk_index?: number
          content?: string
          content_hash?: string
          created_at?: string
          doc_slug?: string
          doc_title?: string
          embedding?: string | null
          id?: string
        }
        Relationships: []
      }
      news: {
        Row: {
          author_id: string | null
          body_md: string
          cover_alt: string | null
          cover_path: string | null
          created_at: string
          id: string
          published_at: string | null
          scope: string
          slug: string
          source_name: string | null
          source_url: string | null
          state: string | null
          status: string
          summary: string | null
          title: string
          updated_at: string
        }
        Insert: {
          author_id?: string | null
          body_md?: string
          cover_alt?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          scope: string
          slug: string
          source_name?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          summary?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          author_id?: string | null
          body_md?: string
          cover_alt?: string | null
          cover_path?: string | null
          created_at?: string
          id?: string
          published_at?: string | null
          scope?: string
          slug?: string
          source_name?: string | null
          source_url?: string | null
          state?: string | null
          status?: string
          summary?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: []
      }
      pairing_groups: {
        Row: {
          created_at: string
          id: string
          name: string
          rounds_count: number | null
          sort_order: number
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          rounds_count?: number | null
          sort_order?: number
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          rounds_count?: number | null
          sort_order?: number
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_groups_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      pairings: {
        Row: {
          black_points: number | null
          black_tp_id: string | null
          board_number: number | null
          bye_kind: Database["public"]["Enums"]["bye_kind"] | null
          created_at: string
          id: string
          is_bye: boolean
          manual_override: boolean
          result: Database["public"]["Enums"]["game_result"]
          round_id: string
          tournament_id: string
          updated_at: string
          white_points: number | null
          white_tp_id: string | null
        }
        Insert: {
          black_points?: number | null
          black_tp_id?: string | null
          board_number?: number | null
          bye_kind?: Database["public"]["Enums"]["bye_kind"] | null
          created_at?: string
          id?: string
          is_bye?: boolean
          manual_override?: boolean
          result?: Database["public"]["Enums"]["game_result"]
          round_id: string
          tournament_id: string
          updated_at?: string
          white_points?: number | null
          white_tp_id?: string | null
        }
        Update: {
          black_points?: number | null
          black_tp_id?: string | null
          board_number?: number | null
          bye_kind?: Database["public"]["Enums"]["bye_kind"] | null
          created_at?: string
          id?: string
          is_bye?: boolean
          manual_override?: boolean
          result?: Database["public"]["Enums"]["game_result"]
          round_id?: string
          tournament_id?: string
          updated_at?: string
          white_points?: number | null
          white_tp_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "pairings_black_tp_id_fkey"
            columns: ["black_tp_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairings_round_id_fkey"
            columns: ["round_id"]
            isOneToOne: false
            referencedRelation: "rounds"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "pairings_white_tp_id_fkey"
            columns: ["white_tp_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_follows: {
        Row: {
          created_at: string
          id: string
          player_id: string
          tournament_id: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          player_id: string
          tournament_id?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          player_id?: string
          tournament_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_follows_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_follows_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      players: {
        Row: {
          birth_year: number | null
          cbx_id: string | null
          cbx_rating_checked_at: string | null
          city: string | null
          created_at: string
          created_by: string | null
          federation: string | null
          fide_id: string | null
          full_name: string
          id: string
          is_test: boolean
          rating_blz: number | null
          rating_rpd: number | null
          rating_std: number | null
          sex: string | null
          state: string | null
          updated_at: string
        }
        Insert: {
          birth_year?: number | null
          cbx_id?: string | null
          cbx_rating_checked_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          federation?: string | null
          fide_id?: string | null
          full_name: string
          id?: string
          is_test?: boolean
          rating_blz?: number | null
          rating_rpd?: number | null
          rating_std?: number | null
          sex?: string | null
          state?: string | null
          updated_at?: string
        }
        Update: {
          birth_year?: number | null
          cbx_id?: string | null
          cbx_rating_checked_at?: string | null
          city?: string | null
          created_at?: string
          created_by?: string | null
          federation?: string | null
          fide_id?: string | null
          full_name?: string
          id?: string
          is_test?: boolean
          rating_blz?: number | null
          rating_rpd?: number | null
          rating_std?: number | null
          sex?: string | null
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          id: string
          p256dh: string
          tournament_id: string | null
          user_id: string | null
        }
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          id?: string
          p256dh: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          id?: string
          p256dh?: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "push_subscriptions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      requested_byes: {
        Row: {
          created_at: string
          created_by: string | null
          id: string
          round_number: number
          tournament_id: string
          tp_id: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          id?: string
          round_number: number
          tournament_id: string
          tp_id: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          id?: string
          round_number?: number
          tournament_id?: string
          tp_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "requested_byes_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "requested_byes_tp_id_fkey"
            columns: ["tp_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      rounds: {
        Row: {
          created_at: string
          id: string
          notified_at: string | null
          pairing_group_id: string | null
          published_at: string | null
          round_number: number
          status: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          id?: string
          notified_at?: string | null
          pairing_group_id?: string | null
          published_at?: string | null
          round_number: number
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          id?: string
          notified_at?: string | null
          pairing_group_id?: string | null
          published_at?: string | null
          round_number?: number
          status?: Database["public"]["Enums"]["round_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "rounds_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rounds_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      series_points_awarded: {
        Row: {
          chess_points: number
          id: string
          identity_key: string
          pairing_group_id: string | null
          place: number
          player_id: string
          points: number
          scope_key: string
          scope_name: string
          series_id: string
          tournament_id: string
        }
        Insert: {
          chess_points?: number
          id?: string
          identity_key: string
          pairing_group_id?: string | null
          place: number
          player_id: string
          points?: number
          scope_key: string
          scope_name: string
          series_id: string
          tournament_id: string
        }
        Update: {
          chess_points?: number
          id?: string
          identity_key?: string
          pairing_group_id?: string | null
          place?: number
          player_id?: string
          points?: number
          scope_key?: string
          scope_name?: string
          series_id?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_points_awarded_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_points_awarded_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_points_awarded_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tournament_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_points_awarded_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      series_points_rules: {
        Row: {
          id: string
          place: number
          points: number
          series_id: string
        }
        Insert: {
          id?: string
          place: number
          points: number
          series_id: string
        }
        Update: {
          id?: string
          place?: number
          points?: number
          series_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_points_rules_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tournament_series"
            referencedColumns: ["id"]
          },
        ]
      }
      series_tournaments: {
        Row: {
          created_at: string
          id: string
          label: string | null
          series_id: string
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          series_id: string
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          series_id?: string
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "series_tournaments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tournament_series"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "series_tournaments_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      standings: {
        Row: {
          buchholz: number | null
          buchholz_cut1: number | null
          direct_encounter: number | null
          draws: number
          games_played: number
          id: string
          losses: number
          performance_rating: number | null
          points: number
          progressive: number | null
          rank: number | null
          sonneborn_berger: number | null
          tournament_id: string
          tournament_player_id: string
          updated_at: string
          wins: number
        }
        Insert: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          direct_encounter?: number | null
          draws?: number
          games_played?: number
          id?: string
          losses?: number
          performance_rating?: number | null
          points?: number
          progressive?: number | null
          rank?: number | null
          sonneborn_berger?: number | null
          tournament_id: string
          tournament_player_id: string
          updated_at?: string
          wins?: number
        }
        Update: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          direct_encounter?: number | null
          draws?: number
          games_played?: number
          id?: string
          losses?: number
          performance_rating?: number | null
          points?: number
          progressive?: number | null
          rank?: number | null
          sonneborn_berger?: number | null
          tournament_id?: string
          tournament_player_id?: string
          updated_at?: string
          wins?: number
        }
        Relationships: [
          {
            foreignKeyName: "standings_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "standings_tournament_player_id_fkey"
            columns: ["tournament_player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_categories: {
        Row: {
          created_at: string
          id: string
          max_age: number | null
          max_rating: number | null
          min_age: number | null
          min_rating: number | null
          name: string
          pairing_group_id: string | null
          sex: string | null
          sort_order: number
          tournament_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          max_age?: number | null
          max_rating?: number | null
          min_age?: number | null
          min_rating?: number | null
          name: string
          pairing_group_id?: string | null
          sex?: string | null
          sort_order?: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          id?: string
          max_age?: number | null
          max_rating?: number | null
          min_age?: number | null
          min_rating?: number | null
          name?: string
          pairing_group_id?: string | null
          sex?: string | null
          sort_order?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_categories_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_categories_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_imports: {
        Row: {
          base_url: string
          created_at: string
          enabled: boolean
          id: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          pairing_group_name: string | null
          tournament_id: string
          updated_at: string
        }
        Insert: {
          base_url: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          pairing_group_name?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          enabled?: boolean
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          pairing_group_name?: string | null
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_imports_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_players: {
        Row: {
          buchholz: number | null
          buchholz_cut1: number | null
          category_id: string | null
          created_at: string
          current_rank: number | null
          current_score: number
          direct_encounter: number | null
          id: string
          initial_ranking: number | null
          joined_at_round: number
          pairing_group_id: string | null
          performance_rating: number | null
          player_id: string
          progressive: number | null
          sonneborn_berger: number | null
          status: Database["public"]["Enums"]["player_tournament_status"]
          tournament_id: string
          updated_at: string
        }
        Insert: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          category_id?: string | null
          created_at?: string
          current_rank?: number | null
          current_score?: number
          direct_encounter?: number | null
          id?: string
          initial_ranking?: number | null
          joined_at_round?: number
          pairing_group_id?: string | null
          performance_rating?: number | null
          player_id: string
          progressive?: number | null
          sonneborn_berger?: number | null
          status?: Database["public"]["Enums"]["player_tournament_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          category_id?: string | null
          created_at?: string
          current_rank?: number | null
          current_score?: number
          direct_encounter?: number | null
          id?: string
          initial_ranking?: number | null
          joined_at_round?: number
          pairing_group_id?: string | null
          performance_rating?: number | null
          player_id?: string
          progressive?: number | null
          sonneborn_berger?: number | null
          status?: Database["public"]["Enums"]["player_tournament_status"]
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_players_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_players_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_registrations: {
        Row: {
          approved_at: string | null
          approved_by: string | null
          birth_year: number | null
          category_id: string | null
          cbx_id: string | null
          city: string | null
          club_or_school: string | null
          created_at: string
          email: string | null
          federation: string
          fide_id: string | null
          full_name: string
          id: string
          pairing_group_id: string | null
          payment_receipt_path: string | null
          phone: string | null
          player_id: string | null
          rating_std: number | null
          rejected_reason: string | null
          sex: string | null
          state: string | null
          status: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          tournament_player_id: string | null
          updated_at: string
        }
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          birth_year?: number | null
          category_id?: string | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name: string
          id?: string
          pairing_group_id?: string | null
          payment_receipt_path?: string | null
          phone?: string | null
          player_id?: string | null
          rating_std?: number | null
          rejected_reason?: string | null
          sex?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          tournament_player_id?: string | null
          updated_at?: string
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          birth_year?: number | null
          category_id?: string | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name?: string
          id?: string
          pairing_group_id?: string | null
          payment_receipt_path?: string | null
          phone?: string | null
          player_id?: string | null
          rating_std?: number | null
          rejected_reason?: string | null
          sex?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id?: string
          tournament_player_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_registrations_category_id_fkey"
            columns: ["category_id"]
            isOneToOne: false
            referencedRelation: "tournament_categories"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_registrations_tournament_player_id_fkey"
            columns: ["tournament_player_id"]
            isOneToOne: false
            referencedRelation: "tournament_players"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_series: {
        Row: {
          banner_url: string | null
          city: string | null
          classification_dimensions: string[]
          created_at: string
          created_by: string | null
          description: string | null
          end_date: string | null
          has_absolute_classification: boolean
          id: string
          name: string
          organizer_name: string | null
          points_outside_table: number
          slug: string
          start_date: string | null
          state: string | null
          status: Database["public"]["Enums"]["series_status"]
          tiebreak_order: string[]
          updated_at: string
        }
        Insert: {
          banner_url?: string | null
          city?: string | null
          classification_dimensions?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          id?: string
          name: string
          organizer_name?: string | null
          points_outside_table?: number
          slug: string
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["series_status"]
          tiebreak_order?: string[]
          updated_at?: string
        }
        Update: {
          banner_url?: string | null
          city?: string | null
          classification_dimensions?: string[]
          created_at?: string
          created_by?: string | null
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          id?: string
          name?: string
          organizer_name?: string | null
          points_outside_table?: number
          slug?: string
          start_date?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["series_status"]
          tiebreak_order?: string[]
          updated_at?: string
        }
        Relationships: []
      }
      tournament_staff: {
        Row: {
          created_at: string
          id: string
          invited_by: string | null
          role: Database["public"]["Enums"]["staff_role"]
          tournament_id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role: Database["public"]["Enums"]["staff_role"]
          tournament_id: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          invited_by?: string | null
          role?: Database["public"]["Enums"]["staff_role"]
          tournament_id?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_staff_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      tournaments: {
        Row: {
          banner_url: string | null
          chief_arbiter: string | null
          city: string
          classification_dimensions: string[]
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          has_absolute_classification: boolean
          id: string
          initial_color: Database["public"]["Enums"]["initial_color"]
          is_free: boolean
          is_public: boolean
          mode: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode: Database["public"]["Enums"]["pairing_mode"]
          pairing_split: string | null
          rating_kind: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date: boolean
          registration_end_date: string | null
          registration_fee_text: string | null
          registration_start_date: string | null
          requested_bye_score: number
          require_cbx_id: boolean
          require_payment_receipt: boolean
          rounds_count: number
          slug: string
          start_date: string
          start_time: string | null
          state: string
          status: Database["public"]["Enums"]["tournament_status"]
          tiebreak_order: string[]
          time_control: string
          time_control_kind: Database["public"]["Enums"]["time_control_kind"]
          tournament_type: Database["public"]["Enums"]["tournament_type"]
          updated_at: string
          venue: string | null
        }
        Insert: {
          banner_url?: string | null
          chief_arbiter?: string | null
          city: string
          classification_dimensions?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          id?: string
          initial_color?: Database["public"]["Enums"]["initial_color"]
          is_free?: boolean
          is_public?: boolean
          mode?: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode?: Database["public"]["Enums"]["pairing_mode"]
          pairing_split?: string | null
          rating_kind?: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date?: boolean
          registration_end_date?: string | null
          registration_fee_text?: string | null
          registration_start_date?: string | null
          requested_bye_score?: number
          require_cbx_id?: boolean
          require_payment_receipt?: boolean
          rounds_count?: number
          slug: string
          start_date: string
          start_time?: string | null
          state: string
          status?: Database["public"]["Enums"]["tournament_status"]
          tiebreak_order?: string[]
          time_control: string
          time_control_kind?: Database["public"]["Enums"]["time_control_kind"]
          tournament_type?: Database["public"]["Enums"]["tournament_type"]
          updated_at?: string
          venue?: string | null
        }
        Update: {
          banner_url?: string | null
          chief_arbiter?: string | null
          city?: string
          classification_dimensions?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          id?: string
          initial_color?: Database["public"]["Enums"]["initial_color"]
          is_free?: boolean
          is_public?: boolean
          mode?: Database["public"]["Enums"]["tournament_mode"]
          name?: string
          organizer_name?: string
          pairing_mode?: Database["public"]["Enums"]["pairing_mode"]
          pairing_split?: string | null
          rating_kind?: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date?: boolean
          registration_end_date?: string | null
          registration_fee_text?: string | null
          registration_start_date?: string | null
          requested_bye_score?: number
          require_cbx_id?: boolean
          require_payment_receipt?: boolean
          rounds_count?: number
          slug?: string
          start_date?: string
          start_time?: string | null
          state?: string
          status?: Database["public"]["Enums"]["tournament_status"]
          tiebreak_order?: string[]
          time_control?: string
          time_control_kind?: Database["public"]["Enums"]["time_control_kind"]
          tournament_type?: Database["public"]["Enums"]["tournament_type"]
          updated_at?: string
          venue?: string | null
        }
        Relationships: []
      }
      unanswered_questions: {
        Row: {
          created_at: string
          id: string
          question: string
          session_id: string | null
          user_id: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          question: string
          session_id?: string | null
          user_id?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          question?: string
          session_id?: string | null
          user_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "unanswered_questions_session_id_fkey"
            columns: ["session_id"]
            isOneToOne: false
            referencedRelation: "chat_sessions"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          avatar_url: string | null
          birth_year: number | null
          cbx_id: string | null
          city: string | null
          club_or_school: string | null
          created_at: string
          email: string | null
          federation: string
          fide_id: string | null
          full_name: string
          id: string
          is_arbiter: boolean
          is_organizer: boolean
          is_participant: boolean
          phone: string | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          birth_year?: number | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name?: string
          id: string
          is_arbiter?: boolean
          is_organizer?: boolean
          is_participant?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          birth_year?: number | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name?: string
          id?: string
          is_arbiter?: boolean
          is_organizer?: boolean
          is_participant?: boolean
          phone?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _audit: {
        Args: {
          p_action: string
          p_entity: string
          p_entity_id: string
          p_payload: Json
          p_tournament_id: string
        }
        Returns: undefined
      }
      _generate_initial_ranking: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      _recalculate_series_standings: {
        Args: { p_series_id: string }
        Returns: number
      }
      _tournament_tiebreak_sql: { Args: { p_order: string[] }; Returns: string }
      add_staff_by_email: {
        Args: {
          p_email: string
          p_role: Database["public"]["Enums"]["staff_role"]
          p_tournament_id: string
        }
        Returns: string
      }
      add_tournament_to_series: {
        Args: {
          p_label?: string
          p_series_id: string
          p_sort_order?: number
          p_tournament_id: string
        }
        Returns: string
      }
      approve_registration: {
        Args: { p_registration_id: string }
        Returns: string
      }
      assign_board_arbiter: {
        Args: { p_board_number: number; p_group_id: string; p_user_id: string }
        Returns: undefined
      }
      auth_user_role: {
        Args: never
        Returns: Database["public"]["Enums"]["user_role"]
      }
      chess_normalize_name_key: { Args: { p: string }; Returns: string }
      cleanup_test_players: { Args: never; Returns: number }
      derive_player_category: {
        Args: { p_tournament_id: string; p_tp_id: string }
        Returns: string
      }
      finish_round: { Args: { p_round_id: string }; Returns: undefined }
      generate_initial_ranking: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      generate_test_players: {
        Args: { p_count: number; p_group_id: string; p_tournament_id: string }
        Returns: number
      }
      get_my_tournament_role: {
        Args: { p_tournament_id: string }
        Returns: string
      }
      get_player_tournament_history: {
        Args: { p_tournament_id: string; p_tp_id: string }
        Returns: {
          board_number: number
          color: string
          cumulative_pts: number
          is_bye: boolean
          opponent_name: string
          opponent_points: number
          opponent_rank: number
          opponent_rating: number
          points_earned: number
          result: Database["public"]["Enums"]["game_result"]
          round_number: number
          round_status: Database["public"]["Enums"]["round_status"]
        }[]
      }
      get_round_pairings: {
        Args: { p_round_id: string }
        Returns: {
          black_name: string
          black_points: number
          black_rank: number
          black_rating: number
          black_score: number
          black_tp_id: string
          board_number: number
          is_bye: boolean
          manual_override: boolean
          pairing_id: string
          result: Database["public"]["Enums"]["game_result"]
          white_name: string
          white_points: number
          white_rank: number
          white_rating: number
          white_score: number
          white_tp_id: string
        }[]
      }
      get_series_player_breakdown: {
        Args: {
          p_identity_key: string
          p_scope_key: string
          p_series_id: string
        }
        Returns: {
          chess_points: number
          label: string
          pairing_group_name: string
          place: number
          points: number
          start_date: string
          tournament_id: string
          tournament_name: string
          tournament_slug: string
        }[]
      }
      get_series_scopes: {
        Args: { p_series_id: string }
        Returns: {
          events: number
          players: number
          scope_key: string
          scope_name: string
        }[]
      }
      get_series_standings: {
        Args: { p_scope_key: string; p_series_id: string }
        Returns: {
          best_place: number
          chess_points: number
          events: number
          federation: string
          full_name: string
          identity_key: string
          player_id: string
          points: number
          rank: number
          rating_std: number
          state: string
        }[]
      }
      get_tournament_by_slug: {
        Args: { p_slug: string }
        Returns: {
          banner_url: string | null
          chief_arbiter: string | null
          city: string
          classification_dimensions: string[]
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          has_absolute_classification: boolean
          id: string
          initial_color: Database["public"]["Enums"]["initial_color"]
          is_free: boolean
          is_public: boolean
          mode: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode: Database["public"]["Enums"]["pairing_mode"]
          pairing_split: string | null
          rating_kind: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date: boolean
          registration_end_date: string | null
          registration_fee_text: string | null
          registration_start_date: string | null
          requested_bye_score: number
          require_cbx_id: boolean
          require_payment_receipt: boolean
          rounds_count: number
          slug: string
          start_date: string
          start_time: string | null
          state: string
          status: Database["public"]["Enums"]["tournament_status"]
          tiebreak_order: string[]
          time_control: string
          time_control_kind: Database["public"]["Enums"]["time_control_kind"]
          tournament_type: Database["public"]["Enums"]["tournament_type"]
          updated_at: string
          venue: string | null
        }
        SetofOptions: {
          from: "*"
          to: "tournaments"
          isOneToOne: true
          isSetofReturn: false
        }
      }
      get_tournament_page_data: {
        Args: { p_slug: string }
        Returns: {
          current_round_number: number
          effective_status: Database["public"]["Enums"]["tournament_status"]
          last_import_at: string
          last_import_status: string
          tournament: Database["public"]["Tables"]["tournaments"]["Row"]
        }[]
      }
      get_tournament_staff: {
        Args: { p_tournament_id: string }
        Returns: {
          email: string
          full_name: string
          id: string
          role: Database["public"]["Enums"]["staff_role"]
          user_id: string
        }[]
      }
      get_tournament_standings: {
        Args: { p_tournament_id: string }
        Returns: {
          buchholz: number
          buchholz_cut1: number
          category_id: string
          category_name: string
          draws: number
          federation: string
          full_name: string
          games_played: number
          initial_ranking: number
          losses: number
          pairing_group_id: string
          pairing_group_name: string
          performance_rating: number
          player_id: string
          player_status: Database["public"]["Enums"]["player_tournament_status"]
          points: number
          progressive: number
          rank: number
          rating_std: number
          sonneborn_berger: number
          state: string
          tp_id: string
          wins: number
        }[]
      }
      is_arbiter_or_admin: { Args: never; Returns: boolean }
      is_organizer_or_admin: { Args: never; Returns: boolean }
      is_series_manager: { Args: { p_series_id: string }; Returns: boolean }
      is_tournament_manager: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_tournament_organizer: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      match_kb_chunks: {
        Args: {
          match_count?: number
          min_similarity?: number
          query_embedding: string
        }
        Returns: {
          content: string
          doc_slug: string
          doc_title: string
          similarity: number
        }[]
      }
      next_status_by_date: {
        Args: {
          p_created_at: string
          p_registration_closes_by_date: boolean
          p_registration_end_date: string
          p_start_date: string
          p_start_time: string
          p_status: Database["public"]["Enums"]["tournament_status"]
        }
        Returns: Database["public"]["Enums"]["tournament_status"]
      }
      now_brt: { Args: never; Returns: string }
      override_pairing_players: {
        Args: { p_justification: string; p_moves: Json; p_round_id: string }
        Returns: undefined
      }
      publish_round: { Args: { p_round_id: string }; Returns: undefined }
      recalculate_series_standings: {
        Args: { p_series_id: string }
        Returns: number
      }
      recalculate_standings: {
        Args: { p_tournament_id: string }
        Returns: undefined
      }
      refresh_tournament_categories: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      remove_staff: { Args: { p_staff_id: string }; Returns: undefined }
      remove_tournament_from_series: {
        Args: { p_series_id: string; p_tournament_id: string }
        Returns: undefined
      }
      reopen_round: { Args: { p_round_id: string }; Returns: undefined }
      save_round_draft: {
        Args: { p_group_id: string; p_pairings: Json; p_round_number: number }
        Returns: string
      }
      search_staff_candidates: {
        Args: { p_query: string; p_tournament_id: string }
        Returns: {
          email: string
          full_name: string
          id: string
        }[]
      }
      search_tournaments: {
        Args: {
          p_limit?: number
          p_offset?: number
          p_query?: string
          p_state?: string
          p_status?: Database["public"]["Enums"]["tournament_status"]
        }
        Returns: {
          city: string
          end_date: string
          id: string
          name: string
          organizer_name: string
          player_count: number
          registration_closes_by_date: boolean
          registration_end_date: string
          rounds_count: number
          slug: string
          start_date: string
          state: string
          status: Database["public"]["Enums"]["tournament_status"]
          time_control: string
          time_control_kind: Database["public"]["Enums"]["time_control_kind"]
          tournament_type: Database["public"]["Enums"]["tournament_type"]
        }[]
      }
      series_identity_key: { Args: { p_player_id: string }; Returns: string }
      set_my_capabilities: {
        Args: {
          p_is_arbiter: boolean
          p_is_organizer: boolean
          p_is_participant: boolean
        }
        Returns: undefined
      }
      set_pairing_result: {
        Args: {
          p_pairing_id: string
          p_result: Database["public"]["Enums"]["game_result"]
        }
        Returns: undefined
      }
      set_series_points_rules: {
        Args: { p_rules: Json; p_series_id: string }
        Returns: number
      }
      show_limit: { Args: never; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      swap_draft_players: {
        Args: { p_moves: Json; p_round_id: string }
        Returns: undefined
      }
      today_brt: { Args: never; Returns: string }
      unassign_board_arbiter: {
        Args: { p_board_number: number; p_group_id: string }
        Returns: undefined
      }
    }
    Enums: {
      bye_kind:
        | "pairing"
        | "requested_half"
        | "requested_zero"
        | "late_entry"
        | "round_robin"
      chat_session_status: "bot" | "encerrada" | "aguardando_humano" | "humano"
      game_result:
        | "1-0"
        | "0-1"
        | "1/2-1/2"
        | "*"
        | "bye"
        | "forfeit_white"
        | "forfeit_black"
        | "double_forfeit"
      initial_color: "white1" | "black1"
      pairing_mode: "absolute" | "per_category" | "custom"
      player_tournament_status: "active" | "withdrawn" | "absent"
      rating_kind: "std" | "rpd" | "blz"
      registration_status: "pending" | "approved" | "rejected"
      round_status: "draft" | "pending" | "ongoing" | "finished"
      series_status: "draft" | "published" | "finished"
      staff_role: "organizer" | "arbiter"
      time_control_kind: "bullet" | "blitz" | "rapid" | "classical" | "other"
      tournament_mode: "native" | "imported"
      tournament_status:
        | "draft"
        | "published"
        | "registration"
        | "registration_closed"
        | "ongoing"
        | "finished"
        | "cancelled"
      tournament_type: "swiss" | "round_robin" | "knockout" | "other"
      user_role: "admin" | "organizer" | "arbiter" | "public_user"
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
      bye_kind: [
        "pairing",
        "requested_half",
        "requested_zero",
        "late_entry",
        "round_robin",
      ],
      chat_session_status: ["bot", "encerrada", "aguardando_humano", "humano"],
      game_result: [
        "1-0",
        "0-1",
        "1/2-1/2",
        "*",
        "bye",
        "forfeit_white",
        "forfeit_black",
        "double_forfeit",
      ],
      initial_color: ["white1", "black1"],
      pairing_mode: ["absolute", "per_category", "custom"],
      player_tournament_status: ["active", "withdrawn", "absent"],
      rating_kind: ["std", "rpd", "blz"],
      registration_status: ["pending", "approved", "rejected"],
      round_status: ["draft", "pending", "ongoing", "finished"],
      series_status: ["draft", "published", "finished"],
      staff_role: ["organizer", "arbiter"],
      time_control_kind: ["bullet", "blitz", "rapid", "classical", "other"],
      tournament_mode: ["native", "imported"],
      tournament_status: [
        "draft",
        "published",
        "registration",
        "registration_closed",
        "ongoing",
        "finished",
        "cancelled",
      ],
      tournament_type: ["swiss", "round_robin", "knockout", "other"],
      user_role: ["admin", "organizer", "arbiter", "public_user"],
    },
  },
} as const
