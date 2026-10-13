'use client';

import { createFormatters } from '@supershop/shared';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { checkoutRequest } from '@/lib/checkout';

/**
 * Thank-you page. The order is fetched with the unguessable token from the link, so a reload or a
 * bookmark still works while nobody can read someone else's order.
 */
export function OrderConfirmation({ token, fmtOptions }) {
  const t = useT();
  const lang = useLang();
  const { reload } = useCart();
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const [state, setState] = useState({ order: null, error: null });

  useEffect(() => {
    let alive = true;
    if (!token) {
      setState({ order: null, error: 'missing' }); // eslint-disable-line react-hooks/set-state-in-effect -- no token in the URL
      return () => {};
    }
    checkoutRequest('GET', `/confirmation?token=${encodeURIComponent(token)}`, { lang })
      .then((order) => {
        if (!alive) return;
        setState({ order, error: null });
        void reload(); // the cart is empty now
      })
      .catch((e) => alive && setState({ order: null, error: e.code }));
    return () => {
      alive = false;
    };
  }, [token, lang, reload]);

  if (state.error) {
    return (
      <div className="grid justify-items-center gap-3 rounded-xl border border-dashed p-12 text-center">
        <p className="text-lg font-medium">{t('checkout.confirmation.notFound')}</p>
        <Link href={localizePath('/', lang)} className="text-sm underline underline-offset-4">
          {t('notFound.back')}
        </Link>
      </div>
    );
  }
  if (!state.order) {
    return (
      <div
        className="h-72 animate-pulse rounded-xl bg-muted motion-reduce:animate-none"
        aria-busy="true"
      />
    );
  }

  const o = state.order;
  const line = (label, value) =>
    value ? (
      <div className="flex justify-between gap-4">
        <dt className="text-muted-foreground">{label}</dt>
        <dd className="text-end">{value}</dd>
      </div>
    ) : null;

  return (
    <div className="grid gap-8">
      <div className="grid justify-items-center gap-2 rounded-2xl bg-muted px-6 py-10 text-center">
        <span className="grid size-12 place-items-center rounded-full bg-emerald-600 text-primary-foreground">
          <svg
            viewBox="0 0 24 24"
            className="size-6"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        </span>
        <h1 className="text-2xl font-semibold">{t('checkout.confirmation.title')}</h1>
        <p className="text-muted-foreground">
          {t('checkout.confirmation.body', { email: o.customer.email || o.customer.phone })}
        </p>
        <p className="mt-2 text-lg font-semibold" dir="ltr">
          {o.orderNo}
        </p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section
          className="grid content-start gap-3 rounded-xl border p-5"
          aria-labelledby="items-heading"
        >
          <h2 id="items-heading" className="font-semibold">
            {t('checkout.confirmation.items')}
          </h2>
          <ul className="grid gap-2 text-sm">
            {o.items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3">
                <span>
                  {i.name}
                  {i.options.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {i.options.map((x) => x.value).join(' / ')}
                    </span>
                  )}
                  <span className="text-muted-foreground"> × {fmt.number(i.qty)}</span>
                </span>
                <span className="tabular-nums">{fmt.money(i.lineTotal)}</span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-1.5 border-t pt-3 text-sm">
            {line(t('cart.subtotal'), fmt.money(o.totals.subtotal))}
            {line(
              t('checkout.delivery'),
              o.totals.deliveryFee ? fmt.money(o.totals.deliveryFee) : t('checkout.freeDelivery'),
            )}
            {line(t('checkout.confirmation.vat'), fmt.money(o.totals.vat))}
            <div className="flex justify-between gap-4 border-t pt-2 text-base font-semibold">
              <dt>{t('cart.total')}</dt>
              <dd className="tabular-nums">{fmt.money(o.totals.total)}</dd>
            </div>
          </dl>
        </section>

        <section
          className="grid content-start gap-3 rounded-xl border p-5"
          aria-labelledby="delivery-heading"
        >
          <h2 id="delivery-heading" className="font-semibold">
            {t('checkout.confirmation.delivery')}
          </h2>
          <dl className="grid gap-1.5 text-sm">
            {line(t('checkout.name'), o.customer.name)}
            {line(t('checkout.phone'), <span dir="ltr">{o.customer.phone}</span>)}
            {line(t('checkout.email'), o.customer.email)}
            {line(
              t('checkout.address'),
              [o.address?.line1, o.address?.district, o.address?.city, o.address?.postalCode]
                .filter(Boolean)
                .join(', '),
            )}
            {line(t('checkout.payment'), t(`checkout.methods.${o.payment.method}`))}
            {line(t('checkout.note'), o.note)}
          </dl>
          <p className="text-sm text-muted-foreground">{t('checkout.confirmation.next')}</p>
          <Link
            href={localizePath('/search', lang)}
            className="mt-2 inline-flex h-11 items-center justify-center rounded-full border px-6 text-sm font-medium"
          >
            {t('checkout.confirmation.keepShopping')}
          </Link>
        </section>
      </div>
    </div>
  );
}
