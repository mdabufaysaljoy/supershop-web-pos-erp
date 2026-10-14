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
    <div className="grid gap-4 rounded-xl border p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-lg font-semibold">{t('checkout.summary')}</h2>
        <Link href={localizePath('/cart', lang)} className="text-sm underline underline-offset-4">
          {t('checkout.editCart')}
        </Link>
      </div>
      <ul className="grid gap-3">
        {cart.items.map((l) => (
          <li key={l.variantId} className="grid grid-cols-[auto_1fr_auto] items-center gap-3">
            <span className="relative size-14 shrink-0 overflow-hidden rounded-md bg-muted">
              <MediaImage
                image={l.image}
                alt={l.name}
                sizes="56px"
                className="size-full object-cover"
              />
              <span className="absolute -end-1 -top-1 grid size-5 place-items-center rounded-full bg-primary text-[11px] font-semibold text-primary-foreground">
                {fmt.number(l.qty)}
              </span>
            </span>
            <span className="grid min-w-0">
              <span className="truncate text-sm">{l.name}</span>
              {l.options.length > 0 && (
                <span className="truncate text-xs text-muted-foreground">
                  {l.options.map((o) => o.value).join(' · ')}
                </span>
              )}
            </span>
            <span className="text-sm tabular-nums">{fmt.money(l.lineTotal ?? 0)}</span>
          </li>
        ))}
      </ul>
      <dl className="grid gap-1.5 border-t pt-3 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
          <dd className="tabular-nums">{fmt.money(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('checkout.delivery')}</dt>
          <dd className="tabular-nums">
            {free ? t('checkout.freeDelivery') : fmt.money(delivery)}
          </dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {t(pricesIncludeVat ? 'cart.vatIncluded' : 'cart.vatAdded', {
              rate: fmt.percent(vatRateBps / 10_000),
            })}
          </dt>
          <dd className="tabular-nums">{fmt.money(totals.vat)}</dd>
        </div>
        {methodFee > 0 && (
          <div className="flex justify-between gap-4">
            <dt className="text-muted-foreground">{method.label}</dt>
            <dd className="tabular-nums">{fmt.money(methodFee)}</dd>
          </div>
        )}
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
          <dt>{t('cart.total')}</dt>
          <dd className="tabular-nums">{fmt.money(totals.total + delivery + methodFee)}</dd>
        </div>
      </dl>
      {missing > 0 && (
        <p className="text-xs text-muted-foreground">
          {t('checkout.freeDeliveryHint', { amount: fmt.money(missing) })}
        </p>
      )}
    </div>
  );
}
