// ============================================================
// Auto-generated types matching the Supabase schema
// ============================================================

export type UserRole = 'admin' | 'organizer' | 'arbiter' | 'public_user';
export type TournamentStatus = 'draft' | 'published' | 'registration' | 'registration_closed' | 'ongoing' | 'finished' | 'cancelled';
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
export type TimeControlKind = 'bullet' | 'blitz' | 'rapid' | 'classical' | 'other';
export type TiebreakKey = 'buchholz' | 'buchholz_cut1' | 'sonneborn_berger' | 'wins' | 'progressive';
export type PlayerSex = 'm' | 'w';
export type SeriesStatus = 'draft' | 'published' | 'finished';
/** Desempate da SÉRIE — domínio diferente de TiebreakKey (que é desempate de xadrez). */
export type SeriesTiebreakKey = 'events' | 'best_place' | 'chess_points';

// ============================================================
// Row types (raw DB rows)
// ============================================================

export interface UserProfile {
  id: string;
  full_name: string;
  email: string | null;
  role: UserRole;
  is_organizer: boolean;
  is_arbiter: boolean;
  is_participant: boolean;
  birth_year: number | null;
  city: string | null;
  state: string | null;
  club_or_school: string | null;
  federation: string;
  fide_id: string | null;
  cbx_id: string | null;
  phone: string | null;
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
  /** Categoria do ritmo pra busca/estatística — migration 061. Texto exibido continua em time_control. */
  time_control_kind: TimeControlKind;
  tournament_type: TournamentType;
  start_date: string;
  /** "HH:MM" (coluna `time`), opcional — entra na transição automática pra 'ongoing' (migration 047, next_status_by_date). */
  start_time: string | null;
  end_date: string | null;
  registration_start_date: string | null;
  registration_end_date: string | null;
  /** false depois de "Reabrir Inscrições" manual — só "Encerrar Inscrições" volta a fechar, o prazo por data para de vigiar (migration 045). */
  registration_closes_by_date: boolean;
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
  is_free: boolean;
  require_cbx_id: boolean;
  pairing_mode: PairingMode;
  /** Respostas das 3 perguntas de classificação (idade/rating/feminina) — migration 035. */
  classification_dimensions: ClassificationDimension[];
  /**
   * 4ª pergunta da classificação (migration 065): se o torneio premia o
   * absoluto — o ranking transversal a todas as faixas. `false` esconde a aba
   * "Absoluto" da classificação pública e do /print, deixando só as faixas. A
   * UI ignora o `false` quando o torneio não tem faixa nenhuma, senão não
   * sobraria ranking pra mostrar.
   */
  has_absolute_classification: boolean;
  /** Dimensão que divide os grupos de emparceiramento quando pairing_mode='per_category'. */
  pairing_split: ClassificationDimension | null;
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
  sex: 'm' | 'w' | null;
  pairing_group_id: string | null;
  /** Ordem de exibição e desempate quando duas células têm a mesma especificidade. */
  sort_order: number;
  created_at: string;
}

export type PairingMode = 'absolute' | 'per_category' | 'custom';
export type ClassificationDimension = 'age' | 'rating' | 'sex';

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
  /** Grupo de emparceiramento dono da rodada (006/007) — null = torneio de grupo único. */
  pairing_group_id: string | null;
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
  /** Classificação declarada pelo inscrito (034) — comparada com a derivada no admin. */
  category_id: string | null;
  full_name: string;
  birth_year: number | null;
  sex: 'm' | 'w' | null;
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
  registration_closes_by_date: boolean;
  status: TournamentStatus;
  tournament_type: TournamentType;
  rounds_count: number;
  organizer_name: string;
  time_control: string;
  time_control_kind: TimeControlKind;
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
  /** Classificação derivada (célula da partição) — migration 035. */
  category_name: string | null;
  category_id: string | null;
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
  /** Pontuação ATUAL do adversário (standings.points) — pra conferir Buchholz/SB na mão. */
  opponent_points: number | null;
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
  manual_override: boolean;
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
  time_control_kind: TimeControlKind;
  tournament_type: TournamentType;
  start_date: string;
  start_time?: string;
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
  is_free: boolean;
  require_cbx_id: boolean;
}

export interface PlayerFormValues {
  full_name: string;
  fide_id?: string;
  cbx_id?: string;
  federation?: string;
  state?: string;
  city?: string;
  birth_year?: number;
  sex?: PlayerSex;
  rating_std?: number;
  rating_rpd?: number;
}

export interface PairingResultUpdate {
  pairing_id: string;
  result: GameResult;
}

