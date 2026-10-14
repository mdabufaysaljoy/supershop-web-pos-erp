import { Suspense } from 'react';
import { SignInForm } from '@/components/account/SignInForm';
import { getPageContext } from '@/lib/page';
import { buildMetadata } from '@/lib/seo';

export async function generateMetadata({ params }) {
  const { lang } = await params;
  const { settings, t } = await getPageContext(lang);
  return buildMetadata({
    lang,
    path: '/account/login',
    title: t('account.signIn.title'),
    siteName: settings['store.name'],
    noindex: true,
  });
}

export default async function LoginPage({ params }) {
  const { lang } = await params;
  const { settings } = await getPageContext(lang);
  return (
    <Suspense>
      <SignInForm googleEnabled={Boolean(settings['auth.google.enabled'])} />
    </Suspense>
  );
}
