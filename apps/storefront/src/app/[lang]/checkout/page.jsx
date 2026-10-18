import { CheckoutView } from '@/components/checkout/CheckoutView';
import { apiGet } from '@/lib/api';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/** Checkout: the admin-defined fields are fetched on the server (cached per language); the cart
 *  itself is personal and loads in the browser. Never indexed. */
export const revalidate = 60;

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/checkout',
    title: t('checkout.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

/** Admin checkout fields; an unreachable API must not break the page (the form still works). */
async function checkoutFields(lang) {
  try {
    return (await apiGet('/api/v1/checkout/fields', { lang, tags: ['custom-fields'] })).data ?? [];
  } catch {
    return [];
  }
}

/**
 * The methods this shop offers, in its own order and words (P4.2). An unreachable API must not
 * break checkout, so cash on delivery stands in — the server checks the choice again anyway.
 */
async function paymentMethods(lang) {
  const fallback = [{ key: 'cod', type: 'cod', label: 'Cash payment on delivery', fee: null }];
  try {
    const methods = (
      await apiGet('/api/v1/payment-methods/public', { lang, tags: ['payment-methods'] })
    ).data;
    return methods?.length ? methods : fallback;
  } catch {
    return fallback;
  }
}

export default async function CheckoutPage({ params }) {
  const { lang } = await params;
  const [{ settings, t }, fields, methods] = await Promise.all([
    getPageContext(lang),
    checkoutFields(lang),
    paymentMethods(lang),
  ]);
  return (
    <div className="grid gap-6 max-w-6xl mx-auto w-full">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-border/60 pb-4">
        <div>
          <div className="flex items-center gap-2 text-xs text-muted-foreground mb-1.5">
            <span>{settings['store.name']}</span>
            <span>/</span>
            <span className="text-foreground font-medium">{t('checkout.title')}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-foreground">
            {t('checkout.title')}
          </h1>
        </div>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-600/25 bg-emerald-500/10 px-3 py-1 text-xs font-bold text-emerald-900 dark:text-emerald-300 shadow-xs">
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.2"
              className="size-3.5 text-emerald-700 dark:text-emerald-300"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            256-Bit SSL Encrypted
          </span>
          <span className="hidden md:inline-flex items-center gap-1.5 rounded-full border border-border/80 bg-muted/60 px-3 py-1 text-xs font-semibold text-muted-foreground">
            🇸🇦 SPL Express Delivery
          </span>
        </div>
      </div>
      <CheckoutView
        fields={fields}
        methods={methods}
        deliveryFee={settings['checkout.deliveryFee']}
        freeDeliveryOver={settings['checkout.freeDeliveryOver']}
      />
    </div>
  );
}
