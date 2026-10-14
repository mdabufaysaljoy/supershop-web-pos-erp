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

/** Methods the shop can actually take money with right now (P4.1); cash is the safe fallback. */
async function paymentMethods() {
  try {
    const methods = (await apiGet('/api/v1/payments/methods', { tags: ['settings'] })).data;
    return methods?.length ? methods : ['cod'];
  } catch {
    return ['cod'];
  }
}

export default async function CheckoutPage({ params }) {
  const { lang } = await params;
  const [{ settings, t }, fields, methods] = await Promise.all([
    getPageContext(lang),
    checkoutFields(lang),
    paymentMethods(),
  ]);
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('checkout.title')}</h1>
      <CheckoutView
        fields={fields}
        methods={methods}
        deliveryFee={settings['checkout.deliveryFee']}
        freeDeliveryOver={settings['checkout.freeDeliveryOver']}
      />
    </div>
  );
}
