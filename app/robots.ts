import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

// Fora do índice: painel, login, API e telas de impressão/TV (não são conteúdo
// pra busca). `/*/` cobre as versões com prefixo de idioma (/es, /en).
export default function robots(): MetadataRoute.Robots {
  // Homologação e previews usam o mesmo banco: conteúdo duplicado do site real.
  if (process.env.VERCEL_ENV && process.env.VERCEL_ENV !== 'production') {
    return { rules: { userAgent: '*', disallow: '/' } };
  }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/auth/',
        '/admin', '/*/admin',
        '/entrar', '/*/entrar',
        '/conta', '/*/conta',
        '/minha-area', '/*/minha-area',
        '/mock-checkout', '/*/mock-checkout',
        '/*/imprimir', '/*/painel',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
