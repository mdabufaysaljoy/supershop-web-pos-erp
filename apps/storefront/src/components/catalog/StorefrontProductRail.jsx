'use client';

import { ProductCard } from './ProductCard';

/**
 * Interactive product rail for the storefront CMS pages (Home, Landing pages).
 * Renders CMS rail products using the full-featured ProductCard client component,
 * enabling direct one-click Add to Cart, variant QuickView modal, buy-now, and live drawer.
 */
export function StorefrontProductRail({ id, heading, context = {} }) {
  const products = context.data?.[id]?.products ?? [];
  if (!products.length) return null;

  return (
    <section className="grid gap-6">
      {heading ? (
        <div className="flex items-center justify-between border-b border-border/60 pb-3">
          <h2 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
            {heading}
          </h2>
        </div>
      ) : null}
      <div className="-mx-4 flex snap-x gap-4 overflow-x-auto px-4 pb-4 hide-scrollbar sm:grid sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 sm:overflow-visible sm:px-0 sm:gap-6">
        {products.map((product, i) => (
          <div key={product.id || i} className="w-64 shrink-0 snap-start sm:w-auto">
            <ProductCard product={product} />
          </div>
        ))}
      </div>
    </section>
  );
}
