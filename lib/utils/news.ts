import { slugify } from './chess';
import type { NewsScope } from '@/types/database';

// ============================================================
// Capa (bucket público news-covers, migration 059)
// ============================================================

export const NEWS_COVERS_BUCKET = 'news-covers';

/** 5 MB — mesmo teto declarado no bucket (migration 059), repetido aqui pra
 *  o formulário recusar antes de gastar upload. */
export const MAX_COVER_BYTES = 5 * 1024 * 1024;

export const COVER_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * Monta a URL pública da capa a partir do path guardado em news.cover_path.
 * Bucket é público, então é string pura, sem rede e sem expiração — signed
 * URL quebraria og:image (preview em rede social) e o SSR da página.
 */
export function newsCoverUrl(coverPath: string | null | undefined): string | null {
  if (!coverPath) return null;
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!base) return null;
  return `${base}/storage/v1/object/public/${NEWS_COVERS_BUCKET}/${coverPath}`;
}

/** Valida o arquivo antes de subir. Devolve a mensagem de erro, ou null se ok. */
export function validateCoverFile(file: File): string | null {
  if (file.size > MAX_COVER_BYTES) return 'Imagem muito grande (máximo 5 MB).';
  if (!COVER_TYPES.includes(file.type)) return 'Formato não suportado (use JPG, PNG ou WebP).';
  return null;
}

// ============================================================
// Abrangência
// ============================================================

export const NEWS_SCOPE_LABELS: Record<NewsScope, string> = {
  state:         'Estadual',
  national:      'Nacional',
  international: 'Internacional',
};

/**
 * Rótulo curto pro selo do card: notícia estadual mostra a própria UF (mais
 * informativo que a palavra "Estadual" repetida em todo card), as outras
 * mostram o nome da abrangência.
 */
export function newsScopeLabel(scope: NewsScope, state: string | null | undefined): string {
  if (scope === 'state') return state ?? NEWS_SCOPE_LABELS.state;
  return NEWS_SCOPE_LABELS[scope];
}

// ============================================================
// Slug
// ============================================================

/**
 * Slug a partir do título, garantindo unicidade contra os que já existem.
 * Colisão vira sufixo numérico (-2, -3…) — a rota de API passa os slugs
 * conflitantes que o banco recusou (unique violation, 23505).
 */
export function uniqueNewsSlug(title: string, taken: string[]): string {
  const base = slugify(title) || 'noticia';
  const used = new Set(taken);
  if (!used.has(base)) return base;
  let n = 2;
  while (used.has(`${base}-${n}`)) n++;
  return `${base}-${n}`;
}
