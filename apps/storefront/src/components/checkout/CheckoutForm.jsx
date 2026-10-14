'use client';

import { createCheckoutSchemas, ORDER } from '@supershop/shared';
import { EmailInput, FormField, NameInput, PhoneInput, PlainTextArea } from '@supershop/ui';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { AddressFields, EMPTY_ADDRESS, toAddressForm } from '@/components/address/AddressFields';
import { useAuth } from '@/components/account/AuthProvider';
import { useCart } from '@/components/cart/CartProvider';
import { localizePath } from '@/i18n/config';
import { useLang, useT } from '@/i18n/I18nProvider';
import { ACCOUNT_BASE } from '@/lib/accountApi';
import { checkoutRequest, CONFIRMATION_PATH, detailsToErrors } from '@/lib/checkout';
import { CustomFields } from './CustomFields';
import { fieldError } from '@/lib/fieldError';

const schemas = createCheckoutSchemas();
/** Errors that mean "go back to the cart and look at it". */
const CART_ERRORS = new Set(['CART_EMPTY', 'OUT_OF_STOCK', 'PRICE_CHANGED', 'CONFLICT']);

/**
 * Guest checkout: contact, delivery address, admin-defined fields and payment. The server
 * revalidates the cart, takes the stock and creates the order; the same `Idempotency-Key` is sent
 * for every retry of one filled-in form, so a double click or a flaky connection cannot order twice.
 */
