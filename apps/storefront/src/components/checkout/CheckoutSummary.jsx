'use client';

import { paymentFee } from '@supershop/shared';
import Link from 'next/link';
import { MediaImage } from '@/components/catalog/MediaImage';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';

/** What is being ordered, beside the form (collapsible on phones). */
export function CheckoutSummary({ method = null, deliveryFee = 0, freeDeliveryOver = 0 }) {
  const t = useT();
  const lang = useLang();
  const { cart, fmt } = useCart();
  if (!cart)
    return <div className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none" />;
  const { totals, vatRateBps, pricesIncludeVat } = cart;
  const free = deliveryFee === 0 || (freeDeliveryOver > 0 && totals.total >= freeDeliveryOver);
  const delivery = free ? 0 : deliveryFee;
  const missing = freeDeliveryOver > 0 && !free ? freeDeliveryOver - totals.total : 0;
  // The method's fee is charged on what the customer already owes (goods + delivery), as on the API.
  const methodFee = paymentFee(method?.fee, totals.total + delivery);

  return (
    <div className="grid gap-4 rounded-2xl border border-border/80 bg-card/95 p-5 sm:p-6 shadow-md backdrop-blur-xs">
      <div className="flex items-baseline justify-between gap-3 border-b border-border/60 pb-3">
        <h2 className="text-lg font-bold tracking-tight text-foreground">
          {t('checkout.summary')}
        </h2>
        <Link
          href={localizePath('/cart', lang)}
          className="text-xs font-semibold text-primary hover:underline"
        >
          {t('checkout.editCart')}
        </Link>
      </div>
      <ul className="grid gap-3 divide-y divide-border/40">
        {cart.items.map((l) => (
          <li
            key={l.variantId}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 pt-2.5 first:pt-0"
          >
            <span className="relative size-14 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-muted/50">
              <MediaImage
                image={l.image}
                alt={l.name}
                sizes="56px"
                className="size-full object-cover"
              />
              <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground shadow-xs">
                {fmt.number(l.qty)}
              </span>
            </span>
            <span className="grid min-w-0">
              <span className="truncate text-sm font-semibold text-foreground">{l.name}</span>
              {l.options.length > 0 && (
                <span className="truncate text-xs text-muted-foreground">
                  {l.options.map((o) => o.value).join(' · ')}
                </span>
              )}
            </span>
            <span className="text-sm font-bold tabular-nums text-foreground">
              {fmt.money(l.lineTotal ?? 0)}
            </span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-2 border-t border-border/60 pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
          <dd className="font-medium tabular-nums">{fmt.money(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('checkout.delivery')}</dt>
          <dd className="font-semibold tabular-nums text-foreground">
            {free ? (
              <span className="inline-flex items-center rounded-full bg-emerald-500/10 px-2 py-0.5 text-xs font-bold text-emerald-800 dark:text-emerald-300">
                {t('checkout.freeDelivery')}
              </span>
            ) : (
              fmt.money(delivery)
            )}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {t(pricesIncludeVat ? 'cart.vatIncluded' : 'cart.vatAdded', {
              rate: fmt.percent(vatRateBps / 10_000),
            })}
          </dt>
          <dd className="tabular-nums text-muted-foreground">{fmt.money(totals.vat)}</dd>
        </div>
        {methodFee > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{method.label}</dt>
            <dd className="font-medium tabular-nums">{fmt.money(methodFee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t border-border/80 pt-3 text-base font-extrabold text-foreground">
          <dt>{t('cart.total')}</dt>
          <dd className="tabular-nums text-primary text-lg">
            {fmt.money(totals.total + delivery + methodFee)}
          </dd>
        </div>
      </dl>
      {missing > 0 && (
        <div className="rounded-xl border border-primary/20 bg-primary/5 p-2.5 text-xs text-primary font-medium">
          {t('checkout.freeDeliveryHint', { amount: fmt.money(missing) })}
        </div>
      )}
      <div className="mt-1 pt-3 border-t border-border/60 grid gap-2 text-[11px] text-muted-foreground font-medium">
        <div className="flex items-center gap-2">
          <span>🛡️</span>
          <span>Official Saudi Agency Warranty</span>
        </div>
        <div className="flex items-center gap-2">
          <span>⚡</span>
          <span>Fast SPL Courier Dispatch</span>
        </div>
      </div>
    </div>
  );
}
