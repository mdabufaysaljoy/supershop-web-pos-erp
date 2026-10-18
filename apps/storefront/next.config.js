/**
 * Storefront (Next.js App Router). SEO-first: pages render on the server (SSR/ISR).
 * In development `/api/v1/*` is proxied to the API so browser calls are same-origin (like
 * production behind Nginx), keeping auth cookies + CSRF behavior identical.
 */
const API_INTERNAL_URL = process.env.API_INTERNAL_URL || 'http://localhost:4000';

/** Baseline security headers (CSP is added with the tracking module, P9.1, which defines script origins). */
const securityHeaders = [
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'X-Frame-Options', value: 'SAMEORIGIN' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=(), payment=(self)' },
];

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Workspace packages ship untranspiled ESM/JSX source.
  transpilePackages: ['@supershop/shared', '@supershop/ui'],
  images: {
    formats: ['image/avif', 'image/webp'],
    deviceSizes: [640, 750, 828, 1080, 1200, 1920],
    imageSizes: [16, 32, 48, 64, 96, 128, 256, 384],
    minimumCacheTTL: 60 * 60 * 24 * 30, // 30 days
    remotePatterns: [
      { protocol: 'http', hostname: 'localhost' },
      { protocol: 'http', hostname: '127.0.0.1' },
      { protocol: 'https', hostname: '**' },
    ],
  },
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [
      { source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` },
      { source: '/media/:path*', destination: `${API_INTERNAL_URL}/media/:path*` },
    ];
  },
};

export default nextConfig;
