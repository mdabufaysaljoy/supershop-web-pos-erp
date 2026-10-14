import { describe, expect, it } from 'vitest';
import {
  collectItemTexts,
  createSiteSchemas,
  itemHref,
  matchRedirect,
  normalizeRedirectPath,
  robotsPolicy,
  resolveMenu,
  syncTextEntries,
  themeCssVars,
  walkItems,
} from '../index.js';

/** P5.4 — menus, the announcement bar and theme tokens. */
const schemas = createSiteSchemas();
const item = (id, label, over = {}) => ({
  id,
  label,
  target: 'products',
  ref: null,
  href: '',
  children: [],
  ...over,
});

describe('menu items', () => {
  it('walks parents before their children', () => {
    const tree = [item('a', 'A', { children: [item('a1', 'A1')] }), item('b', 'B')];
    expect(walkItems(tree).map((i) => i.id)).toEqual(['a', 'a1', 'b']);
  });

  it('collects every label for translation, keyed by the item', () => {
    const tree = [item('a', 'Offers', { children: [item('a1', 'This week'), item('a2', '  ')] })];
    expect(collectItemTexts(tree)).toEqual([
      { key: 'a', text: 'Offers' },
      { key: 'a1', text: 'This week' },
    ]);
  });

  it('builds a link from what the item points at', () => {
    const refs = { page: { p1: 'about-us' }, category: { c1: 'home' }, brand: { b1: 'acme' } };
    expect(itemHref(item('x', 'x', { target: 'page', ref: 'p1' }), refs)).toBe('/p/about-us');
    expect(itemHref(item('x', 'x', { target: 'category', ref: 'c1' }), refs)).toBe(
      '/category/home',
    );
    expect(itemHref(item('x', 'x', { target: 'brand', ref: 'b1' }), refs)).toBe(
      '/search?brands=b1',
    );
    expect(itemHref(item('x', 'x', { target: 'products' }), refs)).toBe('/search');
    expect(itemHref(item('x', 'x', { target: 'url', href: '/offers' }), refs)).toBe('/offers');
  });

  it('drops an item whose target no longer exists, and a parent left with nothing', () => {
    const tree = [
      item('gone', 'Deleted category', { target: 'category', ref: 'missing' }),
      item('parent', 'Shop', {
        target: 'url',
        href: '',
        children: [item('kid', 'Kettles', { target: 'category', ref: 'c1' })],
      }),
      item('empty', 'Empty', { target: 'url', href: '' }),
    ];
    const menu = resolveMenu(tree, [], 'en', { category: { c1: 'kettles' } });
    expect(menu.map((i) => i.id)).toEqual(['parent']);
    expect(menu[0].children[0].href).toBe('/category/kettles');
  });

  it('shows the label in the visitor’s language, and English when nothing was translated', () => {
    const tree = [item('a', 'Offers'), item('b', 'Brands')];
    const texts = [
      { key: 'a', value: { en: 'Offers', ar: 'عروض' } },
      { key: 'b', value: { en: 'Something else', ar: 'شيء آخر' } },
    ];
    const menu = resolveMenu(tree, texts, 'ar', {});
    expect(menu.map((i) => i.label)).toEqual(['عروض', 'Brands']); // b's translation is of old text
  });
});

describe('menu text list', () => {
  it('keeps translations when the English is unchanged and marks changed text as the source', () => {
    const existing = [
      { key: 'a', value: { en: 'Offers', ar: 'عروض', meta: { ar: { mode: 'manual' } } } },
      { key: 'gone', value: { en: 'Old', ar: 'قديم' } },
    ];
    expect(
      syncTextEntries(
        [
          { key: 'a', text: 'Offers' },
          { key: 'b', text: 'New' },
        ],
        existing,
      ),
    ).toEqual([
      { key: 'a', value: { en: 'Offers', ar: 'عروض', meta: { ar: { mode: 'manual' } } } },
      { key: 'b', value: { en: 'New' } },
    ]);
  });
});

describe('what the admin may send', () => {
  it('insists an item points somewhere, naming the exact field', () => {
    const bad = schemas.menuUpdate.safeParse({
      items: [
        { id: 'a', label: 'Link', target: 'url', href: '', children: [] },
        {
          id: 'b',
          label: 'Shop',
          target: 'products',
          children: [{ id: 'b1', label: 'Kettles', target: 'category' }],
        },
      ],
    });
    expect(bad.success).toBe(false);
    expect(bad.error.issues.map((i) => i.path.join('.'))).toEqual([
      'items.0.href',
      'items.1.children.0.ref',
    ]);
  });

  it('refuses a link that is not a path or an http address', () => {
    const bad = schemas.menuUpdate.safeParse({
      items: [{ id: 'a', label: 'X', target: 'url', href: 'javascript:alert(1)', children: [] }],
    });
    expect(bad.success).toBe(false);
  });

  it('accepts a tidy menu and fills in what the admin left out', () => {
    const parsed = schemas.menuCreate.parse({
      title: 'Header',
      location: 'header',
      items: [{ id: 'a', label: 'All products', target: 'products' }],
    });
    expect(parsed.items[0]).toEqual({
      id: 'a',
      label: 'All products',
      target: 'products',
      ref: null,
      href: '',
      children: [],
    });
  });

  it('takes colours only as hex, and only known radius and font choices', () => {
    expect(schemas.layoutUpdate.safeParse({ theme: { primary: '#0A7B4C' } }).success).toBe(true);
    expect(schemas.layoutUpdate.safeParse({ theme: { primary: 'red' } }).success).toBe(false);
    expect(schemas.layoutUpdate.safeParse({ theme: { radius: 'huge' } }).success).toBe(false);
    expect(schemas.layoutUpdate.safeParse({}).success).toBe(false);
  });
});

