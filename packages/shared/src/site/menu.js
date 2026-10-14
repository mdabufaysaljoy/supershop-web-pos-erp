import { resolveLocalized } from '../i18n/localized.js';

/**
 * Menus (P5.4): the header and footer links a shop arranges itself. An item POINTS at something
 * (a page, a category, a brand, the listing, or any address) instead of storing a URL copied by
 * hand, so renaming a category's slug can never leave a dead link in the navigation.
 *
 * Labels are translated with the same machinery as pages: the English lives in the item, and the
 * text is mirrored into a flat `texts` array keyed by the item's id (D-134).
 */
export const MENU = Object.freeze({
  LOCATIONS: Object.freeze(['header', 'footer']),
  /** What an item can point at. `url` is the escape hatch (same-site path or an http(s) address). */
  TARGETS: Object.freeze(['page', 'category', 'brand', 'products', 'url']),
  MAX_ITEMS: 20,
  /** Top level plus one: enough for a mega menu column, shallow enough to stay navigable. */
  MAX_DEPTH: 2,
  MAX_CHILDREN: 20,
});

/** Flattens a menu tree, parents before children. */
export function walkItems(items = []) {
  const out = [];
  const visit = (list) => {
    for (const item of list) {
      out.push(item);
      if (item.children?.length) visit(item.children);
    }
  };
  visit(items);
  return out;
}

/** `[{ key, text }]` of every item label, for the translation pipeline. */
export const collectItemTexts = (items = []) =>
  walkItems(items)
    .filter((item) => typeof item.label === 'string' && item.label.trim())
    .map((item) => ({ key: item.id, text: item.label }));

/**
 * Where an item goes, as a path the storefront can localize. Targets are resolved against what
 * the shop actually has (`refs`: id → slug/path); an item whose target is gone returns null and
 * is left out of the menu rather than sending a visitor to a dead page.
 * @param {object} item
 * @param {{ page?: Record<string,string>, category?: Record<string,string>, brand?: Record<string,string> }} refs
 */
export function itemHref(item, refs = {}) {
  switch (item.target) {
    case 'page': {
      const slug = refs.page?.[item.ref];
      return slug ? `/p/${slug}` : null;
    }
    case 'category': {
      const slug = refs.category?.[item.ref];
      return slug ? `/category/${slug}` : null;
    }
    case 'brand':
      return refs.brand?.[item.ref] ? `/search?brands=${item.ref}` : null;
    case 'products':
      return '/search';
    case 'url':
      return item.href || null;
    default:
      return null;
  }
}

/**
 * The menu a visitor sees: labels in their language, hrefs resolved, dead items dropped (and a
 * parent with neither a destination of its own nor any surviving child goes too).
 */
export function resolveMenu(items = [], texts = [], lang, refs = {}) {
  const byKey = new Map((texts ?? []).map((t) => [t.key, t.value]));
  const resolve = (list, depth) =>
    list
      .map((item) => {
        const value = byKey.get(item.id);
        const label =
          (value && (value.en ?? '') === item.label ? resolveLocalized(value, lang) : '') ||
          item.label;
        const children = depth < MENU.MAX_DEPTH ? resolve(item.children ?? [], depth + 1) : [];
        return { id: item.id, label, href: itemHref(item, refs), children };
      })
      .filter((item) => item.label && (item.href || item.children.length));
  return resolve(items, 1);
}
