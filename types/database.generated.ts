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
      admin_fcm_tokens: {
        Row: {
          created_at: string
          token: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
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
      app_push_follows: {
        Row: {
          followed_player_ids: string[]
          token: string
          tournament_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          followed_player_ids?: string[]
          token: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          followed_player_ids?: string[]
          token?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "app_push_follows_token_fkey"
            columns: ["token"]
            isOneToOne: false
            referencedRelation: "app_push_tokens"
            referencedColumns: ["token"]
          },
          {
            foreignKeyName: "app_push_follows_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      app_push_tokens: {
        Row: {
          created_at: string
          platform: string
          token: string
          updated_at: string
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          platform?: string
          token: string
          updated_at?: string
          user_id?: string | null
        }
        Update: {
          created_at?: string
          platform?: string
          token?: string
          updated_at?: string
          user_id?: string | null
        }
        Relationships: []
      }
      app_settings: {
        Row: {
          key: string
          updated_at: string
          value: NonNullable<Json>
        }
        ComputedFields: never
        Insert: {
          key: string
          updated_at?: string
          value: NonNullable<Json>
        }
        Update: {
          key?: string
          updated_at?: string
          value?: NonNullable<Json>
        }
        Relationships: []
      }
      asaas_webhook_events: {
        Row: {
          event: string
          id: string
          payload: NonNullable<Json>
          payment_id: string
          processed_at: string
        }
        ComputedFields: never
        Insert: {
          event: string
          id?: string
          payload: NonNullable<Json>
          payment_id: string
          processed_at?: string
        }
        Update: {
          event?: string
          id?: string
          payload?: NonNullable<Json>
          payment_id?: string
          processed_at?: string
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
        ComputedFields: never
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
        ComputedFields: never
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
      broadcast_create_limits: {
        Row: {
          attempts: number
          fingerprint: string
          window_start: string
        }
        ComputedFields: never
        Insert: {
          attempts: number
          fingerprint: string
          window_start: string
        }
        Update: {
          attempts?: number
          fingerprint?: string
          window_start?: string
        }
        Relationships: []
      }
      broadcast_keys: {
        Row: {
          broadcast_id: string
          key_hash: string
        }
        ComputedFields: never
        Insert: {
          broadcast_id: string
          key_hash: string
        }
        Update: {
          broadcast_id?: string
          key_hash?: string
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_keys_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: true
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcast_moves: {
        Row: {
          broadcast_id: string
          confidence: number | null
          created_at: string
          fen_after: string
          ply: number
          san: string
          uci: string
          video_timestamp: number | null
        }
        ComputedFields: never
        Insert: {
          broadcast_id: string
          confidence?: number | null
          created_at?: string
          fen_after: string
          ply: number
          san: string
          uci: string
          video_timestamp?: number | null
        }
        Update: {
          broadcast_id?: string
          confidence?: number | null
          created_at?: string
          fen_after?: string
          ply?: number
          san?: string
          uci?: string
          video_timestamp?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "broadcast_moves_broadcast_id_fkey"
            columns: ["broadcast_id"]
            isOneToOne: false
            referencedRelation: "broadcasts"
            referencedColumns: ["id"]
          },
        ]
      }
      broadcasts: {
        Row: {
          black_player: string
          created_at: string
          current_fen: string
          event: string | null
          id: string
          pgn: string
          ply_count: number
          result: string
          revision: number
          share_code: string
          site: string | null
          status: string
          updated_at: string
          white_player: string
        }
        ComputedFields: never
        Insert: {
          black_player?: string
          created_at?: string
          current_fen?: string
          event?: string | null
          id?: string
          pgn?: string
          ply_count?: number
          result?: string
          revision?: number
          share_code: string
          site?: string | null
          status?: string
          updated_at?: string
          white_player?: string
        }
        Update: {
          black_player?: string
          created_at?: string
          current_fen?: string
          event?: string | null
          id?: string
          pgn?: string
          ply_count?: number
          result?: string
          revision?: number
          share_code?: string
          site?: string | null
          status?: string
          updated_at?: string
          white_player?: string
        }
        Relationships: []
      }
      cbx_calendar_events: {
        Row: {
          cbx_id: string
          end_date: string
          first_seen_at: string
          location: string | null
          name: string
          organizer: string | null
          rating: string | null
          start_date: string
          status: string | null
          time_control: string | null
          uf: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          cbx_id: string
          end_date: string
          first_seen_at?: string
          location?: string | null
          name: string
          organizer?: string | null
          rating?: string | null
          start_date: string
          status?: string | null
          time_control?: string | null
          uf?: string | null
          updated_at?: string
        }
        Update: {
          cbx_id?: string
          end_date?: string
          first_seen_at?: string
          location?: string | null
          name?: string
          organizer?: string | null
          rating?: string | null
          start_date?: string
          status?: string | null
          time_control?: string | null
          uf?: string | null
          updated_at?: string
        }
        Relationships: []
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
        ComputedFields: never
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
          started_by: string | null
          status: Database["public"]["Enums"]["chat_session_status"]
          tournament_id: string | null
          user_id: string | null
          user_last_read_at: string | null
        }
        ComputedFields: never
        Insert: {
          contact_phone?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_message_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["chat_session_status"]
          tournament_id?: string | null
          user_id?: string | null
          user_last_read_at?: string | null
        }
        Update: {
          contact_phone?: string | null
          created_at?: string
          escalated_at?: string | null
          id?: string
          last_message_at?: string
          started_by?: string | null
          status?: Database["public"]["Enums"]["chat_session_status"]
          tournament_id?: string | null
          user_id?: string | null
          user_last_read_at?: string | null
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
      cron_import_lock: {
        Row: {
          id: number
          locked_at: string | null
        }
        ComputedFields: never
        Insert: {
          id?: number
          locked_at?: string | null
        }
        Update: {
          id?: number
          locked_at?: string | null
        }
        Relationships: []
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
        ComputedFields: never
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
      history_game_pgns: {
        Row: {
          created_at: string
          game_id: string
          pgn: string
          source: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          game_id: string
          pgn: string
          source?: string
        }
        Update: {
          created_at?: string
          game_id?: string
          pgn?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_game_pgns_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: true
            referencedRelation: "history_games"
            referencedColumns: ["id"]
          },
        ]
      }
      history_games: {
        Row: {
          black_name: string
          black_player_id: string | null
          black_rating: number | null
          created_at: string
          group_name: string | null
          id: string
          result: Database["public"]["Enums"]["game_result"]
          round: number
          source_game_id: string
          tournament_id: string
          white_name: string
          white_player_id: string | null
          white_rating: number | null
        }
        ComputedFields: never
        Insert: {
          black_name: string
          black_player_id?: string | null
          black_rating?: number | null
          created_at?: string
          group_name?: string | null
          id?: string
          result: Database["public"]["Enums"]["game_result"]
          round: number
          source_game_id: string
          tournament_id: string
          white_name: string
          white_player_id?: string | null
          white_rating?: number | null
        }
        Update: {
          black_name?: string
          black_player_id?: string | null
          black_rating?: number | null
          created_at?: string
          group_name?: string | null
          id?: string
          result?: Database["public"]["Enums"]["game_result"]
          round?: number
          source_game_id?: string
          tournament_id?: string
          white_name?: string
          white_player_id?: string | null
          white_rating?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "history_games_black_player_id_fkey"
            columns: ["black_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_games_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "history_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "history_games_white_player_id_fkey"
            columns: ["white_player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      history_tournaments: {
        Row: {
          city: string | null
          created_at: string
          date_approx: boolean
          end_date: string | null
          games_count: number
          groups: string[]
          homologated: boolean | null
          id: string
          name: string
          organizer_name: string | null
          pgn_count: number
          players_count: number
          series_id: string | null
          series_label: string | null
          slug: string
          source_tnrs: string[]
          source_url: string | null
          start_date: string
          state: string | null
          time_control_kind: Database["public"]["Enums"]["time_control_kind"]
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          city?: string | null
          created_at?: string
          date_approx?: boolean
          end_date?: string | null
          games_count?: number
          groups?: string[]
          homologated?: boolean | null
          id?: string
          name: string
          organizer_name?: string | null
          pgn_count?: number
          players_count?: number
          series_id?: string | null
          series_label?: string | null
          slug: string
          source_tnrs?: string[]
          source_url?: string | null
          start_date: string
          state?: string | null
          time_control_kind?: Database["public"]["Enums"]["time_control_kind"]
          updated_at?: string
        }
        Update: {
          city?: string | null
          created_at?: string
          date_approx?: boolean
          end_date?: string | null
          games_count?: number
          groups?: string[]
          homologated?: boolean | null
          id?: string
          name?: string
          organizer_name?: string | null
          pgn_count?: number
          players_count?: number
          series_id?: string | null
          series_label?: string | null
          slug?: string
          source_tnrs?: string[]
          source_url?: string | null
          start_date?: string
          state?: string | null
          time_control_kind?: Database["public"]["Enums"]["time_control_kind"]
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "history_tournaments_series_id_fkey"
            columns: ["series_id"]
            isOneToOne: false
            referencedRelation: "tournament_series"
            referencedColumns: ["id"]
          },
        ]
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
        ComputedFields: never
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
      lite_registrations: {
        Row: {
          birth_year: number | null
          club: string | null
          contact: string
          created_at: string
          decided_at: string | null
          guardian_name: string | null
          id: string
          message: string | null
          name: string
          rating: number | null
          sex: string | null
          status: string
          tournament_id: string
        }
        ComputedFields: never
        Insert: {
          birth_year?: number | null
          club?: string | null
          contact: string
          created_at?: string
          decided_at?: string | null
          guardian_name?: string | null
          id?: string
          message?: string | null
          name: string
          rating?: number | null
          sex?: string | null
          status?: string
          tournament_id: string
        }
        Update: {
          birth_year?: number | null
          club?: string | null
          contact?: string
          created_at?: string
          decided_at?: string | null
          guardian_name?: string | null
          id?: string
          message?: string | null
          name?: string
          rating?: number | null
          sex?: string | null
          status?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lite_registrations_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "lite_tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      lite_result_submissions: {
        Row: {
          arbiter_email: string
          arbiter_name: string
          arbiter_user_id: string
          board: number
          created_at: string
          game_id: string
          message: string | null
          result: string
          rev: string
          round_number: number
          status: string
          tournament_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          arbiter_email: string
          arbiter_name: string
          arbiter_user_id: string
          board: number
          created_at?: string
          game_id: string
          message?: string | null
          result: string
          rev?: string
          round_number: number
          status?: string
          tournament_id: string
          updated_at?: string
        }
        Update: {
          arbiter_email?: string
          arbiter_name?: string
          arbiter_user_id?: string
          board?: number
          created_at?: string
          game_id?: string
          message?: string | null
          result?: string
          rev?: string
          round_number?: number
          status?: string
          tournament_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lite_result_submissions_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "lite_tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      lite_tournament_arbiters: {
        Row: {
          email: string
          name: string
          tournament_id: string
        }
        ComputedFields: never
        Insert: {
          email: string
          name: string
          tournament_id: string
        }
        Update: {
          email?: string
          name?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "lite_tournament_arbiters_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "lite_tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      lite_tournaments: {
        Row: {
          app_version: number
          backup: NonNullable<Json>
          created_at: string
          device_id: string
          id: string
          is_public: boolean
          name: string
          owner_id: string
          registration_open: boolean
          site_tournament_id: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          app_version: number
          backup: NonNullable<Json>
          created_at?: string
          device_id: string
          id: string
          is_public?: boolean
          name: string
          owner_id: string
          registration_open?: boolean
          site_tournament_id?: string | null
          updated_at?: string
        }
        Update: {
          app_version?: number
          backup?: NonNullable<Json>
          created_at?: string
          device_id?: string
          id?: string
          is_public?: boolean
          name?: string
          owner_id?: string
          registration_open?: boolean
          site_tournament_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "lite_tournaments_site_tournament_id_fkey"
            columns: ["site_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
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
        ComputedFields: never
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
        ComputedFields: never
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
      pairing_pgns: {
        Row: {
          created_at: string
          pairing_id: string
          pgn: string
          source: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          pairing_id: string
          pgn: string
          source?: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          pairing_id?: string
          pgn?: string
          source?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "pairing_pgns_pairing_id_fkey"
            columns: ["pairing_id"]
            isOneToOne: true
            referencedRelation: "pairings"
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
        ComputedFields: never
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
      plan_entitlements: {
        Row: {
          enabled: boolean
          key: string
          limit_int: number | null
          plan_id: string
        }
        ComputedFields: never
        Insert: {
          enabled?: boolean
          key: string
          limit_int?: number | null
          plan_id: string
        }
        Update: {
          enabled?: boolean
          key?: string
          limit_int?: number | null
          plan_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "plan_entitlements_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
      plans: {
        Row: {
          billing_interval: string | null
          code: string
          created_at: string
          currency: string
          description: string | null
          id: string
          is_public: boolean
          name: string
          price_cents: number | null
          sort_order: number
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          billing_interval?: string | null
          code: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name: string
          price_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Update: {
          billing_interval?: string | null
          code?: string
          created_at?: string
          currency?: string
          description?: string | null
          id?: string
          is_public?: boolean
          name?: string
          price_cents?: number | null
          sort_order?: number
          updated_at?: string
        }
        Relationships: []
      }
      player_follows: {
        Row: {
          created_at: string
          id: string
          player_id: string
          tournament_id: string | null
          user_id: string
        }
        ComputedFields: never
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
      player_group_members: {
        Row: {
          added_at: string
          group_id: string
          note: string | null
          player_id: string
        }
        ComputedFields: never
        Insert: {
          added_at?: string
          group_id: string
          note?: string | null
          player_id: string
        }
        Update: {
          added_at?: string
          group_id?: string
          note?: string | null
          player_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_group_members_group_id_fkey"
            columns: ["group_id"]
            isOneToOne: false
            referencedRelation: "player_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "player_group_members_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      player_groups: {
        Row: {
          created_at: string
          id: string
          kind: string
          name: string
          owner_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          id?: string
          kind?: string
          name: string
          owner_id: string
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          name?: string
          owner_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "player_groups_owner_id_fkey"
            columns: ["owner_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
          club_or_school: string | null
          created_at: string
          created_by: string | null
          federation: string | null
          fide_id: string | null
          fide_name: string | null
          full_name: string
          id: string
          is_test: boolean
          rating_blz: number | null
          rating_rpd: number | null
          rating_std: number | null
          sex: string | null
          state: string | null
          title: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          birth_year?: number | null
          cbx_id?: string | null
          cbx_rating_checked_at?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          created_by?: string | null
          federation?: string | null
          fide_id?: string | null
          fide_name?: string | null
          full_name: string
          id?: string
          is_test?: boolean
          rating_blz?: number | null
          rating_rpd?: number | null
          rating_std?: number | null
          sex?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
        }
        Update: {
          birth_year?: number | null
          cbx_id?: string | null
          cbx_rating_checked_at?: string | null
          city?: string | null
          club_or_school?: string | null
          created_at?: string
          created_by?: string | null
          federation?: string | null
          fide_id?: string | null
          fide_name?: string | null
          full_name?: string
          id?: string
          is_test?: boolean
          rating_blz?: number | null
          rating_rpd?: number | null
          rating_std?: number | null
          sex?: string | null
          state?: string | null
          title?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      push_notification_events: {
        Row: {
          created_at: string
          event_key: string
          event_type: string
          id: string
          pairing_group_id: string | null
          round_number: number
          tournament_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          event_key: string
          event_type: string
          id?: string
          pairing_group_id?: string | null
          round_number: number
          tournament_id: string
        }
        Update: {
          created_at?: string
          event_key?: string
          event_type?: string
          id?: string
          pairing_group_id?: string | null
          round_number?: number
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "push_notification_events_pairing_group_id_fkey"
            columns: ["pairing_group_id"]
            isOneToOne: false
            referencedRelation: "pairing_groups"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "push_notification_events_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
        ]
      }
      push_subscriptions: {
        Row: {
          auth: string
          created_at: string | null
          endpoint: string
          followed_player_ids: string[]
          id: string
          p256dh: string
          tournament_id: string | null
          user_id: string | null
        }
        ComputedFields: never
        Insert: {
          auth: string
          created_at?: string | null
          endpoint: string
          followed_player_ids?: string[]
          id?: string
          p256dh: string
          tournament_id?: string | null
          user_id?: string | null
        }
        Update: {
          auth?: string
          created_at?: string | null
          endpoint?: string
          followed_player_ids?: string[]
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
      report_orders: {
        Row: {
          asaas_customer_id: string | null
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          created_at: string
          delivered_at: string | null
          delivery_path: string | null
          guardian_consent: boolean
          history_tournament_id: string | null
          id: string
          notes: string | null
          payment_status: string
          player_id: string
          price_cents: number
          status: string
          tournament_id: string | null
          tournament_name: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_path?: string | null
          guardian_consent?: boolean
          history_tournament_id?: string | null
          id?: string
          notes?: string | null
          payment_status?: string
          player_id: string
          price_cents?: number
          status?: string
          tournament_id?: string | null
          tournament_name: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          created_at?: string
          delivered_at?: string | null
          delivery_path?: string | null
          guardian_consent?: boolean
          history_tournament_id?: string | null
          id?: string
          notes?: string | null
          payment_status?: string
          player_id?: string
          price_cents?: number
          status?: string
          tournament_id?: string | null
          tournament_name?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "report_orders_history_tournament_id_fkey"
            columns: ["history_tournament_id"]
            isOneToOne: false
            referencedRelation: "history_tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_orders_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_orders_tournament_id_fkey"
            columns: ["tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "report_orders_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
        ComputedFields: never
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
      site_access_events: {
        Row: {
          city: string | null
          device_id: string
          id: number
          path: string
          region: string | null
          user_id: string | null
          visited_at: string
        }
        ComputedFields: never
        Insert: {
          city?: string | null
          device_id: string
          id?: number
          path: string
          region?: string | null
          user_id?: string | null
          visited_at?: string
        }
        Update: {
          city?: string | null
          device_id?: string
          id?: number
          path?: string
          region?: string | null
          user_id?: string | null
          visited_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "site_access_events_device_id_fkey"
            columns: ["device_id"]
            isOneToOne: false
            referencedRelation: "site_devices"
            referencedColumns: ["id"]
          },
        ]
      }
      site_devices: {
        Row: {
          browser: string
          device_type: string
          first_seen_at: string
          followed_player_ids: string[]
          id: string
          is_owner: boolean
          last_city: string | null
          last_path: string | null
          last_region: string | null
          last_seen_at: string
          os: string
          owner_label: string | null
        }
        ComputedFields: never
        Insert: {
          browser: string
          device_type: string
          first_seen_at?: string
          followed_player_ids?: string[]
          id: string
          is_owner?: boolean
          last_city?: string | null
          last_path?: string | null
          last_region?: string | null
          last_seen_at?: string
          os: string
          owner_label?: string | null
        }
        Update: {
          browser?: string
          device_type?: string
          first_seen_at?: string
          followed_player_ids?: string[]
          id?: string
          is_owner?: boolean
          last_city?: string | null
          last_path?: string | null
          last_region?: string | null
          last_seen_at?: string
          os?: string
          owner_label?: string | null
        }
        Relationships: []
      }
      sparring_games: {
        Row: {
          black: string
          black_elo: number | null
          created_at: string
          eco: string | null
          event: string | null
          hash: string
          id: string
          opening: string | null
          owner_id: string
          pgn: string
          played_on: string | null
          player_color: string
          player_id: string
          ply_count: number
          result: string
          site: string | null
          source: string
          source_id: string | null
          time_class: string
          time_control: string | null
          white: string
          white_elo: number | null
        }
        ComputedFields: never
        Insert: {
          black: string
          black_elo?: number | null
          created_at?: string
          eco?: string | null
          event?: string | null
          hash: string
          id?: string
          opening?: string | null
          owner_id?: string
          pgn: string
          played_on?: string | null
          player_color: string
          player_id: string
          ply_count: number
          result: string
          site?: string | null
          source: string
          source_id?: string | null
          time_class: string
          time_control?: string | null
          white: string
          white_elo?: number | null
        }
        Update: {
          black?: string
          black_elo?: number | null
          created_at?: string
          eco?: string | null
          event?: string | null
          hash?: string
          id?: string
          opening?: string | null
          owner_id?: string
          pgn?: string
          played_on?: string | null
          player_color?: string
          player_id?: string
          ply_count?: number
          result?: string
          site?: string | null
          source?: string
          source_id?: string | null
          time_class?: string
          time_control?: string | null
          white?: string
          white_elo?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "sparring_games_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_analysis"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_games_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_games_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_players"
            referencedColumns: ["id"]
          },
        ]
      }
      sparring_players: {
        Row: {
          aliases: string[]
          chesscom_username: string | null
          created_at: string
          id: string
          lichess_username: string | null
          name: string
          notes: string | null
          owner_id: string
          rating: number | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          aliases?: string[]
          chesscom_username?: string | null
          created_at?: string
          id?: string
          lichess_username?: string | null
          name: string
          notes?: string | null
          owner_id?: string
          rating?: number | null
          updated_at?: string
        }
        Update: {
          aliases?: string[]
          chesscom_username?: string | null
          created_at?: string
          id?: string
          lichess_username?: string | null
          name?: string
          notes?: string | null
          owner_id?: string
          rating?: number | null
          updated_at?: string
        }
        Relationships: []
      }
      sparring_positions: {
        Row: {
          analyzed_at: string
          best_cp: number
          best_move_uci: string
          candidates: NonNullable<Json>
          color: string
          depth: number
          engine: string | null
          fen: string
          game_id: string
          id: string
          legal_moves: number
          loss_cp: number
          move_san: string
          move_uci: string
          multipv: number
          owner_id: string
          phase: string
          played_cp: number
          played_rank: number | null
          player_id: string
          ply: number
        }
        ComputedFields: never
        Insert: {
          analyzed_at?: string
          best_cp: number
          best_move_uci: string
          candidates?: NonNullable<Json>
          color: string
          depth: number
          engine?: string | null
          fen: string
          game_id: string
          id?: string
          legal_moves: number
          loss_cp: number
          move_san: string
          move_uci: string
          multipv: number
          owner_id: string
          phase: string
          played_cp: number
          played_rank?: number | null
          player_id: string
          ply: number
        }
        Update: {
          analyzed_at?: string
          best_cp?: number
          best_move_uci?: string
          candidates?: NonNullable<Json>
          color?: string
          depth?: number
          engine?: string | null
          fen?: string
          game_id?: string
          id?: string
          legal_moves?: number
          loss_cp?: number
          move_san?: string
          move_uci?: string
          multipv?: number
          owner_id?: string
          phase?: string
          played_cp?: number
          played_rank?: number | null
          player_id?: string
          ply?: number
        }
        Relationships: [
          {
            foreignKeyName: "sparring_positions_game_id_fkey"
            columns: ["game_id"]
            isOneToOne: false
            referencedRelation: "sparring_games"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sparring_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_analysis"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_positions_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_players"
            referencedColumns: ["id"]
          },
        ]
      }
      sparring_training_jobs: {
        Row: {
          attempts: number
          created_at: string
          depth: number
          error: string | null
          finished_at: string | null
          games_total: number
          heartbeat_at: string | null
          id: string
          multipv: number
          owner_id: string
          player_id: string
          positions_base: number
          positions_done: number
          positions_total: number
          started_at: string | null
          status: string
        }
        ComputedFields: never
        Insert: {
          attempts?: number
          created_at?: string
          depth?: number
          error?: string | null
          finished_at?: string | null
          games_total?: number
          heartbeat_at?: string | null
          id?: string
          multipv?: number
          owner_id?: string
          player_id: string
          positions_base?: number
          positions_done?: number
          positions_total?: number
          started_at?: string | null
          status?: string
        }
        Update: {
          attempts?: number
          created_at?: string
          depth?: number
          error?: string | null
          finished_at?: string | null
          games_total?: number
          heartbeat_at?: string | null
          id?: string
          multipv?: number
          owner_id?: string
          player_id?: string
          positions_base?: number
          positions_done?: number
          positions_total?: number
          started_at?: string | null
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "sparring_training_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_analysis"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_training_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_player_stats"
            referencedColumns: ["player_id"]
          },
          {
            foreignKeyName: "sparring_training_jobs_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "sparring_players"
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
        ComputedFields: never
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
      subscriptions: {
        Row: {
          asaas_subscription_id: string
          billing_type: string
          created_at: string
          id: string
          next_due_date: string | null
          plan_id: string
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          asaas_subscription_id: string
          billing_type?: string
          created_at?: string
          id?: string
          next_due_date?: string | null
          plan_id: string
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          asaas_subscription_id?: string
          billing_type?: string
          created_at?: string
          id?: string
          next_due_date?: string | null
          plan_id?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "subscriptions_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_alert_deliveries: {
        Row: {
          delivered_at: string
          ref_id: string
          rule_id: string
          source: string
        }
        ComputedFields: never
        Insert: {
          delivered_at?: string
          ref_id: string
          rule_id: string
          source: string
        }
        Update: {
          delivered_at?: string
          ref_id?: string
          rule_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_alert_deliveries_rule_id_fkey"
            columns: ["rule_id"]
            isOneToOne: false
            referencedRelation: "tournament_alert_rules"
            referencedColumns: ["id"]
          },
        ]
      }
      tournament_alert_rules: {
        Row: {
          active: boolean
          created_at: string
          id: string
          include_cbx: boolean
          name: string | null
          time_controls: string[]
          ufs: string[]
          user_id: string
        }
        ComputedFields: never
        Insert: {
          active?: boolean
          created_at?: string
          id?: string
          include_cbx?: boolean
          name?: string | null
          time_controls?: string[]
          ufs?: string[]
          user_id: string
        }
        Update: {
          active?: boolean
          created_at?: string
          id?: string
          include_cbx?: boolean
          name?: string | null
          time_controls?: string[]
          ufs?: string[]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_alert_rules_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "user_profiles"
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
        ComputedFields: never
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
          discovered_rounds_count: number | null
          enabled: boolean
          force_requested_at: string | null
          id: string
          last_message: string | null
          last_run_at: string | null
          last_status: string | null
          pairing_group_name: string | null
          pgn_check_count: number
          pgn_checked_at: string | null
          tournament_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          base_url: string
          created_at?: string
          discovered_rounds_count?: number | null
          enabled?: boolean
          force_requested_at?: string | null
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          pairing_group_name?: string | null
          pgn_check_count?: number
          pgn_checked_at?: string | null
          tournament_id: string
          updated_at?: string
        }
        Update: {
          base_url?: string
          created_at?: string
          discovered_rounds_count?: number | null
          enabled?: boolean
          force_requested_at?: string | null
          id?: string
          last_message?: string | null
          last_run_at?: string | null
          last_status?: string | null
          pairing_group_name?: string | null
          pgn_check_count?: number
          pgn_checked_at?: string | null
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
      tournament_payouts: {
        Row: {
          amount_cents: number
          created_at: string
          created_by: string | null
          id: string
          method: string
          note: string | null
          paid_on: string
          tournament_id: string
        }
        ComputedFields: never
        Insert: {
          amount_cents: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_on?: string
          tournament_id: string
        }
        Update: {
          amount_cents?: number
          created_at?: string
          created_by?: string | null
          id?: string
          method?: string
          note?: string | null
          paid_on?: string
          tournament_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "tournament_payouts_created_by_fkey"
            columns: ["created_by"]
            isOneToOne: false
            referencedRelation: "user_profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "tournament_payouts_tournament_id_fkey"
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
          checked_in_at: string | null
          checkin_status: string
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
          source_name: string | null
          status: Database["public"]["Enums"]["player_tournament_status"]
          tournament_id: string
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          category_id?: string | null
          checked_in_at?: string | null
          checkin_status?: string
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
          source_name?: string | null
          status?: Database["public"]["Enums"]["player_tournament_status"]
          tournament_id: string
          updated_at?: string
        }
        Update: {
          buchholz?: number | null
          buchholz_cut1?: number | null
          category_id?: string | null
          checked_in_at?: string | null
          checkin_status?: string
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
          source_name?: string | null
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
          asaas_customer_id: string | null
          asaas_invoice_url: string | null
          asaas_payment_id: string | null
          birth_year: number | null
          category_id: string | null
          cbx_id: string | null
          city: string | null
          club_or_school: string | null
          cpf_cnpj: string | null
          created_at: string
          email: string | null
          federation: string
          fide_id: string | null
          full_name: string
          id: string
          is_waitlisted: boolean
          net_value_cents: number | null
          paid_at: string | null
          paid_value_cents: number | null
          pairing_group_id: string | null
          payment_receipt_path: string | null
          payment_status: string
          phone: string | null
          platform_fee_cents: number
          player_id: string | null
          promoted_at: string | null
          rating_std: number | null
          rejected_reason: string | null
          sex: string | null
          state: string | null
          status: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          tournament_player_id: string | null
          updated_at: string
          user_id: string | null
          waitlisted_at: string | null
        }
        ComputedFields: never
        Insert: {
          approved_at?: string | null
          approved_by?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          birth_year?: number | null
          category_id?: string | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name: string
          id?: string
          is_waitlisted?: boolean
          net_value_cents?: number | null
          paid_at?: string | null
          paid_value_cents?: number | null
          pairing_group_id?: string | null
          payment_receipt_path?: string | null
          payment_status?: string
          phone?: string | null
          platform_fee_cents?: number
          player_id?: string | null
          promoted_at?: string | null
          rating_std?: number | null
          rejected_reason?: string | null
          sex?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id: string
          tournament_player_id?: string | null
          updated_at?: string
          user_id?: string | null
          waitlisted_at?: string | null
        }
        Update: {
          approved_at?: string | null
          approved_by?: string | null
          asaas_customer_id?: string | null
          asaas_invoice_url?: string | null
          asaas_payment_id?: string | null
          birth_year?: number | null
          category_id?: string | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          cpf_cnpj?: string | null
          created_at?: string
          email?: string | null
          federation?: string
          fide_id?: string | null
          full_name?: string
          id?: string
          is_waitlisted?: boolean
          net_value_cents?: number | null
          paid_at?: string | null
          paid_value_cents?: number | null
          pairing_group_id?: string | null
          payment_receipt_path?: string | null
          payment_status?: string
          phone?: string | null
          platform_fee_cents?: number
          player_id?: string | null
          promoted_at?: string | null
          rating_std?: number | null
          rejected_reason?: string | null
          sex?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["registration_status"]
          tournament_id?: string
          tournament_player_id?: string | null
          updated_at?: string
          user_id?: string | null
          waitlisted_at?: string | null
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
        ComputedFields: never
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
        ComputedFields: never
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
          accept_online_payment: boolean
          banner_url: string | null
          checkin_closes_at: string | null
          checkin_enabled: boolean
          checkin_opens_at: string | null
          chief_arbiter: string | null
          city: string
          classification_dimensions: string[]
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          has_absolute_classification: boolean
          has_female_classification: boolean
          homologated: boolean | null
          id: string
          initial_color: Database["public"]["Enums"]["initial_color"]
          is_free: boolean
          is_international: boolean
          is_public: boolean
          live_broadcast_note: string | null
          live_broadcast_url: string | null
          max_participants: number | null
          mode: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode: Database["public"]["Enums"]["pairing_mode"]
          pairing_split: string | null
          rating_kind: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date: boolean
          registration_end_date: string | null
          registration_fee_cents: number | null
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
          waitlist_enabled: boolean
        }
        ComputedFields: never
        Insert: {
          accept_online_payment?: boolean
          banner_url?: string | null
          checkin_closes_at?: string | null
          checkin_enabled?: boolean
          checkin_opens_at?: string | null
          chief_arbiter?: string | null
          city: string
          classification_dimensions?: string[]
          created_at?: string
          created_by: string
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          has_female_classification?: boolean
          homologated?: boolean | null
          id?: string
          initial_color?: Database["public"]["Enums"]["initial_color"]
          is_free?: boolean
          is_international?: boolean
          is_public?: boolean
          live_broadcast_note?: string | null
          live_broadcast_url?: string | null
          max_participants?: number | null
          mode?: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode?: Database["public"]["Enums"]["pairing_mode"]
          pairing_split?: string | null
          rating_kind?: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date?: boolean
          registration_end_date?: string | null
          registration_fee_cents?: number | null
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
          waitlist_enabled?: boolean
        }
        Update: {
          accept_online_payment?: boolean
          banner_url?: string | null
          checkin_closes_at?: string | null
          checkin_enabled?: boolean
          checkin_opens_at?: string | null
          chief_arbiter?: string | null
          city?: string
          classification_dimensions?: string[]
          created_at?: string
          created_by?: string
          description?: string | null
          end_date?: string | null
          has_absolute_classification?: boolean
          has_female_classification?: boolean
          homologated?: boolean | null
          id?: string
          initial_color?: Database["public"]["Enums"]["initial_color"]
          is_free?: boolean
          is_international?: boolean
          is_public?: boolean
          live_broadcast_note?: string | null
          live_broadcast_url?: string | null
          max_participants?: number | null
          mode?: Database["public"]["Enums"]["tournament_mode"]
          name?: string
          organizer_name?: string
          pairing_mode?: Database["public"]["Enums"]["pairing_mode"]
          pairing_split?: string | null
          rating_kind?: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date?: boolean
          registration_end_date?: string | null
          registration_fee_cents?: number | null
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
          waitlist_enabled?: boolean
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
        ComputedFields: never
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
      user_player_links: {
        Row: {
          created_at: string
          evidence_tournament_id: string | null
          id: string
          player_id: string
          reviewed_at: string | null
          reviewed_by: string | null
          status: string
          updated_at: string
          user_id: string
        }
        ComputedFields: never
        Insert: {
          created_at?: string
          evidence_tournament_id?: string | null
          id?: string
          player_id: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          evidence_tournament_id?: string | null
          id?: string
          player_id?: string
          reviewed_at?: string | null
          reviewed_by?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_player_links_evidence_tournament_id_fkey"
            columns: ["evidence_tournament_id"]
            isOneToOne: false
            referencedRelation: "tournaments"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "user_player_links_player_id_fkey"
            columns: ["player_id"]
            isOneToOne: false
            referencedRelation: "players"
            referencedColumns: ["id"]
          },
        ]
      }
      user_profiles: {
        Row: {
          asaas_customer_id: string | null
          avatar_url: string | null
          birth_year: number | null
          cbx_id: string | null
          city: string | null
          club_or_school: string | null
          cpf_cnpj: string | null
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
          plan_id: string | null
          role: Database["public"]["Enums"]["user_role"]
          state: string | null
          updated_at: string
        }
        ComputedFields: never
        Insert: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          birth_year?: number | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          cpf_cnpj?: string | null
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
          plan_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          updated_at?: string
        }
        Update: {
          asaas_customer_id?: string | null
          avatar_url?: string | null
          birth_year?: number | null
          cbx_id?: string | null
          city?: string | null
          club_or_school?: string | null
          cpf_cnpj?: string | null
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
          plan_id?: string | null
          role?: Database["public"]["Enums"]["user_role"]
          state?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "user_profiles_plan_id_fkey"
            columns: ["plan_id"]
            isOneToOne: false
            referencedRelation: "plans"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      sparring_player_analysis: {
        Row: {
          games_analyzed: number | null
          last_analyzed_at: string | null
          player_id: string | null
          positions: number | null
        }
        ComputedFields: never
        Relationships: []
      }
      sparring_player_stats: {
        Row: {
          as_black: number | null
          as_white: number | null
          classical: number | null
          fast: number | null
          first_game: string | null
          from_chesscom: number | null
          from_lichess: number | null
          from_pgn: number | null
          last_game: string | null
          player_id: string | null
          rapid: number | null
          total: number | null
        }
        ComputedFields: never
        Relationships: []
      }
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
      _group_member_games: {
        Args: { p_group_id: string; p_since: string }
        Returns: {
          color: string
          game_id: string
          has_pgn: boolean
          opponent_name: string
          opponent_rating: number
          player_id: string
          points: number
          result: Database["public"]["Enums"]["game_result"]
          round_number: number
          source: string
          start_date: string
          tournament_id: string
          tournament_name: string
          tournament_slug: string
        }[]
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
      apply_broadcast_move: {
        Args: {
          p_broadcast_id: string
          p_confidence?: number
          p_fen_after: string
          p_pgn: string
          p_ply: number
          p_san: string
          p_uci: string
          p_video_timestamp?: number
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
        Args: Record<PropertyKey, never>
        Returns: Database["public"]["Enums"]["user_role"]
      }
      billing_enabled: { Args: Record<PropertyKey, never>; Returns: boolean }
      checkin_enabled: { Args: Record<PropertyKey, never>; Returns: boolean }
      chess_normalize_name_key: { Args: { p: string }; Returns: string }
      claim_broadcast_create_slot: {
        Args: { p_fingerprint: string; p_limit?: number }
        Returns: boolean
      }
      cleanup_test_players: {
        Args: Record<PropertyKey, never>
        Returns: number
      }
      derive_player_category: {
        Args: { p_tournament_id: string; p_tp_id: string }
        Returns: string
      }
      entitlement_limit: { Args: { p_key: string }; Returns: number }
      finish_round: { Args: { p_round_id: string }; Returns: undefined }
      generate_initial_ranking: {
        Args: { p_group_id: string }
        Returns: undefined
      }
      generate_test_players: {
        Args: { p_count: number; p_group_id: string; p_tournament_id: string }
        Returns: number
      }
      get_group_overview: {
        Args: { p_days?: number; p_group_id: string }
        Returns: {
          birth_year: number
          cbx_id: string
          full_name: string
          games: number
          last_tournament_date: string
          last_tournament_name: string
          note: string
          pgn_games: number
          player_id: string
          points: number
          rating_blz: number
          rating_rpd: number
          rating_std: number
          state: string
          title: string
        }[]
      }
      get_group_recent_games: {
        Args: { p_days?: number; p_group_id: string; p_only_pgn?: boolean }
        Returns: {
          color: string
          game_id: string
          has_pgn: boolean
          opponent_name: string
          opponent_rating: number
          player_id: string
          player_name: string
          points: number
          result: Database["public"]["Enums"]["game_result"]
          round_number: number
          source: string
          start_date: string
          tournament_name: string
          tournament_slug: string
        }[]
      }
      get_history_tournament_players: {
        Args: { p_tournament_id: string }
        Returns: {
          draws: number
          games: number
          group_name: string
          losses: number
          player_id: string
          player_name: string
          points: number
          wins: number
        }[]
      }
      get_my_entitlements: {
        Args: Record<PropertyKey, never>
        Returns: {
          enabled: boolean
          key: string
          limit_int: number
          used: number
        }[]
      }
      get_my_tournament_role: {
        Args: { p_tournament_id: string }
        Returns: string
      }
      get_pairing_ids_with_pgn: {
        Args: { p_pairing_ids: string[] }
        Returns: string[]
      }
      get_payout_overview: {
        Args: Record<PropertyKey, never>
        Returns: {
          balance_cents: number
          name: string
          organizer_name: string
          organizer_net_cents: number
          paid_count: number
          paid_out_cents: number
          slug: string
          start_date: string
          tournament_id: string
        }[]
      }
      get_player_history: {
        Args: { p_player_id: string }
        Returns: {
          color: string
          game_id: string
          group_name: string
          has_pgn: boolean
          homologated: boolean
          my_rating: number
          opponent_cbx_id: string
          opponent_name: string
          opponent_player_id: string
          opponent_rating: number
          opponent_title: string
          points: number
          result: Database["public"]["Enums"]["game_result"]
          round_number: number
          source: string
          start_date: string
          time_control_kind: Database["public"]["Enums"]["time_control_kind"]
          tournament_id: string
          tournament_name: string
          tournament_slug: string
        }[]
      }
      get_player_tournament_history: {
        Args: { p_tournament_id: string; p_tp_id: string }
        Returns: {
          board_number: number
          color: string
          cumulative_pts: number
          is_bye: boolean
          opponent_federation: string
          opponent_fide_name: string
          opponent_name: string
          opponent_points: number
          opponent_rank: number
          opponent_rating: number
          opponent_title: string
          opponent_tp_id: string
          points_earned: number
          result: Database["public"]["Enums"]["game_result"]
          round_number: number
          round_status: Database["public"]["Enums"]["round_status"]
        }[]
      }
      get_round_pairings: {
        Args: { p_round_id: string }
        Returns: {
          black_federation: string
          black_fide_name: string
          black_name: string
          black_points: number
          black_rank: number
          black_rating: number
          black_score: number
          black_title: string
          black_tp_id: string
          board_number: number
          is_bye: boolean
          manual_override: boolean
          pairing_id: string
          result: Database["public"]["Enums"]["game_result"]
          white_federation: string
          white_fide_name: string
          white_name: string
          white_points: number
          white_rank: number
          white_rating: number
          white_score: number
          white_title: string
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
          accept_online_payment: boolean
          banner_url: string | null
          checkin_closes_at: string | null
          checkin_enabled: boolean
          checkin_opens_at: string | null
          chief_arbiter: string | null
          city: string
          classification_dimensions: string[]
          created_at: string
          created_by: string
          description: string | null
          end_date: string | null
          has_absolute_classification: boolean
          has_female_classification: boolean
          homologated: boolean | null
          id: string
          initial_color: Database["public"]["Enums"]["initial_color"]
          is_free: boolean
          is_international: boolean
          is_public: boolean
          live_broadcast_note: string | null
          live_broadcast_url: string | null
          max_participants: number | null
          mode: Database["public"]["Enums"]["tournament_mode"]
          name: string
          organizer_name: string
          pairing_mode: Database["public"]["Enums"]["pairing_mode"]
          pairing_split: string | null
          rating_kind: Database["public"]["Enums"]["rating_kind"]
          registration_closes_by_date: boolean
          registration_end_date: string | null
          registration_fee_cents: number | null
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
          waitlist_enabled: boolean
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
      get_tournament_pgn_count: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      get_tournament_settlement: {
        Args: { p_tournament_id: string }
        Returns: {
          balance_cents: number
          estimated_count: number
          gateway_fee_cents: number
          gross_cents: number
          organizer_net_cents: number
          paid_count: number
          paid_out_cents: number
          platform_fee_cents: number
          refunded_count: number
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
          fide_name: string
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
          rating_tempo: number
          sex: string
          sonneborn_berger: number
          state: string
          title: string
          tp_id: string
          wins: number
        }[]
      }
      has_entitlement: { Args: { p_key: string }; Returns: boolean }
      is_arbiter_or_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_organizer_or_admin: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      is_player_group_owner: { Args: { p_group_id: string }; Returns: boolean }
      is_series_manager: { Args: { p_series_id: string }; Returns: boolean }
      is_tournament_manager: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      is_tournament_organizer: {
        Args: { p_tournament_id: string }
        Returns: boolean
      }
      lite_delete: {
        Args: { p_id: string; p_owner: string }
        Returns: undefined
      }
      lite_publish: { Args: { p_id: string; p_slug: string }; Returns: string }
      lite_unpublish: { Args: { p_id: string }; Returns: undefined }
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
      my_plan_id: { Args: Record<PropertyKey, never>; Returns: string }
      my_unread_chat_count: {
        Args: Record<PropertyKey, never>
        Returns: number
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
      now_brt: { Args: Record<PropertyKey, never>; Returns: string }
      override_pairing_players: {
        Args: { p_justification: string; p_moves: Json; p_round_id: string }
        Returns: undefined
      }
      promote_tournament_waitlist: {
        Args: { p_tournament_id: string }
        Returns: number
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
      registration_payment_enabled: {
        Args: Record<PropertyKey, never>
        Returns: boolean
      }
      remove_staff: { Args: { p_staff_id: string }; Returns: undefined }
      remove_tournament_from_series: {
        Args: { p_series_id: string; p_tournament_id: string }
        Returns: undefined
      }
      reopen_round: { Args: { p_round_id: string }; Returns: undefined }
      return_round_to_draft: {
        Args: { p_discard_results?: boolean; p_round_id: string }
        Returns: number
      }
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
      search_users_for_plan: {
        Args: { p_query: string }
        Returns: {
          email: string
          full_name: string
          id: string
          plan_code: string
          plan_name: string
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
      set_my_checkin: {
        Args: { p_tournament_player_id: string }
        Returns: string
      }
      set_pairing_result: {
        Args: {
          p_pairing_id: string
          p_result: Database["public"]["Enums"]["game_result"]
        }
        Returns: undefined
      }
      set_player_checkin: {
        Args: { p_checked_in: boolean; p_tournament_player_id: string }
        Returns: string
      }
      set_series_points_rules: {
        Args: { p_rules: Json; p_series_id: string }
        Returns: number
      }
      set_user_plan: {
        Args: { p_plan_code: string; p_user_id: string }
        Returns: undefined
      }
      show_limit: { Args: Record<PropertyKey, never>; Returns: number }
      show_trgm: { Args: { "": string }; Returns: string[] }
      sparring_cancel_job: { Args: { p_job: string }; Returns: undefined }
      sparring_claim_job: {
        Args: Record<PropertyKey, never>
        Returns: {
          attempts: number
          created_at: string
          depth: number
          error: string | null
          finished_at: string | null
          games_total: number
          heartbeat_at: string | null
          id: string
          multipv: number
          owner_id: string
          player_id: string
          positions_base: number
          positions_done: number
          positions_total: number
          started_at: string | null
          status: string
        }[]
        SetofOptions: {
          from: "*"
          to: "sparring_training_jobs"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      sparring_profile_stats: {
        Args: { p_classes?: string[]; p_player: string }
        Returns: {
          acpl: number
          blunders: number
          bucket: string
          color: string
          dim: string
          inaccuracies: number
          mistakes: number
          n: number
          top1: number
          top3: number
        }[]
      }
      swap_draft_players: {
        Args: { p_moves: Json; p_round_id: string }
        Returns: undefined
      }
      sync_player_scores_from_standings: {
        Args: { p_tournament_id: string }
        Returns: number
      }
      today_brt: { Args: Record<PropertyKey, never>; Returns: string }
      truncate_broadcast_moves: {
        Args: { p_broadcast_id: string; p_to_ply: number }
        Returns: number
      }
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
        | "not_paired"
      initial_color: "white1" | "black1"
      pairing_mode: "absolute" | "per_category" | "custom"
      player_tournament_status: "active" | "withdrawn" | "absent"
      rating_kind: "std" | "rpd" | "blz"
      registration_status: "pending" | "approved" | "rejected"
      round_status: "draft" | "pending" | "ongoing" | "finished"
      series_status: "draft" | "published" | "finished"
      staff_role: "organizer" | "arbiter"
      time_control_kind: "bullet" | "blitz" | "rapid" | "classical" | "other"
      tournament_mode: "native" | "imported" | "app"
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
        "not_paired",
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
      tournament_mode: ["native", "imported", "app"],
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
