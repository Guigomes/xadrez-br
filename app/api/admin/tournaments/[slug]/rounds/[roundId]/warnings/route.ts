import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { computeWarnings, type HistoryGame, type DraftBoard } from '@/lib/pairing/warnings';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ slug: string; roundId: string }> },
) {
  const { roundId } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado' }, { status: 401 });

  const { data: round } = await supabase
    .from('rounds').select('id, round_number, pairing_group_id, tournament_id')
    .eq('id', roundId).single();
  if (!round) return NextResponse.json({ error: 'Rodada não encontrada' }, { status: 404 });

  const { data: rounds } = await supabase
    .from('rounds').select('id, round_number')
    .eq('pairing_group_id', round.pairing_group_id);
  const numberById = new Map((rounds ?? []).map((r) => [r.id, r.round_number]));
  const priorIds = (rounds ?? [])
    .filter((r) => r.round_number < round.round_number).map((r) => r.id);

  let history: HistoryGame[] = [];
  if (priorIds.length) {
    const { data } = await supabase
      .from('pairings')
      .select('round_id, white_tp_id, black_tp_id, result, is_bye, bye_kind, white_points, black_points')
      .in('round_id', priorIds);
    history = (data ?? []).map((p: any) => ({
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

  const { data: draftRows } = await supabase
    .from('pairings')
    .select('id, board_number, white_tp_id, black_tp_id, bye_kind, manual_override')
    .eq('round_id', roundId);
  const draft: DraftBoard[] = (draftRows ?? []).map((p: any) => ({
    pairingId: p.id,
    board: p.board_number,
    whiteTpId: p.white_tp_id,
    blackTpId: p.black_tp_id,
    byeKind: p.bye_kind,
    manualOverride: p.manual_override,
  }));

  return NextResponse.json({ warnings: computeWarnings(history, draft) });
}
