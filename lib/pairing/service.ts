// Orquestra a geração de rodada: carrega estado do grupo no Supabase,
// serializa TRF(bx), roda a engine e grava o rascunho via RPC save_round_draft.
import type { SupabaseClient } from '@supabase/supabase-js';
import {
  serializeForPairing, serializeForExport,
  type TrfState, type TrfPlayer, type TrfGame, type TrfExportState, type TrfExportPlayer,
} from './trf/serialize';
import { parseEngineOutput } from './trf/parse-output';
import { runDutchPairing } from './engine';

export interface GenerateResult {
  roundId: string;
  roundNumber: number;
  boards: Array<{ board: number | null; whiteTp: string; blackTp: string | null; byeKind: string | null }>;
}

export class GenerateError extends Error {
  constructor(public code: string, message: string) { super(message); }
}

export async function generateRoundDraft(
  supabase: SupabaseClient,
  tournamentSlug: string,
  groupId: string,
  roundNumber?: number,
): Promise<GenerateResult> {
  const { data: t, error: tErr } = await supabase
    .from('tournaments').select('*').eq('slug', tournamentSlug).single();
  if (tErr || !t) throw new GenerateError('NOT_FOUND', 'Torneio não encontrado');
  if (t.mode !== 'native') throw new GenerateError('NOT_NATIVE', 'Torneio não é nativo');

  const { data: group } = await supabase
    .from('pairing_groups').select('*').eq('id', groupId).eq('tournament_id', t.id).single();
  if (!group) throw new GenerateError('NOT_FOUND', 'Grupo não encontrado');

  const { data: rounds } = await supabase
    .from('rounds').select('id, round_number, status')
    .eq('pairing_group_id', groupId).order('round_number');

  const finished = (rounds ?? []).filter((r) => r.status === 'finished');
  const target = roundNumber ?? finished.length + 1;

  const { data: tps } = await supabase
    .from('tournament_players')
    .select('id, initial_ranking, status, joined_at_round, players(full_name, sex, fide_id, birth_year, federation, rating_std, rating_rpd, rating_blz)')
    .eq('pairing_group_id', groupId);
  if (!tps?.length) throw new GenerateError('NO_PLAYERS', 'Grupo sem jogadores');

  const players: TrfPlayer[] = tps.map((tp: any) => ({
    tpId: tp.id,
    startno: tp.initial_ranking ?? 0,
    fullName: tp.players.full_name,
    sex: tp.players.sex,
    rating: tp.players[`rating_${t.rating_kind}`] ?? null,
    federation: tp.players.federation,
    fideId: tp.players.fide_id,
    birthYear: tp.players.birth_year,
    status: tp.status,
    joinedAtRound: tp.joined_at_round ?? 1,
  }));
  if (players.some((p) => !p.startno)) {
    throw new GenerateError('NO_RANKING', 'Jogadores sem ranking inicial — gere o seed do grupo antes de parear.');
  }

  const priorRoundIds = (rounds ?? []).filter((r) => r.round_number < target).map((r) => r.id);
  const roundNumberById = new Map((rounds ?? []).map((r) => [r.id, r.round_number]));
  let games: TrfGame[] = [];
  if (priorRoundIds.length) {
    const { data: pairings } = await supabase
      .from('pairings')
      .select('round_id, white_tp_id, black_tp_id, result, is_bye, bye_kind, white_points, black_points')
      .in('round_id', priorRoundIds);
    games = (pairings ?? []).map((p: any) => ({
      roundNumber: roundNumberById.get(p.round_id)!,
      whiteTpId: p.white_tp_id,
      blackTpId: p.black_tp_id,
      result: p.result,
      isBye: p.is_bye,
      byeKind: p.bye_kind,
      whitePoints: p.white_points,
      blackPoints: p.black_points,
    }));
  }

  const { data: byes } = await supabase
    .from('requested_byes').select('tp_id')
    .eq('tournament_id', t.id).eq('round_number', target);

  const state: TrfState = {
    tournamentName: `${t.name} - ${group.name}`,
    roundsTotal: group.rounds_count ?? t.rounds_count,
    initialColor: t.initial_color,
    requestedByeScore: Number(t.requested_bye_score),
    targetRound: target,
    players,
    games,
    requestedByeTpIds: new Set((byes ?? []).map((b: any) => b.tp_id)),
  };

  const trf = serializeForPairing(state);
  const engine = await runDutchPairing(trf);
  if (!engine.ok) {
    const msgs: Record<string, string> = {
      NO_VALID_PAIRING: 'Não existe pareamento válido (todos já se enfrentaram?). Considere reduzir o número de rodadas do grupo.',
      INVALID_INPUT: 'Estado do torneio inconsistente para a engine.',
      SIZE_LIMIT: 'Torneio excede os limites da engine.',
      ENGINE_ERROR: 'Erro inesperado na engine de pareamento.',
    };
    throw new GenerateError(engine.code, `${msgs[engine.code]} (${engine.detail})`.trim());
  }

  const tpByStartno = new Map(players.map((p) => [p.startno, p.tpId]));
  const pairs = parseEngineOutput(engine.output);

  const boards: GenerateResult['boards'] = pairs.map((pair, i) => ({
    board: pair.black === null ? null : i + 1,
    whiteTp: tpByStartno.get(pair.white)!,
    blackTp: pair.black === null ? null : tpByStartno.get(pair.black)!,
    byeKind: pair.black === null ? 'pairing' : null,
  }));
  // byes solicitados viram linhas no rascunho
  for (const tpId of state.requestedByeTpIds) {
    const p = players.find((x) => x.tpId === tpId);
    if (p?.status === 'active' && p.joinedAtRound <= target) {
      boards.push({ board: null, whiteTp: tpId, blackTp: null,
        byeKind: state.requestedByeScore === 0.5 ? 'requested_half' : 'requested_zero' });
    }
  }

  const payload = boards.map((b) => ({
    board: b.board,
    white_tp: b.whiteTp,
    black_tp: b.blackTp,
    bye_kind: b.byeKind,
    points_w: b.byeKind === 'pairing' ? 1.0
      : b.byeKind === 'requested_half' ? 0.5
      : b.byeKind ? 0.0 : null,
    points_b: null,
  }));

  const { data: roundId, error: rpcErr } = await supabase.rpc('save_round_draft', {
    p_group_id: groupId,
    p_round_number: target,
    p_pairings: payload,
  });
  if (rpcErr) throw new GenerateError('SAVE_FAILED', rpcErr.message);

  return { roundId: roundId as string, roundNumber: target, boards };
}

