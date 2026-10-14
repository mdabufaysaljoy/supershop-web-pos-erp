import {
  countBlocks,
  EVENTS,
  getBlock,
  localizeBlocks,
  migratePageContent,
  pageContentSchema,
  resolveLocalized,
  SOURCE_LANGUAGE,
  syncTexts,
  walkBlocks,
} from '@supershop/shared';
import { ConflictError, NotFoundError, ValidationError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { sanitizeHtml } from '../../core/sanitizeHtml.js';
import { uniqueSlug } from '../../core/slug.js';
import { resolveDoc } from '../i18n/index.js';
import { getMediaByIds, publicImage } from '../media/index.js';
import * as repo from './page.repo.js';

/**
 * Pages (P5.1): the block document, its text, and the two things that must happen on every save —
 * the HTML is sanitized, and the customer-facing strings are mirrored into `texts` so the normal
 * translation machinery picks them up (§5.7). The BUILDER (P5.2) and the screens (P5.4) sit on top
 * of this; nothing here knows about dragging or forms.
 */
const LOCALIZED = ['title', 'seo.title', 'seo.description', 'texts.*.value'];

/** Props whose value is HTML get cleaned; every other prop was validated by the registry. */
function sanitizeContent(content) {
  for (const block of walkBlocks(content.blocks)) {
    const definition = getBlock(block.type);
    if (!definition) continue;
    for (const prop of definition.propNames) {
      if (prop === 'html' && typeof block.props[prop] === 'string')
        block.props[prop] = sanitizeHtml(block.props[prop]);
    }
  }
  return content;
}

/**
 * Validates a page document against the registry and cleans it. Field errors carry the path the
 * builder needs (`blocks.2.props.href`).
 */
export function parseContent(input) {
  const parsed = pageContentSchema.safeParse(migratePageContent(input ?? { blocks: [] }));
  if (!parsed.success) {
    throw new ValidationError(
      parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      'This page has a block the shop cannot render',
    );
  }
  return sanitizeContent(parsed.data);
}

export const toAdminDto = (p) => ({
  id: String(p._id),
  slug: p.slug,
  title: p.title,
  status: p.status,
  isHome: p.isHome,
  draft: p.draft ?? { blocks: [] },
  published: p.published ?? null,
  texts: p.texts ?? [],
  seo: p.seo ?? {},
  blockCount: countBlocks(p.draft),
  publishedAt: p.publishedAt ?? null,
  updatedAt: p.updatedAt,
});

/** The images a page's blocks point at, as the renderer needs them (url + size). */
async function mediaFor(blocks) {
  const ids = [...walkBlocks(blocks)]
    .map((b) => b.props?.mediaId)
    .filter(Boolean)
    .map(String);
  if (!ids.length) return {};
  const items = await getMediaByIds([...new Set(ids)]);
  return Object.fromEntries(
    items.map((m) => {
      const image = publicImage(m);
      return [
        image.id,
        {
          url: image.url,
          // Every stored size, so the renderer can let the browser pick (§5.4, D-094).
          srcSet: image.sources.map((s) => `${s.url} ${s.width}w`).join(', '),
          width: image.width,
          height: image.height,
        },
      ];
    }),
  );
}

/** What a visitor gets: the PUBLISHED blocks, with every translatable prop in their language. */
export function toPublicDto(page, lang = SOURCE_LANGUAGE) {
  const resolved = resolveDoc(page, ['title', 'seo.title', 'seo.description'], lang);
  const content = page.published ?? { blocks: [] };
  return {
    slug: page.slug,
    title: resolved.title,
    seo: { title: resolved.seo?.title ?? '', description: resolved.seo?.description ?? '' },
    content: { ...content, blocks: localizeBlocks(content.blocks ?? [], page.texts, lang) },
    publishedAt: page.publishedAt ?? null,
  };
}

export async function listPages({ page = 1, limit = 20, status } = {}) {
  const { items, total } = await repo.list({ skip: (page - 1) * limit, limit, status });
  return { data: items.map(toAdminDto), meta: { page, limit, total } };
}

export async function getPage(id) {
  const page = await repo.findById(id);
  if (!page || page.deletedAt) throw new NotFoundError('Page not found');
  return toAdminDto(page);
}

export async function createPage(input, actor) {
  const slug =
    input.slug ??
    (await uniqueSlug(input.title, { exists: (v) => repo.slugExists(v), fallback: 'page' }));
  if (await repo.slugExists(slug))
    throw new ConflictError('That address is taken', { fields: ['slug'] });

  const draft = parseContent(input.draft);
  const created = await repo.create({
    slug,
    title: { [SOURCE_LANGUAGE]: input.title },
    status: 'draft',
    isHome: false,
    draft,
    texts: syncTexts(draft, []),
    seo: {
      title: { [SOURCE_LANGUAGE]: input.seo?.title ?? '' },
      description: { [SOURCE_LANGUAGE]: input.seo?.description ?? '' },
    },
    updatedBy: actor?.staffId ?? null,
  });
  emit(EVENTS.PAGE_CREATED, created, actor);
  return toAdminDto(created);
}

/**
 * Saves the draft. The blocks are validated and cleaned, then `texts` is brought in line with
 * them — new strings appear, changed English marks its translation stale, text of deleted blocks
 * disappears — and the save hooks do the rest (§5.7).
 */
export async function updatePage(id, input, actor) {
  if (input.slug && (await repo.slugExists(input.slug, id)))
    throw new ConflictError('That address is taken', { fields: ['slug'] });

  const updated = await repo.update(id, async (doc) => {
    if (input.slug !== undefined) doc.slug = input.slug;
    if (input.title !== undefined) doc.set(`title.${SOURCE_LANGUAGE}`, input.title);
    if (input.seo?.title !== undefined) doc.set(`seo.title.${SOURCE_LANGUAGE}`, input.seo.title);
    if (input.seo?.description !== undefined)
      doc.set(`seo.description.${SOURCE_LANGUAGE}`, input.seo.description);
    if (input.draft !== undefined) {
      const draft = parseContent(input.draft);
      doc.draft = draft;
      doc.markModified('draft');
      doc.texts = syncTexts(
        draft,
        (doc.texts ?? []).map((t) => t.toObject?.() ?? t),
      );
      doc.markModified('texts');
    }
    if (input.isHome === true) {
      await repo.clearHome(id);
      doc.isHome = true;
    } else if (input.isHome === false) {
      doc.isHome = false;
    }
    doc.updatedBy = actor?.staffId ?? null;
  });
  if (!updated) throw new NotFoundError('Page not found');
  emit(EVENTS.PAGE_UPDATED, updated, actor);
  return toAdminDto(updated);
}

/** Publishing copies the draft blocks over; the text (and its translations) stays where it is. */
export async function publishPage(id, actor) {
  const updated = await repo.update(id, (doc) => {
    // A DEEP copy: the draft's blocks are Mixed, so a shallow one would leave the published page
    // pointing at the very objects the builder goes on editing.
    doc.published = structuredClone(doc.draft?.toObject?.() ?? doc.draft ?? { blocks: [] });
    doc.markModified('published');
    doc.status = 'published';
    doc.publishedAt = new Date();
    doc.updatedBy = actor?.staffId ?? null;
  });
  if (!updated) throw new NotFoundError('Page not found');
  emit(EVENTS.PAGE_PUBLISHED, updated, actor);
  return toAdminDto(updated);
}

/** Takes a page off the site without losing the work. */
export async function unpublishPage(id, actor) {
  const updated = await repo.update(id, (doc) => {
    doc.status = 'draft';
    doc.published = null;
    doc.publishedAt = null;
    doc.updatedBy = actor?.staffId ?? null;
  });
  if (!updated) throw new NotFoundError('Page not found');
  emit(EVENTS.PAGE_UPDATED, updated, actor);
  return toAdminDto(updated);
}

export async function deletePage(id, actor) {
  const deleted = await repo.softDelete(id);
  if (!deleted) throw new NotFoundError('Page not found');
  emit(EVENTS.PAGE_DELETED, deleted, actor);
}

/** The storefront asks by slug (or for the home page) and gets one language. */
export async function getPublicPage({ slug, home = false }, lang) {
  const page = home ? await repo.findHome() : await repo.findBySlug(slug);
  if (!page || page.status !== 'published' || !page.published)
    throw new NotFoundError('Page not found');
  const dto = toPublicDto(page, lang);
  // Images are referenced by id; the storefront should not have to look them up itself.
  return { ...dto, media: await mediaFor(dto.content.blocks) };
}

const emit = (name, page, actor) =>
  void eventBus.emit(name, {
    pageId: String(page._id),
    slug: page.slug,
    status: page.status,
    staffId: actor?.staffId ? String(actor.staffId) : null,
  });

export { LOCALIZED as PAGE_LOCALIZED_FIELDS, resolveLocalized };
