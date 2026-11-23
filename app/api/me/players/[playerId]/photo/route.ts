import { NextRequest } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireUser } from '@/lib/api/guards';
import { playerPhotoPath } from '@/lib/player-photos/config';
import { photoJson, photoStatusResponse, photoUploadResponse } from '@/lib/player-photos/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ playerId: string }> };

/**
 * Foto do jogador enviada pela própria conta vinculada a ele (vínculo
 * VERIFICADO em user_player_links — nunca por nome). Ninguém mais envia,
 * nem o Dev. O arquivo continua privado (bucket player-photos).
 */
async function requireLinkedPlayer(playerId: string) {
  const gate = await requireUser();
  if (!gate.ok) return { error: gate.response };
  const path = playerPhotoPath(playerId);
  if (!path) return { error: photoJson({ error: 'Jogador inválido.' }, 400) };
  const admin = createAdminClient();
  const { data: link, error } = await admin.from('user_player_links').select('id')
    .eq('user_id', gate.user.id).eq('player_id', playerId).eq('status', 'verified').maybeSingle();
  if (error) return { error: photoJson({ error: 'Não foi possível verificar o vínculo com o jogador.' }, 503) };
  if (!link) return { error: photoJson({ error: 'Só a conta vinculada a este jogador pode cuidar da foto dele.' }, 403) };
  return { admin, path };
}

export async function GET(_request: NextRequest, { params }: Context) {
  const { playerId } = await params;
  const gate = await requireLinkedPlayer(playerId);
  if (gate.error) return gate.error;
  return photoStatusResponse(gate.admin!, gate.path!);
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { playerId } = await params;
  const gate = await requireLinkedPlayer(playerId);
  if (gate.error) return gate.error;
  return photoUploadResponse(request, gate.admin!, gate.path!);
}
