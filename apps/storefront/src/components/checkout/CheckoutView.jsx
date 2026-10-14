'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { CheckoutForm } from './CheckoutForm';
import { CheckoutSummary } from './CheckoutSummary';

/** Checkout page body: the form plus the order summary (both client — the cart is personal). */
export function CheckoutView({ fields, methods = [], deliveryFee, freeDeliveryOver }) {
  const t = useT();
  const lang = useLang();
  const { cart } = useCart();
  // The chosen method lives here: the form picks it, the summary prices it.
  const [method, setMethod] = useState(methods[0] ?? null);

  if (!cart) {
    return (
      <div
        className="h-96 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
        aria-busy="true"
      />
    );
  }
  if (!cart.items.length) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <p className="text-lg font-medium">{t('cart.empty')}</p>
        <Link
          href={localizePath('/search', lang)}
          className="inline-flex h-11 items-center rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground"
        >
          {t('cart.startShopping')}
        </Link>
      </div>
    );
  }
  return (
    <div className="grid gap-8 lg:grid-cols-[1fr_22rem] lg:items-start">
      <CheckoutForm fields={fields} methods={methods} method={method} onMethodChange={setMethod} />
      <aside className="lg:sticky lg:top-6" aria-label={t('checkout.summary')}>
        <CheckoutSummary
          method={method}
          deliveryFee={deliveryFee}
          freeDeliveryOver={freeDeliveryOver}
        />
      </aside>
    </div>
  );
}
