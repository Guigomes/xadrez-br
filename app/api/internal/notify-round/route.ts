import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { sendTournamentNotification, notifyPlayerFollowers } from '@/lib/push';
import { todayInSaoPaulo } from '@/lib/utils/chess';

// Rota service-to-service: o worker cron-import chama aqui quando publica uma
// rodada de torneio importado, para disparar o push (que só existe no app).
// Autenticada por segredo compartilhado (CRON_PUSH_SECRET), não por sessão de
// usuário. Mantém a lógica de push numa fonte única — mesma de import-pairings.
//
// Dedup: o carimbo rounds.notified_at é reivindicado de forma atômica (update
// ... where notified_at is null). Só o primeiro chamador envia; chamadas
// repetidas do cron (roda a cada 2 min) saem sem reenviar.
//
// Duas guardas além do dedup, adicionadas depois que a importação de um
// torneio de meses atrás (Festival Estadual da Criança e Juventude,
// 11/04/2026) quase disparou push de "rodada publicada" pra quem segue esses
// jogadores — só não disparou porque a rede falhou no ambiente que rodou o
// import manualmente. O worker cria as 6 rodadas de uma vez, todas já
// 'finished', e cada uma passa pelo mesmo caminho de "publicação" que uma
// rodada ao vivo:
//  1. Torneio precisa estar visível ao público (is_public && status ≠ draft)
//     — sem isso a notificação aponta pra algo que ninguém consegue abrir.
//  2. A data do torneio (end_date, ou start_date se não houver fim) não pode
//     já ter passado — push de "rodada publicada" só faz sentido pra evento
//     que está acontecendo. Reimportação de torneio antigo é o caso normal
//     de quem usa este worker (chess-results não muda depois de encerrado),
//     então isso não é uma checagem defensiva rara.

export async function POST(request: NextRequest) {
  const secret = process.env.CRON_PUSH_SECRET;
  if (!secret) {
    return NextResponse.json({ error: 'CRON_PUSH_SECRET não configurado no servidor.' }, { status: 500 });
  }
  if (request.headers.get('x-cron-secret') !== secret) {
    return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });
  }

  const { roundId } = await request.json().catch(() => ({}));
  if (!roundId || typeof roundId !== 'string') {
    return NextResponse.json({ error: 'roundId inválido.' }, { status: 400 });
  }

  const admin = createAdminClient();

  // Claim atômico do direito de notificar esta rodada.
  const { data: claimed } = await admin
    .from('rounds')
    .update({ notified_at: new Date().toISOString() })
    .eq('id', roundId)
    .is('notified_at', null)
    .select('id, round_number, tournament_id')
    .maybeSingle();

  if (!claimed) {
    return NextResponse.json({ skipped: 'já notificada ou inexistente' });
  }

  const roundNumber = claimed.round_number as number;
  const tournamentId = claimed.tournament_id as string;

  const { data: t } = await admin
    .from('tournaments')
    .select('name, slug, is_public, status, start_date, end_date')
    .eq('id', tournamentId)
    .single();
  if (!t) {
    return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  }

  if (!t.is_public || t.status === 'draft') {
    return NextResponse.json({ skipped: 'torneio não é público (rascunho ou privado)' });
  }
  // status='ongoing' já É a fonte de verdade de "está acontecendo agora" —
  // a regra automática por data (next_status_by_date, migration 040) é quem
  // decide essa transição, não este endpoint. Um torneio de vários dias sem
  // end_date preenchido (ex.: festival em Dourados) cairia como "encerrado"
  // se comparasse só start_date contra hoje — por isso o corte por data só
  // entra quando o torneio NÃO está ongoing (é aí que "a data já passou"
  // denuncia reimportação histórica, não falta de end_date).
  if (t.status !== 'ongoing') {
    const eventDate = t.end_date ?? t.start_date;
    if (eventDate && eventDate < todayInSaoPaulo()) {
      return NextResponse.json({ skipped: 'torneio já encerrado por data — provável reimportação histórica' });
    }
  }

  const roundUrl = `/tournaments/${t.slug}/rounds/${roundNumber}`;

  // round_id já é por grupo — pega só os emparceiramentos desta rodada/grupo.
  const { data: pairings } = await admin
    .from('pairings')
    .select('white_tp_id, black_tp_id, board_number, is_bye')
    .eq('round_id', roundId);

  const inserted = (pairings ?? []) as Array<{
    white_tp_id: string;
    black_tp_id: string | null;
    board_number: number | null;
    is_bye: boolean;
  }>;

  const allTpIds = [
    ...new Set(inserted.flatMap((p) => [p.white_tp_id, p.black_tp_id].filter(Boolean) as string[])),
  ];
  const { data: tpNames } = await admin
    .from('tournament_players')
    .select('id, players(full_name)')
    .in('id', allTpIds);
  const nameMap = new Map((tpNames ?? []).map((tp) => [tp.id, (tp as any).players?.full_name ?? '']));

  const notifyPlayers = inserted.flatMap((p) => {
    const entries: Array<{ tpId: string; makePayload: (n: string) => { title: string; body: string; url?: string } }> = [];
    const board = p.board_number ? ` · Tabuleiro ${p.board_number}` : '';
    if (p.white_tp_id) {
      entries.push({
        tpId: p.white_tp_id,
        makePayload: () => ({
          title: t.name,
          body: p.is_bye
            ? `Rodada ${roundNumber}: ${nameMap.get(p.white_tp_id)} recebe BYE`
            : `Rodada ${roundNumber}${board}: ${nameMap.get(p.white_tp_id)} (Brancas) × ${nameMap.get(p.black_tp_id!) ?? '?'}`,
          url: roundUrl,
        }),
      });
    }
    if (p.black_tp_id) {
      entries.push({
        tpId: p.black_tp_id,
        makePayload: () => ({
          title: t.name,
          body: `Rodada ${roundNumber}${board}: ${nameMap.get(p.black_tp_id!)} (Pretas) × ${nameMap.get(p.white_tp_id)}`,
          url: roundUrl,
        }),
      });
    }
    return entries;
  });

  await Promise.all([
    sendTournamentNotification(tournamentId, {
      title: t.name,
      body: `Rodada ${roundNumber} publicada — ${inserted.length} emparceiramentos`,
      url: roundUrl,
    }).catch((e) => console.error('[notify-round] tournament push:', e)),
    notifyPlayerFollowers(tournamentId, notifyPlayers).catch((e) =>
      console.error('[notify-round] followers push:', e)
    ),
  ]);

  return NextResponse.json({ ok: true, roundNumber, pairings: inserted.length });
}
