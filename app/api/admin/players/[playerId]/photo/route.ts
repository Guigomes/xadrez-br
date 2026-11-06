import { NextRequest, NextResponse } from 'next/server';
import { createAdminClient } from '@/lib/supabase/server';
import { requireAdmin } from '@/lib/api/guards';
import { PLAYER_PHOTOS_BUCKET, PLAYER_PHOTO_MAX_BYTES, playerPhotoFileError, playerPhotoPath } from '@/lib/player-photos/config';
import { preparePlayerPhoto } from '@/lib/player-photos/image';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
type Context = { params: Promise<{ playerId: string }> };
const json = (body: object, status = 200) => NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

async function requireDev(playerId: string) {
  const gate = await requireAdmin();
  if (!gate.ok) return { error: gate.response };
  const path = playerPhotoPath(playerId);
  if (!path) return { error: json({ error: 'Jogador inválido.' }, 400) };
  const admin = createAdminClient();
  const { data: player, error } = await admin.from('players').select('id').eq('id', playerId).maybeSingle();
  if (error) return { error: json({ error: 'Não foi possível consultar o jogador.' }, 503) };
  if (!player) return { error: json({ error: 'Jogador não encontrado.' }, 404) };
  return { admin, path };
}

/** Status only: deliberately no URL, signed URL or image bytes. */
export async function GET(_request: NextRequest, { params }: Context) {
  const { playerId } = await params;
  const gate = await requireDev(playerId);
  if (gate.error) return gate.error;
  const { data, error } = await gate.admin!.storage.from(PLAYER_PHOTOS_BUCKET)
    .list(gate.path!.split('/')[0], { limit: 10, search: 'photo.webp' });
  if (error) return json({ error: 'Não foi possível consultar a foto. Verifique a configuração do armazenamento.' }, 503);
  const photo = data?.find((item) => item.name === 'photo.webp');
  return json({ hasPhoto: !!photo, updatedAt: photo?.updated_at ?? null });
}

export async function PUT(request: NextRequest, { params }: Context) {
  const { playerId } = await params;
  const gate = await requireDev(playerId);
  if (gate.error) return gate.error;
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return json({ error: 'Origem inválida.' }, 403);
  const length = Number(request.headers.get('content-length'));
  if (length > PLAYER_PHOTO_MAX_BYTES + 64 * 1024) return json({ error: 'A foto deve ter no máximo 3 MB.' }, 413);
  const form = await request.formData().catch(() => null);
  const file = form?.get('photo');
  if (!(file instanceof File)) return json({ error: 'Selecione uma foto.' }, 400);
  const fileError = playerPhotoFileError(file);
  if (fileError) return json({ error: fileError }, file.size > PLAYER_PHOTO_MAX_BYTES ? 413 : 400);

  let bytes: Buffer;
  try {
    bytes = await preparePlayerPhoto(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return json({ error: 'Foto inválida ou muito grande. Use uma imagem estática JPG, PNG ou WebP de até 25 megapixels.' }, 400);
  }
  if (bytes.length > PLAYER_PHOTO_MAX_BYTES) return json({ error: 'A foto processada excede 3 MB.' }, 413);
  // Stable UUID-based association: a successful replacement cannot affect another player.
  const { error } = await gate.admin!.storage.from(PLAYER_PHOTOS_BUCKET)
    .upload(gate.path!, bytes, { contentType: 'image/webp', cacheControl: '0', upsert: true });
  if (error) return json({ error: 'Não foi possível salvar a foto. Tente novamente.' }, 503);
  return json({ hasPhoto: true, updatedAt: new Date().toISOString() });
}
