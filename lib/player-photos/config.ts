export const PLAYER_PHOTOS_BUCKET = 'player-photos';
export const PLAYER_PHOTO_MAX_BYTES = 3 * 1024 * 1024;
export const PLAYER_PHOTO_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;

export function playerPhotoPath(playerId: string): string | null {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(playerId)
    ? `${playerId.toLowerCase()}/photo.webp`
    : null;
}

export function playerPhotoFileError(file: { size: number; type: string }): string | null {
  if (file.size === 0) return 'Selecione uma foto não vazia.';
  if (file.size > PLAYER_PHOTO_MAX_BYTES) return 'A foto deve ter no máximo 3 MB.';
  if (!(PLAYER_PHOTO_MIME_TYPES as readonly string[]).includes(file.type)) return 'Use uma foto JPG, PNG ou WebP.';
  return null;
}

export interface PlayerPhotoStatus {
  hasPhoto: boolean;
  updatedAt: string | null;
}
