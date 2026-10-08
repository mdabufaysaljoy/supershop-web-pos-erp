/**
 * Technical constants and DEFAULTS. Business values here are only seed defaults for the settings
 * registry (P0.6) — runtime code must read the admin-configured value via settings, never these.
 */

/** Supported languages; English is the only authored language (CLAUDE.md §5.7). */
export const LANGUAGES = Object.freeze({
  EN: 'en',
  AR: 'ar',
});
export const SOURCE_LANGUAGE = LANGUAGES.EN;
export const RTL_LANGUAGES = Object.freeze([LANGUAGES.AR]);
/** @param {string} lang */
export const isRtl = (lang) => RTL_LANGUAGES.includes(lang);

export const ORDER_CHANNELS = Object.freeze({ ONLINE: 'online', POS: 'pos' });

/** Seed defaults for settings (P0.6). */
export const DEFAULTS = Object.freeze({
  currency: 'SAR',
  timeZone: 'Asia/Riyadh',
  vatRateBps: 1500, // 15%
  pricesIncludeVat: true,
  countryCode: 'SA',
  weekendDays: Object.freeze([5, 6]), // Friday, Saturday (0 = Sunday)
  maxCartQty: 9999,
});

export const PAGINATION = Object.freeze({ DEFAULT_LIMIT: 20, MAX_LIMIT: 100 });

/** Header name for idempotent mutations (checkout, POS sale, returns, webhooks). */
export const IDEMPOTENCY_HEADER = 'Idempotency-Key';
