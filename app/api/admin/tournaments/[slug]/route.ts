import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;
  const supabase = await createClient();

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: tournament } = await supabase
    .from('tournaments')
    .select('id, created_by')
    .eq('slug', slug)
    .single();

  if (!tournament) return NextResponse.json({ error: 'Torneio não encontrado.' }, { status: 404 });
  if (tournament.created_by !== user.id) return NextResponse.json({ error: 'Sem permissão.' }, { status: 403 });

  const { error } = await supabase
    .from('tournaments')
    .delete()
    .eq('id', tournament.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