/**
 * Gera o TRF completo de um grupo para homologação (RF-9 / F10).
 * Inclui todas as rodadas finalizadas, ranking final e cabeçalhos FIDE.
 */
export async function exportGroupTrf(
  supabase: SupabaseClient,
  tournamentSlug: string,
  groupId: string,
): Promise<{ filename: string; trf: string }> {
  const { data: t } = await supabase
    .from('tournaments').select('*').eq('slug', tournamentSlug).single();
  if (!t) throw new GenerateError('NOT_FOUND', 'Torneio não encontrado');

  const { data: group } = await supabase
    .from('pairing_groups').select('*').eq('id', groupId).eq('tournament_id', t.id).single();
  if (!group) throw new GenerateError('NOT_FOUND', 'Grupo não encontrado');

  const { data: rounds } = await supabase
    .from('rounds').select('id, round_number, status')
    .eq('pairing_group_id', groupId).order('round_number');
  const finished = (rounds ?? []).filter((r) => r.status === 'finished');
  const lastRound = finished.length ? Math.max(...finished.map((r) => r.round_number)) : 0;
  const finishedIds = finished.map((r) => r.id);
  const numberById = new Map((rounds ?? []).map((r) => [r.id, r.round_number]));

  const { data: tps } = await supabase
    .from('tournament_players')
    .select('id, initial_ranking, status, joined_at_round, players(full_name, sex, fide_id, birth_year, federation, rating_std, rating_rpd, rating_blz)')
    .eq('pairing_group_id', groupId);
  if (!tps?.length) throw new GenerateError('NO_PLAYERS', 'Grupo sem jogadores');

  const { data: standings } = await supabase
    .from('standings').select('tournament_player_id, rank').eq('tournament_id', t.id);
  const rankByTp = new Map((standings ?? []).map((s: any) => [s.tournament_player_id, s.rank]));

  const players: TrfExportPlayer[] = tps.map((tp: any) => ({
    tpId: tp.id,
    startno: tp.initial_ranking ?? 0,
    fullName: tp.players.full_name,
    sex: tp.players.sex,
    rating: tp.players[`rating_${t.rating_kind}`] ?? null,
    federation: tp.players.federation,
    fideId: tp.players.fide_id,
    birthYear: tp.players.birth_year,
    status: tp.status,
    joinedAtRound: tp.joined_at_round ?? 1,
    rank: rankByTp.get(tp.id) ?? null,
  }));
  if (players.some((p) => !p.startno)) {
    throw new GenerateError('NO_RANKING', 'Jogadores sem ranking inicial — gere o seed do grupo.');
  }

  let games: TrfGame[] = [];
  if (finishedIds.length) {
    const { data: pairings } = await supabase
      .from('pairings')
      .select('round_id, white_tp_id, black_tp_id, result, is_bye, bye_kind, white_points, black_points')
      .in('round_id', finishedIds);
    games = (pairings ?? []).map((p: any) => ({
      roundNumber: numberById.get(p.round_id)!,
      whiteTpId: p.white_tp_id,
      blackTpId: p.black_tp_id,
      result: p.result,
      isBye: p.is_bye,
      byeKind: p.bye_kind,
      whitePoints: p.white_points,
      blackPoints: p.black_points,
    }));
  }

  const state: TrfExportState = {
    tournamentName: `${t.name} - ${group.name}`,
    city: t.city,
    federation: 'BRA',
    startDate: t.start_date,
    endDate: t.end_date,
    chiefArbiter: t.chief_arbiter,
    timeControl: t.time_control,
    roundsTotal: group.rounds_count ?? t.rounds_count,
    initialColor: t.initial_color,
    lastRound,
    players,
    games,
  };

  const slug = `${tournamentSlug}-${group.name}`.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
  return { filename: `${slug}.trf`, trf: serializeForExport(state) };
}