// Chatbot de suporte (docs/plano-chatbot-suporte.md) — Fase 2 (bot) + Fase 3
// (escalonamento humano), só logado.
export type ChatSessionStatus = 'bot' | 'aguardando_humano' | 'humano' | 'encerrada';
export type ChatMessageRole = 'user' | 'assistant' | 'system';

export interface ChatSession {
  id: string;
  /** null = sessão anônima (visitante sem login) — migration 067, flag CHAT_ALLOW_ANONYMOUS. */
  user_id: string | null;
  tournament_id: string | null;
  status: ChatSessionStatus;
  escalated_at: string | null;
  contact_phone: string | null;
  last_message_at: string;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  session_id: string;
  role: ChatMessageRole;
  content: string;
  sources: { doc_slug: string; doc_title: string }[] | null;
  // true quando o admin digitou a mensagem em /admin/dev/chat (Fase 3) — só
  // pra você revisar o histórico depois; o widget do usuário nunca lê isso,
  // a mensagem sempre aparece como se fosse o Gambito (role='assistant' nos
  // dois casos).
  is_human: boolean;
  created_at: string;
}

// Log centralizado de erros não esperados (migration 053_error_logs.sql).
export type ErrorLogSource = 'client' | 'server' | 'api';

export interface ErrorLog {
  id: string;
  source: ErrorLogSource;
  message: string;
  stack: string | null;
  route: string | null;
  method: string | null;
  status_code: number | null;
  user_id: string | null;
  context: Record<string, unknown> | null;
  created_at: string;
}

// Pergunta que o Gambito não conseguiu responder (migration
// 055_unanswered_questions.sql) — registrada pela ferramenta
// registrar_pergunta_sem_resposta (lib/chat/tools.ts).
export interface UnansweredQuestion {
  id: string;
  session_id: string | null;
  user_id: string | null;
  question: string;
  created_at: string;
}

// Notícias (migration 059_news.sql) — conteúdo editorial publicado pelo
// painel dev (/admin/dev/noticias) e lido publicamente em /noticias.
export type NewsStatus = 'draft' | 'published';
/** Abrangência: estadual (com UF), nacional (Brasil) ou internacional. */
export type NewsScope = 'state' | 'national' | 'international';

export interface News {
  id: string;
  slug: string;
  title: string;
  summary: string | null;
  /** Markdown cru — renderizado sanitizado em components/news/markdown.tsx. */
  body_md: string;
  /** Path dentro do bucket news-covers, não a URL (ver lib/utils/news.ts). */
  cover_path: string | null;
  cover_alt: string | null;
  source_name: string | null;
  source_url: string | null;
  scope: NewsScope;
  /** UF — preenchida só quando scope='state' (check no banco garante). */
  state: string | null;
  status: NewsStatus;
  published_at: string | null;
  author_id: string | null;
  created_at: string;
  updated_at: string;
}

// ============================================================
// Séries de torneios (festivais / circuitos) — migrations 069/070
// ============================================================

