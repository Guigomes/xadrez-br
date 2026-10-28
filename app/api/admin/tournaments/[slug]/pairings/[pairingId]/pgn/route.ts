import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { normalizePgn } from '@/lib/pgn/normalize';

/**
 * PGN de uma mesa de torneio NATIVO, enviado pela organização (organizador, árbitro ou admin).
 * `pairing_pgns` não tem política de escrita (só o robô de importação grava, via service role), então
 * a autorização é feita aqui — usuário logado que gerencia o torneio (`is_tournament_manager`) — e a
 * gravação vai pelo cliente administrativo. Torneio importado continua só com o robô, que sobrescreveria
 * o PGN na próxima sincronização.
 */
async function authorize(slug: string, pairingId: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: NextResponse.json({ error: 'Não autenticado.' }, { status: 401 }) };

  const { data: tournament } = await supabase.from('tournaments').select('id, mode').eq('slug', slug).maybeSingle();
  if (!tournament) return { error: NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 }) };

  const { data: isManager } = await supabase.rpc('is_tournament_manager', { p_tournament_id: tournament.id });
  if (!isManager) return { error: NextResponse.json({ error: 'Sem permissão.' }, { status: 403 }) };
  if (tournament.mode !== 'native') {
    return { error: NextResponse.json({ error: 'Só torneios criados no Gambito aceitam PGN anexado.' }, { status: 409 }) };
  }

  const { data: pairing } = await supabase
    .from('pairings').select('id, is_bye, rounds(status)')
    .eq('id', pairingId).eq('tournament_id', tournament.id).maybeSingle();
  if (!pairing) return { error: NextResponse.json({ error: 'Mesa não encontrada.' }, { status: 404 }) };
  if (pairing.is_bye) return { error: NextResponse.json({ error: 'Mesa com bye não tem partida.' }, { status: 409 }) };
  const round = Array.isArray(pairing.rounds) ? pairing.rounds[0] : pairing.rounds;
  if (round?.status === 'draft') {
    return { error: NextResponse.json({ error: 'A rodada ainda é rascunho — publique antes de anexar o PGN.' }, { status: 409 }) };
  }
  return { error: null };
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; pairingId: string }> }
) {
  const { slug, pairingId } = await params;
  const auth = await authorize(slug, pairingId);
  if (auth.error) return auth.error;

  const body = await request.json().catch(() => null);
  const check = normalizePgn(body?.pgn);
  if (!check.ok) return NextResponse.json({ error: check.error }, { status: 400 });

  const { error } = await createAdminClient()
    .from('pairing_pgns')
    .upsert({ pairing_id: pairingId, pgn: check.pgn, source: 'manual' }, { onConflict: 'pairing_id' });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; pairingId: string }> }
) {
  const { slug, pairingId } = await params;
  const auth = await authorize(slug, pairingId);
  if (auth.error) return auth.error;

  const { error } = await createAdminClient().from('pairing_pgns').delete().eq('pairing_id', pairingId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
