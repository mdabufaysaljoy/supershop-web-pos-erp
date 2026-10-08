import { CATEGORY, ERROR_CODES, EVENTS, SOURCE_LANGUAGE } from '@supershop/shared';
import { V } from '@supershop/shared/validators';
import { nextSequence } from '../../core/counter.js';
import { withTransaction } from '../../core/db.js';
import { AppError, NotFoundError, ValidationError } from '../../core/errors.js';
import { isDuplicateKey, slugTakenError, uniqueSlug } from '../../core/slug.js';
import { eventBus } from '../../core/events.js';
import { resolveDoc } from '../i18n/index.js';
import { getMediaByIds } from '../media/index.js';
import * as repo from './category.repo.js';

/**
 * Category tree (P1.2). Structural changes (create, move, delete) run in a transaction that first
 * writes one shared guard document, so concurrent tree edits serialize: two moves can't build a
 * cycle together and a child can't be created under a parent that is being deleted.
 */

const LOCALIZED = ['name', 'description', 'seo.title', 'seo.description'];
const TREE_GUARD = 'guard:category-tree';

/** Products in a category — injected by the products module at the composition root (P1.4). */
let countProductsInCategory = async () => 0;
export function setCategoryUsageCounter(fn) {
  countProductsInCategory = fn;
}

const invalidMove = (message) => new AppError(ERROR_CODES.INVALID_MOVE, message, { status: 422 });
const notFound = () => new NotFoundError('Category not found');

const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
const auditView = (c) => ({
  name: c.name?.en ?? '',
  slug: c.slug,
  parentId: c.parentId ? String(c.parentId) : null,
  isActive: c.isActive,
  imageId: c.imageId ? String(c.imageId) : null,
});

const imageView = (m) =>
  m && {
    id: m.id,
    url: m.url,
    thumbUrl: m.variants.thumb?.url ?? m.url,
    width: m.width,
    height: m.height,
  };

async function mediaMap(categories) {
  const ids = [...new Set(categories.filter((c) => c.imageId).map((c) => String(c.imageId)))];
  return new Map(ids.length ? (await getMediaByIds(ids)).map((m) => [m.id, m]) : []);
}

