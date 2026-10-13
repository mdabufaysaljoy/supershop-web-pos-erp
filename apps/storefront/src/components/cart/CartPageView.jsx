'use client';

import Link from 'next/link';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { CartLines } from './CartLines';
import { useCart } from './CartProvider';
import { CartSummary } from './CartSummary';

/** Full cart page body (client: the cart is personal and loaded in the browser). */
export function CartPageView() {
  const t = useT();
  const lang = useLang();
  const { cart } = useCart();

  if (!cart) {
    return (
      <div
        className="h-64 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
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
      <CartLines size="lg" />
      <aside className="rounded-xl border p-5 lg:sticky lg:top-6" aria-label={t('cart.summary')}>
        <CartSummary />
      </aside>
    </div>
  );
}
