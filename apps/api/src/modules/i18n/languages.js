import { LANGUAGES, SOURCE_LANGUAGE } from '@supershop/shared';
import * as repo from './i18n.repo.js';

/**
 * Enabled target languages, cached in memory (read synchronously by the localized plugin).
 * Loaded at startup; until then (and in tests) every non-source language in the registry.
 */
let targets = Object.values(LANGUAGES).filter((l) => l !== SOURCE_LANGUAGE);

export const getTargetLanguages = () => targets;

export async function loadLanguages() {
  const rows = await repo.listLanguages();
  if (rows.length) targets = rows.filter((l) => l.enabled && !l.isSource).map((l) => l.code);
  return rows;
}

/**
 * Language names come from the runtime's Unicode CLDR data (Intl.DisplayNames) — the native name
 * (endonym, shown in the switcher) is generated, never hand-written (CLAUDE.md §5.7).
 * @param {string} code
 */
export const describeLanguage = (code) => ({
  name: new Intl.DisplayNames(['en'], { type: 'language' }).of(code),
  nativeName: new Intl.DisplayNames([code], { type: 'language' }).of(code),
});

export const DEFAULT_LANGUAGES = Object.freeze([
  { code: 'en', ...describeLanguage('en'), rtl: false, enabled: true, isSource: true, order: 0 },
  { code: 'ar', ...describeLanguage('ar'), rtl: true, enabled: true, order: 1 },
]);

export async function seedLanguages() {
  for (const l of DEFAULT_LANGUAGES) await repo.insertLanguageIfMissing(l);
  return loadLanguages();
}
