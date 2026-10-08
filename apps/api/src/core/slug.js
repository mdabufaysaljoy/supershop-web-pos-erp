import { ERROR_CODES } from '@supershop/shared';
import { toSlug, V } from '@supershop/shared/validators';
import { AppError } from './errors.js';

/**
 * URL slug helpers shared by catalog/content modules (categories, brands, products, pages).
 * Uniqueness is ultimately enforced by each collection's unique index; these give friendly results.
 */

/**
 * First free slug derived from `text`: `shoes`, `shoes-2`, … (random suffix after 50 tries).
 * @param {string} text
 * @param {{ exists: (slug: string) => Promise<boolean>, fallback?: string }} opts
 */
export async function uniqueSlug(text, { exists, fallback = 'item' }) {
  const base = toSlug(text) || fallback;
  for (let n = 1; n <= 50; n += 1) {
    const candidate = n === 1 ? base : `${base.slice(0, 110)}-${n}`;
    if (!(await exists(candidate))) return candidate;
  }
  return `${base.slice(0, 100)}-${Date.now().toString(36)}`;
}

/** 409 with a field detail so forms can show it inline. */
export const slugTakenError = () =>
  new AppError(ERROR_CODES.SLUG_TAKEN, 'Slug already in use', {
    status: 409,
    details: [{ path: 'slug', message: V.DUPLICATE }],
  });

export const nameTakenError = () =>
  new AppError(ERROR_CODES.NAME_TAKEN, 'Name already in use', {
    status: 409,
    details: [{ path: 'name', message: V.DUPLICATE }],
  });

/** Mongo duplicate-key error on `field` (E11000). */
export const isDuplicateKey = (err, field) =>
  err?.code === 11000 && Boolean(err.keyPattern?.[field]);
