'use client';

import { createContext, useContext, useMemo } from 'react';
import { translator } from './translate.js';

/**
 * Client-side UI strings. The server layout passes ONLY the active language's dictionary, and only
 * the namespaces client components need (CLIENT_NAMESPACES) — so the browser never downloads other
 * languages (per-language bundles, CLAUDE.md §5.7).
 */
const I18nContext = createContext({ lang: 'en', dict: {} });

export function I18nProvider({ lang, dict, children }) {
  const value = useMemo(() => ({ lang, dict }), [lang, dict]);
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

/** `const t = useT(); t('notFound.title')` in client components. */
export function useT() {
  const { dict } = useContext(I18nContext);
  return useMemo(() => translator(dict), [dict]);
}

export const useLang = () => useContext(I18nContext).lang;
