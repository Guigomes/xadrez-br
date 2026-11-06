import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { pushSubscriptionSchema, readJson, uuid } from '@/lib/api/validation';

// Aberto a visitante anônimo (acompanhar torneio sem conta), por isso tudo é
// validado aqui: endpoint só de serviço de push conhecido (o servidor faz POST
// nele a cada aviso), torneio/jogadores como UUID.
const SubscribeSchema = z.object({
  subscription: pushSubscriptionSchema,
  tournamentId: uuid.nullish(),
  followedPlayerIds: z.array(z.unknown()).max(500).optional(),
});

const UnsubscribeSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  const parsed = await readJson(request, SubscribeSchema, 'Inválido.');
  if (!parsed.ok) return parsed.response;
  const { subscription, followedPlayerIds } = parsed.data;
  const tournamentId = parsed.data.tournamentId ?? null;

  // Get user if authenticated (optional — anonymous subscriptions are allowed)
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  // Service role: a tabela é privada e o endpoint valida os dados do navegador.
  const admin = createAdminClient();
  const requestedPlayerIds = [...new Set((followedPlayerIds ?? [])
    .filter((id): id is string => uuid.safeParse(id).success))].slice(0, 100);
  let validPlayerIds: string[] = [];
  if (tournamentId && requestedPlayerIds.length) {
    const { data: tournamentPlayers } = await admin
      .from('tournament_players')
      .select('player_id')
      .eq('tournament_id', tournamentId)
      .in('player_id', requestedPlayerIds);
    validPlayerIds = [...new Set((tournamentPlayers ?? []).map((player) => player.player_id))];
  }

  // Inscrição global (sem torneio, ex.: /alertas) num aparelho que já acompanha
  // um torneio: só vincula a conta e renova as chaves. Não pode apagar o
  // torneio nem os jogadores seguidos — os avisos por conta (sendUserNotification)
  // já chegam a qualquer inscrição do usuário.
  if (!tournamentId) {
    const { data: existing } = await admin
      .from('push_subscriptions').select('tournament_id').eq('endpoint', subscription.endpoint).maybeSingle();
    if (existing?.tournament_id) {
      const { error } = await admin.from('push_subscriptions').update({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        ...(user ? { user_id: user.id } : {}),
      }).eq('endpoint', subscription.endpoint);
      if (error) return failure(error);
      return NextResponse.json({ ok: true });
    }
  }

  const { error } = await admin.from('push_subscriptions').upsert({
    endpoint: subscription.endpoint,
    p256dh: subscription.keys.p256dh,
    auth: subscription.keys.auth,
    tournament_id: tournamentId,
    user_id: user?.id ?? null,
    followed_player_ids: validPlayerIds,
  }, { onConflict: 'endpoint' });

  if (error) return failure(error);
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const parsed = await readJson(request, UnsubscribeSchema, 'Inválido.');
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  await admin.from('push_subscriptions').delete().eq('endpoint', parsed.data.endpoint);
  return NextResponse.json({ ok: true });
}

function failure(error: unknown) {
  console.error('[push/subscribe]', error);
  return NextResponse.json({ error: 'Não foi possível salvar a inscrição.' }, { status: 500 });
}
