# Gerando ícones PWA

Os ícones precisam ser gerados antes do deploy. Use qualquer ferramenta abaixo:

## Opção 1 – pwa-asset-generator (recomendado)
```bash
npx pwa-asset-generator ./public/icons/icon-source.svg ./public/icons \
  --manifest ./public/manifest.json \
  --index ./app/layout.tsx \
  --background "#4f52eb" \
  --padding "10%"
```

## Opção 2 – realfavicongenerator.net
Acesse https://realfavicongenerator.net e envie o SVG abaixo.

## SVG base (icon-source.svg)
Salve como `public/icons/icon-source.svg`:

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="20" fill="#4f52eb"/>
  <text x="50" y="72" text-anchor="middle" font-size="60" font-family="serif">♟</text>
</svg>
```

## Geração rápida com sharp (Node.js)
```js
// scripts/generate-icons.js
const sharp = require('sharp');
const sizes = [72, 96, 128, 144, 152, 192, 384, 512];
const svg = Buffer.from(`
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
    <rect width="100" height="100" rx="20" fill="#4f52eb"/>
    <text x="50" y="72" text-anchor="middle" font-size="60" font-family="serif" fill="white">♟</text>
  </svg>
`);
sizes.forEach(size => {
  sharp(svg).resize(size, size).png().toFile(`public/icons/icon-${size}x${size}.png`);
});
```
Execute: `node scripts/generate-icons.js`
