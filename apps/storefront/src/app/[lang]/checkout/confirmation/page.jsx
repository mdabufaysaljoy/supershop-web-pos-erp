import { OrderConfirmation } from '@/components/checkout/OrderConfirmation';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/** Thank-you page; the order is loaded in the browser from the link's token. Never indexed. */
export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/checkout/confirmation',
    title: t('checkout.confirmation.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function ConfirmationPage({ params, searchParams }) {
  const { lang } = await params;
  const { token } = await searchParams;
  const { fmtOptions } = await getPageContext(lang);
  return (
    <OrderConfirmation token={typeof token === 'string' ? token : null} fmtOptions={fmtOptions} />
  );
}
