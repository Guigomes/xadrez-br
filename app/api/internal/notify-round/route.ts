import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import {
  sendPlayerFollowersNotification,
  sendTournamentNotificationToNonFollowers,
} from '@/lib/push';
import {
  allResultsFinishedEventKey,
  allRoundsStartedEventKey,
  categoryKey,
  groupRoundStartedEventKey,
  isFinalResult,
  playerResultEventKey,
  resultNotificationBody,
  summarizeCategoryRounds,
} from '@/lib/tournament-notifications';
import { todayInSaoPaulo } from '@/lib/utils/chess';

type AdminClient = ReturnType<typeof createAdminClient>;
type NotificationEventType =
  | 'group_round_started'
  | 'all_rounds_started'
  | 'player_result'
  | 'all_results_finished';

interface PairingRow {
  board_number: number | null;
  white_tp_id: string | null;
  black_tp_id: string | null;
  result: string;
}

interface TournamentInfo {
  name: string;
  slug: string;
  is_public: boolean;
  status: string;
  start_date: string | null;
  end_date: string | null;
}

async function claimEvent(
  admin: AdminClient,
  event: {
    tournamentId: string;
    pairingGroupId: string | null;
    roundNumber: number;
    type: NotificationEventType;
    key: string;
  },
): Promise<boolean> {
  const { error } = await admin.from('push_notification_events').insert({
    tournament_id: event.tournamentId,
    pairing_group_id: event.pairingGroupId,
    round_number: event.roundNumber,
    event_type: event.type,
    event_key: event.key,
  });

  if (!error) return true;
  if (error.code === '23505') return false;
  throw new Error(`Falha ao registrar evento de push: ${error.message}`);
}

async function getRoundSummary(
  admin: AdminClient,
  tournamentId: string,
  roundNumber: number,
) {
  const [
    { data: groups, error: groupsError },
    { data: activePlayers, error: playersError },
    { data: imports, error: importsError },
  ] = await Promise.all([
    admin.from('pairing_groups').select('id, name').eq('tournament_id', tournamentId),
    admin
      .from('tournament_players')
      .select('pairing_group_id')
      .eq('tournament_id', tournamentId)
      .eq('status', 'active'),
    admin
      .from('tournament_imports')
      .select('pairing_group_name, discovered_rounds_count')
      .eq('tournament_id', tournamentId)
      .eq('enabled', true),
  ]);
  if (groupsError) throw groupsError;
  if (playersError) throw playersError;
  if (importsError) throw importsError;

  const activeCategoryKeys = new Set(
    (activePlayers ?? []).map((player) => categoryKey(player.pairing_group_id)),
  );
  let expectedCategoryKeys: string[];
  if (imports?.length) {
    const eligibleImports = imports.filter((item) =>
      item.discovered_rounds_count != null && item.discovered_rounds_count > 0
    );
    if (imports.some((item) => item.discovered_rounds_count == null) || !eligibleImports.length) {
      return { allStarted: false, allFinished: false, categoryCount: eligibleImports.length };
    }

    const groupsByName = new Map(
      (groups ?? []).map((group) => [group.name.trim().toLocaleLowerCase('pt-BR'), group.id]),
    );
    expectedCategoryKeys = [...new Set(eligibleImports.map((item) => {
      if (!item.pairing_group_name) return categoryKey(null);
      const normalizedName = item.pairing_group_name.trim().toLocaleLowerCase('pt-BR');
      return groupsByName.get(normalizedName) ?? `__missing__:${normalizedName}`;
    }))];
  } else {
    expectedCategoryKeys = activeCategoryKeys.size
      ? [...activeCategoryKeys]
      : groups?.length
        ? groups.map((group) => categoryKey(group.id))
        : [categoryKey(null)];
  }

  const { data: rounds, error: roundsError } = await admin
    .from('rounds')
    .select('id, pairing_group_id, status')
    .eq('tournament_id', tournamentId)
    .eq('round_number', roundNumber);
  if (roundsError) throw roundsError;

  const roundIds = (rounds ?? []).map((round) => round.id);
  const { data: pairings, error: pairingsError } = roundIds.length
    ? await admin.from('pairings').select('round_id, result').in('round_id', roundIds)
    : { data: [], error: null };
  if (pairingsError) throw pairingsError;

  const pairingsByRound = new Map<string, string[]>();
  for (const pairing of pairings ?? []) {
    const results = pairingsByRound.get(pairing.round_id) ?? [];
    results.push(pairing.result);
    pairingsByRound.set(pairing.round_id, results);
  }
  return summarizeCategoryRounds(
    expectedCategoryKeys,
    (rounds ?? []).map((round) => ({
      categoryKey: categoryKey(round.pairing_group_id),
      status: round.status,
      results: pairingsByRound.get(round.id) ?? [],
    })),
  );
}

