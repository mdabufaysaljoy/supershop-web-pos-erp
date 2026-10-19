'use client';

import Link from 'next/link';
import { Dialog } from 'radix-ui';
import { useEffect, useState } from 'react';
import { AddToCart } from '@/components/cart/AddToCart';
import { useCart } from '@/components/cart/CartProvider';
import { Gallery } from '@/components/product/Gallery';
import { useVariantSelection } from '@/components/product/useVariantSelection';
import { VariantOptions } from '@/components/product/VariantOptions';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { productPath } from '@/lib/categories';
import { PriceTag } from './PriceTag';
import { ProductQuickSkeleton } from './Skeletons';

/**
 * "Choose options" from a product card: loads the product (current language), lets the shopper
 * pick a variant and add it / buy it now without leaving the listing. `start` preselects the
 * swatch value chosen on the card.
 */
export function QuickView({ slug, name, start, open, onOpenChange }) {
  const t = useT();
  const lang = useLang();
  const [state, setState] = useState({ slug: null, product: null, error: false });

  useEffect(() => {
    if (!open || state.slug === slug) return undefined;
    let alive = true;
    fetch(`/api/v1/products/public/${encodeURIComponent(slug)}?${new URLSearchParams({ lang })}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
      .then((body) => alive && setState({ slug, product: body.data, error: false }))
      .catch(() => alive && setState({ slug, product: null, error: true }));
    return () => {
      alive = false;
    };
  }, [open, slug, lang, state.slug]);

  const loaded = state.slug === slug ? state : { product: null, error: false };
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/40" />
        <Dialog.Content
          aria-describedby={undefined}
          className="dialog-pop fixed inset-x-4 top-1/2 z-50 mx-auto max-h-[90svh] max-w-3xl -translate-y-1/2 overflow-y-auto rounded-xl bg-background p-5 shadow-xl outline-none sm:p-6"
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <Dialog.Title className="text-lg font-semibold">
              {loaded.product?.name ?? name}
            </Dialog.Title>
            <Dialog.Close
              aria-label={t('catalog.close')}
              className="rounded-md p-2 text-muted-foreground hover:bg-muted hover:text-foreground"
            >
              <svg
                viewBox="0 0 24 24"
                className="size-5"
                aria-hidden
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
              >
                <path d="M18 6 6 18M6 6l12 12" />
              </svg>
            </Dialog.Close>
          </div>
          {loaded.error ? (
            <p role="alert" className="text-sm text-destructive">
              {t('cart.errors.generic')}
            </p>
          ) : !loaded.product ? (
            <ProductQuickSkeleton />
          ) : (
            <QuickViewBody
              product={loaded.product}
              start={start}
              onDone={() => onOpenChange(false)}
              lang={lang}
            />
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

function QuickViewBody({ product, start, onDone, lang }) {
  const t = useT();
  const { fmt } = useCart();
  const { selection, variant, images, image, setImageIndex, choose } = useVariantSelection(
    product,
    { start },
  );
  return (
    <div className="grid gap-6 sm:grid-cols-2">
      <Gallery
        images={images}
        image={image}
        onSelect={setImageIndex}
        name={product.name}
        sizes="(min-width: 640px) 360px, 90vw"
      />
      <div className="grid content-start gap-4">
        <PriceTag
          price={variant?.price ?? product.priceMin}
          compareAt={variant ? variant.compareAtPrice : null}
          from={!variant && product.priceMax > product.priceMin}
          fmt={fmt}
          t={t}
          size="lg"
        />
        <VariantOptions product={product} selection={selection} onChoose={choose} />
        <AddToCart variant={variant} productName={product.name} buyNow onAdded={onDone} />
        <Link
          href={localizePath(productPath(product.slug), lang)}
          onClick={onDone}
          className="text-sm underline underline-offset-4"
        >
          {t('catalog.viewDetails')}
        </Link>
      </div>
    </div>
  );
}
