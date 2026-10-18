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

export default function CartPage() {
  return <CartPageView />;
}
