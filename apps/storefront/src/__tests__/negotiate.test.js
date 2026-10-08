import { describe, expect, it } from 'vitest';
import { isBot, negotiateLanguage, preferredLanguage } from '@/i18n/negotiate';

const HUMAN =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1';
const base = {
  routeLang: null,
  cookieLang: undefined,
  acceptLanguage: 'ar-SA,ar;q=0.9,en;q=0.8',
  userAgent: HUMAN,
  isDocument: true,
  autoDetect: true,
  locales: ['en', 'ar'],
};

describe('preferredLanguage', () => {
  it.each([
    ['ar-SA,ar;q=0.9,en;q=0.8', 'ar'],
    ['en-US,en;q=0.9,ar;q=0.8', 'en'],
    ['fr-FR,fr;q=0.9', null],
    ['fr;q=1, ar;q=0.5, en;q=0.4', 'ar'],
    ['ar;q=0, en', 'en'], // q=0 means "not acceptable"
    ['', null],
  ])('%j → %s', (header, expected) =>
    expect(preferredLanguage(header, ['en', 'ar'])).toBe(expected),
  );
});

describe('negotiateLanguage', () => {
  it('auto-detects Arabic for first-time human visitors when enabled, and remembers it', () => {
    expect(negotiateLanguage(base)).toEqual({ redirectTo: 'ar', setCookie: true });
  });

  it('does nothing when auto-detect is off (default)', () => {
    expect(negotiateLanguage({ ...base, autoDetect: false })).toBeNull();
  });

  it('explicit cookie choice wins over the browser preference', () => {
    expect(negotiateLanguage({ ...base, cookieLang: 'en' })).toBeNull();
    expect(negotiateLanguage({ ...base, cookieLang: 'ar', autoDetect: false })).toEqual({
      redirectTo: 'ar',
      setCookie: false,
    });
  });

  it('never redirects bots, prefetches/non-documents, or explicit language URLs', () => {
    expect(
      negotiateLanguage({ ...base, userAgent: 'Mozilla/5.0 (compatible; Googlebot/2.1)' }),
    ).toBeNull();
    expect(negotiateLanguage({ ...base, userAgent: null })).toBeNull();
    expect(negotiateLanguage({ ...base, isDocument: false })).toBeNull();
    expect(negotiateLanguage({ ...base, routeLang: 'ar', cookieLang: 'en' })).toBeNull();
  });

  it('ignores invalid cookie values', () => {
    expect(negotiateLanguage({ ...base, cookieLang: 'xx', autoDetect: false })).toBeNull();
  });

  it('bot detection', () => {
    for (const ua of [
      'Googlebot',
      'bingbot/2.0',
      'facebookexternalhit/1.1',
      'WhatsApp/2.23',
      'Chrome-Lighthouse',
    ]) {
      expect(isBot(ua)).toBe(true);
    }
    expect(isBot(HUMAN)).toBe(false);
  });
});
