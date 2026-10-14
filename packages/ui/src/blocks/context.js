import { createFormatters } from '@supershop/shared';

/**
 * The renderer context is DATA, never functions: the same object is handed to blocks that render
 * on the server and to the two that run in the browser (the carousel and the countdown), and a
 * function cannot cross that boundary — React refuses it outright.
 *
 * So the page passes a language prefix and formatting options, and these helpers do the rest.
 *
 *   context = { lang, langPrefix, media, data, labels, emailLabel, newsletterAction, fmtOptions }
 */

/** `/search` → `/ar/search` for an Arabic visitor; an external address is left alone. */
export function hrefIn(href, context = {}) {
  if (!href?.startsWith('/')) return href ?? '';
  const prefix = context.langPrefix ?? '';
  if (!prefix) return href;
  return href === '/' ? prefix : `${prefix}${href}`;
}

/** One formatter set per context object (cheap to call from every block). */
const formatters = new WeakMap();
const formattersFor = (context) => {
  if (!formatters.has(context))
    formatters.set(context, createFormatters(context.fmtOptions ?? { lang: context.lang ?? 'en' }));
  return formatters.get(context);
};

/** Money from halalas, in the visitor's language and the shop's currency. */
export const money = (amount, context = {}) => formattersFor(context).money(amount);

/** A plain number (a countdown's digits follow the visitor's digit setting). */
export const number = (value, context = {}) => formattersFor(context).number(value);
