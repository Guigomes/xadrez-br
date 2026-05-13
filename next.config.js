/** @type {import('next').NextConfig} */
const withPWA = require('next-pwa')({
  dest: 'public',
  disable: process.env.NODE_ENV === 'development',
  register: true,
  skipWaiting: true,
});

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
    // Disable symlink resolution — prevents EISDIR readlink errors on Windows
    // when directory names contain special characters like [slug]
    config.resolve.symlinks = false;
    return config;
  },
};

module.exports = withPWA(nextConfig);
