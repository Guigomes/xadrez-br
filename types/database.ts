// ============================================================
// Auto-generated types matching the Supabase schema
// ============================================================

export type UserRole = 'admin' | 'organizer' | 'arbiter' | 'public_user';
export type TournamentStatus = 'draft' | 'registration' | 'ongoing' | 'finished' | 'cancelled';
export type TournamentType = 'swiss' | 'round_robin' | 'knockout' | 'other';
export type RoundStatus = 'draft' | 'pending' | 'ongoing' | 'finished';
export type ByeKind = 'pairing' | 'requested_half' | 'requested_zero' | 'late_entry';
export type StaffRole = 'organizer' | 'arbiter';
export type GameResult = '1-0' | '0-1' | '1/2-1/2' | '*' | 'bye' | 'forfeit_white' | 'forfeit_black' | 'double_forfeit';
export type PlayerTournamentStatus = 'active' | 'withdrawn' | 'absent';
export type RegistrationStatus = 'pending' | 'approved' | 'rejected';
export type TournamentMode = 'native' | 'imported';
export type InitialColor = 'white1' | 'black1';
export type RatingKind = 'std' | 'rpd' | 'blz';
export type TiebreakKey = 'buchholz' | 'buchholz_cut1' | 'sonneborn_berger' | 'wins' | 'progressive';
export type PlayerSex = 'm' | 'w';

// ============================================================
// Row types (raw DB rows)
// ============================================================

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

