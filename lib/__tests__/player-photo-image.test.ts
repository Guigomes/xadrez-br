import sharp from 'sharp';
import { describe, expect, it } from 'vitest';
import { preparePlayerPhoto } from '../player-photos/image';

describe('player photo normalization', () => {
  it('generates a bounded WebP without preserving embedded metadata', async () => {
    const original = await sharp({ create: { width: 1600, height: 1200, channels: 3, background: '#336644' } }).jpeg().withMetadata().toBuffer();
    const photo = await preparePlayerPhoto(original);
    const info = await sharp(photo).metadata();
    expect(info.format).toBe('webp'); expect(info.width).toBe(800); expect(info.height).toBe(600);
    expect(info.exif).toBeUndefined(); expect(info.icc).toBeUndefined();
  });
  it('does not upscale a small photo or accept executable SVG disguised as a photo', async () => {
    const original = await sharp({ create: { width: 30, height: 40, channels: 3, background: '#336644' } }).png().toBuffer();
    expect((await sharp(await preparePlayerPhoto(original)).metadata()).width).toBe(30);
    await expect(preparePlayerPhoto(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="30" height="40"></svg>'))).rejects.toThrow();
    await expect(preparePlayerPhoto(Buffer.from('not an image'))).rejects.toThrow();
  });
});
