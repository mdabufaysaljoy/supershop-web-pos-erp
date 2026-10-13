import { AccountShell } from '@/components/account/AccountShell';
import { AddressBook } from '@/components/account/AddressBook';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/addresses',
    title: t('account.addresses.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function AddressesPage({ params }) {
  const { lang } = await params;
  const { t } = await getPageContext(lang);
  return (
    <AccountShell title={t('account.addresses.title')}>
      <AddressBook />
    </AccountShell>
  );
}
