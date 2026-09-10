import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { POST as notifyInternalRound } from '@/app/api/internal/notify-round/route';

export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autorizado.' }, { status: 401 });

  const { data: round } = await supabase.from('rounds').select('tournament_id, status').eq('id', id).maybeSingle();
  if (!round) return NextResponse.json({ error: 'Rodada não encontrada.' }, { status: 404 });
  const { data: canManage } = await supabase.rpc('is_tournament_manager', { p_tournament_id: round.tournament_id });
  if (!canManage) return NextResponse.json({ error: 'Não autorizado.' }, { status: 403 });
  if (round.status !== 'ongoing') return NextResponse.json({ skipped: 'rodada ainda não publicada' });

  const secret = process.env.CRON_PUSH_SECRET;
  if (!secret) return NextResponse.json({ skipped: 'notificações não configuradas' });
  const delegated = new NextRequest(new URL('/api/internal/notify-round', request.url), {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-cron-secret': secret },
    body: JSON.stringify({ roundId: id }),
  });
  return notifyInternalRound(delegated);
}
