'use client';

import { createFormatters } from '@supershop/shared';
import { useEffect, useMemo, useState } from 'react';
import { AddToCart } from '@/components/cart/AddToCart';
import { MediaImage } from '@/components/catalog/MediaImage';
import { PriceTag } from '@/components/catalog/PriceTag';
import { useT } from '@/i18n/I18nProvider';
import { cn } from '@/lib/cn';
import { galleryFor, initialSelection, selectedVariant, valueState } from './variants';

/**
 * Interactive part of the product page: gallery + option selector. Choosing options swaps the
 * price, availability, SKU and images; the chosen variant is kept in `?variant=` (shareable, not
 * indexed — the canonical URL has no query).
 */
export function ProductView({ product, fmtOptions, pricesIncludeVat }) {
  const t = useT();
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const [selection, setSelection] = useState(() => initialSelection(product, null));
  const [imageIndex, setImageIndex] = useState(0);

  // Restore a shared ?variant= after hydration (keeps the server render cacheable).
  useEffect(() => {
    const id = new URLSearchParams(window.location.search).get('variant');
    if (id && product.variants.some((v) => v.id === id)) {
      setSelection(initialSelection(product, id)); // eslint-disable-line react-hooks/set-state-in-effect
    }
  }, [product]);

  const variant = selectedVariant(product, selection);
  const images = galleryFor(product, variant);
  const image = images[Math.min(imageIndex, images.length - 1)] ?? null;

  const choose = (optionKey, valueKey) => {
    const next = { ...selection, [optionKey]: valueKey };
    // Keep a valid combination: if the new value doesn't fit the rest, take a variant that has it.
    const fits = product.variants.some((v) =>
      Object.entries(next).every(([k, val]) => v.optionValues?.[k] === val),
    );
    const sel = fits
      ? next
      : initialSelection(
          product,
          product.variants.find((v) => v.optionValues?.[optionKey] === valueKey)?.id,
        );
    setSelection(sel);
    setImageIndex(0);
    const chosen = selectedVariant(product, sel);
    if (chosen) {
      const url = new URL(window.location.href);
      url.searchParams.set('variant', chosen.id);
      window.history.replaceState(window.history.state, '', url);
    }
  };

  const price = variant?.price ?? product.priceMin;
  const stock = variant ? variant.inStock : product.inStock;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <div className="grid content-start gap-3">
        <div className="aspect-square overflow-hidden rounded-xl bg-muted">
          <MediaImage
            image={image}
            alt={product.name}
            sizes="(min-width: 768px) 50vw, 100vw"
            priority
            className="size-full object-contain"
          />
        </div>
        {images.length > 1 && (
          <ul className="flex gap-2 overflow-x-auto pb-1" aria-label={t('catalog.gallery')}>
            {images.map((img, i) => (
              <li key={img.id} className="shrink-0">
                <button
                  type="button"
                  onClick={() => setImageIndex(i)}
                  aria-label={t('catalog.showImage', { n: i + 1 })}
                  aria-current={img === image ? 'true' : undefined}
                  className="block size-16 overflow-hidden rounded-md border-2 border-transparent aria-[current]:border-primary"
                >
                  <MediaImage image={img} alt="" sizes="64px" className="size-full object-cover" />
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="grid content-start gap-5">
        {product.brand && <p className="text-sm text-muted-foreground">{product.brand.name}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
        <div className="grid gap-1">
          <PriceTag
            price={price}
            compareAt={variant ? variant.compareAtPrice : null}
            from={!variant && product.priceMax > product.priceMin}
            fmt={fmt}
            t={t}
            size="lg"
          />
          <p className="text-xs text-muted-foreground">
            {t(pricesIncludeVat ? 'catalog.vatIncluded' : 'catalog.vatExcluded')}
          </p>
        </div>

        {product.options.map((o) => (
          <fieldset key={o.key} className="grid gap-2">
            <legend className="mb-2 text-sm font-medium">
              {o.name}
              {selection[o.key] && (
                <span className="font-normal text-muted-foreground">
                  {': '}
                  {o.values.find((v) => v.key === selection[o.key])?.label}
                </span>
              )}
            </legend>
            <div className="flex flex-wrap gap-2">
              {o.values.map((v) => {
                const state = valueState(product, selection, o.key, v.key);
                const selected = selection[o.key] === v.key;
                const label =
                  state === 'out' ? t('catalog.valueOutOfStock', { value: v.label }) : v.label;
                return (
                  <button
                    key={v.key}
                    type="button"
                    aria-pressed={selected}
                    aria-label={v.swatch ? label : undefined}
                    title={v.swatch ? label : undefined}
                    disabled={state === 'unavailable'}
                    onClick={() => choose(o.key, v.key)}
                    className={cn(
                      'relative rounded-md border text-sm transition-colors disabled:cursor-not-allowed disabled:opacity-40',
                      v.swatch ? 'size-10 rounded-full p-1' : 'min-h-10 px-3',
                      selected
                        ? 'border-primary ring-2 ring-primary/30'
                        : 'hover:border-foreground/40',
                      state === 'out' && 'text-muted-foreground line-through',
                    )}
                  >
                    {v.swatch ? (
                      <span
                        className="block size-full rounded-full border"
                        style={{ backgroundColor: v.swatch }}
                      />
                    ) : (
                      v.label
                    )}
                  </button>
                );
              })}
            </div>
          </fieldset>
        ))}

        <div className="grid gap-1 text-sm" aria-live="polite">
          {stock != null && (
            <p className={stock ? 'font-medium text-emerald-700' : 'font-medium text-destructive'}>
              {t(stock ? 'catalog.inStock' : 'catalog.outOfStock')}
            </p>
          )}
          {!variant && product.options.length > 0 && (
            <p className="text-muted-foreground">{t('catalog.chooseOptions')}</p>
          )}
          {variant && (
            <p className="text-muted-foreground">
              {t('catalog.sku')}: <span dir="ltr">{variant.sku}</span>
            </p>
          )}
        </div>

        <AddToCart variant={variant} productName={product.name} />

        {product.shortDescription && (
          <p className="whitespace-pre-line text-muted-foreground">{product.shortDescription}</p>
        )}
      </div>
    </div>
  );
}