export interface Player {
  id: string;
  full_name: string;
  fide_id: string | null;
  cbx_id: string | null;
  federation: string | null;
  state: string | null;
  city: string | null;
  birth_year: number | null;
  sex: PlayerSex | null;
  rating_std: number | null;
  rating_rpd: number | null;
  rating_blz: number | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface Tournament {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  city: string;
  state: string;
  venue: string | null;
  organizer_name: string;
  chief_arbiter: string | null;
  time_control: string;
  tournament_type: TournamentType;
  start_date: string;
  end_date: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
  rounds_count: number;
  status: TournamentStatus;
  is_public: boolean;
  banner_url: string | null;
  mode: TournamentMode;
  requested_bye_score: number;
  initial_color: InitialColor;
  rating_kind: RatingKind;
  tiebreak_order: TiebreakKey[];
  require_payment_receipt: boolean;
  registration_fee_text: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}

export interface PairingGroup {
  id: string;
  tournament_id: string;
  name: string;
  sort_order: number;
  rounds_count: number | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentCategory {
  id: string;
  tournament_id: string;
  name: string;
  max_age: number | null;
  min_age: number | null;
  max_rating: number | null;
  min_rating: number | null;
  created_at: string;
}

export interface TournamentPlayer {
  id: string;
  tournament_id: string;
  player_id: string;
  category_id: string | null;
  initial_ranking: number | null;
  current_score: number;
  current_rank: number | null;
  buchholz: number | null;
  buchholz_cut1: number | null;
  sonneborn_berger: number | null;
  direct_encounter: number | null;
  performance_rating: number | null;
  status: PlayerTournamentStatus;
  joined_at_round: number;
  created_at: string;
  updated_at: string;
}

export interface TournamentStaff {
  id: string;
  tournament_id: string;
  user_id: string;
  role: StaffRole;
  invited_by: string | null;
  created_at: string;
}

export interface BoardArbiter {
  id: string;
  tournament_id: string;
  pairing_group_id: string;
  board_number: number;
  user_id: string;
  assigned_by: string | null;
  created_at: string;
}

export interface RequestedBye {
  id: string;
  tournament_id: string;
  tp_id: string;
  round_number: number;
  created_by: string | null;
  created_at: string;
}

export interface AuditLogEntry {
  id: number;
  tournament_id: string;
  actor: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  payload: Record<string, unknown> | null;
  created_at: string;
}

export interface Round {
  id: string;
  tournament_id: string;
  round_number: number;
  status: RoundStatus;
  published_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Pairing {
  id: string;
  tournament_id: string;
  round_id: string;
  board_number: number | null;
  white_tp_id: string | null;
  black_tp_id: string | null;
  result: GameResult;
  white_points: number | null;
  black_points: number | null;
  is_bye: boolean;
  bye_kind: ByeKind | null;
  manual_override: boolean;
  created_at: string;
  updated_at: string;
}

export interface Standing {
  id: string;
  tournament_id: string;
  tournament_player_id: string;
  points: number;
  rank: number | null;
  buchholz: number | null;
  buchholz_cut1: number | null;
  sonneborn_berger: number | null;
  direct_encounter: number | null;
  performance_rating: number | null;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  updated_at: string;
}

export interface PlayerFollow {
  id: string;
  user_id: string;
  player_id: string;
  tournament_id: string | null;
  created_at: string;
}

export interface TournamentImport {
  id: string;
  tournament_id: string;
  base_url: string;
  pairing_group_name: string | null;
  enabled: boolean;
  last_run_at: string | null;
  last_status: 'success' | 'error' | null;
  last_message: string | null;
  created_at: string;
  updated_at: string;
}

export interface TournamentRegistration {
  id: string;
  tournament_id: string;
  pairing_group_id: string | null;
  full_name: string;
  birth_year: number | null;
  city: string | null;
  state: string | null;
  club_or_school: string | null;
  federation: string;
  fide_id: string | null;
  cbx_id: string | null;
  rating_std: number | null;
  email: string | null;
  phone: string | null;
  payment_receipt_path: string | null;
  status: RegistrationStatus;
  player_id: string | null;
  tournament_player_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejected_reason: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// RPC / Join return types
// ============================================================

export interface TournamentListItem {
  id: string;
  slug: string;
  name: string;
  city: string;
  state: string;
  start_date: string;
  end_date: string | null;
  registration_end_date: string | null;
  status: TournamentStatus;
  tournament_type: TournamentType;
  rounds_count: number;
  organizer_name: string;
  time_control: string;
  player_count: number;
}

export interface StandingRow {
  rank: number | null;
  player_id: string;
  full_name: string;
  federation: string | null;
  state: string | null;
  rating_std: number | null;
  initial_ranking: number | null;
  points: number;
  games_played: number;
  wins: number;
  draws: number;
  losses: number;
  buchholz: number | null;
  buchholz_cut1: number | null;
  sonneborn_berger: number | null;
  progressive: number | null;
  performance_rating: number | null;
  category_name: string | null;
  pairing_group_id: string | null;
  pairing_group_name: string | null;
  tp_id: string;
  player_status: PlayerTournamentStatus;
}

export interface PlayerHistoryRow {
  round_number: number;
  round_status: RoundStatus;
  board_number: number | null;
  color: 'white' | 'black';
  opponent_name: string;
  opponent_rating: number | null;
  opponent_rank: number | null;
  result: GameResult;
  points_earned: number | null;
  is_bye: boolean;
  cumulative_pts: number | null;
}

export interface RoundPairingRow {
  pairing_id: string;
  board_number: number | null;
  white_tp_id: string | null;
  white_name: string;
  white_rating: number | null;
  white_rank: number | null;
  white_score: number | null;
  black_tp_id: string | null;
  black_name: string;
  black_rating: number | null;
  black_rank: number | null;
  black_score: number | null;
  result: GameResult;
  white_points: number | null;
  black_points: number | null;
  is_bye: boolean;
}

// ============================================================
// Form / Input types
// ============================================================

export interface TournamentFormValues {
  name: string;
  description?: string;
  city: string;
  state: string;
  venue?: string;
  organizer_name: string;
  chief_arbiter?: string;
  time_control: string;
  tournament_type: TournamentType;
  start_date: string;
  end_date?: string;
  registration_start_date?: string;
  registration_end_date?: string;
  rounds_count: number;
  is_public: boolean;
  mode: TournamentMode;
  initial_color: InitialColor;
  rating_kind: RatingKind;
  requested_bye_score: number;
  tiebreak_order: TiebreakKey[];
  require_payment_receipt: boolean;
  registration_fee_text?: string;
}

export interface PlayerFormValues {
  full_name: string;
  fide_id?: string;
  cbx_id?: string;
  federation?: string;
  state?: string;
  city?: string;
  birth_year?: number;
  rating_std?: number;
  rating_rpd?: number;
}

export interface PairingResultUpdate {
  pairing_id: string;
  result: GameResult;
}

// ============================================================
// Supabase Database type (used with createClient generic)
// ============================================================

export interface Database {
  public: {
    Tables: {
      user_profiles:        { Row: UserProfile;        Insert: Partial<UserProfile> & Pick<UserProfile, 'id'>; Update: Partial<UserProfile>; };
      players:              { Row: Player;             Insert: Omit<Player, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Player, 'id'>>; };
      tournaments:          { Row: Tournament;         Insert: Omit<Tournament, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Tournament, 'id'>>; };
      tournament_categories:{ Row: TournamentCategory; Insert: Omit<TournamentCategory, 'id' | 'created_at'>; Update: Partial<Omit<TournamentCategory, 'id'>>; };
      tournament_players:   { Row: TournamentPlayer;   Insert: Omit<TournamentPlayer, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<TournamentPlayer, 'id'>>; };
      rounds:               { Row: Round;              Insert: Omit<Round, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Round, 'id'>>; };
      pairings:             { Row: Pairing;            Insert: Omit<Pairing, 'id' | 'created_at' | 'updated_at'>; Update: Partial<Omit<Pairing, 'id'>>; };
      standings:            { Row: Standing;           Insert: Omit<Standing, 'id'>; Update: Partial<Omit<Standing, 'id'>>; };
      player_follows:       { Row: PlayerFollow;       Insert: Omit<PlayerFollow, 'id' | 'created_at'>; Update: Partial<Omit<PlayerFollow, 'id'>>; };
    };
    Functions: {
      recalculate_standings:        { Args: { p_tournament_id: string }; Returns: void; };
      get_tournament_standings:     { Args: { p_tournament_id: string }; Returns: StandingRow[]; };
      get_player_tournament_history:{ Args: { p_tournament_id: string; p_tp_id: string }; Returns: PlayerHistoryRow[]; };
      search_tournaments:           { Args: { p_query?: string; p_state?: string; p_status?: TournamentStatus; p_limit?: number; p_offset?: number }; Returns: TournamentListItem[]; };
      get_round_pairings:           { Args: { p_round_id: string }; Returns: RoundPairingRow[]; };
    };
    Enums: {
      user_role:                UserRole;
      tournament_status:        TournamentStatus;
      tournament_type:          TournamentType;
      round_status:             RoundStatus;
      game_result:              GameResult;
      player_tournament_status: PlayerTournamentStatus;
    };
  };
}
