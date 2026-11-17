import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/api/guards';
import { pushSubscriptionSchema, readJson } from '@/lib/api/validation';

/**
 * Avisos da CONTA neste aparelho (convite de equipe, alertas, vaga liberada,
 * suporte): é o `user_id` da linha de push_subscriptions. O torneio que o
 * aparelho segue (`tournament_id`, botão da página do torneio) é outro eixo
 * da mesma linha e nunca é tocado aqui.
 *
 * POST liga; DELETE desliga. Desligar só apaga a linha quando o aparelho não
 * segue torneio nenhum; senão só solta a conta (`kept: true`) e o navegador
 * mantém a inscrição para os avisos do torneio.
 */

const LinkSchema = z.object({ subscription: pushSubscriptionSchema });
const UnlinkSchema = z.object({ endpoint: z.string().min(1).max(1000) });

export async function POST(request: NextRequest) {
  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const parsed = await readJson(request, LinkSchema, 'Inválido.');
  if (!parsed.ok) return parsed.response;
  const { subscription } = parsed.data;

  // Service role: a tabela é privada; o endpoint já foi validado no schema.
  const admin = createAdminClient();
  const { data: existing } = await admin
    .from('push_subscriptions').select('endpoint').eq('endpoint', subscription.endpoint).maybeSingle();

  const { error } = existing
    ? await admin.from('push_subscriptions').update({
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        user_id: gate.user.id,
      }).eq('endpoint', subscription.endpoint)
    : await admin.from('push_subscriptions').insert({
        endpoint: subscription.endpoint,
        p256dh: subscription.keys.p256dh,
        auth: subscription.keys.auth,
        tournament_id: null,
        user_id: gate.user.id,
        followed_player_ids: [],
      });
  if (error) {
    console.error('[push/account] POST', error);
    return NextResponse.json({ error: 'Não foi possível ativar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}

export async function DELETE(request: NextRequest) {
  const gate = await requireUser();
  if (!gate.ok) return gate.response;
  const parsed = await readJson(request, UnlinkSchema, 'Inválido.');
  if (!parsed.ok) return parsed.response;

  const admin = createAdminClient();
  const { data: row } = await admin
    .from('push_subscriptions').select('user_id, tournament_id')
    .eq('endpoint', parsed.data.endpoint).maybeSingle();
  // Linha de outra conta (ou inexistente): nada a desligar para esta.
  if (!row || row.user_id !== gate.user.id) return NextResponse.json({ ok: true, kept: !!row });

  const { error } = row.tournament_id
    ? await admin.from('push_subscriptions').update({ user_id: null }).eq('endpoint', parsed.data.endpoint)
    : await admin.from('push_subscriptions').delete().eq('endpoint', parsed.data.endpoint);
  if (error) {
    console.error('[push/account] DELETE', error);
    return NextResponse.json({ error: 'Não foi possível desativar.' }, { status: 500 });
  }
  return NextResponse.json({ ok: true, kept: !!row.tournament_id });
}
