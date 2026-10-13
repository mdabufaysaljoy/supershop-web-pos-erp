'use client';

import { AnimatePresence, m } from 'motion/react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { productPath } from '@/lib/categories';
import { CHECKOUT_PATH } from '@/lib/checkout';
import { cn } from '@/lib/cn';
import { MediaImage } from './MediaImage';
import { PriceTag } from './PriceTag';
import { QuickView } from './QuickView';

/**
 * Product card: image (swapped by the colour swatches below it, cross-faded), brand, name,
 * price and actions. Products without choices add in one click (and "Buy now" goes straight
 * on); products with options open a quick view to pick them, starting from the chosen swatch.
 * The whole card links to the product; the buttons sit above that link.
 */
export function ProductCard({ product: p, priority = false }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { add, busy, fmt } = useCart();
  const [swatch, setSwatch] = useState(null);
  const [quick, setQuick] = useState(false);
  const [status, setStatus] = useState(null); // null | 'added' | error message
  const href = localizePath(productPath(p.slug), lang);
  const chosen = p.swatches?.values.find((v) => v.key === swatch);
  const image = chosen?.image ?? p.image;
  const out = (chosen ? chosen.inStock : p.inStock) === false;

  const quickAdd = async (now) => {
    const res = await add(p.defaultVariantId, 1, { open: !now });
    if (!res.ok) {
      setStatus(
        t(res.error.code === 'OUT_OF_STOCK' ? 'cart.errors.OUT_OF_STOCK' : 'cart.errors.generic'),
      );
      return;
    }
    if (now) router.push(localizePath(CHECKOUT_PATH, lang));
  };
  const choose = () => setQuick(true);

  return (
    <m.article
      className="group relative grid content-start gap-2"
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div className="relative aspect-square overflow-hidden rounded-lg bg-muted">
        <AnimatePresence initial={false} mode="popLayout">
          <m.div
            key={image?.id ?? 'none'}
            className="absolute inset-0"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <MediaImage
              image={image}
              alt={p.name}
              sizes="(min-width: 1024px) 22vw, (min-width: 640px) 30vw, 46vw"
              priority={priority}
              className="size-full object-cover transition-transform duration-300 group-hover:scale-105 motion-reduce:transition-none"
            />
          </m.div>
        </AnimatePresence>
        {out && (
          <span className="absolute start-2 top-2 rounded-full bg-background/90 px-2 py-0.5 text-xs font-medium">
            {t('catalog.outOfStock')}
          </span>
        )}
      </div>

      {p.swatches && (
        <div
          className="relative z-10 flex flex-wrap items-center gap-1.5"
          role="group"
          aria-label={p.swatches.name}
        >
          {p.swatches.values.map((v) => (
            <button
              key={v.key}
              type="button"
              aria-pressed={swatch === v.key}
              aria-label={
                v.inStock === false ? t('catalog.valueOutOfStock', { value: v.label }) : v.label
              }
              title={v.label}
              onClick={() => setSwatch(v.key)}
              onMouseEnter={() => v.image && setSwatch(v.key)}
              className={cn(
                'size-6 rounded-full border p-0.5 transition-shadow',
                swatch === v.key
                  ? 'ring-2 ring-primary ring-offset-1'
                  : 'hover:ring-1 hover:ring-foreground/40',
                v.inStock === false && 'opacity-50',
              )}
            >
              <span
                className="block size-full rounded-full"
                style={{ backgroundColor: v.swatch }}
              />
            </button>
          ))}
        </div>
      )}

      <div className="grid gap-1">
        {p.brand && <p className="text-xs text-muted-foreground">{p.brand.name}</p>}
        <h3 className="line-clamp-2 text-sm font-medium">
          <Link href={href} className="after:absolute after:inset-0 after:content-['']">
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

      <div className="relative z-10 mt-1 grid grid-cols-[1fr_auto] gap-2">
        {p.defaultVariantId ? (
          <>
            <button
              type="button"
              disabled={busy || out}
              onClick={() => quickAdd(false)}
              aria-label={t('catalog.addNamed', { name: p.name })}
              className="h-9 rounded-full bg-primary px-3 text-xs font-medium text-primary-foreground transition-opacity disabled:opacity-50"
            >
              {out ? t('catalog.outOfStock') : t('cart.add')}
            </button>
            <button
              type="button"
              disabled={busy || out}
              onClick={() => quickAdd(true)}
              aria-label={t('catalog.buyNamed', { name: p.name })}
              className="h-9 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-muted disabled:opacity-50"
            >
              {t('cart.buyNow')}
            </button>
          </>
        ) : (
          <button
            type="button"
            onClick={choose}
            aria-label={t('catalog.chooseNamed', { name: p.name })}
            className="col-span-2 h-9 rounded-full border px-3 text-xs font-medium transition-colors hover:bg-muted"
          >
            {t('cart.chooseOptions')}
          </button>
        )}
      </div>
      {typeof status === 'string' && (
        <p role="status" className="relative z-10 text-xs text-destructive">
          {status}
        </p>
      )}
      {p.defaultVariantId == null && (
        <QuickView
          slug={p.slug}
          name={p.name}
          start={swatch && p.swatches ? { optionKey: p.swatches.key, valueKey: swatch } : null}
          open={quick}
          onOpenChange={setQuick}
        />
      )}
    </m.article>
  );
}

/** Responsive grid of cards; the first `eager` load eagerly (likely LCP). */
export function ProductGrid({ products, eager = 4 }) {
  return (
    <ul className="grid grid-cols-2 gap-x-4 gap-y-8 sm:grid-cols-3 lg:grid-cols-4">
      {products.map((p, i) => (
        <li key={p.id}>
          <ProductCard product={p} priority={i < eager} />
        </li>
      ))}
    </ul>
  );
}
