import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { fetchCbxProfile } from '@/lib/cbx/profile';

const CACHE_DAYS = 30;

interface CbxRatingResult {
  ratingStd: number | null;
  ratingRpd: number | null;
  ratingBlz: number | null;
  checkedAt: string;
  fromCache: boolean;
  playerName: string | null;
}

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ playerId: string }> }
) {
  const { playerId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: player, error: fetchError } = await supabase
    .from('players')
    .select('cbx_id, cbx_rating_checked_at, rating_std, rating_rpd, rating_blz, full_name')
    .eq('id', playerId)
    .single();
  if (fetchError) return NextResponse.json({ error: `Erro ao buscar jogador: ${fetchError.message}` }, { status: 500 });
  if (!player) return NextResponse.json({ error: 'Jogador não encontrado.' }, { status: 404 });
  if (!player.cbx_id) return NextResponse.json({ error: 'Jogador sem ID CBX cadastrado.' }, { status: 400 });

  // Cache: só reconsulta a CBX depois de 30 dias — pedido explícito de não
  // bater no site deles toda hora, e clicar de novo no mesmo mês deve só
  // devolver o que já está salvo.
  if (player.cbx_rating_checked_at) {
    const ageMs = Date.now() - new Date(player.cbx_rating_checked_at).getTime();
    if (ageMs < CACHE_DAYS * 24 * 60 * 60 * 1000) {
      const result: CbxRatingResult = {
        ratingStd: player.rating_std,
        ratingRpd: player.rating_rpd,
        ratingBlz: player.rating_blz,
        checkedAt: player.cbx_rating_checked_at,
        fromCache: true,
        playerName: player.full_name,
      };
      return NextResponse.json(result);
    }
  }

  let cbx: Awaited<ReturnType<typeof fetchCbxProfile>>;
  try {
    cbx = await fetchCbxProfile(player.cbx_id);
  } catch (err) {
    const msg = (err as Error).name === 'AbortError'
      ? 'Tempo limite excedido ao conectar na CBX (10s).'
      : `Erro ao consultar a CBX: ${(err as Error).message}`;
    return NextResponse.json({ error: msg }, { status: 422 });
  }
  if (!cbx) {
    return NextResponse.json({ error: `ID CBX ${player.cbx_id} não encontrado no site da CBX.` }, { status: 404 });
  }

  const checkedAt = new Date().toISOString();
  const { error: updateError } = await supabase
    .from('players')
    .update({
      rating_std: cbx.ratingStd,
      rating_rpd: cbx.ratingRpd,
      rating_blz: cbx.ratingBlz,
      cbx_rating_checked_at: checkedAt,
    })
    .eq('id', playerId);
  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 403 });

  const result: CbxRatingResult = {
    ratingStd: cbx.ratingStd,
    ratingRpd: cbx.ratingRpd,
    ratingBlz: cbx.ratingBlz,
    checkedAt,
    fromCache: false,
    playerName: cbx.playerName,
  };
  return NextResponse.json(result);
}
