'use client';

import { useQuery } from '@tanstack/react-query';
import type { SupabaseClient } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';
import type { HistoryRow } from '@/lib/player-history/types';

// As tabelas e funções do arquivo histórico ainda não estão em types/database.generated.ts;
// este módulo usa o cliente sem tipos do banco e declara o formato das linhas à mão.
const supabase = createClient() as unknown as SupabaseClient;

export const historyKeys = {
  all: ['history'] as const,
  player: (id: string) => [...historyKeys.all, 'player', id] as const,
  pgn: (source: string, id: string) => [...historyKeys.all, 'pgn', source, id] as const,
  tournaments: () => [...historyKeys.all, 'tournaments'] as const,
  tournament: (slug: string) => [...historyKeys.all, 'tournament', slug] as const,
  players: (id: string) => [...historyKeys.all, 'tournament-players', id] as const,
  games: (id: string) => [...historyKeys.all, 'games', id] as const,
  pgnIds: (id: string) => [...historyKeys.all, 'pgn-ids', id] as const,
};

/**
 * Histórico completo do jogador (todos os torneios, adversários, PGN disponível).
 * A função do banco recusa chamada sem login; por isso só roda com `enabled`.
 */
export function usePlayerHistory(playerId: string, enabled: boolean) {
  return useQuery({
    queryKey: historyKeys.player(playerId),
    enabled,
    staleTime: 300_000,
    queryFn: async (): Promise<HistoryRow[]> => {
      const { data, error } = await supabase.rpc('get_player_history', { p_player_id: playerId });
      if (error) throw error;
      return (data ?? []) as HistoryRow[];
    },
  });
}

/** Lances de uma partida (só logado: a tabela de PGN não é pública). */
export function useGamePgn(source: 'live' | 'history', gameId: string, enabled: boolean) {
  return useQuery({
    queryKey: historyKeys.pgn(source, gameId),
    enabled,
    staleTime: Infinity,
    queryFn: async (): Promise<string | null> => {
      const table = source === 'live' ? 'pairing_pgns' : 'history_game_pgns';
      const column = source === 'live' ? 'pairing_id' : 'game_id';
      const { data, error } = await supabase.from(table).select('pgn').eq(column, gameId).maybeSingle();
      if (error) throw error;
      return (data?.pgn as string | undefined) ?? null;
    },
  });
}

/** Quais mesas (torneio ao vivo/importado) têm lances. Só logado: a tabela de PGN não é pública. */
export function useLivePgnIds(pairingIds: string[], enabled: boolean) {
  const key = pairingIds.length ? `${pairingIds.length}:${pairingIds[0]}:${pairingIds[pairingIds.length - 1]}` : '';
  return useQuery({
    queryKey: [...historyKeys.all, 'live-pgn-ids', key],
    enabled: enabled && pairingIds.length > 0,
    staleTime: 60_000,
    queryFn: async (): Promise<Set<string>> => {
      const found = new Set<string>();
      for (let i = 0; i < pairingIds.length; i += 100) {
        const { data, error } = await supabase.from('pairing_pgns').select('pairing_id').in('pairing_id', pairingIds.slice(i, i + 100));
        if (error) throw error;
        for (const r of data ?? []) found.add((r as { pairing_id: string }).pairing_id);
      }
      return found;
    },
  });
}

// ---------------------------------------------------------------------------
// Arquivo histórico (torneios antigos, só com as partidas jogadas) — leitura pública
// ---------------------------------------------------------------------------

export interface HistoryTournament {
  id: string;
  slug: string;
  name: string;
  start_date: string;
  date_approx: boolean;
  end_date: string | null;
  time_control_kind: 'bullet' | 'blitz' | 'rapid' | 'classical' | 'other';
  homologated: boolean | null;
  city: string | null;
  state: string | null;
  organizer_name: string | null;
  groups: string[];
  source_tnrs: string[];
  source_url: string | null;
  players_count: number;
  games_count: number;
  pgn_count: number;
}

export function useHistoryTournaments() {
  return useQuery({
    queryKey: historyKeys.tournaments(),
    staleTime: 300_000,
    queryFn: async (): Promise<HistoryTournament[]> => {
      const { data, error } = await supabase
        .from('history_tournaments')
        .select('*')
        .order('start_date', { ascending: false })
        .limit(1000);
      if (error) throw error;
      return (data ?? []) as HistoryTournament[];
    },
  });
}

export function useHistoryTournament(slug: string) {
  return useQuery({
    queryKey: historyKeys.tournament(slug),
    staleTime: 300_000,
    queryFn: async (): Promise<HistoryTournament | null> => {
      const { data, error } = await supabase.from('history_tournaments').select('*').eq('slug', slug).maybeSingle();
      if (error) throw error;
      return (data as HistoryTournament | null) ?? null;
    },
  });
}

export interface HistoryTournamentPlayer {
  player_id: string | null;
  player_name: string;
  group_name: string | null;
  games: number;
  wins: number;
  draws: number;
  losses: number;
  points: number;
}

/** Desempenho de cada jogador no torneio: pontos só das partidas jogadas. */
export function useHistoryTournamentPlayers(tournamentId: string | undefined) {
  return useQuery({
    queryKey: historyKeys.players(tournamentId ?? ''),
    enabled: !!tournamentId,
    staleTime: 300_000,
    queryFn: async (): Promise<HistoryTournamentPlayer[]> => {
      const { data, error } = await supabase.rpc('get_history_tournament_players', { p_tournament_id: tournamentId });
      if (error) throw error;
      return ((data ?? []) as HistoryTournamentPlayer[]).map((r) => ({ ...r, points: Number(r.points) }));
    },
  });
}

export interface HistoryGame {
  id: string;
  group_name: string | null;
  round: number;
  white_player_id: string | null;
  black_player_id: string | null;
  white_name: string;
  black_name: string;
  white_rating: number | null;
  black_rating: number | null;
  result: string;
}

export function useHistoryGames(tournamentId: string | undefined) {
  return useQuery({
    queryKey: historyKeys.games(tournamentId ?? ''),
    enabled: !!tournamentId,
    staleTime: 300_000,
    queryFn: async (): Promise<HistoryGame[]> => {
      const out: HistoryGame[] = [];
      // o PostgREST devolve no máximo 1000 linhas por pedido
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('history_games')
          .select('id, group_name, round, white_player_id, black_player_id, white_name, black_name, white_rating, black_rating, result')
          .eq('tournament_id', tournamentId)
          .order('group_name', { nullsFirst: true })
          .order('round')
          .order('source_game_id')
          .range(from, from + 999);
        if (error) throw error;
        out.push(...((data ?? []) as HistoryGame[]));
        if (!data || data.length < 1000) break;
      }
      return out;
    },
  });
}

/** Quais partidas do torneio têm lances (só logado: a tabela de PGN não é pública). */
export function useHistoryPgnIds(tournamentId: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: historyKeys.pgnIds(tournamentId ?? ''),
    enabled: enabled && !!tournamentId,
    staleTime: 300_000,
    queryFn: async (): Promise<Set<string>> => {
      const ids = new Set<string>();
      for (let from = 0; ; from += 1000) {
        const { data, error } = await supabase
          .from('history_game_pgns')
          .select('game_id, history_games!inner(tournament_id)')
          .eq('history_games.tournament_id', tournamentId)
          .range(from, from + 999);
        if (error) throw error;
        for (const r of data ?? []) ids.add((r as { game_id: string }).game_id);
        if (!data || data.length < 1000) break;
      }
      return ids;
    },
  });
}
