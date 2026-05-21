/** @type {import('next').NextConfig} */

// next-pwa is intentionally disabled: the app uses push-sw.js as its sole
// service worker. Having next-pwa generate and register a Workbox sw.js in
// production created a competing registration that caused stale manifest/icon
// caching (showing "T" fallback) and broke the PWA install prompt on Android.
const nextConfig = {
  typescript: {
    ignoreBuildErrors: true,
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

module.exports = nextConfig;
