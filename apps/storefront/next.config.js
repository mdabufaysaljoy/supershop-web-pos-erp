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
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
  async rewrites() {
    return [{ source: '/api/v1/:path*', destination: `${API_INTERNAL_URL}/api/v1/:path*` }];
  },
};

export default nextConfig;
