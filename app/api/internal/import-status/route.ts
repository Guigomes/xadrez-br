import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireCronSecret } from '@/lib/api/guards';
import { sendOperatorNotification } from '@/lib/push';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/**
 * Chamado pelo worker cron-import quando a sincronização de um torneio importado
 * QUEBRA (status 'error') ou VOLTA a funcionar ('recovered'). Avisa só o desenvolvedor
 * (perfil admin), por push, com o motivo — o público não vê mais o aviso de erro na
 * página do torneio. O worker só chama na mudança de estado (ou quando o motivo muda),
 * então não chega um push a cada 2 minutos.
 *
 * Autenticação: mesmo segredo da notificação de rodada (x-cron-secret = CRON_PUSH_SECRET).
 */
export async function POST(request: NextRequest) {
  const denied = requireCronSecret(request);
  if (denied) return denied;

  const body = await request.json().catch(() => null);
  const tournamentId = typeof body?.tournamentId === 'string' ? body.tournamentId : '';
  const status = body?.status === 'recovered' ? 'recovered' : body?.status === 'error' ? 'error' : null;
  const message = typeof body?.message === 'string' ? body.message.trim().slice(0, 300) : '';
  const groupName = typeof body?.groupName === 'string' && body.groupName ? body.groupName : null;
  if (!tournamentId || !status) {
    return NextResponse.json({ error: 'Dados inválidos.' }, { status: 400 });
  }

  const admin = createAdminClient();
  const { data: tournament } = await admin
    .from('tournaments')
    .select('name, slug')
    .eq('id', tournamentId)
    .maybeSingle();
  const name = tournament?.name ?? 'Torneio importado';
  const where = groupName ? `${name} (${groupName})` : name;

  await sendOperatorNotification(
    status === 'error'
      ? {
          title: '⚠ Sincronização com erro',
          body: `${where}: ${message || 'erro sem mensagem'}`,
          url: tournament ? `/admin/torneios/${tournament.slug}/importacoes` : '/admin/dev',
        }
      : {
          title: '✅ Sincronização normalizada',
          body: `${where} voltou a sincronizar com o chess-results.`,
          url: tournament ? `/admin/torneios/${tournament.slug}/importacoes` : '/admin/dev',
        },
  );

  return NextResponse.json({ ok: true });
}
