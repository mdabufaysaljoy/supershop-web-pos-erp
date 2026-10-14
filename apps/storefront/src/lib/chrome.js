import 'server-only';
import { cache } from 'react';
import { themeCssVars } from '@supershop/shared';
import { apiGet } from './api';

/**
 * The site's chrome (P5.4): the menus the shop arranged, its announcement bar, footer note and
 * theme tokens — one request per language, ISR-cached and deduplicated within a render.
 *
 * It never throws: if the API is unreachable the site still renders with the shop's categories in
 * the header and the default theme.
 */
const FALLBACK = Object.freeze({
  announcement: { enabled: false, text: '', href: '', tone: 'primary' },
  header: { showCategoryRow: true, menu: [] },
  footer: { note: '', menus: [] },
  theme: themeCssVars(),
});

export const getSiteChrome = cache(async (lang) => {
  try {
    const { data } = await apiGet('/api/v1/site/public', { lang, tags: ['site'] });
    return { ...FALLBACK, ...data };
  } catch {
    return FALLBACK;
  }
});
