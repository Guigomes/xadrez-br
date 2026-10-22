import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';
import { parsePayoutInput } from '@/lib/finance/settlement';

// Registra um repasse feito ao organizador (acerto por fora, PIX/TED). Só admin:
// a policy tournament_payouts_write_admin barra os demais no banco — esta rota
// usa o cliente da sessão de propósito, sem service_role.

export async function POST(request: NextRequest, { params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const parsed = parsePayoutInput(await request.json().catch(() => ({})));
  if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 });

  const { data: tournament } = await supabase.from('tournaments').select('id').eq('slug', slug).maybeSingle();
  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase as any)
    .from('tournament_payouts')
    .insert({ tournament_id: tournament.id, created_by: user.id, ...parsed.value });
  if (error) {
    const forbidden = (error as { code?: string }).code === '42501';
    return NextResponse.json({ error: forbidden ? 'Só admin registra repasses.' : error.message }, { status: forbidden ? 403 : 500 });
  }
  return NextResponse.json({ ok: true });
}
