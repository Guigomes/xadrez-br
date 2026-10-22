// Torneios em que um relatório pode ser pedido: precisa haver ao menos uma
// partida do jogador com lances (PGN). Sem lances não há o que analisar.
// Só servidor (recebe o client service_role).

export interface ReportCandidate {
  kind: 'live' | 'history';
  tournamentId: string;
  playerId: string;
  name: string;
  startDate: string | null;
  games: number;
  pgnGames: number;
}

const chunk = <T,>(arr: T[], size: number): T[][] =>
  Array.from({ length: Math.ceil(arr.length / size) }, (_, i) => arr.slice(i * size, i * size + size));

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function loadReportCandidates(admin: any, playerIds: string[]): Promise<ReportCandidate[]> {
  if (!playerIds.length) return [];
  const out = new Map<string, ReportCandidate>();
  const bump = (c: Omit<ReportCandidate, 'games' | 'pgnGames'>, hasPgn: boolean) => {
    const key = `${c.kind}:${c.tournamentId}:${c.playerId}`;
    const cur = out.get(key) ?? { ...c, games: 0, pgnGames: 0 };
    cur.games += 1;
    if (hasPgn) cur.pgnGames += 1;
    out.set(key, cur);
  };

  // Ao vivo: inscrições do jogador -> mesas jogadas (sem bye) -> PGN da mesa.
  const { data: tps } = await admin
    .from('tournament_players').select('id, player_id, tournaments(id, name, start_date)').in('player_id', playerIds);
  const tpById = new Map<string, { player_id: string; tournaments: { id: string; name: string; start_date: string | null } | null }>(
    (tps ?? []).map((tp: { id: string }) => [tp.id, tp]));
  for (const ids of chunk([...tpById.keys()], 100)) {
    const list = ids.join(',');
    const { data: pairings } = await admin
      .from('pairings')
      .select('id, white_tp_id, black_tp_id, is_bye, pairing_pgns(pairing_id)')
      .or(`white_tp_id.in.(${list}),black_tp_id.in.(${list})`);
    for (const p of pairings ?? []) {
      if (p.is_bye) continue;
      for (const tpId of [p.white_tp_id, p.black_tp_id]) {
        const tp = tpId ? tpById.get(tpId) : undefined;
        if (!tp?.tournaments) continue;
        const hasPgn = Array.isArray(p.pairing_pgns) ? p.pairing_pgns.length > 0 : !!p.pairing_pgns;
        bump({ kind: 'live', tournamentId: tp.tournaments.id, playerId: tp.player_id, name: tp.tournaments.name, startDate: tp.tournaments.start_date }, hasPgn);
      }
    }
  }

  // Arquivo histórico: partidas jogadas -> PGN da partida.
  const ids = playerIds.join(',');
  const { data: games } = await admin
    .from('history_games')
    .select('id, tournament_id, white_player_id, black_player_id, history_game_pgns(game_id), history_tournaments(name, start_date)')
    .or(`white_player_id.in.(${ids}),black_player_id.in.(${ids})`);
  for (const g of games ?? []) {
    const hasPgn = Array.isArray(g.history_game_pgns) ? g.history_game_pgns.length > 0 : !!g.history_game_pgns;
    for (const pid of [g.white_player_id, g.black_player_id]) {
      if (!playerIds.includes(pid)) continue;
      bump({ kind: 'history', tournamentId: g.tournament_id, playerId: pid, name: g.history_tournaments?.name ?? 'Torneio', startDate: g.history_tournaments?.start_date ?? null }, hasPgn);
    }
  }

  return [...out.values()].sort((a, b) => String(b.startDate ?? '').localeCompare(String(a.startDate ?? '')));
}
