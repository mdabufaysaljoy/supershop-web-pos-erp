import { ERROR_CODES, EVENTS, SOURCE_LANGUAGE } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { AppError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { isDuplicateKey, nameTakenError, slugTakenError, uniqueSlug } from '../../core/slug.js';
import { resolveDoc } from '../i18n/index.js';
import { getMediaByIds } from '../media/index.js';
import * as repo from './brand.repo.js';

/** Brands (P1.3). Name is never translated; description/SEO are auto-translated. */

const LOCALIZED = ['description', 'seo.title', 'seo.description'];

/** Products of a brand — injected by the products module at the composition root (P1.4). */
let countProductsOfBrand = async () => 0;
export function setBrandUsageCounter(fn) {
  countProductsOfBrand = fn;
}

const notFound = () => new NotFoundError('Brand not found');
const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
const auditView = (b) => ({
  name: b.name,
  slug: b.slug,
  isActive: b.isActive,
  protectName: b.protectName,
  logoId: b.logoId ? String(b.logoId) : null,
  website: b.website ?? null,
});

const logoView = (m) =>
  m && {
    id: m.id,
    url: m.url,
    thumbUrl: m.variants.thumb?.url ?? m.url,
    width: m.width,
    height: m.height,
  };

async function mediaMap(brands) {
  const ids = [...new Set(brands.filter((b) => b.logoId).map((b) => String(b.logoId)))];
  return new Map(ids.length ? (await getMediaByIds(ids)).map((m) => [m.id, m]) : []);
}

/** Admin DTO (full LocalizedStrings). */
export function toBrandDto(b, media = new Map()) {
  return {
    id: String(b._id),
    name: b.name,
    slug: b.slug,
    description: b.description ?? { en: '' },
    logo: b.logoId ? (logoView(media.get(String(b.logoId))) ?? null) : null,
    website: b.website ?? null,
    isActive: b.isActive,
    protectName: b.protectName,
    seo: { title: b.seo?.title ?? { en: '' }, description: b.seo?.description ?? { en: '' } },
    createdAt: b.createdAt,
    updatedAt: b.updatedAt,
  };
}

async function assertLogo(logoId) {
  if (!logoId) return;
  const [found] = await getMediaByIds([logoId]);
  if (!found) throw new ValidationError([{ path: 'logoId', message: V.ID_INVALID }]);
}

function mapDuplicate(err) {
  if (isDuplicateKey(err, 'slug')) return slugTakenError();
  if (isDuplicateKey(err, 'nameKey')) return nameTakenError();
  return err;
}

export async function listBrands(query) {
  const { items, total } = await repo.listActive(query);
  const media = await mediaMap(items);
  return {
    items: items.map((b) => toBrandDto(b, media)),
    meta: { page: query.page, limit: query.limit, total },
  };
}

export async function getBrand(id) {
  const b = await repo.findActiveById(id);
  if (!b) throw notFound();
  return toBrandDto(b, await mediaMap([b]));
}

export async function createBrand(actor, input) {
  await assertLogo(input.logoId);
  if (await repo.nameExists(input.name)) throw nameTakenError();
  if (input.slug && (await repo.slugExists(input.slug))) throw slugTakenError();
  const slug =
    input.slug ??
    (await uniqueSlug(input.name, { exists: (v) => repo.slugExists(v), fallback: 'brand' }));
  let created;
  try {
    created = await repo.createBrand({
      name: input.name,
      slug,
      description: { [SOURCE_LANGUAGE]: input.description ?? '' },
      logoId: input.logoId ?? null,
      website: input.website ?? null,
      isActive: input.isActive ?? true,
      protectName: input.protectName ?? true,
      seo: {
        title: { [SOURCE_LANGUAGE]: input.seo?.title ?? '' },
        description: { [SOURCE_LANGUAGE]: input.seo?.description ?? '' },
      },
    });
  } catch (err) {
    throw mapDuplicate(err);
  }
  emit(actor, EVENTS.BRAND_CREATED, { brandId: String(created._id), after: auditView(created) });
  return toBrandDto(created, await mediaMap([created]));
}

export async function updateBrand(actor, id, input) {
  const doc = await repo.loadForUpdate(id);
  if (!doc) throw notFound();
  if (input.logoId !== undefined) await assertLogo(input.logoId);
  if (input.name !== undefined && (await repo.nameExists(input.name, id))) throw nameTakenError();
  if (input.slug !== undefined && (await repo.slugExists(input.slug, id))) throw slugTakenError();
  const before = auditView(doc.toObject());

  for (const key of ['name', 'slug', 'logoId', 'website', 'isActive', 'protectName']) {
    if (input[key] !== undefined) doc.set(key, input[key]);
  }
  const en = (path, value) => value !== undefined && doc.set(`${path}.${SOURCE_LANGUAGE}`, value);
  en('description', input.description);
  en('seo.title', input.seo?.title);
  en('seo.description', input.seo?.description);

  let saved;
  try {
    saved = await repo.saveDoc(doc);
  } catch (err) {
    throw mapDuplicate(err);
  }
  emit(actor, EVENTS.BRAND_UPDATED, { brandId: id, before, after: auditView(saved) });
  return toBrandDto(saved, await mediaMap([saved]));
}

/** Soft delete; refused while products use the brand. */
export async function deleteBrand(actor, id) {
  const b = await repo.findActiveById(id);
  if (!b) throw notFound();
  if ((await countProductsOfBrand(id)) > 0) {
    throw new AppError(ERROR_CODES.BRAND_IN_USE, 'Brand has products', { status: 409 });
  }
  if (!(await repo.softDelete(id))) throw notFound();
  emit(actor, EVENTS.BRAND_DELETED, { brandId: id });
}

/** Storefront list (brand strip, filters) in one language. */
export async function listPublicBrands(lang) {
  const brands = await repo.listVisible();
  const media = await mediaMap(brands);
  return brands.map((b) => {
    const r = resolveDoc(b, LOCALIZED, lang);
    const logo = b.logoId ? logoView(media.get(String(b.logoId))) : null;
    return {
      id: String(b._id),
      name: b.name,
      slug: b.slug,
      description: r.description,
      logo: logo ? { ...logo, alt: b.name } : null,
      website: b.website ?? null,
      seo: { title: r.seo.title, description: r.seo.description },
    };
  });
}

/** For other modules (products): DTOs of existing brands; missing ids omitted. */
export async function getBrandsByIds(ids) {
  const brands = await repo.findActiveByIds(ids);
  const media = await mediaMap(brands);
  return brands.map((b) => toBrandDto(b, media));
}

/** `[{ id, name, slug }]` of all brands (imports resolve brand names/slugs). */
export const listAllBrands = async () =>
  (await repo.listAllActive()).map((b) => ({ id: String(b._id), name: b.name, slug: b.slug }));
