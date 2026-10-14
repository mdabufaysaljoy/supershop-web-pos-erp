import { Suspense } from 'react';
import { RegisterForm } from '@/components/account/RegisterForm';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/register',
    title: t('account.register.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function RegisterPage({ params }) {
  const { lang } = await params;
  const { settings } = await getPageContext(lang);
  return (
    <Suspense>
      <RegisterForm googleEnabled={Boolean(settings['auth.google.enabled'])} />
    </Suspense>
  );
}