/** Admin DTO: full LocalizedStrings (English + generated languages with status). */
export function toCategoryDto(c, media = new Map()) {
  return {
    id: String(c._id),
    name: c.name ?? { en: '' },
    description: c.description ?? { en: '' },
    slug: c.slug,
    parentId: c.parentId ? String(c.parentId) : null,
    depth: c.depth,
    position: c.position,
    isActive: c.isActive,
    image: c.imageId ? (imageView(media.get(String(c.imageId))) ?? null) : null,
    seo: {
      title: c.seo?.title ?? { en: '' },
      description: c.seo?.description ?? { en: '' },
    },
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

async function assertImage(imageId) {
  if (!imageId) return;
  const [found] = await getMediaByIds([imageId]);
  if (!found) throw new ValidationError([{ path: 'imageId', message: V.ID_INVALID }]);
}

export async function listCategories() {
  const items = await repo.listActive();
  const media = await mediaMap(items);
  return items.map((c) => toCategoryDto(c, media));
}

/** For other modules (products): DTOs of existing categories; missing/deleted ids omitted. */
export async function getCategoriesByIds(ids) {
  const items = await repo.findActiveByIds(ids);
  const media = await mediaMap(items);
  return items.map((c) => toCategoryDto(c, media));
}

export async function getCategory(id) {
  const c = await repo.findActiveById(id);
  if (!c) throw notFound();
  return toCategoryDto(c, await mediaMap([c]));
}

/**
 * @param {import('../../core/access.js').AccessContext} actor
 * @param {{ name: string, description?: string, slug?: string, parentId?: string | null,
 *   imageId?: string | null, isActive?: boolean, seo?: { title?: string, description?: string } }} input
 */
export async function createCategory(actor, input) {
  await assertImage(input.imageId);
  const slug =
    input.slug ??
    (await uniqueSlug(input.name, { exists: (v) => repo.slugExists(v), fallback: 'category' }));
  if (input.slug && (await repo.slugExists(slug))) throw slugTakenError();

  let created;
  try {
    created = await withTransaction(async (session) => {
      await nextSequence(TREE_GUARD, { session });
      let parent = null;
      if (input.parentId) {
        parent = await repo.findActiveById(input.parentId, session);
        if (!parent) throw new ValidationError([{ path: 'parentId', message: V.ID_INVALID }]);
        if (parent.depth + 1 >= CATEGORY.MAX_DEPTH) throw invalidMove('Category tree too deep');
      }
      const siblings = await repo.listSiblings(parent?._id ?? null, session);
      return repo.createCategory(
        {
          name: { [SOURCE_LANGUAGE]: input.name },
          description: { [SOURCE_LANGUAGE]: input.description ?? '' },
          slug,
          parentId: parent?._id ?? null,
          ancestors: parent ? [...parent.ancestors, parent._id] : [],
          depth: parent ? parent.depth + 1 : 0,
          position: siblings.length ? Math.max(...siblings.map((s) => s.position)) + 1 : 0,
          imageId: input.imageId ?? null,
          isActive: input.isActive ?? true,
          seo: {
            title: { [SOURCE_LANGUAGE]: input.seo?.title ?? '' },
            description: { [SOURCE_LANGUAGE]: input.seo?.description ?? '' },
          },
        },
        session,
      );
    });
  } catch (err) {
    if (isDuplicateKey(err, 'slug')) throw slugTakenError();
    throw err;
  }
  emit(actor, EVENTS.CATEGORY_CREATED, {
    categoryId: String(created._id),
    after: auditView(created),
  });
  return toCategoryDto(created, await mediaMap([created]));
}

/** Content edits (not structure — use `moveCategory` to re-parent/reorder). */
export async function updateCategory(actor, id, input) {
  const doc = await repo.loadForUpdate(id);
  if (!doc) throw notFound();
  if (input.imageId !== undefined) await assertImage(input.imageId);
  if (
    input.slug !== undefined &&
    input.slug !== doc.slug &&
    (await repo.slugExists(input.slug, id))
  ) {
    throw slugTakenError();
  }
  const before = auditView(doc.toObject());

  const en = (path, value) => value !== undefined && doc.set(`${path}.${SOURCE_LANGUAGE}`, value);
  en('name', input.name);
  en('description', input.description);
  en('seo.title', input.seo?.title);
  en('seo.description', input.seo?.description);
  if (input.slug !== undefined) doc.slug = input.slug;
  if (input.imageId !== undefined) doc.imageId = input.imageId;
  if (input.isActive !== undefined) doc.isActive = input.isActive;

  let saved;
  try {
    saved = await repo.saveDoc(doc);
  } catch (err) {
    if (isDuplicateKey(err, 'slug')) throw slugTakenError();
    throw err;
  }
  emit(actor, EVENTS.CATEGORY_UPDATED, { categoryId: id, before, after: auditView(saved) });
  return toCategoryDto(saved, await mediaMap([saved]));
}

/**
 * Places `id` under `parentId` (null = top level) at sibling `index` (clamped). Same parent =
 * reorder. The whole subtree moves with it.
 */
export async function moveCategory(actor, id, { parentId, index }) {
  const result = await withTransaction(async (session) => {
    await nextSequence(TREE_GUARD, { session });
    const node = await repo.findActiveById(id, session);
    if (!node) throw notFound();

    let parent = null;
    if (parentId) {
      if (parentId === id) throw invalidMove('Cannot move a category into itself');
      parent = await repo.findActiveById(parentId, session);
      if (!parent) throw new ValidationError([{ path: 'parentId', message: V.ID_INVALID }]);
      if (parent.ancestors.some((a) => String(a) === id)) {
        throw invalidMove('Cannot move a category into its own subcategory');
      }
    }
    const depth = parent ? parent.depth + 1 : 0;
    const deepest = await repo.maxDescendantDepth(node._id, session);
    if (depth + ((deepest ?? node.depth) - node.depth) >= CATEGORY.MAX_DEPTH) {
      throw invalidMove('Category tree too deep');
    }

    const oldParentId = node.parentId ? String(node.parentId) : null;
    const newParentId = parent ? String(parent._id) : null;
    const siblings = (await repo.listSiblings(parent?._id ?? null, session)).filter(
      (s) => String(s._id) !== id,
    );
    const at = Math.min(index, siblings.length);
    const ordered = [...siblings.slice(0, at), { _id: node._id }, ...siblings.slice(at)];
    const current = new Map(siblings.map((s) => [String(s._id), s.position]));
    if (oldParentId === newParentId) current.set(id, node.position);

    if (oldParentId !== newParentId) {
      await repo.reparent(
        node,
        {
          parentId: parent?._id ?? null,
          ancestors: parent ? [...parent.ancestors, parent._id] : [],
          depth,
        },
        session,
      );
      // Close the gap among the old siblings.
      const old = await repo.listSiblings(node.parentId, session);
      await repo.writePositions(
        old.map((s) => s._id),
        new Map(old.map((s) => [String(s._id), s.position])),
        session,
      );
    }
    await repo.writePositions(
      ordered.map((s) => s._id),
      current,
      session,
    );
    return {
      before: { parentId: oldParentId, position: node.position },
      after: { parentId: newParentId, position: at },
    };
  });
  emit(actor, EVENTS.CATEGORY_MOVED, { categoryId: id, ...result });
  return getCategory(id);
}

/** Soft delete; refused while it has subcategories or products. */
export async function deleteCategory(actor, id) {
  await withTransaction(async (session) => {
    await nextSequence(TREE_GUARD, { session });
    const node = await repo.findActiveById(id, session);
    if (!node) throw notFound();
    if ((await repo.countActiveChildren(node._id, session)) > 0) {
      throw new AppError(ERROR_CODES.CATEGORY_HAS_CHILDREN, 'Category has subcategories', {
        status: 409,
      });
    }
    if ((await countProductsInCategory(id, { session })) > 0) {
      throw new AppError(ERROR_CODES.CATEGORY_IN_USE, 'Category has products', { status: 409 });
    }
    await repo.softDelete(node._id, session);
  });
  emit(actor, EVENTS.CATEGORY_DELETED, { categoryId: id });
}

/**
 * Storefront tree in one language: active categories only (a hidden category hides its subtree),
 * strings resolved with English fallback, nested `children` in display order.
 * @param {string} lang
 */
export async function getPublicTree(lang) {
  const all = await repo.listActive(); // parents first
  const media = await mediaMap(all.filter((c) => c.isActive));
  const nodes = new Map();
  const roots = [];
  for (const c of all) {
    if (!c.isActive) continue;
    const parentKey = c.parentId ? String(c.parentId) : null;
    if (parentKey && !nodes.has(parentKey)) continue; // parent hidden or missing → hide subtree
    const r = resolveDoc(c, LOCALIZED, lang);
    const image = c.imageId ? imageView(media.get(String(c.imageId))) : null;
    const node = {
      id: String(c._id),
      name: r.name,
      slug: c.slug,
      description: r.description,
      image: image ? { ...image, alt: r.name } : null,
      seo: { title: r.seo.title, description: r.seo.description },
      children: [],
    };
    nodes.set(node.id, node);
    (parentKey ? nodes.get(parentKey).children : roots).push(node);
  }
  return roots;
}