export interface TournamentSeries {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  start_date: string | null;
  end_date: string | null;
  city: string | null;
  state: string | null;
  organizer_name: string | null;
  banner_url: string | null;
  status: SeriesStatus;
  /** Contrato da série: toda etapa precisa ter o mesmo valor. */
  classification_dimensions: ClassificationDimension[];
  has_absolute_classification: boolean;
  points_outside_table: number;
  tiebreak_order: SeriesTiebreakKey[];
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface SeriesPointsRule {
  id: string;
  series_id: string;
  place: number;
  points: number;
}

export interface SeriesTournament {
  id: string;
  series_id: string;
  tournament_id: string;
  label: string | null;
  sort_order: number;
  created_at: string;
}

export interface SeriesPointsAwarded {
  id: string;
  series_id: string;
  tournament_id: string;
  pairing_group_id: string | null;
  scope_key: string;
  scope_name: string;
  identity_key: string;
  player_id: string;
  place: number;
  points: number;
  chess_points: number;
}

/** Retorno de get_series_scopes. */
export interface SeriesScopeRow {
  scope_key: string;
  scope_name: string;
  events: number;
  players: number;
}

/** Retorno de get_series_standings. */
export interface SeriesStandingRow {
  rank: number;
  identity_key: string;
  player_id: string;
  full_name: string;
  federation: string | null;
  state: string | null;
  rating_std: number | null;
  points: number;
  events: number;
  best_place: number;
  chess_points: number;
}

/** Retorno de get_series_player_breakdown. */
export interface SeriesBreakdownRow {
  tournament_id: string;
  tournament_slug: string;
  tournament_name: string;
  label: string | null;
  start_date: string | null;
  pairing_group_name: string | null;
  place: number;
  points: number;
  chess_points: number;
}

/** scope_key do ranking transversal (não é uma tournament_categories). */
export const SERIES_ABSOLUTE_SCOPE = '__absoluto__';

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
      chat_sessions:        { Row: ChatSession;        Insert: Partial<Omit<ChatSession, 'id' | 'created_at'>> & { user_id: string }; Update: Partial<Omit<ChatSession, 'id'>>; };
      chat_messages:        { Row: ChatMessage;        Insert: Omit<ChatMessage, 'id' | 'created_at' | 'is_human'> & { is_human?: boolean }; Update: Partial<Omit<ChatMessage, 'id'>>; };
      error_logs:           { Row: ErrorLog;           Insert: Omit<ErrorLog, 'id' | 'created_at'>; Update: Partial<Omit<ErrorLog, 'id'>>; };
      unanswered_questions: { Row: UnansweredQuestion; Insert: Omit<UnansweredQuestion, 'id' | 'created_at'>; Update: Partial<Omit<UnansweredQuestion, 'id'>>; };
      news:                 { Row: News;               Insert: Partial<Omit<News, 'id' | 'created_at' | 'updated_at'>> & Pick<News, 'slug' | 'title' | 'scope'>; Update: Partial<Omit<News, 'id'>>; };
      tournament_series:    { Row: TournamentSeries;   Insert: Partial<Omit<TournamentSeries, 'id' | 'created_at' | 'updated_at'>> & Pick<TournamentSeries, 'slug' | 'name'>; Update: Partial<Omit<TournamentSeries, 'id'>>; };
      series_points_rules:  { Row: SeriesPointsRule;   Insert: Omit<SeriesPointsRule, 'id'>; Update: Partial<Omit<SeriesPointsRule, 'id'>>; };
      series_tournaments:   { Row: SeriesTournament;   Insert: Omit<SeriesTournament, 'id' | 'created_at'>; Update: Partial<Omit<SeriesTournament, 'id'>>; };
      // Escrita só pelas funções security definer da 070 — sem Insert/Update úteis.
      series_points_awarded:{ Row: SeriesPointsAwarded; Insert: never; Update: never; };
    };
    Functions: {
      recalculate_standings:        { Args: { p_tournament_id: string }; Returns: void; };
      get_tournament_standings:     { Args: { p_tournament_id: string }; Returns: StandingRow[]; };
      get_player_tournament_history:{ Args: { p_tournament_id: string; p_tp_id: string }; Returns: PlayerHistoryRow[]; };
      search_tournaments:           { Args: { p_query?: string; p_state?: string; p_status?: TournamentStatus; p_limit?: number; p_offset?: number }; Returns: TournamentListItem[]; };
      get_tournament_by_slug:       { Args: { p_slug: string }; Returns: Tournament; };
      get_round_pairings:           { Args: { p_round_id: string }; Returns: RoundPairingRow[]; };
      refresh_tournament_categories:{ Args: { p_tournament_id: string }; Returns: number; };
      match_kb_chunks:               { Args: { query_embedding: number[]; match_count?: number; min_similarity?: number }; Returns: { doc_slug: string; doc_title: string; content: string; similarity: number }[]; };
      add_tournament_to_series:      { Args: { p_series_id: string; p_tournament_id: string; p_label?: string | null; p_sort_order?: number | null }; Returns: string; };
      remove_tournament_from_series: { Args: { p_series_id: string; p_tournament_id: string }; Returns: void; };
      set_series_points_rules:       { Args: { p_series_id: string; p_rules: { place: number; points: number }[] }; Returns: number; };
      recalculate_series_standings:  { Args: { p_series_id: string }; Returns: number; };
      get_series_scopes:             { Args: { p_series_id: string }; Returns: SeriesScopeRow[]; };
      get_series_standings:          { Args: { p_series_id: string; p_scope_key: string }; Returns: SeriesStandingRow[]; };
      get_series_player_breakdown:   { Args: { p_series_id: string; p_identity_key: string; p_scope_key: string }; Returns: SeriesBreakdownRow[]; };
    };
    Enums: {
      user_role:                UserRole;
      tournament_status:        TournamentStatus;
      tournament_type:          TournamentType;
      round_status:             RoundStatus;
      game_result:              GameResult;
      player_tournament_status: PlayerTournamentStatus;
      chat_session_status:      ChatSessionStatus;
      series_status:            SeriesStatus;
    };
  };
}
