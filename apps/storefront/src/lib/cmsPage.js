import 'server-only';
import { cache } from 'react';
import { localizePath } from '@/i18n/config';
import { apiGet } from './api';

/**
 * Pages built in the admin, as the storefront needs them (P5.1–P5.6). The API resolves the text
 * into one language and the catalogue data each block asked for, so a page renders in ONE server
 * pass with no client fetching.
 */
const fetchPage = async (path, lang, tags) => {
  try {
    return (await apiGet(path, { lang, tags })).data;
  } catch {
    return null;
  }
};

/** A page by its address, or null when it does not exist / is not published. */
export const getCmsPage = cache((slug, lang) =>
  fetchPage(`/api/v1/pages/public/${encodeURIComponent(slug)}`, lang, ['pages', `page:${slug}`]),
);

/**
 * The shop's home page, or null when it has none — then the storefront falls back to its own
 * built-in home, so a shop is never left without one (P5.6).
 */
export const getHomePage = cache((lang) =>
  fetchPage('/api/v1/pages/public/home', lang, ['pages', 'page:home']),
);

/**
 * What the block renderers need besides their own props: the page's images and resolved data, the
 * visitor's formatters, the few strings a block renders itself, and how to keep a link in their
 * language.
 * @param {{ page: object, lang: string, t: (key: string) => string, fmt: object }} args
 */
export function blockContext({ page, lang, t, fmt }) {
  return {
    lang,
    media: page.media ?? {},
    data: page.data ?? {},
    formatMoney: fmt.money,
    formatNumber: fmt.number,
    labels: {
      previous: t('blocks.previousSlide'),
      next: t('blocks.nextSlide'),
      slide: t('blocks.slide'),
      days: t('blocks.days'),
      hours: t('blocks.hours'),
      minutes: t('blocks.minutes'),
      seconds: t('blocks.seconds'),
    },
    emailLabel: t('blocks.emailAddress'),
    /** Internal links keep the visitor in their language; external ones are left alone. */
    localizeHref: (href) => (href?.startsWith('/') ? localizePath(href, lang) : href),
  };
}
