'use client';

import { createCheckoutSchemas, ORDER, paymentFee } from '@supershop/shared';
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
import { getAttributionPayload } from '@/lib/tracking';

const schemas = createCheckoutSchemas();

/** "+ SAR 10.75" next to a method that charges for itself; nothing when it is free. */
function feeLabel(method, cart, fmt, t) {
  const amount = paymentFee(method.fee, cart?.totals.total ?? 0);
  return amount > 0 ? t('checkout.methodFee', { amount: fmt.money(amount) }) : null;
}
/** Errors that mean "go back to the cart and look at it". */
const CART_ERRORS = new Set(['CART_EMPTY', 'OUT_OF_STOCK', 'PRICE_CHANGED', 'CONFLICT']);

/**
 * Guest checkout: contact, delivery address, admin-defined fields and payment. The server
 * revalidates the cart, takes the stock and creates the order; the same `Idempotency-Key` is sent
 * for every retry of one filled-in form, so a double click or a flaky connection cannot order twice.
 */
export function CheckoutForm({ fields, methods = [], method = null, onMethodChange }) {
  const t = useT();
  const lang = useLang();
  const router = useRouter();
  const { cart, fmt, reload } = useCart();
  const { isSignedIn, authed } = useAuth();
  const [form, setForm] = useState({
    name: '',
    phone: '',
    email: '',
    address: EMPTY_ADDRESS,
    note: '',
    paymentMethod: method?.key ?? methods[0]?.key ?? ORDER.PAYMENT_METHODS[0],
  });
  const [custom, setCustom] = useState({});
  const [errors, setErrors] = useState({});
  const [formError, setFormError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(() => crypto.randomUUID());

  const [step, setStep] = useState(1);

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

  const body = () => {
    const attribution = getAttributionPayload();
    return {
      contact: { name: form.name, phone: form.phone, email: form.email },
      deliveryMethod: 'delivery',
      address: form.address,
      paymentMethod: form.paymentMethod,
      note: form.note,
      customFields: custom,
      ...(attribution ? { attribution } : {}),
    };
  };

  const handleContinueToStep2 = (e) => {
    if (e) e.preventDefault();
    const contactErrors = {};
    if (!form.name?.trim()) contactErrors['contact.name'] = 'validation.required';
    if (!form.phone?.trim()) contactErrors['contact.phone'] = 'validation.required';

    if (Object.keys(contactErrors).length > 0) {
      setErrors((prev) => ({ ...prev, ...contactErrors }));
      return;
    }
    setErrors((prev) => {
      const next = { ...prev };
      delete next['contact.name'];
      delete next['contact.phone'];
      delete next['contact.email'];
      return next;
    });
    setStep(2);
  };

  const canGoToStep2 = Boolean(form.name?.trim() && form.phone?.trim());

  const submit = async (e) => {
    e.preventDefault();
    if (busy) return;
    if (step === 1) {
      handleContinueToStep2(e);
      return;
    }
    setFormError(null);
    const parsed = schemas.place.safeParse(body());
    if (!parsed.success) {
      const errMap = detailsToErrors(
        parsed.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
      );
      setErrors(errMap);
      if (errMap['contact.name'] || errMap['contact.phone'] || errMap['contact.email']) {
        setStep(1);
      }
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

  const section =
    'grid gap-5 rounded-lg border border-border/80 bg-card/95 p-5 sm:p-6 shadow-md backdrop-blur-xs transition-all';

  return (
    <form className="grid gap-6" onSubmit={submit} noValidate>
      {/* 2-Step Progress Stepper */}
      <div className="flex items-center justify-between gap-4 p-4 rounded-lg border border-border/80 bg-card/80 shadow-xs backdrop-blur-xs">
        <button
          type="button"
          onClick={() => setStep(1)}
          className={`flex items-center gap-3 transition-colors text-start cursor-pointer group ${
            step === 1
              ? 'text-primary font-bold'
              : 'text-muted-foreground hover:text-foreground font-medium'
          }`}
        >
          <span
            className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step === 1
                ? 'bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15'
                : step > 1
                  ? 'bg-emerald-600 text-white'
                  : 'bg-muted text-muted-foreground'
            }`}
          >
            {step > 1 ? '✓' : '1'}
          </span>
          <div>
            <span className="text-[10px] block uppercase tracking-wider text-muted-foreground font-semibold">
              Step 1
            </span>
            <span className="text-xs sm:text-sm font-semibold">{t('checkout.step1Title')}</span>
          </div>
        </button>

        <div className="h-0.5 flex-1 bg-border/80 mx-2">
          <div
            className={`h-full bg-primary transition-all duration-300 ${
              step === 2 ? 'w-full' : 'w-0'
            }`}
          />
        </div>

        <button
          type="button"
          onClick={() => {
            if (canGoToStep2) setStep(2);
            else handleContinueToStep2();
          }}
          className={`flex items-center gap-3 transition-colors text-start cursor-pointer ${
            step === 2 ? 'text-primary font-bold' : 'text-muted-foreground font-medium'
          }`}
        >
          <span
            className={`flex size-8 items-center justify-center rounded-full text-xs font-bold transition-all ${
              step === 2
                ? 'bg-primary text-primary-foreground shadow-sm ring-4 ring-primary/15'
                : 'bg-muted text-muted-foreground'
            }`}
          >
            2
          </span>
          <div>
            <span className="text-[10px] block uppercase tracking-wider text-muted-foreground font-semibold">
              Step 2
            </span>
            <span className="text-xs sm:text-sm font-semibold">{t('checkout.step2Title')}</span>
          </div>
        </button>
      </div>

      {step === 1 ? (
        <div className="grid gap-6">
          <section className={section} aria-labelledby="contact-heading">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
              <span
                className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary select-none"
                aria-hidden="true"
              >
                👤
              </span>
              <h2 id="contact-heading" className="text-lg font-bold tracking-tight text-foreground">
                {t('checkout.contact')}
              </h2>
            </div>
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

          {formError && (
            <p
              role="alert"
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-sm text-destructive font-medium"
            >
              {formError}
            </p>
          )}

          <button
            type="button"
            onClick={handleContinueToStep2}
            className="h-12 w-full flex items-center justify-center gap-2 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/95 hover:shadow-lg transition-all cursor-pointer"
          >
            <span>{t('checkout.continueToStep2')}</span>
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              className="size-4 rtl:-scale-x-100"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="m9 5 7 7-7 7" />
            </svg>
          </button>
        </div>
      ) : (
        <div className="grid gap-6">
          {/* Step 1 Compact Contact Summary Card */}
          <div className="flex items-center justify-between p-4 rounded-lg border border-border/80 bg-muted/40 shadow-xs">
            <div className="flex items-center gap-3">
              <span className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-primary text-base select-none">
                👤
              </span>
              <div className="text-xs">
                <p className="font-bold text-foreground text-sm">{form.name}</p>
                <p className="text-muted-foreground font-mono">
                  {form.phone}
                  {form.email ? ` · ${form.email}` : ''}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setStep(1)}
              className="text-xs font-semibold text-primary hover:underline px-3 py-1.5 rounded-xl border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-colors cursor-pointer"
            >
              {t('checkout.editContact')} ✏️
            </button>
          </div>

          <section className={section} aria-labelledby="address-heading">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
              <span
                className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary select-none"
                aria-hidden="true"
              >
                📍
              </span>
              <h2 id="address-heading" className="text-lg font-bold tracking-tight text-foreground">
                {t('checkout.address')}
              </h2>
            </div>
            <AddressFields
              value={form.address}
              onChange={setAddress}
              error={(field) => err(`address.${field}`)}
            />
          </section>

          {fields.length > 0 && (
            <section className={section} aria-labelledby="extra-heading">
              <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
                <span
                  className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary select-none"
                  aria-hidden="true"
                >
                  📋
                </span>
                <h2 id="extra-heading" className="text-lg font-bold tracking-tight text-foreground">
                  {t('checkout.extra')}
                </h2>
              </div>
              <CustomFields fields={fields} values={custom} errors={errors} onChange={setCustom} />
            </section>
          )}

          <section className={section} aria-labelledby="payment-heading">
            <div className="flex items-center gap-2.5 border-b border-border/60 pb-3">
              <span
                className="flex size-7 items-center justify-center rounded-lg bg-primary/10 text-sm font-bold text-primary select-none"
                aria-hidden="true"
              >
                💳
              </span>
              <h2 id="payment-heading" className="text-lg font-bold tracking-tight text-foreground">
                {t('checkout.payment')}
              </h2>
            </div>
            <fieldset className="grid gap-2.5">
              <legend className="sr-only">{t('checkout.payment')}</legend>
              {methods.map((m) => (
                <label
                  key={m.key}
                  className={`flex items-start gap-3.5 rounded-lg border p-4 text-sm transition-all cursor-pointer ${
                    form.paymentMethod === m.key
                      ? 'border-primary bg-primary/[0.04] ring-2 ring-primary/20 shadow-xs'
                      : 'border-border/70 hover:border-foreground/30 hover:bg-muted/30'
                  }`}
                >
                  <input
                    type="radio"
                    name="paymentMethod"
                    className="mt-1 size-4 accent-primary"
                    checked={form.paymentMethod === m.key}
                    onChange={() => {
                      set({ paymentMethod: m.key });
                      onMethodChange?.(m);
                    }}
                  />
                  <div className="flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-semibold text-foreground">{m.label}</span>
                      {m.key === 'card' && (
                        <span className="flex items-center gap-1.5 text-xs text-muted-foreground font-mono">
                          <span>💳 Mada</span>
                          <span>·</span>
                          <span>Apple Pay</span>
                        </span>
                      )}
                      {m.key === 'cod' && <span className="text-base select-none">💵</span>}
                    </div>
                    {feeLabel(m, cart, fmt, t) && (
                      <span className="mt-1 inline-block rounded-full bg-muted px-2.5 py-0.5 text-xs font-semibold text-foreground">
                        {feeLabel(m, cart, fmt, t)}
                      </span>
                    )}
                    {m.instructions && (
                      <span className="mt-1 block text-xs text-muted-foreground">
                        {m.instructions}
                      </span>
                    )}
                  </div>
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
              className="rounded-xl border border-destructive/40 bg-destructive/5 p-3.5 text-sm text-destructive font-medium"
            >
              {formError}
            </p>
          )}

          <div className="flex flex-col-reverse sm:flex-row items-center gap-3">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="h-12 w-full sm:w-auto px-6 rounded-md border border-border/80 bg-background text-sm font-semibold hover:bg-muted transition-all cursor-pointer"
            >
              ← {t('checkout.backToStep1')}
            </button>
            <button
              type="submit"
              disabled={busy || !cart?.items.length}
              className="h-12 w-full sm:flex-1 rounded-md bg-primary text-sm font-semibold text-primary-foreground shadow-md hover:bg-primary/95 transition-all disabled:opacity-60 cursor-pointer"
            >
              {busy ? t('checkout.placing') : t('checkout.placeOrder')}
            </button>
          </div>
          <p className="text-center text-xs text-muted-foreground">{t('checkout.privacy')}</p>
        </div>
      )}
    </form>
  );
}
