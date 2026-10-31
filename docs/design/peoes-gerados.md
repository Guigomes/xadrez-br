# Peões branco e preto — primeira versão

Gerados com a ferramenta integrada de geração de imagens (não pela CLI). PNGs separados de 1254 × 1254 px, com canal alfa transparente verificado. Os originais foram preservados e os arquivos abaixo são cópias para uso no projeto:

- `public/images/chess-pieces/pawn-white-v1.png`
- `public/images/chess-pieces/pawn-black-v1.png`

Integração concluída em 2026-10-31: `components/tournament/piece-icons.tsx` usa estes PNGs com miniaturas otimizadas pelo Next/Image, substituindo os SVGs em resultados, rodadas e TV. O branco foi gerado primeiro e usado como referência para o preto, mantendo o formato. O painel mostra “Quem venceu?”, com Brancas / Empate / Pretas e o placar menor abaixo de cada opção, além de rating e pontos acumulados sob cada nome. Publicação autorizada pelo dono em 2026-10-31: os dois PNGs acompanham o código no mesmo commit; aguardar o CI e o deploy antes de confirmar produção.

## Prompt do peão branco

Use case: stylized-concept. Asset type: production-ready transparent PNG chess pawn icon for a mobile chess tournament results interface. Generate exactly ONE WHITE chess pawn, full piece, centered, upright, viewed straight-on with very slight elevation to reveal its round base. Elegant classic Staunton silhouette: generous spherical head, small clean collar, gently tapered stem, stable broad round stepped base. Polished restrained 3D illustration, satin ivory-white ceramic, subtle cool gray modeling and a fine neutral edge definition so the white silhouette remains legible on a white interface. Clean bold silhouette readable when displayed at 24–40px, minimal detail, not cartoon character, not photorealistic wood. Soft studio lighting from upper left, restrained highlights, no dramatic reflections. Square composition with the pawn about 84% of canvas height and equal padding, nothing cropped. Background genuinely transparent alpha; all empty space must be transparent, no checkerboard drawn into the image, no floor, no ground shadow, no backdrop. No text, labels, logo, watermark, frame, board, other pieces or extra objects. This white pawn will serve as the exact shape reference for a matching black variant.

## Prompt do peão preto

Referência: o PNG branco gerado acima.

Use case: precise-object-edit. Input image: reference and color-variant source, the generated white pawn. Create its BLACK companion as a separate production-ready transparent PNG icon. Change ONLY the pawn's material color to elegant satin charcoal-black ceramic with subtle neutral graphite highlights. Preserve the exact same Staunton design, spherical head, collar, tapered stem, stepped round base, silhouette, shape proportions, pose, scale, image dimensions, centering and camera angle. Keep soft studio lighting from upper left. Add a restrained narrow light-gray rim on the outer contour so the black piece reads on a dark interface, but keep it clearly black rather than metallic silver. Preserve genuinely transparent alpha everywhere outside the pawn; remove any isolated edge flecks. This must look like the same physical pawn in black, not a different model. Exactly ONE black pawn and nothing else. No white pawn, no collage, no text, no floor, no cast shadow, no background, no fake checkerboard, no logos, no watermark, no extra objects. Clear small-size silhouette for mobile UI at 24–40px.
