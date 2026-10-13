'use client';

import { useT } from '@/i18n/I18nProvider';
import { useCart } from './CartProvider';

/** Totals: subtotal, VAT (included or added), total; checkout opens with P3.4. */
export function CartSummary() {
  const t = useT();
  const { cart, fmt } = useCart();
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
      <button
        type="button"
        disabled
        title={t('cart.checkoutSoon')}
        className="h-11 rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {t('cart.checkout')}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t('cart.checkoutSoon')}</p>
    </div>
  );
}
