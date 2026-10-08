import { randomBytes } from 'node:crypto';
import { ERROR_CODES, EVENTS } from '@supershop/shared';
import { getStorage } from '../../adapters/storage/index.js';
import { sha256 } from '../../core/crypto.js';
import { AppError, BadRequestError, NotFoundError } from '../../core/errors.js';
import { eventBus } from '../../core/events.js';
import { logger } from '../../core/logger.js';
import { getSetting } from '../settings/index.js';
import { processImage, UnsupportedImageError } from './image.processor.js';
import * as repo from './media.repo.js';

/**
 * Media library (P1.1): validated image uploads → WebP variants in the storage adapter.
 * Other modules (products, pages) reference media by id and read URLs via `getMediaByIds`.
 */

const OUTPUT_MIME = 'image/webp';

export const unsupported = () =>
  new AppError(ERROR_CODES.UNSUPPORTED_MEDIA_TYPE, 'Unsupported or invalid image', {
    status: 415,
  });

/** Display name from the client file name: base name only, no control/markup chars, bounded. */
export function cleanFileName(raw) {
  const base = String(raw ?? '')
    .normalize('NFC')
    .split(/[\\/]/)
    .pop()
    .replace(/[\p{Cc}\p{Cf}<>"`]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
    .trim();
  return base || 'image';
}

/** Random, server-generated key prefix: `YYYY/MM/<32 hex>` (no user input in paths). */
function newKeyBase(now = new Date()) {
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  return `${yyyy}/${mm}/${randomBytes(16).toString('hex')}`;
}

/** Admin DTO: full LocalizedString alt + public URLs per variant. */
export function toMediaDto(m) {
  const storage = getStorage();
  const variants = Object.fromEntries(
    m.variants.map((v) => [
      v.name,
      { url: storage.url(v.key), width: v.width, height: v.height, bytes: v.bytes },
    ]),
  );
  return {
    id: String(m._id),
    name: m.name,
    alt: m.alt ?? { en: '' },
    mime: m.mime,
    sourceFormat: m.sourceFormat,
    animated: Boolean(m.animated),
    width: m.width,
    height: m.height,
    bytes: m.bytes,
    originalBytes: m.originalBytes,
    url: variants.full?.url ?? null,
    variants,
    uploadedBy: m.uploadedBy ? String(m.uploadedBy) : null,
    createdAt: m.createdAt,
    updatedAt: m.updatedAt,
  };
}

const emit = (actor, name, payload) =>
  void eventBus.emit(name, { ...payload, actorId: actor.staffId });
const auditView = (m) => ({
  name: m.name,
  alt: m.alt?.en ?? '',
  bytes: m.bytes,
  sourceFormat: m.sourceFormat,
});

export async function listMedia(query) {
  const { items, total } = await repo.listActive(query);
  return { items: items.map(toMediaDto), meta: { page: query.page, limit: query.limit, total } };
}

export async function getMedia(id) {
  const m = await repo.findActiveById(id);
  if (!m) throw new NotFoundError('Media not found');
  return toMediaDto(m);
}

/** For other modules (product gallery, page blocks). Missing/deleted ids are omitted. */
export async function getMediaByIds(ids) {
  return (await repo.findActiveByIds(ids)).map(toMediaDto);
}

/**
 * @param {import('../../core/access.js').AccessContext} actor
 * @param {{ buffer: Buffer, originalName?: string }} file
 * @param {{ alt?: string }} fields
 * @returns {Promise<{ media: object, duplicate: boolean }>}
 */
export async function uploadMedia(actor, file, { alt } = {}) {
  if (!file?.buffer?.length) throw new BadRequestError('A file is required');
  const hash = sha256(file.buffer);

  // Same bytes already in the library → reuse (no second copy in storage).
  const existing = await repo.findActiveBySha(hash);
  if (existing) return { media: toMediaDto(existing), duplicate: true };

  let processed;
  try {
    processed = await processImage(file.buffer, {
      maxDimension: getSetting('media.maxDimension'),
      quality: getSetting('media.webpQuality'),
    });
  } catch (err) {
    if (err instanceof UnsupportedImageError) throw unsupported();
    throw err;
  }

  const storage = getStorage();
  const base = newKeyBase();
  const variants = processed.variants.map((v) => ({ ...v, key: `${base}-${v.name}.webp` }));
  const stored = [];
  const cleanup = () =>
    Promise.all(stored.map((key) => storage.delete(key))).catch((err) =>
      logger.error({ err: { message: err.message }, base }, 'media cleanup failed'),
    );

  try {
    for (const v of variants) {
      await storage.put(v.key, v.data, { contentType: OUTPUT_MIME });
      stored.push(v.key);
    }
    const full = variants.find((v) => v.name === 'full');
    const created = await repo.createMedia({
      name: cleanFileName(file.originalName),
      alt: { en: alt ?? '' },
      mime: OUTPUT_MIME,
      sourceFormat: processed.sourceFormat,
      animated: processed.animated,
      width: full.width,
      height: full.height,
      bytes: full.bytes,
      originalBytes: file.buffer.length,
      sha256: hash,
      variants: variants.map(({ name, key, width, height, bytes }) => ({
        name,
        key,
        width,
        height,
        bytes,
      })),
      uploadedBy: actor.staffId ?? null,
    });
    emit(actor, EVENTS.MEDIA_UPLOADED, { mediaId: String(created._id), after: auditView(created) });
    return { media: toMediaDto(created), duplicate: false };
  } catch (err) {
    await cleanup();
    throw err;
  }
}

/** Edits display name and/or English alt text (Arabic follows automatically). */
export async function updateMedia(actor, id, { alt, name }) {
  const doc = await repo.loadForUpdate(id);
  if (!doc) throw new NotFoundError('Media not found');
  const before = auditView(doc.toObject());
  if (name !== undefined) doc.name = cleanFileName(name);
  if (alt !== undefined) doc.set('alt.en', alt);
  const saved = await repo.saveDoc(doc);
  emit(actor, EVENTS.MEDIA_UPDATED, { mediaId: id, before, after: auditView(saved) });
  return toMediaDto(saved);
}

/**
 * Soft delete: hidden from the library; stored files are kept so pages/products/orders that
 * already reference them keep rendering (purging unreferenced files is a later maintenance job).
 */
export async function deleteMedia(actor, id) {
  const m = await repo.softDelete(id);
  if (!m) throw new NotFoundError('Media not found');
  emit(actor, EVENTS.MEDIA_DELETED, { mediaId: id });
}
