import { AccountShell } from '@/components/account/AccountShell';
import { ProfileView } from '@/components/account/ProfileView';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account',
    title: t('account.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function AccountPage({ params }) {
  const { lang } = await params;
  const { t } = await getPageContext(lang);
  return (
    <AccountShell title={t('account.title')}>
      <ProfileView />
    </AccountShell>
  );
}
