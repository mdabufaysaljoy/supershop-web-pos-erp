import { describe, expect, it } from 'vitest';
import { dirOf, isLocale, localizePath, resolveLocaleRoute, splitLocale } from '@/i18n/config';
import { getDictionary, mergeFallback, translate } from '@/i18n/dictionaries';

describe('locale routing', () => {
  it.each([
    ['/', { type: 'rewrite', lang: 'en', pathname: '/en' }],
    ['/products/blue-shirt', { type: 'rewrite', lang: 'en', pathname: '/en/products/blue-shirt' }],
    ['/ar', { type: 'next', lang: 'ar' }],
    ['/ar/products/x', { type: 'next', lang: 'ar' }],
    ['/en', { type: 'redirect', pathname: '/' }],
    ['/en/', { type: 'redirect', pathname: '/' }],
    ['/en/products/x/', { type: 'redirect', pathname: '/products/x' }],
    ['/english-books', { type: 'rewrite', lang: 'en', pathname: '/en/english-books' }], // prefix ≠ segment
    ['/fr/x', { type: 'rewrite', lang: 'en', pathname: '/en/fr/x' }], // unknown locale → 404 page later
  ])('%s', (input, expected) => expect(resolveLocaleRoute(input)).toEqual(expected));

  it('localizes and splits paths', () => {
    expect(localizePath('/', 'en')).toBe('/');
    expect(localizePath('/', 'ar')).toBe('/ar');
    expect(localizePath('/p/x', 'ar')).toBe('/ar/p/x');
    expect(splitLocale('/ar/p/x')).toEqual({ lang: 'ar', path: '/p/x' });
    expect(splitLocale('/p/x')).toEqual({ lang: null, path: '/p/x' });
  });

  it('direction and validation', () => {
    expect(dirOf('ar')).toBe('rtl');
    expect(dirOf('en')).toBe('ltr');
    expect(isLocale('ar')).toBe(true);
    expect(isLocale('fr')).toBe(false);
    expect(isLocale(undefined)).toBe(false);
  });
});

describe('dictionaries', () => {
  it('every key resolves to non-empty text in every language; missing ones fall back to English', async () => {
    const flat = (o, p = '', r = {}) => {
      for (const [k, v] of Object.entries(o))
        typeof v === 'object' ? flat(v, p ? `${p}.${k}` : k, r) : (r[p ? `${p}.${k}` : k] = v);
      return r;
    };
    const en = flat(await getDictionary('en'));
    const ar = flat(await getDictionary('ar'));
    const generated = flat((await import('@/i18n/dictionaries/ar.json')).default);
    for (const key of Object.keys(en)) {
      expect(typeof ar[key] === 'string' && ar[key].trim() !== '', key).toBe(true);
      if (!(key in generated)) expect(ar[key], `${key} falls back to English`).toBe(en[key]);
    }
    expect(mergeFallback({ a: { b: 'en', c: 'en' } }, { a: { b: 'ar' } })).toEqual({
      a: { b: 'ar', c: 'en' },
    });
  });

  it('translate interpolates and reports missing keys visibly', () => {
    const dict = { home: { title: 'Welcome to {{store}}' } };
    expect(translate(dict, 'home.title', { store: 'Riyadh Mart' })).toBe('Welcome to Riyadh Mart');
    expect(translate(dict, 'home.title', {})).toBe('Welcome to {{store}}');
    expect(translate(dict, 'home.missing')).toBe('home.missing');
  });
});