function tournamentSkipReason(tournament: TournamentInfo): string | null {
  if (!tournament.is_public || tournament.status === 'draft') {
    return 'torneio não é público (rascunho ou privado)';
  }
  if (tournament.status !== 'ongoing') {
    const eventDate = tournament.end_date ?? tournament.start_date;
    if (eventDate && eventDate < todayInSaoPaulo()) {
      return 'torneio já encerrado por data — provável reimportação histórica';
    }
  }
  return null;
}

async function sendTournamentSummaryEvents(
  admin: AdminClient,
  tournamentId: string,
  tournament: TournamentInfo,
) {
  const { data: rounds, error } = await admin
    .from('rounds')
    .select('round_number')
    .eq('tournament_id', tournamentId)
    .in('status', ['ongoing', 'finished']);
  if (error) throw error;

  const roundNumbers = [...new Set((rounds ?? []).map((round) => round.round_number))].sort((a, b) => a - b);
  let allRoundsStarted = 0;
  let allResultsFinished = 0;

  for (const roundNumber of roundNumbers) {
    const summary = await getRoundSummary(admin, tournamentId, roundNumber);
    const roundUrl = `/torneios/${tournament.slug}/rounds/${roundNumber}`;

    if (summary.allStarted && await claimEvent(admin, {
      tournamentId,
      pairingGroupId: null,
      roundNumber,
      type: 'all_rounds_started',
      key: allRoundsStartedEventKey(tournamentId, roundNumber),
    })) {
      allRoundsStarted++;
      await sendTournamentNotificationToNonFollowers(tournamentId, {
        title: tournament.name,
        body: `Rodada ${roundNumber} iniciada em todas as ${summary.categoryCount} categorias.`,
        url: roundUrl,
      }).catch((sendError) => console.error('[notify-round] início global:', sendError));
    }

    if (summary.allFinished && await claimEvent(admin, {
      tournamentId,
      pairingGroupId: null,
      roundNumber,
      type: 'all_results_finished',
      key: allResultsFinishedEventKey(tournamentId, roundNumber),
    })) {
      allResultsFinished++;
      await sendTournamentNotificationToNonFollowers(tournamentId, {
        title: tournament.name,
        body: `Rodada ${roundNumber} concluída · resultados das ${summary.categoryCount} categorias publicados.`,
        url: roundUrl,
      }).catch((sendError) => console.error('[notify-round] conclusão global:', sendError));
    }
  }

  return { allRoundsStarted, allResultsFinished };
}

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_PUSH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_PUSH_SECRET não configurado no servidor.' }, { status: 500 });
  }
  if (request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { roundId, tournamentId: summaryTournamentId } = await request.json().catch(() => ({}));
  const admin = createAdminClient();

  if (summaryTournamentId && typeof summaryTournamentId === 'string' && !roundId) {
    const { data: tournament, error } = await admin
      .from('tournaments')
      .select('name, slug, is_public, status, start_date, end_date')
      .eq('id', summaryTournamentId)
      .maybeSingle();
    if (error) throw error;
    if (!tournament) {
      return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
    }
    const skipped = tournamentSkipReason(tournament);
    if (skipped) return NextResponse.json({ skipped });

    const events = await sendTournamentSummaryEvents(admin, summaryTournamentId, tournament);
    return NextResponse.json({ ok: true, tournamentId: summaryTournamentId, events });
  }

  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId inválido.' }, { status: 400 });
  }

  const { data: round, error: roundError } = await admin
    .from('rounds')
    .select('id, round_number, tournament_id, pairing_group_id, status')
    .eq('id', roundId)
    .maybeSingle();
  if (roundError) throw roundError;
  if (!round) {
    return NextResponse.json({ error: 'Rodada não encontrada.' }, { status: 404 });
  }

  const roundNumber = round.round_number;
  const tournamentId = round.tournament_id;
  const pairingGroupId = round.pairing_group_id;

  const [{ data: tournament }, { data: pairingGroup }, { data: pairings, error: pairingsError }] = await Promise.all([
    admin
      .from('tournaments')
      .select('name, slug, is_public, status, start_date, end_date')
      .eq('id', tournamentId)
      .single(),
    pairingGroupId
      ? admin.from('pairing_groups').select('name').eq('id', pairingGroupId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    admin
      .from('pairings')
      .select('white_tp_id, black_tp_id, board_number, result')
      .eq('round_id', roundId),
  ]);
  if (!tournament) {
    return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  }
  if (pairingsError) throw pairingsError;

  const skipped = tournamentSkipReason(tournament);
  if (skipped) return NextResponse.json({ skipped });

  const inserted = (pairings ?? []) as PairingRow[];
  if (!inserted.length || (round.status !== 'ongoing' && round.status !== 'finished')) {
    return NextResponse.json({ skipped: 'rodada ainda não publicada' });
  }

  const categoryName = pairingGroup?.name ?? 'Categoria geral';
  const roundUrl = `/torneios/${tournament.slug}/rounds/${roundNumber}`;
  const allTpIds = [...new Set(inserted.flatMap((pairing) =>
    [pairing.white_tp_id, pairing.black_tp_id].filter(Boolean) as string[]
  ))];

  const [{ data: pairedPlayers, error: pairedPlayersError }, { data: categoryPlayers, error: categoryPlayersError }] = await Promise.all([
    allTpIds.length
      ? admin
          .from('tournament_players')
          .select('id, player_id, players(full_name)')
          .in('id', allTpIds)
      : Promise.resolve({ data: [], error: null }),
    (() => {
      let query = admin
        .from('tournament_players')
        .select('player_id')
        .eq('tournament_id', tournamentId)
        .eq('status', 'active');
      query = pairingGroupId
        ? query.eq('pairing_group_id', pairingGroupId)
        : query.is('pairing_group_id', null);
      return query;
    })(),
  ]);
  if (pairedPlayersError) throw pairedPlayersError;
  if (categoryPlayersError) throw categoryPlayersError;

  const tpMap = new Map((pairedPlayers ?? []).map((tp) => [
    tp.id,
    {
      playerId: tp.player_id,
      name: (tp.players as unknown as { full_name?: string } | null)?.full_name ?? 'Jogador',
    },
  ]));

  let groupRoundStarted = false;
  if (await claimEvent(admin, {
    tournamentId,
    pairingGroupId,
    roundNumber,
    type: 'group_round_started',
    key: groupRoundStartedEventKey(roundId),
  })) {
    groupRoundStarted = true;
    await sendPlayerFollowersNotification(
      tournamentId,
      (categoryPlayers ?? []).map((player) => player.player_id),
      {
        title: tournament.name,
        body: `Rodada ${roundNumber} iniciada · ${categoryName}`,
        url: roundUrl,
      },
    ).catch((error) => console.error('[notify-round] seguidores da categoria:', error));
  }

  let playerResults = 0;
  for (const pairing of inserted) {
    if (!isFinalResult(pairing.result)) continue;

    const key = playerResultEventKey({
      roundId,
      boardNumber: pairing.board_number,
      whiteTpId: pairing.white_tp_id,
      blackTpId: pairing.black_tp_id,
      result: pairing.result,
    });
    if (!await claimEvent(admin, {
      tournamentId,
      pairingGroupId,
      roundNumber,
      type: 'player_result',
      key,
    })) continue;

    const white = pairing.white_tp_id ? tpMap.get(pairing.white_tp_id) : null;
    const black = pairing.black_tp_id ? tpMap.get(pairing.black_tp_id) : null;
    const playerIds = [white?.playerId, black?.playerId].filter(Boolean) as string[];
    if (!playerIds.length) continue;

    playerResults++;
    await sendPlayerFollowersNotification(tournamentId, playerIds, {
      title: tournament.name,
      body: `${categoryName} · ${resultNotificationBody(pairing.result, white?.name ?? 'Jogador', black?.name ?? null)}`,
      url: roundUrl,
    }).catch((error) => console.error('[notify-round] resultado de jogador:', error));
  }

  return NextResponse.json({
    ok: true,
    roundNumber,
    category: categoryName,
    events: { groupRoundStarted, playerResults },
  });
}
