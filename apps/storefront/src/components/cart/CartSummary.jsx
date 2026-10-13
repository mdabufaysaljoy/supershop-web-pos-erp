'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { useCart } from './CartProvider';

/** Totals: subtotal, VAT (included or added), total, and the way to checkout. */
export function CartSummary() {
  const t = useT();
  const lang = useLang();
  const { cart, fmt, setOpen } = useCart();
  const { totals, pricesIncludeVat, vatRateBps } = cart;
  const rate = fmt.percent(vatRateBps / 10_000);
  const blocked = cart.items.some((l) => l.status !== 'ok');
  return (
    <div className="grid gap-3">
      <dl className="grid gap-1.5 text-sm">
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">{t('cart.subtotal')}</dt>
          <dd className="tabular-nums">{fmt.money(totals.subtotal)}</dd>
        </div>
        <div className="flex justify-between gap-4">
          <dt className="text-muted-foreground">
            {t(pricesIncludeVat ? 'cart.vatIncluded' : 'cart.vatAdded', { rate })}
          </dt>
          <dd className="tabular-nums">{fmt.money(totals.vat)}</dd>
        </div>
        <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
          <dt>{t('cart.total')}</dt>
          <dd className="tabular-nums">{fmt.money(totals.total)}</dd>
        </div>
      </dl>
      <p className="text-xs text-muted-foreground">{t('cart.shippingAtCheckout')}</p>
      {blocked && <p className="text-xs text-destructive">{t('cart.removeUnavailable')}</p>}
      <Link
        href={localizePath('/checkout', lang)}
        aria-disabled={blocked || undefined}
        onClick={(e) => {
          if (blocked) e.preventDefault();
          else setOpen(false); // leaving for checkout closes the mini-cart behind it
        }}
        className="grid h-11 place-items-center rounded-full bg-primary text-sm font-medium text-primary-foreground aria-disabled:opacity-60"
      >
        {t('cart.checkout')}
      </Link>
    </div>
  );
}
