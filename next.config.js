/** @type {import('next').NextConfig} */

// createNextIntlPlugin aponta pro i18n/request.ts e só afeta rotas dentro do
// segmento app/[locale] — DORMENTE enquanto esse segmento não existir (Fase 0
// do docs/plano-i18n.md ainda não moveu a árvore). Wired agora pra fechar o
// scaffolding; não muda nenhuma rota atual. Ver docs/pendencias-i18n.md.
const createNextIntlPlugin = require('next-intl/plugin');
const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

// next-pwa is intentionally disabled: the app uses push-sw.js as its sole
// service worker. Having next-pwa generate and register a Workbox sw.js in
// production created a competing registration that caused stale manifest/icon
// caching (showing "T" fallback) and broke the PWA install prompt on Android.
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },

  // A rota de pareamento carrega o glue/wasm do bbpPairings do filesystem em
  // runtime (import dinâmico com webpackIgnore) — o tracing precisa incluí-los.
  outputFileTracingIncludes: {
    '/api/admin/tournaments/[slug]/groups/[groupId]/rounds/generate': [
      './lib/pairing/wasm/**',
    ],
  },

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: '*.supabase.co',
      },
    ],
  },

  webpack(config) {
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = withNextIntl(nextConfig);
