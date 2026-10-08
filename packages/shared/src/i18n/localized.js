import { z } from 'zod';
import { SOURCE_LANGUAGE } from '../constants.js';
import { V } from '../validators/messages.js';

/**
 * LocalizedString (CLAUDE.md §5.7): English is authored, other languages are machine-generated.
 *   { en: 'Blue shirt', ar?: '...', meta?: { ar: { mode: 'auto'|'manual', srcHash, provider, at, status } } }
 *
 * Admin forms send ONLY `{ en }` (or a manual override via the dedicated API); translations and
 * meta are written by the server. Never put customer PII in a localized field — it is sent to the
 * translation provider.
 */

/**
 * Admin input schema for a localized field: validates the English source.
 * @param {{ min?: number, max?: number }} [opts]
 */
export const localizedInput = ({ min = 0, max = 500 } = {}) =>
  z.object({
    en: z
      .string({ error: V.INVALID_TYPE })
      .trim()
      .min(min, { error: min <= 1 ? V.REQUIRED : V.TOO_SHORT })
      .max(max, { error: V.TOO_LONG }),
  });

/**
 * Plain string for a language. Fallback chain: requested language → English source → ''.
 * Accepts plain strings too (non-localized legacy values).
 * @param {unknown} value
 * @param {string} lang
 */
export function resolveLocalized(value, lang) {
  if (value == null) return '';
  if (typeof value === 'string') return value;
  if (typeof value !== 'object') return '';
  const v = /** @type {Record<string, unknown>} */ (value);
  const own = lang !== SOURCE_LANGUAGE ? v[lang] : undefined;
  if (typeof own === 'string' && own.trim()) return own;
  return typeof v[SOURCE_LANGUAGE] === 'string' ? v[SOURCE_LANGUAGE] : '';
}

/** True when `value` has a usable translation for `lang` (source language always counts). */
export function hasTranslation(value, lang) {
  if (!value || typeof value !== 'object') return false;
  if (lang === SOURCE_LANGUAGE) return Boolean(value[SOURCE_LANGUAGE]);
  return typeof value[lang] === 'string' && value[lang].trim() !== '';
}
