import { describe, expect, it } from 'vitest';
import { DUMMY_PRODUCTS } from '../dummyProducts.js';

/** The demonstration catalogue: seeded on every install, so its data has to hold up. */
const checkDigit = (code) => {
  const digits = [...code].map(Number);
  const sum = digits.slice(0, 12).reduce((n, d, i) => n + d * (i % 2 === 0 ? 1 : 3), 0);
  return (10 - (sum % 10)) % 10;
};

describe('the seeded demonstration products', () => {
  it('is fifty products, each with a brand and a category', () => {
    expect(DUMMY_PRODUCTS).toHaveLength(50);
    for (const p of DUMMY_PRODUCTS) {
      expect(p.brandSlug).toMatch(/^[a-z]+$/);
      expect(p.categorySlugs.length).toBeGreaterThan(0);
      expect(p.name.length).toBeGreaterThan(5);
    }
  });

  it('can be seeded twice: slug, SKU and barcode are each its own', () => {
    for (const field of ['slug', 'sku', 'barcode']) {
      const seen = new Set(DUMMY_PRODUCTS.map((p) => p[field]));
      expect(seen.size, `${field} repeats`).toBe(50);
    }
  });

  it('carries barcodes a scanner will accept — EAN-13, check digit and all', () => {
    for (const p of DUMMY_PRODUCTS) {
      expect(p.barcode).toMatch(/^\d{13}$/);
      expect(Number(p.barcode[12]), p.barcode).toBe(checkDigit(p.barcode));
    }
  });

  it('is priced like a shop: cost under price, and the struck-through price above it', () => {
    for (const p of DUMMY_PRODUCTS) {
      expect(p.price).toBeGreaterThan(0);
      expect(Number.isInteger(p.price)).toBe(true); // halalas, never a float (CLAUDE.md §2.5)
      expect(p.cost).toBeLessThan(p.price);
      expect(p.compareAtPrice).toBeGreaterThan(p.price);
    }
  });

  it('names no category the catalogue does not have', async () => {
    const seed = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../catalog.seed.js', import.meta.url), 'utf8'),
    );
    const known = new Set([...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]));
    for (const p of DUMMY_PRODUCTS) {
      for (const slug of p.categorySlugs) expect(known.has(slug), slug).toBe(true);
    }
  });

  it('takes no slug the shop already uses', async () => {
    const seed = await import('node:fs').then((fs) =>
      fs.readFileSync(new URL('../catalog.seed.js', import.meta.url), 'utf8'),
    );
    const taken = new Set([...seed.matchAll(/slug: '([a-z0-9-]+)'/g)].map((m) => m[1]));
    for (const p of DUMMY_PRODUCTS) expect(taken.has(p.slug), p.slug).toBe(false);
  });
});
