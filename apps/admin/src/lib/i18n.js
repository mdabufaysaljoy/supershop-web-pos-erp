import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import en from '@/locales/en.json';

/**
 * UI strings: English source only (CLAUDE.md §5.7). Use `t('key')` — never hardcode text.
 * The admin UI stays English in v1; P0.11 adds the generated `ar.json` and per-language bundles.
 * API errors arrive as stable codes → `errors.<CODE>`; validation messages are `validation.*` keys.
 */
void i18n.use(initReactI18next).init({
  resources: { en: { translation: en } },
  lng: 'en',
  fallbackLng: 'en',
  initAsync: false,
  interpolation: { escapeValue: false }, // React already escapes
  returnNull: false,
});

/**
 * Message for an API error or a validation key, with a safe generic fallback.
 * @param {(key: string, opts?: object) => string} t
 * @param {unknown} error
 */
export function errorMessage(t, error) {
  const code = /** @type {any} */ (error)?.code;
  if (code === 'NETWORK_ERROR') return t('errors.network');
  return code && i18n.exists(`errors.${code}`) ? t(`errors.${code}`) : t('errors.generic');
}

/** Translates a zod/react-hook-form message that is an i18n key; otherwise a generic message. */
export const fieldMessage = (t, message) =>
  message && i18n.exists(message) ? t(message) : message ? t('validation.invalidType') : undefined;

export default i18n;
