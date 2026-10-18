'use client';

import { createFormatters } from '@supershop/shared';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ORDER } from '@supershop/shared';
import { apiRequest } from '@/lib/accountApi';
import { checkoutRequest } from '@/lib/checkout';
import { trackPurchase } from '@/lib/tracking';

/**
 * Thank-you page. The order is fetched with the unguessable token from the link, so a reload or a
 * bookmark still works while nobody can read someone else's order.
 */
export function OrderConfirmation({ token, fmtOptions }) {
  const t = useT();
  const lang = useLang();
  const activeToken =
    token ||
    (typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('token')
      : null);
  const { reload } = useCart();
  const fmt = useMemo(() => createFormatters(fmtOptions), [fmtOptions]);
  const [state, setState] = useState({ order: null, error: null });
  const trackedOrder = useRef(null);
  const reloadRef = useRef(reload);
  useEffect(() => {
    reloadRef.current = reload;
  }, [reload]);

  useEffect(() => {
    let alive = true;
    if (!activeToken) {
      setState({ order: null, error: 'missing' }); // eslint-disable-line react-hooks/set-state-in-effect -- no token in the URL
      return () => {};
    }
    checkoutRequest('GET', `/confirmation?token=${encodeURIComponent(activeToken)}`, { lang })
      .then((order) => {
        if (!alive) return;
        setState({ order, error: null });
        void reloadRef.current?.(); // the cart is empty now

        if (order && trackedOrder.current !== order.orderNo) {
          trackedOrder.current = order.orderNo;
          trackPurchase({
            orderNumber: order.orderNo,
            value: (order.totals?.total ?? 0) / 100,
            currency: 'SAR',
            tax: (order.totals?.vat ?? 0) / 100,
            shipping: (order.totals?.deliveryFee ?? 0) / 100,
            items: (order.items || []).map((item) => ({
              item_id: item.variantId,
              item_name: item.name,
              price: (item.price ?? item.unitPrice ?? 0) / 100,
              quantity: item.qty,
            })),
          });
        }
      })
      .catch((e) => alive && setState({ order: null, error: e.code }));
    return () => {
      alive = false;
    };
  }, [activeToken, lang]);

  if (state.error) {
    const isRateLimited = state.error === 'RATE_LIMITED';
    return (
      <div className="mx-auto max-w-lg grid justify-items-center gap-3 rounded-2xl border border-dashed border-border/80 bg-card/60 p-12 text-center shadow-xs">
        <p className="text-lg font-bold text-foreground">
          {isRateLimited ? t('cart.errors.generic') : t('checkout.confirmation.notFound')}
        </p>
        <div className="mt-3 flex flex-wrap gap-3">
          {isRateLimited && (
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
            >
              {t('checkout.confirmation.payment.retry')}
            </button>
          )}
          <Link
            href={localizePath('/', lang)}
            className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-medium hover:bg-muted transition-colors"
          >
            {t('notFound.back')}
          </Link>
        </div>
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
      <PaymentState order={o} token={activeToken} />
      <div className="grid justify-items-center gap-3 rounded-2xl border border-emerald-500/30 bg-emerald-50/50 p-8 md:p-10 text-center dark:bg-emerald-950/20 shadow-xs">
        <span className="grid size-14 place-items-center rounded-2xl bg-emerald-600 text-white shadow-xs">
          <svg
            viewBox="0 0 24 24"
            className="size-7"
            aria-hidden
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
          >
            <path d="m5 12 5 5L20 7" />
          </svg>
        </span>
        <h1 className="text-2xl font-bold tracking-tight text-foreground sm:text-3xl">
          {t('checkout.confirmation.title')}
        </h1>
        <p className="max-w-md text-sm text-muted-foreground">
          {t('checkout.confirmation.body', { email: o.customer.email || o.customer.phone })}
        </p>
        <div className="mt-1 inline-flex items-center gap-2 rounded-lg border border-border/70 bg-background/80 px-4 py-1.5 shadow-2xs">
          <span className="text-xs text-muted-foreground uppercase tracking-wider font-semibold">
            Order
          </span>
          <span className="text-base font-bold text-foreground tabular-nums" dir="ltr">
            {o.orderNo}
          </span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <section
          className="grid content-start gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs"
          aria-labelledby="items-heading"
        >
          <h2 id="items-heading" className="text-base font-bold text-foreground">
            {t('checkout.confirmation.items')}
          </h2>
          <ul className="grid gap-2.5 text-sm">
            {o.items.map((i) => (
              <li key={i.variantId} className="flex justify-between gap-3">
                <span className="text-foreground">
                  {i.name}
                  {i.options.length > 0 && (
                    <span className="text-muted-foreground">
                      {' '}
                      · {i.options.map((x) => x.value).join(' / ')}
                    </span>
                  )}
                  <span className="text-muted-foreground"> × {fmt.number(i.qty)}</span>
                </span>
                <span className="font-semibold tabular-nums text-foreground">
                  {fmt.money(i.lineTotal)}
                </span>
              </li>
            ))}
          </ul>
          <dl className="grid gap-2 border-t border-border/60 pt-4 text-sm">
            {line(t('cart.subtotal'), fmt.money(o.totals.subtotal))}
            {line(
              t('checkout.delivery'),
              o.totals.deliveryFee ? fmt.money(o.totals.deliveryFee) : t('checkout.freeDelivery'),
            )}
            {line(t('checkout.confirmation.vat'), fmt.money(o.totals.vat))}
            <div className="flex justify-between gap-4 border-t border-border/80 pt-3 text-base font-bold">
              <dt className="text-foreground">{t('cart.total')}</dt>
              <dd className="tabular-nums text-foreground">{fmt.money(o.totals.total)}</dd>
            </div>
          </dl>
        </section>

        <section
          className="grid content-start gap-4 rounded-2xl border border-border/80 bg-card p-6 shadow-xs"
          aria-labelledby="delivery-heading"
        >
          <h2 id="delivery-heading" className="text-base font-bold text-foreground">
            {t('checkout.confirmation.delivery')}
          </h2>
          <dl className="grid gap-2 text-sm">
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
          <div className="mt-3 flex flex-wrap gap-3">
            <Link
              href={localizePath('/search', lang)}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-xs hover:bg-primary/90 transition-all"
            >
              {t('checkout.confirmation.keepShopping')}
            </Link>
            {/* Only the order number travels in the link — the phone is typed on the page (§5.1). */}
            <Link
              href={`${localizePath('/track', lang)}?order=${encodeURIComponent(o.orderNo)}`}
              className="inline-flex h-11 items-center justify-center rounded-xl border border-border px-6 text-sm font-semibold hover:bg-muted transition-colors"
            >
              {t('track.linkLabel')}
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

/**
 * Where the money is (P4.1). A card payment can come back unfinished — the customer closed the
 * gateway page, or it expired — so the order is kept and a new payment page is one click away.
 */
function PaymentState({ order, token }) {
  const t = useT();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const needsPayment =
    ORDER.GATEWAY_METHODS.includes(order.payment?.method) && order.payment?.status !== 'paid';

  if (!needsPayment) return null;

  const retry = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { redirectUrl } = await apiRequest('POST', '/api/v1/payments/retry', {
        body: { token },
      });
      if (redirectUrl) return window.location.assign(redirectUrl);
      setError(t('checkout.confirmation.payment.retryFailed'));
    } catch {
      setError(t('checkout.confirmation.payment.retryFailed'));
    }
    setBusy(false);
  };

  return (
    <div
      className="grid gap-3 rounded-xl border border-amber-500/40 bg-amber-500/5 p-5"
      role="status"
    >
      <p className="font-medium">{t('checkout.confirmation.payment.unpaidTitle')}</p>
      <p className="text-sm text-muted-foreground">
        {t('checkout.confirmation.payment.unpaidBody')}
      </p>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={retry}
        disabled={busy}
        className="h-11 justify-self-start rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy
          ? t('checkout.confirmation.payment.retrying')
          : t('checkout.confirmation.payment.retry')}
      </button>
    </div>
  );
}
