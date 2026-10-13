import { CartPageView } from '@/components/cart/CartPageView';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

/** Cart page: a static shell (cacheable) + the personal cart loaded in the browser. Not indexed. */
export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/cart',
    title: t('cart.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function CartPage({ params }) {
  const { lang } = await params;
  const { t } = await getPageContext(lang);
  return (
    <div className="grid gap-6">
      <h1 className="text-3xl font-semibold tracking-tight">{t('cart.title')}</h1>
      <CartPageView />
    </div>
  );
}