describe('theme tokens', () => {
  it('turns a shop’s choices into the variables the storefront already uses', () => {
    const vars = themeCssVars({ primary: '#0A7B4C', primaryForeground: '#fff', radius: 'full' });
    expect(vars['--primary']).toBe('#0a7b4c');
    expect(vars['--ring']).toBe('#0a7b4c');
    expect(vars['--radius']).toBe('2rem');
    expect(vars['--font-sans']).toContain('var(--font-latin)');
  });

  it('never writes nonsense into CSS', () => {
    const vars = themeCssVars({ primary: 'url(evil)', radius: 'nope', font: 'comic' });
    expect(vars['--primary']).toBe('#1f1f1f');
    expect(vars['--radius']).toBe('0.625rem');
    expect(vars['--font-sans']).toContain('var(--font-latin)');
  });
});

describe('redirects', () => {
  const rules = [
    { from: '/old-offer', to: '/search?sort=newest', status: 301 },
    { from: '/temp', to: '/p/about-us', status: 302 },
    { from: '/gone', to: '', status: 410 },
  ];
  const opts = { locales: ['en', 'ar'], defaultLocale: 'en' };

  it('matches whatever the visitor typed, trailing slash and case included', () => {
    expect(matchRedirect(rules, '/Old-Offer/', opts)).toEqual({
      status: 301,
      to: '/search?sort=newest',
    });
    expect(matchRedirect(rules, '/nothing-here', opts)).toBeNull();
  });

  it('keeps an Arabic visitor in Arabic', () => {
    expect(matchRedirect(rules, '/ar/temp', opts)).toEqual({ status: 302, to: '/ar/p/about-us' });
    expect(matchRedirect(rules, '/temp', opts)).toEqual({ status: 302, to: '/p/about-us' });
  });

  it('carries the query along to an internal target', () => {
    expect(matchRedirect(rules, '/temp?utm_source=sms', opts)).toEqual({
      status: 302,
      to: '/p/about-us?utm_source=sms',
    });
  });

  it('says a page is gone without sending anyone anywhere', () => {
    expect(matchRedirect(rules, '/gone', opts)).toEqual({ status: 410, to: null });
  });

  it('normalizes a path the same way wherever it comes from', () => {
    expect(normalizeRedirectPath('Offers/?x=1')).toBe('/offers');
    expect(normalizeRedirectPath('/')).toBe('/');
    expect(normalizeRedirectPath('')).toBe('/');
  });
});

describe('robots.txt', () => {
  it('keeps private areas out in every language', () => {
    const policy = robotsPolicy({
      indexable: true,
      privatePaths: ['/cart', '/checkout'],
      locales: ['ar'],
    });
    expect(policy.rules).toEqual({
      userAgent: '*',
      allow: '/',
      disallow: ['/cart', '/checkout', '/ar/cart', '/ar/checkout'],
    });
  });

  it('shuts the whole site out when the shop says it is not ready', () => {
    const policy = robotsPolicy({ indexable: false, privatePaths: ['/cart'], locales: ['ar'] });
    expect(policy.rules).toEqual({ userAgent: '*', disallow: ['/'] });
  });

  it('keeps the shop’s own lines, without the blank ones', () => {
    expect(robotsPolicy({ extra: 'Disallow: /tmp\n\n  # ours \n' }).extraLines).toEqual([
      'Disallow: /tmp',
      '# ours',
    ]);
  });
});

describe('what the admin may send for the site', () => {
  it('takes a phone and an email, and refuses nonsense', () => {
    expect(
      schemas.layoutUpdate.parse({ contact: { phone: '0501234567', email: 'Hi@Shop.test' } })
        .contact,
    ).toEqual({ phone: '+966501234567', email: 'hi@shop.test' });
    expect(schemas.layoutUpdate.safeParse({ contact: { email: 'nope' } }).success).toBe(false);
  });

  it('takes social profiles only as full addresses of known platforms', () => {
    expect(
      schemas.layoutUpdate.safeParse({
        social: [{ platform: 'instagram', url: 'https://instagram.com/shop' }],
      }).success,
    ).toBe(true);
    expect(
      schemas.layoutUpdate.safeParse({ social: [{ platform: 'myspace', url: 'https://x.test' }] })
        .success,
    ).toBe(false);
    expect(
      schemas.layoutUpdate.safeParse({ social: [{ platform: 'x', url: 'shop' }] }).success,
    ).toBe(false);
  });

  it('refuses a redirect source that is not a path on this site', () => {
    expect(schemas.redirectCreate.safeParse({ from: 'https://evil.test', to: '/x' }).success).toBe(
      false,
    );
  });
});
