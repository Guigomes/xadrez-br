import { NextRequest, NextResponse } from 'next/server';
import { createClient, createAdminClient } from '@/lib/supabase/server';

/**
 * Botão "Dev: forçar sincronização" (aba Importações de um torneio importado,
 * visível só pra role='admin'). NÃO importa aqui: marca force_requested_at nas
 * linhas de tournament_imports do torneio e o robô cron-import — a única
 * implementação do importador — processa essas linhas primeiro na próxima
 * execução, mesmo desligadas ou com o torneio já encerrado.
 *
 * Antes este endpoint rodava uma cópia do importador (lib/import/) que tinha
 * ficado para trás: cortava a planilha em 150 linhas, não casava jogador pelo
 * ID CBX e não baixava PGN. Ver migration 20261022210000_import_force_request.
 */
export async function POST(request: NextRequest) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'Não autenticado.' }, { status: 401 });

  const { data: profile } = await supabase.from('user_profiles').select('role').eq('id', user.id).maybeSingle();
  if (profile?.role !== 'admin') {
    return NextResponse.json({ error: 'Restrito a administradores.' }, { status: 403 });
  }

  const { tournamentId } = await request.json().catch(() => ({}));
  if (!tournamentId || typeof tournamentId !== 'string') {
    return NextResponse.json({ error: 'tournamentId inválido.' }, { status: 400 });
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = createAdminClient() as any;
  const { data, error } = await admin
    .from('tournament_imports')
    .update({ force_requested_at: new Date().toISOString() })
    .eq('tournament_id', tournamentId)
    .select('id');
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data?.length) {
    return NextResponse.json({ error: 'Nenhuma importação configurada pra este torneio.' }, { status: 404 });
  }
  return NextResponse.json({ ok: true, queued: data.length });
}
