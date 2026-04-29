/**
 * Generates PWA icons from the SVG source.
 * Run: node scripts/generate-icons.mjs
 * Requires: npm install --save-dev sharp
 */
import { readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];

async function main() {
  let sharp;
  try {
    sharp = (await import('sharp')).default;
  } catch {
    console.error('❌  sharp not installed. Run: npm install --save-dev sharp');
    process.exit(1);
  }

  const svgPath = join(__dirname, '../public/icons/icon-source.svg');
  const svgBuffer = readFileSync(svgPath);

  for (const size of sizes) {
    const out = join(__dirname, `../public/icons/icon-${size}x${size}.png`);
    await sharp(svgBuffer).resize(size, size).png().toFile(out);
    console.log(`✅  Generated ${size}x${size}`);
  }

  console.log('\n🎉  All icons generated in public/icons/');
}

main();
