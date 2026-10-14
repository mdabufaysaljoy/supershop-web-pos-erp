'use client';

import { createCheckoutSchemas, ORDER, trackingTimeline } from '@supershop/shared';
import { FormField, PhoneInput, PlainTextInput } from '@supershop/ui';
import { useSearchParams } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useCart } from '@/components/cart/CartProvider';
import { useLang, useT } from '@/i18n/I18nProvider';
import { checkoutRequest, detailsToErrors } from '@/lib/checkout';
import { fieldError } from '@/lib/fieldError';
import { OrderTimeline } from './OrderTimeline';

/**
 * "Where is my order?" — the order number plus the phone it was placed with. Both are needed, so a
 * stray order number alone reveals nothing; the answer is rendered in the browser only (never in
 * cached HTML) and the API returns delivery progress, not the whole order.
 */
const schemas = createCheckoutSchemas();

export function TrackOrderView() {
  const t = useT();
  const lang = useLang();
  const { fmt } = useCart();
  const params = useSearchParams();
  const [form, setForm] = useState({
    number: params.get('order') ?? '',
    phone: params.get('phone') ?? '',
  });
  const [errors, setErrors] = useState({});
  const [state, setState] = useState({ order: null, error: null, busy: false });
  const autoRan = useRef(false);

  const lookup = useCallback(
    async (values) => {
      const parsed = schemas.trackQuery.safeParse({ ...values, lang });
      if (!parsed.success) {
        setErrors(
          detailsToErrors(
            parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
          ),
        );
        return;
      }
      setErrors({});
      setState({ order: null, error: null, busy: true });
      try {
        const query = new URLSearchParams({ number: parsed.data.number, phone: parsed.data.phone });
        const order = await checkoutRequest('GET', `/track?${query}`, { lang });
        setState({ order, error: null, busy: false });
      } catch (err) {
        setState({
          order: null,
          busy: false,
          error:
            err.status === 404
              ? 'track.notFound'
              : err.code === 'RATE_LIMITED'
                ? 'track.tooMany'
                : err.code === 'NETWORK_ERROR'
                  ? 'cart.errors.NETWORK_ERROR'
                  : 'track.failed',
        });
      }
    },
    [lang],
  );

  // A link from a confirmation email can carry both values and show the answer straight away.
  useEffect(() => {
    if (autoRan.current || !form.number || !form.phone) return;
    autoRan.current = true;
    void lookup(form);
  }, [form, lookup]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));

  return (
    <div className="grid gap-8">
      <form
        className="grid gap-4 rounded-xl border p-5 sm:grid-cols-2 sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          if (!state.busy) void lookup(form);
        }}
        noValidate
      >
        <FormField
          label={t('track.orderNumber')}
          description={t('track.orderNumberHint', { prefix: ORDER.NUMBER_PREFIX })}
          error={fieldError(t, errors.number)}
          required
        >
          <PlainTextInput
            dir="ltr"
            autoComplete="off"
            maxLength={20}
            placeholder={`${ORDER.NUMBER_PREFIX}000123`}
            value={form.number}
            onChange={(e) => set({ number: e.target.value })}
          />
        </FormField>
        <FormField
          label={t('track.phone')}
          description={t('checkout.phoneHint')}
          error={fieldError(t, errors.phone)}
          required
        >
          <PhoneInput
            autoComplete="tel"
            value={form.phone}
            onChange={(e) => set({ phone: e.target.value })}
          />
        </FormField>
        <button
          type="submit"
          disabled={state.busy}
          className="h-11 rounded-full bg-primary px-6 text-sm font-medium text-primary-foreground disabled:opacity-60 sm:col-span-2 sm:justify-self-start"
        >
          {state.busy ? t('track.searching') : t('track.submit')}
        </button>
      </form>

      {state.error && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-4 text-sm text-destructive"
        >
          {t(state.error)}
        </p>
      )}

      {state.order && <TrackedOrder order={state.order} fmt={fmt} />}
    </div>
  );
}

function TrackedOrder({ order, fmt }) {
  const t = useT();
  const timeline = trackingTimeline(order.status);
  return (
    <section className="grid gap-6" aria-live="polite">
      <div className="grid gap-1">
        <h2 className="text-xl font-semibold">{order.orderNo}</h2>
        <p className="text-sm text-muted-foreground">
          {t('track.placedOn', { date: fmt.date(order.placedAt) })}
          {order.city ? ` · ${order.city}` : ''}
        </p>
      </div>

      <OrderTimeline timeline={timeline} updatedAt={order.updatedAt} fmt={fmt} />

      {order.shipment && <ShipmentCard shipment={order.shipment} fmt={fmt} />}

      <ul className="grid gap-3 rounded-xl border p-5">
        {order.items.map((item) => (
          <li
            key={`${item.name}-${item.qty}`}
            className="flex items-center justify-between gap-4 text-sm"
          >
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
        <li className="flex items-center justify-between border-t pt-3 text-base font-semibold">
          <span>{t('cart.total')}</span>
          <span>{fmt.money(order.totals.total)}</span>
        </li>
      </ul>

      <p className="text-sm text-muted-foreground">
        {t('track.paymentLine', {
          method: t(`checkout.methods.${order.payment.method}`),
          status: t(`track.paymentStatus.${order.payment.status}`),
        })}
      </p>
    </section>
  );
}

/** Where the parcel is, in the courier's own words. */
function ShipmentCard({ shipment, fmt }) {
  const t = useT();
  return (
    <div className="grid gap-1 rounded-xl border p-5 text-sm">
      <p className="font-medium">{t('track.shipment.title')}</p>
      <p className="text-muted-foreground">
        {t('track.shipment.carrier', { carrier: shipment.carrier })}
        {shipment.shippedAt ? ` · ${fmt.date(shipment.shippedAt)}` : ''}
      </p>
      {shipment.trackingNumber && (
        <p className="text-muted-foreground">
          {t('track.shipment.number')}: <span dir="ltr">{shipment.trackingNumber}</span>
        </p>
      )}
      {shipment.trackingUrl && (
        <a
          href={shipment.trackingUrl}
          target="_blank"
          rel="noreferrer noopener"
          className="justify-self-start underline underline-offset-4"
        >
          {t('track.shipment.follow')}
        </a>
      )}
    </div>
  );
}
