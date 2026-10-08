import arLock from '@storefront-i18n/i18n.lock.json';
import ar from '@storefront-i18n/ar.json';
import en from '@storefront-i18n/en.json';

/**
 * Storefront UI catalogs (read-only, bundled at build time) + status of every key for the
 * "Storefront text" table. Overrides come from the API; their `srcHash` is compared with the
 * CURRENT English to detect corrections that need review after the English changed.
 */
const flatten = (obj, prefix = '', out = {}) => {
  for (const [k, v] of Object.entries(obj ?? {})) {
    const key = prefix ? `${prefix}.${k}` : k;
    if (v && typeof v === 'object') flatten(v, key, out);
    else out[key] = v;
  }
  return out;
};

export const STOREFRONT_EN = flatten(en);
export const STOREFRONT_GENERATED = { ar: flatten(ar) };
export const STOREFRONT_LOCK = { ar: arLock.ar ?? {} };

/** SHA-256 hex of a string (matches the API's `sourceHash`). */
export async function sha256Hex(text) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * @param {string} lang
 * @param {{ key: string, value: string, srcHash: string }[]} overrides
 * @param {Record<string, string>} enHashes  key → sha256(current English)
 * @returns {{ key: string, en: string, machine: string | null, override: string | null,
 *   status: 'override' | 'overrideStale' | 'machine' | 'english' }[]}
 */
export function buildRows(lang, overrides, enHashes) {
  const byKey = new Map(overrides.map((o) => [o.key, o]));
  const generated = STOREFRONT_GENERATED[lang] ?? {};
  return Object.entries(STOREFRONT_EN).map(([key, enText]) => {
    const o = byKey.get(key);
    const machine = typeof generated[key] === 'string' ? generated[key] : null;
    let status = machine ? 'machine' : 'english';
    if (o) status = o.srcHash === enHashes[key] ? 'override' : 'overrideStale';
    return { key, en: enText, machine, override: o?.value ?? null, status };
  });
}

export const NEEDS_REVIEW = new Set(['english', 'overrideStale']);
