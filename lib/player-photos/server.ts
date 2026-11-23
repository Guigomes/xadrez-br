import { NextResponse, type NextRequest } from 'next/server';
import type { createAdminClient } from '@/lib/supabase/server';
import { PLAYER_PHOTOS_BUCKET, PLAYER_PHOTO_MAX_BYTES, playerPhotoFileError } from '@/lib/player-photos/config';
import { preparePlayerPhoto } from '@/lib/player-photos/image';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Respostas das rotas de foto: nunca em cache, nunca com URL ou bytes da imagem. */
export const photoJson = (body: object, status = 200) =>
  NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });

/** Status only: deliberately no URL, signed URL or image bytes. */
export async function photoStatusResponse(admin: AdminClient, path: string) {
  const { data, error } = await admin.storage.from(PLAYER_PHOTOS_BUCKET)
    .list(path.split('/')[0], { limit: 10, search: 'photo.webp' });
  if (error) return photoJson({ error: 'Não foi possível consultar a foto. Verifique a configuração do armazenamento.' }, 503);
  const photo = data?.find((item) => item.name === 'photo.webp');
  return photoJson({ hasPhoto: !!photo, updatedAt: photo?.updated_at ?? null });
}

/**
 * Valida, normaliza (WebP, sem EXIF/GPS) e grava a foto no caminho do jogador.
 * Quem chama já conferiu a permissão sobre esse jogador.
 */
export async function photoUploadResponse(request: NextRequest, admin: AdminClient, path: string) {
  const origin = request.headers.get('origin');
  if (origin && origin !== request.nextUrl.origin) return photoJson({ error: 'Origem inválida.' }, 403);
  const length = Number(request.headers.get('content-length'));
  if (length > PLAYER_PHOTO_MAX_BYTES + 64 * 1024) return photoJson({ error: 'A foto deve ter no máximo 3 MB.' }, 413);
  const form = await request.formData().catch(() => null);
  if (form?.get('consent') !== '1') return photoJson({ error: 'Confirme a autorização de uso da foto.' }, 400);
  const file = form?.get('photo');
  if (!(file instanceof File)) return photoJson({ error: 'Selecione uma foto.' }, 400);
  const fileError = playerPhotoFileError(file);
  if (fileError) return photoJson({ error: fileError }, file.size > PLAYER_PHOTO_MAX_BYTES ? 413 : 400);

  let bytes: Buffer;
  try {
    bytes = await preparePlayerPhoto(new Uint8Array(await file.arrayBuffer()));
  } catch {
    return photoJson({ error: 'Foto inválida ou muito grande. Use uma imagem estática JPG, PNG ou WebP de até 25 megapixels.' }, 400);
  }
  if (bytes.length > PLAYER_PHOTO_MAX_BYTES) return photoJson({ error: 'A foto processada excede 3 MB.' }, 413);
  // Stable UUID-based association: a successful replacement cannot affect another player.
  const { error } = await admin.storage.from(PLAYER_PHOTOS_BUCKET)
    .upload(path, bytes, { contentType: 'image/webp', cacheControl: '0', upsert: true });
  if (error) return photoJson({ error: 'Não foi possível salvar a foto. Tente novamente.' }, 503);
  return photoJson({ hasPhoto: true, updatedAt: new Date().toISOString() });
}
