import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { createAdminClient, createClient } from '@/lib/supabase/server';
import { readJson } from '@/lib/api/validation';
import { describeUserAgent } from '@/lib/analytics/device';

export const runtime = 'nodejs';

/**
 * Registra um clique no banner de propaganda (promo_clicks). Chamado por
 * navigator.sendBeacon no clique, que leva o cookie de sessão: com conta logada,
 * grava quem foi; sem conta, só campanha, página e tipo de aparelho.
 * Aberto a visitante, então tudo tem teto e formato fixo.
 */
const ClickSchema = z.object({
  campaign: z.string().regex(/^[a-z0-9_:-]{1,80}$/),
  path: z.string().max(500).startsWith('/').optional(),
});

export async function POST(request: NextRequest) {
  const parsed = await readJson(request, ClickSchema, 'Clique inválido.');
  if (!parsed.ok) return parsed.response;

  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  const userId = user && !user.is_anonymous ? user.id : null;
  const deviceType = describeUserAgent(request.headers.get('user-agent') ?? '').deviceType;

  const { error } = await createAdminClient().from('promo_clicks').insert({
    campaign: parsed.data.campaign,
    path: parsed.data.path ?? null,
    device_type: deviceType,
    user_id: userId,
  });
  if (error) {
    console.error('[promo/click]', error);
    return NextResponse.json({ error: 'Não foi possível registrar o clique.' }, { status: 500 });
  }
  return new NextResponse(null, { status: 204 });
}
