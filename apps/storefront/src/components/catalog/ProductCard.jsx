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
  let router = null;
  try {
    // eslint-disable-next-line react-hooks/rules-of-hooks
    router = useRouter();
  } catch {
    router = null;
  }
  const { add, busy, fmt } = useCart();
  const [swatch, setSwatch] = useState(null);
  const [quick, setQuick] = useState(false);
  const [status, setStatus] = useState(null); // null | 'added' | error message
  const cardSlug = p.slug || (p.href ? p.href.replace(/^\/product\//, '') : '');
  const href = p.href ? localizePath(p.href, lang) : localizePath(productPath(cardSlug), lang);
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
    if (now && router?.push) router.push(localizePath(CHECKOUT_PATH, lang));
  };
  const choose = () => setQuick(true);

  const discountPct =
    p.compareAtPrice && p.compareAtPrice > p.priceMin
      ? Math.round(((p.compareAtPrice - p.priceMin) / p.compareAtPrice) * 100)
      : null;

  return (
    <m.article
      className="group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/70 bg-card p-3 shadow-xs transition-all duration-300 hover:border-primary/40 hover:shadow-xl"
      whileHover={{ y: -4 }}
      transition={{ type: 'spring', stiffness: 400, damping: 30 }}
    >
      <div>
        <div className="relative aspect-square overflow-hidden rounded-xl bg-muted/50">
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
                className="size-full object-cover transition-transform duration-500 group-hover:scale-105 motion-reduce:transition-none"
              />
            </m.div>
          </AnimatePresence>

          <div className="absolute inset-x-2.5 top-2.5 z-10 flex items-center justify-between pointer-events-none">
            {discountPct ? (
              <span className="rounded-full bg-rose-600 px-2 py-0.5 text-[11px] font-bold text-white shadow-xs">
                -{discountPct}%
              </span>
            ) : (
              <span />
            )}

            {out ? (
              <span className="rounded-full bg-background/90 px-2 py-0.5 text-[11px] font-semibold text-muted-foreground shadow-xs">
                {t('catalog.outOfStock')}
              </span>
            ) : (
              <span className="flex items-center gap-1 rounded-full bg-background/85 px-2 py-0.5 text-[10px] font-medium text-emerald-600 backdrop-blur-xs">
                <span className="size-1.5 rounded-full bg-emerald-500" />
                {t('catalog.inStock')}
              </span>
            )}
          </div>
        </div>

        {p.swatches && (
          <div
            className="relative z-10 mt-2.5 flex flex-wrap items-center gap-1.5"
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
                  'size-6 rounded-full border p-0.5 transition-all',
                  swatch === v.key
                    ? 'ring-2 ring-primary ring-offset-1 scale-105'
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

        <div className="mt-2.5 grid gap-1">
          {p.brand && (
            <p className="text-[11px] font-semibold tracking-wide text-muted-foreground uppercase">
              {p.brand.name}
            </p>
          )}
          <h3 className="line-clamp-2 text-sm font-semibold tracking-tight text-foreground transition-colors group-hover:text-primary">
            <Link href={href} className="after:absolute after:inset-0 after:content-['']">
              {p.name}
            </Link>
          </h3>
          <div className="mt-1">
            <PriceTag
              price={p.priceMin}
              compareAt={p.compareAtPrice}
              from={p.priceMax > p.priceMin}
              fmt={fmt}
              t={t}
              className={out ? 'opacity-60' : undefined}
            />
          </div>
        </div>
      </div>

      <div className="relative z-10 mt-3 pt-2">
        <div className="grid grid-cols-[1fr_auto] gap-1.5">
          {p.defaultVariantId ? (
            <>
              <button
                type="button"
                disabled={busy || out}
                onClick={() => quickAdd(false)}
                aria-label={t('catalog.addNamed', { name: p.name })}
                className="flex h-9 items-center justify-center gap-1.5 rounded-xl bg-primary px-3 text-xs font-semibold text-primary-foreground shadow-xs transition-all hover:bg-primary/95 hover:shadow-md disabled:opacity-50"
              >
                <svg
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  className="size-3.5"
                  aria-hidden="true"
                >
                  <path d="M6 2 3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4Z" />
                  <path d="M3 6h18" />
                  <path d="M16 10a4 4 0 0 1-8 0" />
                </svg>
                {out ? t('catalog.outOfStock') : t('cart.add')}
              </button>
              <button
                type="button"
                disabled={busy || out}
                onClick={() => quickAdd(true)}
                aria-label={t('catalog.buyNamed', { name: p.name })}
                className="flex h-9 items-center justify-center gap-1 rounded-xl border border-border/80 bg-background px-3 text-xs font-semibold transition-all hover:bg-muted hover:border-foreground/30 disabled:opacity-50"
              >
                <span aria-hidden="true">⚡</span>
                {t('cart.buyNow')}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={choose}
              aria-label={t('catalog.chooseNamed', { name: p.name })}
              className="col-span-2 flex h-9 items-center justify-center gap-1.5 rounded-xl border border-border/80 bg-background px-3 text-xs font-semibold transition-all hover:bg-muted hover:border-foreground/30"
            >
              <svg
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                className="size-3.5 text-muted-foreground"
                aria-hidden="true"
              >
                <line x1="4" x2="20" y1="21" y2="21" />
                <line x1="4" x2="20" y1="3" y2="3" />
                <line x1="4" x2="20" y1="12" y2="12" />
                <circle cx="8" cy="12" r="3" />
              </svg>
              {t('cart.chooseOptions')}
            </button>
          )}
        </div>
        {typeof status === 'string' && (
          <p role="status" className="mt-1 text-center text-xs text-destructive">
            {status}
          </p>
        )}
      </div>

      {p.defaultVariantId == null && cardSlug && (
        <QuickView
          slug={cardSlug}
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
