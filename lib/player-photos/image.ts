import sharp from 'sharp';

/** Decode, bound resource use, auto-orient and strip EXIF/GPS before storage. */
export async function preparePlayerPhoto(input: Uint8Array): Promise<Buffer> {
  const image = sharp(input, { limitInputPixels: 25_000_000, failOn: 'warning' });
  const metadata = await image.metadata();
  if (!['jpeg', 'png', 'webp'].includes(metadata.format ?? '') || (metadata.pages ?? 1) > 1) {
    throw new Error('Use uma foto estática JPG, PNG ou WebP.');
  }
  return image.rotate().resize(800, 800, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 85 }).toBuffer();
}
