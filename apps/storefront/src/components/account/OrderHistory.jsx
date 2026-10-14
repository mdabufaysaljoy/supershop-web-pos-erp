'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_BASE, ACCOUNT_PATHS } from '@/lib/accountApi';
import { AddressSummary } from './AddressBook';
import { useAuth } from './AuthProvider';

/** Order status chip — the same wording the tracking page (P3.6) will use. */
function StatusBadge({ status }) {
  const t = useT();
  return (
    <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium">
      {t(`account.orders.status.${status}`)}
    </span>
  );
}

/** The customer's past orders, newest first. Money and dates come from the shared formatters. */
export function OrderHistory() {
  const t = useT();
  const lang = useLang();
  const { authed } = useAuth();
  const { fmt } = useCart();
  const [page, setPage] = useState(1);
  const [state, setState] = useState({ orders: null, total: 0, error: null });

  useEffect(() => {
    let alive = true;
    authed('GET', `${ACCOUNT_BASE}/orders?page=${page}&limit=10`)
      .then((orders) => alive && setState((s) => ({ ...s, orders, error: null })))
      .catch(() => alive && setState((s) => ({ ...s, orders: [], error: 'generic' })));
    return () => {
      alive = false;
    };
  }, [authed, page]);

  if (state.error)
    return (
      <p role="alert" className="text-sm text-destructive">
        {t('account.errors.generic')}
      </p>
    );
  if (state.orders === null)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('account.loading')}
      </p>
    );
  if (state.orders.length === 0)
    return (
      <div className="grid justify-items-center gap-4 rounded-xl border border-dashed p-10 text-center">
        <p className="text-sm text-muted-foreground">{t('account.orders.empty')}</p>
        <Link
          href={localizePath('/search', lang)}
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium leading-[2.75rem] text-primary-foreground"
        >
          {t('account.orders.startShopping')}
        </Link>
      </div>
    );

  return (
    <div className="grid gap-4">
      <ul className="grid gap-4">
        {state.orders.map((order) => (
          <li
            key={order.id}
            className="grid gap-3 rounded-xl border p-5 sm:flex sm:items-center sm:justify-between"
          >
            <div className="grid gap-1">
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href={localizePath(`${ACCOUNT_PATHS.orders}/${order.id}`, lang)}
                  className="font-medium underline-offset-4 hover:underline"
                >
                  {order.orderNo}
                </Link>
                <StatusBadge status={order.status} />
              </div>
              <p className="text-sm text-muted-foreground">
                {fmt.date(order.placedAt)} ·{' '}
                {t('account.orders.itemCount', { count: order.itemCount })}
              </p>
              <p className="truncate text-sm text-muted-foreground">
                {order.items.map((i) => i.name).join(', ')}
              </p>
            </div>
            <p className="text-lg font-semibold">{fmt.money(order.total)}</p>
          </li>
        ))}
      </ul>
      {(page > 1 || state.orders.length === 10) && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            disabled={page === 1}
            className="h-10 rounded-full border px-4 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t('account.orders.previous')}
          </button>
          <button
            type="button"
            disabled={state.orders.length < 10}
            className="h-10 rounded-full border px-4 text-sm disabled:opacity-50"
            onClick={() => setPage((p) => p + 1)}
          >
            {t('account.orders.next')}
          </button>
        </div>
      )}
    </div>
  );
}

/** One past order: the snapshot exactly as it was placed. */
export function OrderDetail({ id }) {
  const t = useT();
  const lang = useLang();
  const { authed } = useAuth();
  const { fmt } = useCart();
  const [state, setState] = useState({ order: null, error: null });

  useEffect(() => {
    let alive = true;
    authed('GET', `${ACCOUNT_BASE}/orders/${id}?lang=${lang}`)
      .then((order) => alive && setState({ order, error: null }))
      .catch(
        (err) =>
          alive && setState({ order: null, error: err.status === 404 ? 'notFound' : 'generic' }),
      );
    return () => {
      alive = false;
    };
  }, [authed, id, lang]);

  if (state.error)
    return (
      <div className="grid gap-4">
        <p role="alert" className="text-sm text-destructive">
          {t(state.error === 'notFound' ? 'account.orders.notFound' : 'account.errors.generic')}
        </p>
        <Link
          className="text-sm underline underline-offset-4"
          href={localizePath(ACCOUNT_PATHS.orders, lang)}
        >
          {t('account.orders.backToList')}
        </Link>
      </div>
    );
  if (!state.order)
    return (
      <p role="status" className="text-sm text-muted-foreground">
        {t('account.loading')}
      </p>
    );

  const { order } = state;
  return (
    <div className="grid gap-6">
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-xl font-semibold">{order.orderNo}</h2>
        <StatusBadge status={order.status} />
        <span className="text-sm text-muted-foreground">{fmt.date(order.placedAt)}</span>
      </div>

      <ul className="grid gap-3 rounded-xl border p-5">
        {order.items.map((item) => (
          <li key={item.variantId} className="flex items-center justify-between gap-4 text-sm">
            <span>
              <span className="font-medium">{item.name}</span>
              {item.options.length > 0 && (
                <span className="block text-muted-foreground">
                  {item.options.map((o) => `${o.name}: ${o.value}`).join(' · ')}
                </span>
              )}
              <span className="block text-muted-foreground">
                {t('account.orders.quantity', { count: item.qty })}
              </span>
            </span>
            <span className="font-medium">{fmt.money(item.lineTotal)}</span>
          </li>
        ))}
        <li className="flex items-center justify-between border-t pt-3 text-sm">
          <span>{t('checkout.delivery')}</span>
          <span>
            {order.totals.deliveryFee
              ? fmt.money(order.totals.deliveryFee)
              : t('checkout.freeDelivery')}
          </span>
        </li>
        <li className="flex items-center justify-between text-sm text-muted-foreground">
          <span>{t('checkout.confirmation.vat')}</span>
          <span>{fmt.money(order.totals.vat)}</span>
        </li>
        <li className="flex items-center justify-between border-t pt-3 text-base font-semibold">
          <span>{t('cart.total')}</span>
          <span>{fmt.money(order.totals.total)}</span>
        </li>
      </ul>

      {order.shipment && (
        <div className="grid gap-1 rounded-xl border p-5 text-sm">
          <p className="font-medium">{t('track.shipment.title')}</p>
          <p className="text-muted-foreground">
            {t('track.shipment.carrier', { carrier: order.shipment.carrier })}
            {order.shipment.shippedAt ? ` · ${fmt.date(order.shipment.shippedAt)}` : ''}
          </p>
          {order.shipment.trackingNumber && (
            <p className="text-muted-foreground">
              {t('track.shipment.number')}: <span dir="ltr">{order.shipment.trackingNumber}</span>
            </p>
          )}
        </div>
      )}

      <div className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2">
        <div className="grid gap-2">
          <h3 className="font-medium">{t('account.orders.deliveryTo')}</h3>
          <p className="text-sm text-muted-foreground">
            {order.customer.name} · {order.customer.phone}
          </p>
          {order.address && <AddressSummary address={order.address} />}
        </div>
        <div className="grid gap-2">
          <h3 className="font-medium">{t('checkout.payment')}</h3>
          <p className="text-sm text-muted-foreground">
            {t(`checkout.methods.${order.payment.method}`)}
          </p>
          {order.note && <p className="text-sm text-muted-foreground">{order.note}</p>}
        </div>
      </div>

      <Link
        className="text-sm underline underline-offset-4"
        href={localizePath(ACCOUNT_PATHS.orders, lang)}
      >
        {t('account.orders.backToList')}
      </Link>
    </div>
  );
}
