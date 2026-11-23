import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api/guards';
import { playerPhotoPath } from '@/lib/player-photos/config';
import { photoJson, photoStatusResponse } from '@/lib/player-photos/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ playerId: string }> };

/**
 * Dev: só consulta se o jogador tem foto. Enviar foto é exclusivo da conta
 * vinculada ao jogador (`/api/me/players/[playerId]/photo`, pedido do dono em 2026-11-23).
 */
export async function GET(_request: NextRequest, { params }: Context) {
  const { playerId } = await params;
  const gate = await requireAdmin();
  if (!gate.ok) return gate.response;
  const path = playerPhotoPath(playerId);
  if (!path) return photoJson({ error: 'Jogador inválido.' }, 400);
  const admin = createAdminClient();
  const { data: player, error } = await admin.from('players').select('id').eq('id', playerId).maybeSingle();
  if (error) return photoJson({ error: 'Não foi possível consultar o jogador.' }, 503);
  if (!player) return photoJson({ error: 'Jogador não encontrado.' }, 404);
  return photoStatusResponse(admin, path);
}
