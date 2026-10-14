import { AccountShell } from '@/components/account/AccountShell';
import { OrderHistory } from '@/components/account/OrderHistory';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/orders',
    title: t('account.orders.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function OrdersPage({ params }) {
  const { lang } = await params;
  const { t } = await getPageContext(lang);
  return (
    <AccountShell title={t('account.orders.title')}>
      <OrderHistory />
    </AccountShell>
  );
}
