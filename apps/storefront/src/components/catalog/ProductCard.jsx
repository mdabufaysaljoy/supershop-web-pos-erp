import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { productPath } from '@/lib/categories';
import { MediaImage } from './MediaImage';
import { PriceTag } from './PriceTag';

/** Grid card (server component): image, brand, name, price, out-of-stock state. */
export function ProductCard({ product: p, lang, fmt, t, priority = false }) {
  const out = p.inStock === false;
  return (
    <article className="group relative grid content-start gap-2">
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <MediaImage
          image={p.image}
          alt={p.name}
          sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw"
          priority={priority}
          className="size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
        />
        {out && (
          <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            {t('catalog.outOfStock')}
          </span>
        )}
      </div>
      <div className="grid gap-1">
        {p.brand && <p className="text-xs text-muted-foreground">{p.brand.name}</p>}
        <h3 className="line-clamp-2 text-sm font-medium">
          <Link
            href={localizePath(productPath(p.slug), lang)}
            className="after:absolute after:inset-0"
          >
            {p.name}
          </Link>
        </h3>
        <PriceTag
          price={p.priceMin}
          compareAt={p.compareAtPrice}
          from={p.priceMax > p.priceMin}
          fmt={fmt}
          t={t}
          className={out ? 'opacity-60' : undefined}
        />
      </div>
    </article>
  );
}

/** Responsive grid of cards; the first row loads eagerly (likely LCP). */
export function ProductGrid({ products, lang, fmt, t, eager = 4 }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} lang={lang} fmt={fmt} t={t} priority={i < eager} />
        </li>
      ))}
    </ul>
  );
}
