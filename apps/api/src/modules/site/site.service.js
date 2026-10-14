import {
  collectItemTexts,
  EVENTS,
  resolveMenu,
  SOURCE_LANGUAGE,
  syncTextEntries,
  themeCssVars,
} from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { ConflictError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { uniqueSlug } from '../../core/slug.js';
import { resolveDoc } from '../i18n/index.js';
import { getMediaByIds, publicImage } from '../media/index.js';
import * as repo from './site.repo.js';

/**
 * The site's chrome (P5.4): menus, the announcement bar, the footer note and theme tokens.
 *
 * What a menu item points at is resolved HERE, through lookups injected at the composition root —
 * this module imports no other module (D-144). An item whose page was unpublished or whose
 * category was deleted simply stops appearing; it never becomes a dead link.
 */
const MENU_LOCALIZED = ['texts.*.value'];
const LAYOUT_LOCALIZED = [
  'announcement.text',
  'footer.note',
  'contact.address',
  'seo.titleSuffix',
  'seo.defaultDescription',
];
/** The pictures a shop sets once: header logo, favicon, the one used when a page is shared. */
const BRAND_IMAGE_FIELDS = ['logoId', 'faviconId', 'ogImageId'];

/** @type {Record<string, null | ((ids: string[]) => Promise<Record<string, string>>)>} */
let refs = { page: null, category: null, brand: null };
export function setMenuRefProviders(next) {
  refs = { ...refs, ...next };
}

const emit = (name, payload, actor) =>
  void eventBus.emit(name, { ...payload, actorId: actor?.staffId ?? null });

export const toMenuDto = (m) => ({
  id: String(m._id),
  title: m.title,
  slug: m.slug,
  location: m.location,
  items: m.items ?? [],
  texts: (m.texts ?? []).map((t) => ({ key: t.key, value: t.value })),
  updatedAt: m.updatedAt,
});

export const toLayoutDto = (l) => ({
  headerMenuId: l.headerMenuId ? String(l.headerMenuId) : null,
  showCategoryRow: l.showCategoryRow,
  announcement: {
    enabled: l.announcement?.enabled ?? false,
    text: l.announcement?.text ?? { en: '' },
    href: l.announcement?.href ?? '',
    tone: l.announcement?.tone ?? 'primary',
  },
  footer: {
    note: l.footer?.note ?? { en: '' },
    menuIds: (l.footer?.menuIds ?? []).map(String),
  },
  theme: {
    primary: l.theme?.primary,
    primaryForeground: l.theme?.primaryForeground,
    radius: l.theme?.radius,
    font: l.theme?.font,
  },
  brand: {
    logoId: l.brand?.logoId ? String(l.brand.logoId) : null,
    faviconId: l.brand?.faviconId ? String(l.brand.faviconId) : null,
    ogImageId: l.brand?.ogImageId ? String(l.brand.ogImageId) : null,
  },
  contact: {
    phone: l.contact?.phone ?? '',
    whatsapp: l.contact?.whatsapp ?? '',
    email: l.contact?.email ?? '',
    address: l.contact?.address ?? { en: '' },
    nationalAddress: l.contact?.nationalAddress ?? '',
    mapUrl: l.contact?.mapUrl ?? '',
  },
  social: (l.social ?? []).map((link) => ({ platform: link.platform, url: link.url })),
  seo: {
    titleSuffix: l.seo?.titleSuffix ?? { en: '' },
    defaultDescription: l.seo?.defaultDescription ?? { en: '' },
    indexable: l.seo?.indexable !== false,
    robotsExtra: l.seo?.robotsExtra ?? '',
  },
  updatedAt: l.updatedAt,
});

const notFound = () => new NotFoundError('Menu not found');

// ---------------------------------------------------------------- menus (admin)

export async function listMenus() {
  return (await repo.listMenus()).map(toMenuDto);
}

export async function getMenu(id) {
  const menu = await repo.findMenuById(id);
  if (!menu) throw notFound();
  return toMenuDto(menu);
}

/** Item labels are mirrored into `texts` so they are translated like any other content. */
const textsFor = (items, existing) => syncTextEntries(collectItemTexts(items), existing);

export async function createMenu(actor, input) {
  const slug =
    input.slug ??
    (await uniqueSlug(input.title, { exists: repo.menuSlugExists, fallback: 'menu' }));
  const items = input.items ?? [];
  const menu = await repo.createMenu({
    title: input.title,
    slug,
    location: input.location,
    items,
    texts: textsFor(items, []),
    updatedBy: actor.staffId,
  });
  emit(EVENTS.MENU_UPDATED, { menuId: String(menu._id), location: menu.location }, actor);
  return toMenuDto(menu);
}

export async function updateMenu(actor, id, patch) {
  const menu = await repo.updateMenu(id, (doc) => {
    if (patch.title !== undefined) doc.title = patch.title;
    if (patch.location !== undefined) doc.location = patch.location;
    if (patch.items !== undefined) {
      doc.items = patch.items;
      doc.texts = textsFor(patch.items, doc.texts ?? []);
    }
    doc.updatedBy = actor.staffId;
  });
  if (!menu) throw notFound();
  emit(EVENTS.MENU_UPDATED, { menuId: String(menu._id), location: menu.location }, actor);
  return toMenuDto(menu);
}

export async function deleteMenu(actor, id) {
  const menu = await repo.softDeleteMenu(id);
  if (!menu) throw notFound();
  await repo.forgetMenu(menu._id);
  emit(EVENTS.MENU_UPDATED, { menuId: String(menu._id), location: menu.location }, actor);
}

// ---------------------------------------------------------------- layout (admin)

export const getLayout = async () => toLayoutDto(await repo.getLayout());

export async function updateLayout(actor, patch) {
  const layout = await repo.updateLayout((doc) => {
    if (patch.headerMenuId !== undefined) doc.headerMenuId = patch.headerMenuId;
    if (patch.showCategoryRow !== undefined) doc.showCategoryRow = patch.showCategoryRow;
    for (const [field, value] of Object.entries(patch.announcement ?? {}))
      doc.announcement[field] = field === 'text' ? { en: value } : value;
    if (patch.footer?.note !== undefined) doc.footer.note = { en: patch.footer.note };
    if (patch.footer?.menuIds !== undefined) doc.footer.menuIds = patch.footer.menuIds;
    for (const [field, value] of Object.entries(patch.theme ?? {})) doc.theme[field] = value;
    for (const field of BRAND_IMAGE_FIELDS)
      if (patch.brand?.[field] !== undefined) doc.brand[field] = patch.brand[field];
    for (const [field, value] of Object.entries(patch.contact ?? {}))
      doc.contact[field] = field === 'address' ? { en: value } : value;
    if (patch.social !== undefined) doc.social = patch.social;
    for (const [field, value] of Object.entries(patch.seo ?? {}))
      doc.seo[field] =
        field === 'titleSuffix' || field === 'defaultDescription' ? { en: value } : value;
    doc.updatedBy = actor.staffId;
  });
  emit(EVENTS.SITE_LAYOUT_UPDATED, {}, actor);
  return toLayoutDto(layout);
}

// ---------------------------------------------------------------- what a visitor gets

/** id → slug (or id) for every target the given items point at; missing targets are left out. */
async function refMaps(items) {
  const wanted = { page: new Set(), category: new Set(), brand: new Set() };
  const collect = (list) => {
    for (const item of list) {
      if (item.ref && wanted[item.target]) wanted[item.target].add(String(item.ref));
      collect(item.children ?? []);
    }
  };
  collect(items);
  const entries = await Promise.all(
    Object.entries(wanted).map(async ([target, ids]) => {
      const provider = refs[target];
      if (!ids.size || !provider) return [target, {}];
      return [target, await provider([...ids])];
    }),
  );
  return Object.fromEntries(entries);
}

const resolvedMenu = async (menu, lang) => ({
  id: String(menu._id),
  title: menu.title,
  items: resolveMenu(menu.items ?? [], menu.texts ?? [], lang, await refMaps(menu.items ?? [])),
});

/** The shop's pictures, as the storefront needs them (url + size), by their role. */
async function brandImages(brand = {}) {
  const ids = BRAND_IMAGE_FIELDS.map((field) => brand[field])
    .filter(Boolean)
    .map(String);
  if (!ids.length) return { logo: null, favicon: null, ogImage: null };
  const found = new Map(
    (await getMediaByIds([...new Set(ids)])).map((m) => {
      const image = publicImage(m);
      return [image.id, { url: image.url, width: image.width, height: image.height }];
    }),
  );
  const pick = (field) => (brand[field] ? (found.get(String(brand[field])) ?? null) : null);
  return { logo: pick('logoId'), favicon: pick('faviconId'), ogImage: pick('ogImageId') };
}

/**
 * Everything the storefront's header and footer need, in one request: the menus with their links
 * resolved, the announcement bar, the footer note, how to reach the shop, its SEO defaults, its
 * pictures, and the theme as CSS variables.
 */
export async function getSiteChrome(lang = SOURCE_LANGUAGE) {
  const layout = await repo.getLayout();
  const ids = [layout.headerMenuId, ...(layout.footer?.menuIds ?? [])].filter(Boolean);
  const menus = ids.length ? await repo.findMenusByIds(ids) : [];
  const byId = new Map(menus.map((m) => [String(m._id), m]));
  const header = layout.headerMenuId ? byId.get(String(layout.headerMenuId)) : null;
  const footerMenus = (layout.footer?.menuIds ?? [])
    .map((id) => byId.get(String(id)))
    .filter(Boolean);
  const text = resolveDoc(layout, LAYOUT_LOCALIZED, lang);

  return {
    announcement: {
      enabled: Boolean(layout.announcement?.enabled && text.announcement?.text),
      text: text.announcement?.text ?? '',
      href: layout.announcement?.href ?? '',
      tone: layout.announcement?.tone ?? 'primary',
    },
    header: {
      showCategoryRow: layout.showCategoryRow !== false,
      menu: header ? (await resolvedMenu(header, lang)).items : [],
    },
    footer: {
      note: text.footer?.note ?? '',
      menus: await Promise.all(footerMenus.map((m) => resolvedMenu(m, lang))),
    },
    theme: themeCssVars(layout.theme),
    brand: await brandImages(layout.brand),
    contact: {
      phone: layout.contact?.phone ?? '',
      whatsapp: layout.contact?.whatsapp ?? '',
      email: layout.contact?.email ?? '',
      address: text.contact?.address ?? '',
      nationalAddress: layout.contact?.nationalAddress ?? '',
      mapUrl: layout.contact?.mapUrl ?? '',
    },
    social: (layout.social ?? []).map((link) => ({ platform: link.platform, url: link.url })),
    seo: {
      titleSuffix: text.seo?.titleSuffix ?? '',
      defaultDescription: text.seo?.defaultDescription ?? '',
      indexable: layout.seo?.indexable !== false,
      robotsExtra: layout.seo?.robotsExtra ?? '',
    },
  };
}

// ---------------------------------------------------------------- redirects

const toRedirectDto = (r) => ({
  id: String(r._id),
  from: r.from,
  to: r.to,
  status: r.status,
  note: r.note,
  createdAt: r.createdAt,
});

export async function listRedirects() {
  return (await repo.listRedirects()).map(toRedirectDto);
}

/** What the storefront needs to answer a request: the rules, nothing else. */
export async function getPublicRedirects() {
  return (await repo.listRedirects()).map((r) => ({ from: r.from, to: r.to, status: r.status }));
}

export async function createRedirect(actor, input) {
  if (await repo.redirectFromExists(input.from))
    throw new ConflictError('A redirect for this address already exists', [
      { path: 'from', message: V.DUPLICATE },
    ]);
  const created = await repo.createRedirect({ ...input, createdBy: actor.staffId });
  emit(EVENTS.SITE_LAYOUT_UPDATED, { redirectId: String(created._id) }, actor);
  return toRedirectDto(created);
}

export async function deleteRedirect(actor, id) {
  const removed = await repo.deleteRedirect(id);
  if (!removed) throw new NotFoundError('Redirect not found');
  emit(EVENTS.SITE_LAYOUT_UPDATED, { redirectId: id }, actor);
}

export { MENU_LOCALIZED as MENU_LOCALIZED_FIELDS, LAYOUT_LOCALIZED as LAYOUT_LOCALIZED_FIELDS };
