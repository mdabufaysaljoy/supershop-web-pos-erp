// @vitest-environment jsdom
import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

/** P5.6 — the home page the shop arranges, with the storefront's own as a fallback. */
const HOME = {
  slug: 'home',
  title: 'Home',
  seo: { title: '', description: '' },
  content: {
    schemaVersion: 1,
    blocks: [
      {
        id: 'home-hero',
        type: 'heroCarousel',
        version: 1,
        props: {
          slides: [
            {
              mediaId: null,
              heading: 'Everything for your home, delivered',
              text: '',
              buttonLabel: 'Shop now',
              href: '/search',
            },
          ],
          autoplaySeconds: 0,
        },
      },
      {
        id: 'home-newest',
        type: 'productRail',
        version: 1,
        props: { heading: 'New arrivals', source: 'newest', limit: 8 },
      },
    ],
  },
  media: {},
  data: {
    'home-newest': {
      products: [{ id: 'p1', href: '/product/kettle', name: 'Kettle', price: 12900, image: null }],
    },
  },
};

const json = (data, meta = {}) =>
  new Response(JSON.stringify({ data, meta }), {
    headers: { 'Content-Type': 'application/json' },
  });

/** `home` decides whether the shop has a home page; everything else answers with empties. */
const stubApi = (home) =>
  vi.stubGlobal(
    'fetch',
    vi.fn(async (url) => {
      const u = new URL(url);
      if (u.pathname === '/api/v1/pages/public/home')
        return home ? json(home) : new Response('{}', { status: 404 });
      if (u.pathname === '/api/v1/settings/public') return json({ 'store.name': 'Supershop' });
      if (u.pathname === '/api/v1/categories/public') return json([]);
      if (u.pathname === '/api/v1/search') return json([], { total: 0 });
      throw new Error(`unexpected ${u}`);
    }),
  );

const HomePage = (await import('@/app/[lang]/page')).default;

afterEach(() => vi.unstubAllGlobals());

describe('the home page', () => {
  it('renders the blocks the shop arranged', async () => {
    stubApi(HOME);
    render(await HomePage({ params: Promise.resolve({ lang: 'en' }) }));
    expect(
      screen.getByRole('heading', { name: 'Everything for your home, delivered' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'New arrivals' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /Kettle/ })).toHaveAttribute('href', '/product/kettle');
  });

  it('falls back to the storefront’s own home when the shop has none', async () => {
    stubApi(null);
    render(await HomePage({ params: Promise.resolve({ lang: 'en' }) }));
    expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
  });
});
