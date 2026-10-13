/**
 * Variant selection logic (pure, unit-tested). `selection` = `{ [optionKey]: valueKey }`.
 */

const matches = (variant, selection) =>
  Object.entries(selection).every(([k, v]) => v == null || variant.optionValues?.[k] === v);

/** The variant matching every option, or null while the selection is incomplete. */
export function selectedVariant(product, selection) {
  if (!product.options.length) return product.variants[0] ?? null;
  if (product.options.some((o) => !selection[o.key])) return null;
  return product.variants.find((v) => matches(v, selection)) ?? null;
}

/**
 * State of one option value given the rest of the selection:
 * 'unavailable' (no such combination), 'out' (exists but all out of stock) or 'ok'.
 */
export function valueState(product, selection, optionKey, valueKey) {
  const candidate = { ...selection, [optionKey]: valueKey };
  const found = product.variants.filter((v) => matches(v, candidate));
  if (!found.length) return 'unavailable';
  return found.every((v) => v.inStock === false) ? 'out' : 'ok';
}

/** Starting selection: the URL's variant, else the first in-stock variant, else the first. */
export function initialSelection(product, variantId) {
  const v =
    product.variants.find((x) => x.id === variantId) ??
    product.variants.find((x) => x.inStock !== false) ??
    product.variants[0];
  return v ? { ...v.optionValues } : {};
}

/** Gallery for a variant: its own images first (in its order), then the rest of the product's. */
export function galleryFor(product, variant) {
  const own = (variant?.imageIds ?? [])
    .map((id) => product.images.find((i) => i.id === id))
    .filter(Boolean);
  const ownIds = new Set(own.map((i) => i.id));
  return [...own, ...product.images.filter((i) => !ownIds.has(i.id))];
}

/**
 * Selection after picking `valueKey` for `optionKey`: keeps the other choices when that
 * combination exists, otherwise switches to a variant having the value (in stock first).
 */
export function selectionWith(product, selection, optionKey, valueKey) {
  const next = { ...selection, [optionKey]: valueKey };
  if (product.variants.some((v) => matches(v, next))) return next;
  const having = product.variants.filter((v) => v.optionValues?.[optionKey] === valueKey);
  const pick = having.find((v) => v.inStock !== false) ?? having[0];
  return pick ? { ...pick.optionValues } : next;
}
