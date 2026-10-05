import type { MetadataRoute } from 'next';
import { siteUrl } from '@/lib/seo';

// Fora do índice: painel, login, API e telas de impressão/TV (não são conteúdo
// pra busca). `/*/` cobre as versões com prefixo de idioma (/es, /en).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: [
        '/api/', '/auth/',
        '/admin', '/*/admin',
        '/login', '/*/login',
        '/account', '/*/account',
        '/minha-area', '/*/minha-area',
        '/mock-checkout', '/*/mock-checkout',
        '/*/print', '/*/painel',
      ],
    },
    sitemap: `${siteUrl()}/sitemap.xml`,
    host: siteUrl(),
  };
}
