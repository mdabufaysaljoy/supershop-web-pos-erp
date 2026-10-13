'use client';

import { createFormatters } from '@supershop/shared';
import { useMemo } from 'react';
import { AddToCart } from '@/components/cart/AddToCart';
import { PriceTag } from '@/components/catalog/PriceTag';
import { useT } from '@/i18n/I18nProvider';
import { Gallery } from './Gallery';
import { useVariantSelection } from './useVariantSelection';
import { VariantOptions } from './VariantOptions';

/**
 * Interactive part of the product page: gallery + option selector + add to cart / buy now.
 * Choosing options swaps price, availability, SKU and images; the chosen variant is kept in
 * `?variant=` (shareable, not indexed — the canonical URL has no query).
 */
export function ProductView({ product, fmtOptions, pricesIncludeVat }) {
  const t = useT();
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const { selection, variant, images, image, setImageIndex, choose } = useVariantSelection(
    product,
    {
      syncUrl: true,
    },
  );
  const stock = variant ? variant.inStock : product.inStock;

  return (
    <div className="grid gap-8 md:grid-cols-2">
      <Gallery
        images={images}
        image={image}
        onSelect={setImageIndex}
        name={product.name}
        priority
        sizes="(min-width: 768px) 50vw, 100vw"
      />
      <div className="grid content-start gap-5">
        {product.brand && <p className="text-sm text-muted-foreground">{product.brand.name}</p>}
        <h1 className="text-2xl font-semibold tracking-tight sm:text-3xl">{product.name}</h1>
        <div className="grid gap-1">
          <PriceTag
            price={variant?.price ?? product.priceMin}
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

        <VariantOptions product={product} selection={selection} onChoose={choose} />

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

        <AddToCart variant={variant} productName={product.name} buyNow />

        {product.shortDescription && (
          <p className="whitespace-pre-line text-muted-foreground">{product.shortDescription}</p>
        )}
      </div>
    </div>
  );
}