export function CheckoutForm({ fields, methods = ORDER.PAYMENT_METHODS }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { cart, reload } = useCart();
  const { isSignedIn, authed } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: EMPTY_ADDRESS,
    note: '',
    paymentMethod: methods[0] ?? ORDER.PAYMENT_METHODS[0],
  });
  const [custom, setCustom] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  // A signed-in customer should not retype what the shop already knows. Filled in once, and only
  // into fields still untouched — anything typed on this page wins.
  const prefilled = useRef(false);
  useEffect(() => {
    if (!isSignedIn || prefilled.current) return;
    prefilled.current = true;
    let alive = true;
    authed('GET', ACCOUNT_BASE)
      .then((me) => {
        if (!alive || !me) return;
        const saved = me.addresses?.find((a) => a.isDefault) ?? me.addresses?.[0];
        setForm((f) => ({
          ...f,
          name: f.name || me.name || '',
          phone: f.phone || me.phone || '',
          email: f.email || me.email || '',
          address: saved && f.address === EMPTY_ADDRESS ? toAddressForm(saved.address) : f.address,
        }));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [isSignedIn, authed]);

  // A new attempt after a rejected one must not reuse the previous key.
  useEffect(() => {
    if (formError) setKey(crypto.randomUUID()); // eslint-disable-line react-hooks/set-state-in-effect -- new attempt
  }, [formError]);

  const set = (patch) => setForm((f) => ({ ...f, ...patch }));
  const setAddress = (patch) => setForm((f) => ({ ...f, address: { ...f.address, ...patch } }));
  const err = (path) => fieldError(t, errors[path]);

  const body = () => ({
    contact: { name: form.name, phone: form.phone, email: form.email },
    deliveryMethod: 'delivery',
    address: form.address,
    paymentMethod: form.paymentMethod,
    note: form.note,
    customFields: custom,
  });

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    setFormError(null);
    const parsed = schemas.place.safeParse(body());
    if (!parsed.success) {
      setErrors(
        detailsToErrors(
          parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
        ),
      );
      return;
    }
    setErrors({});
    setBusy(true);
    try {
      const order = await checkoutRequest('POST', '', {
        lang,
        body: parsed.data,
        idempotencyKey: key,
      });
      const confirmation = `${localizePath(CONFIRMATION_PATH, lang)}?token=${encodeURIComponent(order.confirmationToken)}`;
      if (order.payment?.redirectUrl) {
        // Leaving our site for the gateway's page: a full navigation, not a router push.
        window.location.assign(order.payment.redirectUrl);
        return;
      }
      router.push(confirmation);
    } catch (error) {
      if (error.details?.length) setErrors(detailsToErrors(error.details));
      if (CART_ERRORS.has(error.code)) {
        await reload();
        setFormError(
          t(`checkout.errors.${error.code}`, { defaultValue: t('checkout.errors.generic') }),
        );
      } else if (!error.details?.length) {
        setFormError(
          t(
            error.code === 'NETWORK_ERROR'
              ? 'cart.errors.NETWORK_ERROR'
              : 'checkout.errors.generic',
          ),
        );
      }
      setBusy(false);
    }
  };

  const section = 'grid gap-4 rounded-xl border p-5';
  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      <section className={section} aria-labelledby="contact-heading">
        <h2 id="contact-heading" className="text-lg font-semibold">
          {t('checkout.contact')}
        </h2>
        <FormField label={t('checkout.name')} error={err('contact.name')} required>
          <NameInput
            autoComplete="name"
            value={form.name}
            onChange={(e) => set({ name: e.target.value })}
          />
        </FormField>
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            label={t('checkout.phone')}
            description={t('checkout.phoneHint')}
            error={err('contact.phone')}
            required
          >
            <PhoneInput
              autoComplete="tel"
              value={form.phone}
              onChange={(e) => set({ phone: e.target.value })}
            />
          </FormField>
          <FormField
            label={t('checkout.email')}
            description={t('checkout.emailHint')}
            error={err('contact.email')}
          >
            <EmailInput
              autoComplete="email"
              value={form.email}
              onChange={(e) => set({ email: e.target.value })}
            />
          </FormField>
        </div>
      </section>

      <section className={section} aria-labelledby="address-heading">
        <h2 id="address-heading" className="text-lg font-semibold">
          {t('checkout.address')}
        </h2>
        <AddressFields
          value={form.address}
          onChange={setAddress}
          error={(field) => err(`address.${field}`)}
        />
      </section>

      {fields.length > 0 && (
        <section className={section} aria-labelledby="extra-heading">
          <h2 id="extra-heading" className="text-lg font-semibold">
            {t('checkout.extra')}
          </h2>
          <CustomFields fields={fields} values={custom} errors={errors} onChange={setCustom} />
        </section>
      )}

      <section className={section} aria-labelledby="payment-heading">
        <h2 id="payment-heading" className="text-lg font-semibold">
          {t('checkout.payment')}
        </h2>
        <fieldset className="grid gap-2">
          <legend className="sr-only">{t('checkout.payment')}</legend>
          {methods.map((method) => (
            <label key={method} className="flex items-start gap-3 rounded-lg border p-3 text-sm">
              <input
                type="radio"
                name="paymentMethod"
                className="mt-0.5 size-4 accent-primary"
                checked={form.paymentMethod === method}
                onChange={() => set({ paymentMethod: method })}
              />
              <span>
                <span className="font-medium">{t(`checkout.methods.${method}`)}</span>
                <span className="block text-muted-foreground">
                  {t(`checkout.methodHints.${method}`)}
                </span>
              </span>
            </label>
          ))}
        </fieldset>
        <FormField label={t('checkout.note')} error={err('note')}>
          <PlainTextArea
            rows={2}
            maxLength={ORDER.NOTE_MAX}
            placeholder={t('checkout.notePlaceholder')}
            value={form.note}
            onChange={(e) => set({ note: e.target.value })}
          />
        </FormField>
      </section>

      {formError && (
        <p
          role="alert"
          className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive"
        >
          {formError}
        </p>
      )}
      <button
        type="submit"
        disabled={busy || !cart?.items.length}
        className="h-12 rounded-full bg-primary text-sm font-medium text-primary-foreground disabled:opacity-60"
      >
        {busy ? t('checkout.placing') : t('checkout.placeOrder')}
      </button>
      <p className="text-center text-xs text-muted-foreground">{t('checkout.privacy')}</p>
    </form>
  );
}
