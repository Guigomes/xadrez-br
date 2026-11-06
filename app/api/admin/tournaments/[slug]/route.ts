import { NextRequest, NextResponse } from 'next/server';
import { requireTournamentOwner } from '@/lib/api/guards';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  // Dono ou admin do sistema — o mesmo critério do RLS de tournaments (admin gerencia qualquer torneio).
  const gate = await requireTournamentOwner(slug);
  if (!gate.ok) return gate.response;

  const { error } = await gate.supabase
    .from('tournaments')
    .delete()
    .eq('id', gate.tournament.id);

  if (error) {
    // Trava do banco (migration 20261106120000): torneio com cobrança, pagamento ou
    // repasse não pode ser excluído — a mensagem já vem pronta para o organizador.
    if (error.hint === 'FINANCIAL_HISTORY') {
      return NextResponse.json({ error: error.message, code: 'FINANCIAL_HISTORY' }, { status: 409 });
    }
    console.error('[tournaments/delete]', error);
    return NextResponse.json({ error: 'Não foi possível excluir o torneio.' }, { status: 500 });
  }

  return NextResponse.json({ ok: true });
}
