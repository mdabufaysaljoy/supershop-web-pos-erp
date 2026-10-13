/**
 * Public category tree helpers (pure). Tree nodes: `{ id, name, slug, image, seo, children }`.
 */

/** Depth-first list of `{ node, trail }` where `trail` is the path from the root (inclusive). */
export function flattenTree(tree, trail = []) {
  return tree.flatMap((node) => {
    const here = [...trail, node];
    return [{ node, trail: here }, ...flattenTree(node.children ?? [], here)];
  });
}

/** `{ node, trail }` for a slug (or id), or null. */
export function findCategory(tree, { slug, id }) {
  return flattenTree(tree).find(({ node }) => (slug ? node.slug === slug : node.id === id)) ?? null;
}

/** Category path for a product: the deepest of its categories (breadcrumbs). */
export function primaryTrail(tree, categoryIds = []) {
  const found = categoryIds
    .map((id) => findCategory(tree, { id }))
    .filter(Boolean)
    .sort((a, b) => b.trail.length - a.trail.length);
  return found[0]?.trail ?? [];
}

/** Language-neutral public path of a category / product. */
export const categoryPath = (slug) => `/category/${slug}`;
export const productPath = (slug) => `/product/${slug}`;
